# ── CPU image (default) ──────────────────────────────────────────────────────
# For GPU support swap base image to: nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04
# and uncomment the torch GPU install below.
FROM python:3.11-slim

# yt-dlp + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl \
    && pip install yt-dlp \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# CPU torch (smaller image). For GPU replace with:
# pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
