import json
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity


ROOT = Path(__file__).resolve().parent.parent
CONTENT_FILE = ROOT / "content.json"
model = SentenceTransformer("all-MiniLM-L6-v2")

app = FastAPI(title="Where's That Reel Semantic Search")
app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:3000", "http://localhost:3001"],
	allow_methods=["GET", "POST", "PUT"],
	allow_headers=["*"],
)


class SearchRequest(BaseModel):
	query: str
	top_k: int = 3


class ContentUpdate(BaseModel):
	url: str
	transcription: str


class ContentCreate(BaseModel):
	url: str
	transcription: str


def load_data() -> list[dict[str, Any]]:
	try:
		with CONTENT_FILE.open("r", encoding="utf-8") as content_file:
			data = json.load(content_file)
		return data if isinstance(data, list) else []
	except (FileNotFoundError, json.JSONDecodeError):
		return []


def save_data(data: list[dict[str, Any]]) -> None:
	with CONTENT_FILE.open("w", encoding="utf-8") as content_file:
		json.dump(data, content_file, indent=4)


@app.put("/content")
def update_content(payload: ContentUpdate) -> dict[str, dict[str, Any]]:
	transcription = payload.transcription.strip()
	if not transcription:
		raise HTTPException(status_code=400, detail="Transcription cannot be empty.")

	data = load_data()
	for item in data:
		if item.get("url") == payload.url:
			item["transcription"] = transcription
			item["embedding"] = model.encode(transcription).tolist()
			save_data(data)
			return {"item": item}

	raise HTTPException(status_code=404, detail="Reel not found in content.json.")


@app.post("/content")
def create_content(payload: ContentCreate) -> dict[str, dict[str, Any]]:
	url = payload.url.strip()
	transcription = payload.transcription.strip()
	if not url or not transcription:
		raise HTTPException(status_code=400, detail="URL and transcription are required.")

	data = load_data()
	if any(item.get("url") == url for item in data):
		raise HTTPException(status_code=409, detail="This reel is already indexed.")

	item = {
		"url": url,
		"transcription": transcription,
		"embedding": model.encode(transcription).tolist(),
	}
	data.insert(0, item)
	save_data(data)
	return {"item": item}


@app.post("/search")
def search(payload: SearchRequest) -> dict[str, list[dict[str, Any]]]:
	query = payload.query.strip()
	data = load_data()
	if not query or not data:
		return {"results": []}

	records = [item for item in data if item.get("embedding")]
	if not records:
		return {"results": []}

	query_vector = model.encode(query)
	embeddings = np.asarray([item["embedding"] for item in records])
	similarities = cosine_similarity(query_vector.reshape(1, -1), embeddings)[0]
	top_k = max(1, min(payload.top_k, len(records)))
	top_indices = np.argsort(similarities)[-top_k:][::-1]

	results = []
	for index in top_indices:
		item = records[index]
		results.append({
			"url": item.get("url", ""),
			"transcription": item.get("transcription", ""),
			"score": float(similarities[index]),
		})
	return {"results": results}


@app.get("/health")
def health() -> dict[str, str]:
	return {"status": "ok"}
