"""HTTP API for the Ava Persian TTS studio. Serves the built web UI too, so one local
process is the whole app and nothing needs the internet."""

from __future__ import annotations

from .config import force_offline_env

force_offline_env()  # must run before anything imports huggingface_hub / transformers

import asyncio
import json
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import __version__
from .audio import join_chunks, normalize_loudness, write_wav
from .config import MODEL_PAGE_URL, Settings
from .engine import GenParams, ModelNotReady, TTSEngine, VoiceRef
from .text import chunk_text, estimate_seconds, normalize
from .voices import VoiceError, VoiceStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("ava.api")

settings = Settings()
engine = TTSEngine(settings)
voices = VoiceStore(settings)
_OUTPUT_ID_RE = re.compile(r"^[0-9a-f]{16}$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.outputs_dir.mkdir(parents=True, exist_ok=True)
    settings.voices_dir.mkdir(parents=True, exist_ok=True)
    app.state.synth_lock = asyncio.Lock()
    if settings.autoload:
        engine.start_loading()
    yield


app = FastAPI(title="Ava · Persian TTS", version=__version__, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ----------------------------------------------------------------------------- schemas


class TTSRequest(BaseModel):
    text: str = Field(min_length=1)
    voice_id: str = "female"
    exaggeration: float = Field(0.5, ge=0.25, le=2.0)
    cfg_weight: float = Field(0.5, ge=0.0, le=1.0)
    temperature: float = Field(0.8, ge=0.05, le=2.0)
    seed: int | None = Field(None, ge=0, le=2**31 - 1)
    pause_ms: int = Field(250, ge=0, le=2000)
    spell_numbers: bool = True


class AnalyzeRequest(BaseModel):
    text: str
    spell_numbers: bool = True


# ------------------------------------------------------------------------------ health


@app.get("/api/health")
def health() -> dict:
    return {
        "status": engine.status,
        "stage": engine.stage,
        "error": engine.error,
        "device": engine.device,
        "device_name": engine.device_name,
        "sample_rate": engine.sample_rate,
        "load_seconds": engine.load_seconds,
        "missing_files": settings.missing_model_files() if engine.status == "missing_models" else [],
        "model_dir": str(settings.model_dir),
        "offline": True,
        "max_text_chars": settings.max_text_chars,
        "version": __version__,
        "model_url": MODEL_PAGE_URL,
    }


@app.post("/api/engine/reload")
def reload_engine() -> dict:
    """Try loading again, e.g. after the model files were downloaded."""
    started = engine.start_loading()
    return {"started": started, "status": engine.status}


# -------------------------------------------------------------------------------- text


@app.post("/api/text/analyze")
def analyze(body: AnalyzeRequest) -> dict:
    clean = normalize(body.text, spell_numbers=body.spell_numbers)
    chunks = chunk_text(clean, settings.chunk_chars)
    return {
        "normalized": clean,
        "chunks": [c.text for c in chunks],
        "characters": len(body.text),
        "estimated_seconds": estimate_seconds(clean),
    }


# ------------------------------------------------------------------------------ voices


@app.get("/api/voices")
def list_voices() -> list[dict]:
    return [v.public() for v in voices.list()]


@app.post("/api/voices", status_code=201)
async def add_voice(
    file: UploadFile = File(...),
    name: str = Form(""),
    consent: bool = Form(False),
) -> dict:
    if not consent:
        raise HTTPException(400, "برای ساخت صدا باید تأیید کنید که اجازهٔ استفاده از این صدا را دارید.")
    data = await file.read()
    try:
        voice = await run_in_threadpool(voices.add, data, name)
    except VoiceError as exc:
        raise HTTPException(400, str(exc)) from exc
    return voice.public()


@app.delete("/api/voices/{voice_id}", status_code=204)
def delete_voice(voice_id: str) -> None:
    try:
        voices.delete(voice_id)
    except KeyError as exc:
        raise HTTPException(404, "صدا پیدا نشد.") from exc
    engine.forget_voice(voice_id)


@app.get("/api/voices/{voice_id}/audio")
def voice_audio(voice_id: str) -> FileResponse:
    try:
        _, path = voices.resolve(voice_id)
    except KeyError as exc:
        raise HTTPException(404, "صدا پیدا نشد.") from exc
    return FileResponse(path, media_type="audio/wav")


# --------------------------------------------------------------------------------- tts


def _event(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8")


@app.post("/api/tts")
async def tts(body: TTSRequest, request: Request) -> StreamingResponse:
    """Stream NDJSON progress events while synthesizing, ending with a `done` event that
    points at the finished WAV file."""
    if engine.status != "ready":
        raise HTTPException(503, engine.error or "مدل هنوز آماده نیست.")
    if len(body.text) > settings.max_text_chars:
        raise HTTPException(413, f"متن طولانی‌تر از {settings.max_text_chars} نویسه است.")
    try:
        voice, voice_path = voices.resolve(body.voice_id)
    except KeyError as exc:
        raise HTTPException(404, "صدای انتخاب‌شده پیدا نشد.") from exc

    clean = normalize(body.text, spell_numbers=body.spell_numbers)
    chunks = chunk_text(clean, settings.chunk_chars)
    if not chunks:
        raise HTTPException(400, "متن قابل خواندنی پیدا نشد.")

    params = GenParams(body.exaggeration, body.cfg_weight, body.temperature)
    ref = VoiceRef(voice.id, voice_path)
    lock: asyncio.Lock = request.app.state.synth_lock

    async def stream() -> AsyncIterator[bytes]:
        if lock.locked():
            yield _event({"type": "queued"})
        async with lock:
            started = time.perf_counter()
            yield _event({"type": "start", "total": len(chunks), "chunks": [c.text for c in chunks]})
            pieces = []
            for i, chunk in enumerate(chunks):
                if await request.is_disconnected():
                    log.info("Client went away; stopping after %d/%d chunks", i, len(chunks))
                    return
                seed = None if body.seed is None else body.seed + i
                try:
                    audio = await run_in_threadpool(engine.generate_chunk, chunk.text, ref, params, seed)
                except ModelNotReady as exc:
                    yield _event({"type": "error", "message": str(exc)})
                    return
                except Exception as exc:  # report, don't kill the server
                    log.exception("Synthesis failed")
                    yield _event({"type": "error", "message": f"{type(exc).__name__}: {exc}"})
                    return
                pieces.append(normalize_loudness(audio, engine.sample_rate))
                yield _event(
                    {
                        "type": "progress",
                        "index": i,
                        "total": len(chunks),
                        "audio_seconds": round(audio.size / engine.sample_rate, 2),
                        "elapsed": round(time.perf_counter() - started, 2),
                    }
                )

            pauses = [body.pause_ms * (2 if c.paragraph_end else 1) for c in chunks]
            final = join_chunks(pieces, pauses, engine.sample_rate)
            output_id = uuid.uuid4().hex[:16]
            await run_in_threadpool(
                write_wav, settings.outputs_dir / f"{output_id}.wav", final, engine.sample_rate
            )
            elapsed = time.perf_counter() - started
            duration = final.size / engine.sample_rate
            record = {
                "id": output_id,
                "url": f"/api/outputs/{output_id}.wav",
                "text": body.text,
                "voice_id": voice.id,
                "voice_name": voice.name,
                "duration": round(duration, 2),
                "elapsed": round(elapsed, 2),
                "rtf": round(elapsed / duration, 2) if duration else None,
                "chunks": len(chunks),
                "device": engine.device,
                "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "params": body.model_dump(exclude={"text"}),
            }
            (settings.outputs_dir / f"{output_id}.json").write_text(
                json.dumps(record, ensure_ascii=False), "utf-8"
            )
            yield _event({"type": "done", **record})

    return StreamingResponse(
        stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


# ----------------------------------------------------------------------------- history


@app.get("/api/history")
def history(limit: int = 100) -> list[dict]:
    items = []
    for meta_path in settings.outputs_dir.glob("*.json"):
        if not meta_path.with_suffix(".wav").is_file():
            continue
        try:
            items.append(json.loads(meta_path.read_text("utf-8")))
        except ValueError:
            continue
    items.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return items[: max(1, min(limit, 500))]


@app.get("/api/outputs/{output_id}.wav")
def output_audio(output_id: str, download: bool = False) -> FileResponse:
    path = settings.outputs_dir / f"{output_id}.wav"
    if not _OUTPUT_ID_RE.match(output_id) or not path.is_file():
        raise HTTPException(404, "فایل صوتی پیدا نشد.")
    filename = f"ava-{output_id}.wav" if download else None
    return FileResponse(path, media_type="audio/wav", filename=filename)


@app.delete("/api/history/{output_id}", status_code=204)
def delete_output(output_id: str) -> None:
    if not _OUTPUT_ID_RE.match(output_id):
        raise HTTPException(404, "مورد پیدا نشد.")
    removed = False
    for suffix in (".wav", ".json"):
        path = settings.outputs_dir / f"{output_id}{suffix}"
        if path.exists():
            path.unlink()
            removed = True
    if not removed:
        raise HTTPException(404, "مورد پیدا نشد.")


# ---------------------------------------------------------------------------- web UI

if settings.web_dir.is_dir():
    app.mount("/", StaticFiles(directory=settings.web_dir, html=True), name="web")
else:

    @app.get("/", response_class=HTMLResponse)
    def no_ui() -> str:
        return (
            "<html dir='rtl' lang='fa'><body style='font-family:sans-serif;padding:2rem'>"
            "<h1>Ava API is running</h1><p>The web UI has not been built yet. Run "
            "<code>npm run build</code> in <code>web/</code>, or use <code>npm run dev</code>.</p>"
            "</body></html>"
        )
