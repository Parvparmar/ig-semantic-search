# ReelSearch

Semantic search for your saved Instagram reels. Paste URLs → audio gets transcribed → search by meaning, not keywords.

```
"that pasta recipe with butter and anchovies" → finds it instantly
```

---

## Architecture

```
Browser (React + Vite)
    │  Supabase Auth (JWT)
    ▼
FastAPI backend
    ├── yt-dlp          — download reel audio
    ├── Whisper (HF)    — transcribe speech to text
    ├── all-MiniLM-L6   — embed text → 384-dim vector
    └── Supabase        — store transcriptions + pgvector search
```

**GPU auto-detection:** if `torch.cuda.is_available()` is true at startup, Whisper and the embedding model are both loaded onto CUDA automatically. No config needed — users with a GPU get 5–10× faster transcription.

---

## Prerequisites

- Python 3.11+
- Node 20+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed on the server (`pip install yt-dlp`)
- [ffmpeg](https://ffmpeg.org/) installed (`brew install ffmpeg` / `apt install ffmpeg`)
- A [Supabase](https://supabase.com) project (free tier is fine)

---

## 1 — Supabase setup

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** and run the contents of `backend/schema.sql`
3. From **Settings → API**, copy:
   - `Project URL` → `SUPABASE_URL`
   - `anon / public` key → `VITE_SUPABASE_ANON_KEY` (frontend)
   - `service_role` key → `SUPABASE_SERVICE_KEY` (backend — keep secret)
   - `JWT Secret` → `SUPABASE_JWT_SECRET` (backend)

---

## 2 — Instagram cookies (required for private/auth-gated reels)

Instagram requires you to be logged in to download reels.

1. Log into Instagram in Chrome/Firefox
2. Install the **"Get cookies.txt LOCALLY"** browser extension
3. Visit any Instagram reel and export cookies → save as `backend/cookies.txt`
4. The file is gitignored and only read by the backend

> **Tip:** Cookies expire. If downloads start failing, re-export.

---

## 3 — Local development

### Backend

```bash
cd backend
cp .env.example .env          # fill in your Supabase values
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Server starts at http://localhost:8000

### Frontend

```bash
cd frontend
cp .env.example .env          # fill in SUPABASE_URL and ANON_KEY
npm install
npm run dev
```

App starts at http://localhost:5173

---

## 4 — Docker (recommended)

```bash
cp backend/.env.example backend/.env   # fill in values
cp frontend/.env.example frontend/.env # fill in values
cp /path/to/your/cookies.txt backend/cookies.txt

docker compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:8000

### GPU support

1. Install [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
2. Edit `backend/Dockerfile` — swap the base image to the CUDA image (comment in the GPU line)
3. Uncomment the `deploy.resources` block in `docker-compose.yml`
4. Set `WHISPER_MODEL=openai/whisper-small` in `.env` for better accuracy (GPU can handle it)

---

## 5 — Production deployment

### Backend → Railway / Render

1. Push `backend/` as a separate repo (or monorepo with root set to `backend/`)
2. Add environment variables from `.env.example`
3. Add `cookies.txt` as a secret file mount
4. Railway auto-detects the Dockerfile

### Frontend → Vercel / Netlify

```bash
cd frontend
npm run build          # outputs to dist/
```

Set `VITE_API_URL` to your deployed backend URL.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | service_role key (never expose to frontend) |
| `SUPABASE_JWT_SECRET` | JWT secret for token verification |
| `WHISPER_MODEL` | `openai/whisper-tiny` (fast) or `openai/whisper-base` (default) or `openai/whisper-small` (accurate) |
| `COOKIES_FILE` | Path to Netscape cookies file (default: `cookies.txt`) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | Backend URL (default: `/api` via Vite proxy in dev) |

---

## Whisper model tradeoffs

| Model | Speed (CPU) | Speed (GPU) | Accuracy |
|---|---|---|---|
| `whisper-tiny` | ~30s/min audio | ~5s/min audio | Good for clear speech |
| `whisper-base` | ~60s/min audio | ~8s/min audio | Better (recommended default) |
| `whisper-small` | ~2min/min audio | ~15s/min audio | Best for noisy reels |

---

## Known limitations

- Instagram occasionally changes their anti-scraping measures; if yt-dlp fails, run `pip install -U yt-dlp` to update it
- Reels with no speech (music-only, silent) will produce empty or garbled transcriptions
- Ingestion is synchronous — for high volume, consider a task queue (Celery + Redis) in front of the `/ingest` endpoint
