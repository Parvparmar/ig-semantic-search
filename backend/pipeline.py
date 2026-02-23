import torch
from transformers import pipeline
import os
import subprocess
# import json
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import redis
from redis.commands.search.field import VectorField, TextField, TagField
from redis.commands.search.index_definition import IndexDefinition, IndexType
from redis.commands.search.query import Query
import numpy as np

input_file = "reels.txt"
audio_folder = "audio"
device = "cuda:0" if torch.cuda.is_available() else "cpu"

# --- Connect to Redis Cloud ---
# Replace with your actual Redis Insight credentials
r = redis.Redis(
    host='redis-16856.crce179.ap-south-1-1.ec2.cloud.redislabs.com',
    port=16856,
    password='kzbxcgxZShRWM5ucXKAXAp75QQtp1t3x',
    decode_responses=True # Important for reading text
)

INDEX_NAME = "idx:reels"
PREFIX = "reel:"

# 1. Initialize Models
pipe = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-tiny",
    chunk_length_s=30,
    device=device,
    ignore_warning=True
)
model = SentenceTransformer("all-MiniLM-L6-v2")

def create_index():
    try:
        r.ft(INDEX_NAME).info()
    except:
        schema = (
            TagField("user_id"), # TagField is optimized for exact matches like IDs
            TextField("url"),
            TextField("transcription"),
            VectorField("embedding", "HNSW", {
                "TYPE": "FLOAT32",
                "DIM": 384,
                "DISTANCE_METRIC": "COSINE"
            })
        )
        r.ft(INDEX_NAME).create_index(
            fields=schema,
            definition=IndexDefinition(prefix=[PREFIX], index_type=IndexType.HASH)
        )

def process_for_user(user_id):
    with open("reels.txt", "r") as f:
        urls = [line.strip() for line in f if line.strip()]

    for url in urls:
        # Check if THIS user has already processed THIS url
        # Query: @user_id:{123} @url:"https://..."
        query_str = f"@user_id:{{{user_id}}} @url:\"{url}\""
        existing = r.ft(INDEX_NAME).search(Query(query_str)).docs
        
        if existing:
            print(f"Skipping: User {user_id} already indexed {url}")
            continue

        try:
            # 1. Download
            get_id_cmd = ["yt-dlp", "--get-id", "--cookies", "cookies.txt", url]
            video_id = subprocess.check_output(get_id_cmd, text=True).strip()
            temp_path = os.path.join(audio_folder, f"{video_id}.mp3")

            subprocess.run(["yt-dlp", "-x", "--audio-format", "mp3", "-o", temp_path, url], check=True)

            # 2. Transcribe & Embed
            text = pipe(temp_path)["text"]
            vector = model.encode(text).astype(np.float32).tobytes()

            # 3. Store in Redis with user_id
            r.hset(f"reel:{user_id}:{video_id}", mapping={
                "user_id": user_id,
                "url": url,
                "transcription": text,
                "embedding": vector
            })

            # 4. CLEANUP: Delete the mp3 file immediately
            if os.path.exists(temp_path):
                os.remove(temp_path)
                print(f"Temporary file {temp_path} deleted.")

        except Exception as e:
            print(f"Error processing {url}: {e}")

# def search_redis(query_text, top_k=3):
#     # 1. Embed the query
#     query_vector = model.encode(query_text).astype(np.float32).tobytes()

#     # 2. Build the query
#     # (*) means search all docs; =>[KNN...] finds nearest vectors
#     q = Query(f"(*)=>[KNN {top_k} @embedding $vec AS score]") \
#         .sort_by("score") \
#         .return_fields("url", "transcription", "score") \
#         .dialect(2)

#     params = {"vec": query_vector}
    
#     results = r.ft(INDEX_NAME).search(q, params)

#     print(f"\nResults for: {query_text}")
#     for doc in results.docs:
#         print(f"Score: {doc.score}")
#         print(f"URL: {doc.url}")
#         print(f"Text: {doc.transcription[:100]}...\n")
def search_user_reels(user_id, query_text, top_k=3):
    query_vector = model.encode(query_text).astype(np.float32).tobytes()

    # Hybrid Query: Filter by user_id TAG, then perform Vector Search
    sql_query = f"@user_id:{{{user_id}}}=>[KNN {top_k} @embedding $vec AS score]"
    
    q = Query(sql_query) \
        .sort_by("score") \
        .return_fields("url", "transcription", "score") \
        .dialect(2)

    results = r.ft(INDEX_NAME).search(q, {"vec": query_vector})
    # return results.docs
    print(f"\nResults for: {query_text}")
    for doc in results.docs:
        print(f"Score: {doc.score}")
        print(f"URL: {doc.url}")
        print(f"Text: {doc.transcription[:100]}...\n")

if __name__ == "__main__":
    create_index()
    userid="dummy"
    process_for_user(userid)

    while True:
        user_query = input("\nEnter search query (or 'exit' to quit): ")
        if user_query.lower() == 'exit':
            break
        search_user_reels(userid,user_query)