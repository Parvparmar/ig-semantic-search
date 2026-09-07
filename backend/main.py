import json
import os
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from transformers import pipeline


ROOT = Path(__file__).resolve().parent.parent
CONTENT_FILE = ROOT / "content.json"
AUDIO_DIR = ROOT / "audio"
COOKIES_FILE = ROOT / "cookies.txt"
model = SentenceTransformer("all-MiniLM-L6-v2")
speech_pipeline = None
jobs: dict[str, dict[str, Any]] = {}

app = FastAPI(title="Where's That Reel Semantic Search")
app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:3000", "http://localhost:3001"],
	allow_methods=["GET", "POST", "PUT", "DELETE"],
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


class IndexRequest(BaseModel):
	url: str


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


def update_job(job_id: str, **values: Any) -> None:
	jobs[job_id] = {**jobs.get(job_id, {}), **values}


def get_speech_pipeline():
	global speech_pipeline
	if speech_pipeline is None:
		speech_pipeline = pipeline(
			"automatic-speech-recognition",
			model="openai/whisper-tiny",
			chunk_length_s=30,
			device="cuda:0" if __import__("torch").cuda.is_available() else "cpu",
		)
	return speech_pipeline


def process_index_job(job_id: str, url: str) -> None:
	audio_file: Path | None = None
	try:
		AUDIO_DIR.mkdir(exist_ok=True)
		cookies = ["--cookies", str(COOKIES_FILE)] if COOKIES_FILE.exists() else []
		update_job(job_id, status="Downloading video", progress=15)
		video_id = subprocess.check_output(["yt-dlp", *cookies, "--get-id", url], cwd=ROOT, text=True).strip()
		if not video_id:
			raise RuntimeError("Could not determine the video id.")

		update_job(job_id, status="Extracting audio", progress=35)
		output_template = str(AUDIO_DIR / f"{video_id}.%(ext)s")
		subprocess.run(
			["yt-dlp", *cookies, "-x", "--audio-format", "mp3", "-o", output_template, url],
			cwd=ROOT,
			check=True,
		)
		audio_file = AUDIO_DIR / f"{video_id}.mp3"
		if not audio_file.exists():
			raise RuntimeError("Audio extraction did not produce an MP3 file.")

		update_job(job_id, status="Transcribing audio", progress=58)
		transcription = get_speech_pipeline()(str(audio_file))["text"].strip()
		if not transcription:
			raise RuntimeError("Whisper returned an empty transcription.")

		update_job(job_id, status="Generating embedding", progress=82, transcription=transcription)
		item = {"url": url, "transcription": transcription, "embedding": model.encode(transcription).tolist()}
		data = load_data()
		data.insert(0, item)
		save_data(data)
		update_job(job_id, status="Indexed", progress=100, complete=True, item=item)
	except Exception as error:
		update_job(job_id, status="Indexing failed", progress=100, complete=True, error=str(error))
	finally:
		if audio_file and audio_file.exists():
			try:
				audio_file.unlink()
			except OSError:
				pass


@app.post("/content/index")
def start_index(payload: IndexRequest) -> dict[str, str]:
	url = payload.url.strip()
	if not url:
		raise HTTPException(status_code=400, detail="URL is required.")
	if any(item.get("url") == url for item in load_data()):
		raise HTTPException(status_code=409, detail="This reel is already indexed.")

	job_id = uuid.uuid4().hex
	update_job(job_id, status="Queued", progress=5, complete=False)
	threading.Thread(target=process_index_job, args=(job_id, url), daemon=True).start()
	return {"job_id": job_id}


@app.get("/content/jobs/{job_id}")
def index_status(job_id: str) -> dict[str, Any]:
	job = jobs.get(job_id)
	if job is None:
		raise HTTPException(status_code=404, detail="Indexing job not found.")
	return job


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


@app.delete("/content")
def delete_content(url: str) -> dict[str, str]:
	data = load_data()
	remaining = [item for item in data if item.get("url") != url]
	if len(remaining) == len(data):
		raise HTTPException(status_code=404, detail="Reel not found in content.json.")

	save_data(remaining)
	return {"status": "deleted", "url": url}


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
