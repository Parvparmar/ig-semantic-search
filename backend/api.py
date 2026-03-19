from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
from typing import Dict

from pipeline import create_index, process_for_user, search_user_reels

app = FastAPI(title="Reels Pipeline API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/upload-reels")
async def upload_reels(file: UploadFile = File(...), user_id: str = "default", background_tasks: BackgroundTasks = None):
    save_path = "reels.txt"
    with open(save_path, "wb") as out_f:
        shutil.copyfileobj(file.file, out_f)

    create_index()

    if background_tasks:
        background_tasks.add_task(process_for_user, user_id)
        return {"status": "queued", "message": "Processing started in background"}
    try:
        report = process_for_user(user_id)
        return {"status": "processed", "report": report}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/process")
def trigger_process(user_id: str = "default") -> Dict:
    create_index()
    return {"status": "processed", "report": process_for_user(user_id)}


@app.post("/search")
def search(payload: Dict):
    user_id = payload.get("user_id", "default")
    query = payload.get("query", "")
    top_k = int(payload.get("top_k", 3))
    return {"results": search_user_reels(user_id, query, top_k)}
