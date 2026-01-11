import torch
from transformers import pipeline
import os
import subprocess
import json
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# --- Configuration ---
jsonfile = "content.json"
input_file = "reels.txt"
audio_folder = "audio"
device = "cuda:0" if torch.cuda.is_available() else "cpu"

# 1. Initialize Models
pipe = pipeline(
    "automatic-speech-recognition",
    model="openai/whisper-tiny",
    chunk_length_s=30,
    device=device,
    ignore_warning=True
)
model = SentenceTransformer("all-MiniLM-L6-v2")

os.makedirs(audio_folder, exist_ok=True)

def load_data():
    if os.path.exists(jsonfile):
        with open(jsonfile, 'r') as f:
            try:
                return json.load(f)
            except json.JSONDecodeError:
                return []
    return []

def save_data(data):
    # Convert numpy arrays to lists so they are JSON serializable
    serializable_data = []
    for item in data:
        new_item = item.copy()
        if isinstance(new_item.get('embedding'), np.ndarray):
            new_item['embedding'] = new_item['embedding'].tolist()
        serializable_data.append(new_item)
    
    with open(jsonfile, 'w') as f:
        json.dump(serializable_data, f, indent=4)

def get_embedding(text):
    if not text: return None
    # Returns a numpy array
    return model.encode(text)

def process_reels():
    indexed_data = load_data()
    # Create a set of already processed URLs for fast lookup
    print(indexed_data)
    processed_urls = {item['url'] for item in indexed_data if 'url' in item}

    if not os.path.exists(input_file):
        print(f"File {input_file} not found.")
        return indexed_data

    with open(input_file, "r") as f:
        urls = [line.strip() for line in f if line.strip()]

    new_data_added = False

    for url in urls:
        if url in processed_urls:
            print(f"Skipping already processed: {url}")
            continue
        
        print(f"--- Processing: {url} ---")
        try:
            # Step A: Download
            get_id_cmd = ["yt-dlp", "--get-id", "--cookies", "cookies.txt", url]
            video_id = subprocess.check_output(get_id_cmd, text=True).strip()
            final_filename = os.path.join(audio_folder, f"{video_id}.mp3")

            if not os.path.exists(final_filename):
                download_cmd = [
                    "yt-dlp", "--cookies", "cookies.txt", url,
                    "-x", "--audio-format", "mp3",
                    "-o", os.path.join(audio_folder, "%(id)s.%(ext)s")
                ]
                subprocess.run(download_cmd, check=True)

            # Step B: Transcribe
            print(f"Transcribing...")
            transcription = pipe(final_filename)["text"]

            # Step C: Embed
            print(f"Generating Embedding...")
            embedding = get_embedding(transcription)

            # Step D: Append to list
            indexed_data.append({
                "url": url,
                "transcription": transcription,
                "embedding": embedding
            })
            new_data_added = True
            processed_urls.add(url)

        except Exception as e:
            print(f"Error processing {url}: {e}")

    if new_data_added:
        save_data(indexed_data)
    
    return indexed_data

def search(query, indexed_data, top_k=3):
    if not indexed_data:
        print("No data to search through.")
        return

    print(f"\nSearching for: '{query}'")
    query_vec = get_embedding(query).reshape(1, -1)
    
    # Extract embeddings and ensure they are numpy arrays
    embeddings = np.array([np.array(item['embedding']) for item in indexed_data])
    
    # Calculate Cosine Similarity
    similarities = cosine_similarity(query_vec, embeddings)[0]
    
    # Get top K indices
    top_indices = np.argsort(similarities)[-top_k:][::-1]

    print("\n--- Search Results ---")
    for i in top_indices:
        score = similarities[i]
        item = indexed_data[i]
        print(f"\nScore: {score:.4f}")
        print(f"URL: {item['url']}")
        print(f"Text: {item['transcription'][:200]}...")

if __name__ == "__main__":
    # 1. Process and Index
    data = process_reels()
    
    # 2. Interactive Search
    while True:
        user_query = input("\nEnter search query (or 'exit' to quit): ")
        if user_query.lower() == 'exit':
            break
        search(user_query, data)