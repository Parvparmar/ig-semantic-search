import os
import subprocess
import tempfile
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Optional

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from transformers import pipeline as hf_pipeline
from sentence_transformers import SentenceTransformer
from supabase import create_client, Client
from jose import jwt, JWTError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── GPU detection ──────────────────────────────────────────────────────────────
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
logger.info(f"Using device: {DEVICE} {'(GPU 🚀)' if DEVICE != 'cpu' else '(CPU)'}")

# ── Global model holders ────────────────────────────────────────────────────────
whisper_pipe = None
embed_model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global whisper_pipe, embed_model
    logger.info("Loading Whisper model...")
    whisper_pipe = hf_pipeline(
        "automatic-speech-recognition",
        model=os.getenv("WHISPER_MODEL", "openai/whisper-base"),
        chunk_length_s=30,
        device=DEVICE,
    )
    logger.info("Loading embedding model...")
    embed_model = SentenceTransformer("all-MiniLM-L6-v2", device=DEVICE)
    logger.info("Models ready ✓")
    yield
    logger.info("Shutting down")


app = FastAPI(title="ReelSearch API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Supabase client ────────────────────────────────────────────────────────────
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],  # service key for server-side ops
)

# ── Auth ───────────────────────────────────────────────────────────────────────
bearer_scheme = HTTPBearer()
SUPABASE_JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user_id
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Token error: {e}")


# ── Pydantic models ────────────────────────────────────────────────────────────
class IngestRequest(BaseModel):
    urls: List[str]

class SearchRequest(BaseModel):
    query: str
    top_k: int = 5

class ReelResult(BaseModel):
    id: str
    url: str
    transcription: str
    score: float
    video_id: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────
def download_audio(url: str, output_path: str) -> None:
    """Download Instagram reel audio via yt-dlp."""
    cookies_file = os.getenv("COOKIES_FILE", "cookies.txt")
    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "-o", output_path,
        "--no-playlist",
    ]
    if os.path.exists(cookies_file):
        cmd += ["--cookies", cookies_file]
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {result.stderr[:300]}")


def get_video_id(url: str) -> str:
    cookies_file = os.getenv("COOKIES_FILE", "cookies.txt")
    cmd = ["yt-dlp", "--get-id", "--no-playlist"]
    if os.path.exists(cookies_file):
        cmd += ["--cookies", cookies_file]
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"Could not get video ID: {result.stderr[:200]}")
    return result.stdout.strip()


def embed(text: str) -> List[float]:
    vec = embed_model.encode(text, normalize_embeddings=True)
    return vec.tolist()


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {
        "status": "ok",
        "device": DEVICE,
        "gpu": DEVICE != "cpu",
    }


@app.post("/ingest")
async def ingest(req: IngestRequest, user_id: str = Depends(get_current_user)):
    processed = []
    errors = []

    for url in req.urls:
        # Skip already-indexed URLs for this user
        existing = supabase.table("reels").select("id").eq("user_id", user_id).eq("url", url).execute()
        if existing.data:
            processed.append({"url": url, "status": "already_indexed"})
            continue

        try:
            video_id = await asyncio.to_thread(get_video_id, url)

            with tempfile.TemporaryDirectory() as tmpdir:
                audio_path = os.path.join(tmpdir, f"{video_id}.mp3")
                await asyncio.to_thread(download_audio, url, audio_path)

                # Transcribe
                result = await asyncio.to_thread(whisper_pipe, audio_path)
                transcription = result["text"].strip()

            # Embed
            vector = await asyncio.to_thread(embed, transcription)

            # Upsert to Supabase
            supabase.table("reels").insert({
                "user_id": user_id,
                "url": url,
                "video_id": video_id,
                "transcription": transcription,
                "embedding": vector,
            }).execute()

            processed.append({"url": url, "video_id": video_id, "transcription": transcription[:120] + "..."})

        except Exception as e:
            logger.error(f"Error processing {url}: {e}")
            errors.append({"url": url, "error": str(e)})

    return {"processed": processed, "errors": errors}


@app.post("/search", response_model=List[ReelResult])
async def search(req: SearchRequest, user_id: str = Depends(get_current_user)):
    query_vec = await asyncio.to_thread(embed, req.query)

    # pgvector cosine similarity search via Supabase RPC
    result = supabase.rpc("search_reels", {
        "query_user_id": user_id,
        "query_embedding": query_vec,
        "match_count": req.top_k,
    }).execute()

    return [
        ReelResult(
            id=row["id"],
            url=row["url"],
            transcription=row["transcription"],
            score=row["similarity"],
            video_id=row.get("video_id"),
        )
        for row in result.data
    ]


@app.get("/reels")
def list_reels(user_id: str = Depends(get_current_user)):
    result = supabase.table("reels").select("id, url, video_id, transcription, created_at") \
        .eq("user_id", user_id).order("created_at", desc=True).execute()
    return result.data


@app.delete("/reels/{reel_id}")
def delete_reel(reel_id: str, user_id: str = Depends(get_current_user)):
    result = supabase.table("reels").delete() \
        .eq("id", reel_id).eq("user_id", user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Reel not found")
    return {"deleted": reel_id}
