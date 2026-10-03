"""FastAPI entrypoint for the transcription microservice.

Stateless: media is fetched/streamed and never persisted. When GROQ_API_KEY is
absent the service reports `configured: false` and rejects transcription, so the
rest of the stack keeps working without it.
"""

import os
from typing import Optional

import httpx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings

app = FastAPI(title="SarkiAI Policy Sandbox — Transcription", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptResponse(BaseModel):
    text: str
    language: Optional[str] = None
    segments: list[TranscriptSegment] = []


def _authorize(api_key: Optional[str]) -> None:
    if settings.service_api_key and api_key != settings.service_api_key:
        raise HTTPException(status_code=401, detail="Invalid service API key.")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "sps-transcription",
        "configured": bool(settings.groq_api_key),
        "model": settings.groq_audio_model_name,
    }


@app.post("/v1/transcribe", response_model=TranscriptResponse)
async def transcribe(file: UploadFile = File(...), x_api_key: Optional[str] = Header(default=None)) -> TranscriptResponse:
    _authorize(x_api_key)
    if not settings.groq_api_key:
        raise HTTPException(status_code=503, detail="Transcription not configured (missing GROQ_API_KEY).")

    data = await file.read()
    if len(data) > 100 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Media too large (max 100 MB).")

    async with httpx.AsyncClient(timeout=300.0) as client:
        response = await client.post(
            GROQ_TRANSCRIBE_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            data={"model": settings.groq_audio_model_name, "response_format": "verbose_json"},
            files={"file": (file.filename or "audio", data, file.content_type or "audio/mpeg")},
        )
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Transcription provider error: {response.text[:300]}")

    payload = response.json()
    segments = [
        TranscriptSegment(start=s.get("start", 0.0), end=s.get("end", 0.0), text=s.get("text", "").strip())
        for s in payload.get("segments", [])
    ]
    return TranscriptResponse(text=payload.get("text", ""), language=payload.get("language"), segments=segments)
