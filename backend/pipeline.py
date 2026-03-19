import os
import subprocess
from typing import List, Optional, Dict, Any

import torch
from transformers import pipeline
import numpy as np
from sentence_transformers import SentenceTransformer
import redis
from redis.commands.search.field import VectorField, TextField, TagField
from redis.commands.search.index_definition import IndexDefinition, IndexType
from redis.commands.search.query import Query


input_file = "reels.txt"
audio_folder = "audio"
device = "cuda:0" if torch.cuda.is_available() else "cpu"

# --- Connect to Redis Cloud ---
r = redis.Redis(
    host='redis-16856.crce179.ap-south-1-1.ec2.cloud.redislabs.com',
    port=16856,
    password='kzbxcgxZShRWM5ucXKAXAp75QQtp1t3x',
    decode_responses=True
)

INDEX_NAME = "idx:reels"
PREFIX = "reel:"

# Initialize models once
pipe = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-tiny",
    chunk_length_s=30,
    device=device,
    ignore_warning=True
)
model = SentenceTransformer("all-MiniLM-L6-v2")


def create_index() -> None:
    try:
        r.ft(INDEX_NAME).info()
    except Exception:
        schema = (
            TagField("user_id"),
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


def process_for_user(user_id: str, urls: Optional[List[str]] = None) -> Dict[str, Any]:
    """Process reel URLs for a given user_id.

    If `urls` is None, reads from `reels.txt` in the project root.
    Returns a simple report dict with processed and errors.
    """
    if urls is None:
        if not os.path.exists(input_file):
            return {"processed": [], "errors": [f"{input_file} not found"]}
        with open(input_file, "r", encoding="utf-8") as f:
            urls = [line.strip() for line in f if line.strip()]

    processed = []
    errors = []

    for url in urls:
        query_str = f"@user_id:{{{user_id}}} @url:\"{url}\""
        existing = r.ft(INDEX_NAME).search(Query(query_str)).docs
        if existing:
            # already indexed for this user
            continue

        try:
            get_id_cmd = ["yt-dlp", "--get-id", "--cookies", "cookies.txt", url]
            video_id = subprocess.check_output(get_id_cmd, text=True).strip()
            temp_path = os.path.join(audio_folder, f"{video_id}.mp3")

            subprocess.run(["yt-dlp", "-x", "--audio-format", "mp3", "-o", temp_path, url], check=True)

            text = pipe(temp_path)["text"]
            vector = model.encode(text).astype(np.float32).tobytes()

            r.hset(f"reel:{user_id}:{video_id}", mapping={
                "user_id": user_id,
                "url": url,
                "transcription": text,
                "embedding": vector
            })

            if os.path.exists(temp_path):
                os.remove(temp_path)

            processed.append({"video_id": video_id, "url": url})

        except Exception as e:
            errors.append({"url": url, "error": str(e)})

    return {"processed": processed, "errors": errors}


def search_user_reels(user_id: str, query_text: str, top_k: int = 3) -> List[Dict[str, Any]]:
    """Search user-specific reels using hybrid Redis vector search.

    Returns a list of result dicts with `score`, `url`, and `transcription`.
    """
    query_vector = model.encode(query_text).astype(np.float32).tobytes()

    sql_query = f"@user_id:{{{user_id}}}=>[KNN {top_k} @embedding $vec AS score]"
    q = Query(sql_query).sort_by("score").return_fields("url", "transcription", "score").dialect(2)

    results = r.ft(INDEX_NAME).search(q, {"vec": query_vector})

    out = []
    for doc in results.docs:
        out.append({
            "score": float(doc.score),
            "url": doc.url,
            "transcription": doc.transcription
        })

    return out
