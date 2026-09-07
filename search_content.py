import json
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# --- Configuration ---
JSON_FILE = "content.json"
TOP_K = 3

# Load the embedding model once (no Whisper, no downloads)
model = SentenceTransformer("all-MiniLM-L6-v2")


def load_data():
    try:
        with open(JSON_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def search(query, data, top_k=TOP_K):
    if not data:
        print("content.json is empty or missing.")
        return

    query_vec = model.encode(query)
    embeddings = np.array([np.array(item["embedding"]) for item in data])
    similarities = cosine_similarity(query_vec.reshape(1, -1), embeddings)[0]

    top_indices = np.argsort(similarities)[-top_k:][::-1]

    print(f"\n--- Top {top_k} results for: '{query}' ---\n")
    for i in top_indices:
        score = similarities[i]
        item = data[i]
        print(f"Score : {score:.4f}")
        print(f"URL   : {item['url']}")
        print(f"Text  : {item['transcription'][:250]}...")
        print("-" * 70)


if __name__ == "__main__":
    data = load_data()
    print(f"Loaded {len(data)} indexed reels from {JSON_FILE}")

    while True:
        user_query = input("\nEnter search query (or 'exit' to quit): ").strip()
        if user_query.lower() in ("exit", "quit"):
            break
        if user_query:
            search(user_query, data)
