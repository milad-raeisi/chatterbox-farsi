"""Voice library: the two built-in Farsi voices plus voices the user uploads or records."""

from __future__ import annotations

import io
import json
import re
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

from .config import BUILTIN_VOICES, Settings

MIN_SECONDS = 3.0
MAX_SECONDS = 20.0  # the model uses at most 10 s of the reference; keep a little headroom
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
_CUSTOM_ID_RE = re.compile(r"^c_[0-9a-f]{12}$")


class VoiceError(ValueError):
    pass


@dataclass(frozen=True)
class Voice:
    id: str
    name: str
    kind: str  # "builtin" | "custom"
    duration: float
    gender: str | None = None
    created_at: str | None = None

    def public(self) -> dict:
        return asdict(self)


def _duration(path: Path) -> float:
    info = sf.info(str(path))
    return round(info.frames / float(info.samplerate), 2)


def _trim_silence(audio: np.ndarray, sr: int, threshold_db: float = -40.0) -> np.ndarray:
    frame = max(1, int(sr * 0.02))
    if audio.size < frame * 2:
        return audio
    frames = audio[: audio.size // frame * frame].reshape(-1, frame)
    rms_db = 20 * np.log10(np.sqrt(np.mean(frames**2, axis=1)) + 1e-9)
    loud = np.flatnonzero(rms_db > rms_db.max() + threshold_db)
    if loud.size == 0:
        return audio
    start = max(0, loud[0] - 2) * frame
    end = min(audio.size, (loud[-1] + 3) * frame)
    return audio[start:end]


class VoiceStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.dir = settings.voices_dir

    def _builtin(self) -> list[tuple[Voice, Path]]:
        out = []
        for vid, meta in BUILTIN_VOICES.items():
            path = self.settings.model_dir / meta["file"]
            if path.is_file():
                voice = Voice(vid, meta["name"], "builtin", _duration(path), gender=meta["gender"])
                out.append((voice, path))
        return out

    def _custom(self) -> list[tuple[Voice, Path]]:
        out = []
        if not self.dir.is_dir():
            return out
        for meta_path in sorted(self.dir.glob("c_*.json")):
            wav = meta_path.with_suffix(".wav")
            if not wav.is_file():
                continue
            try:
                meta = json.loads(meta_path.read_text("utf-8"))
                out.append((Voice(kind="custom", **meta), wav))
            except (ValueError, TypeError):
                continue
        out.sort(key=lambda item: item[0].created_at or "", reverse=True)
        return out

    def list(self) -> list[Voice]:
        return [v for v, _ in self._builtin() + self._custom()]

    def resolve(self, voice_id: str) -> tuple[Voice, Path]:
        for voice, path in self._builtin() + self._custom():
            if voice.id == voice_id:
                return voice, path
        raise KeyError(voice_id)

    def add(self, data: bytes, name: str) -> Voice:
        if len(data) > MAX_UPLOAD_BYTES:
            raise VoiceError("فایل صوتی بیش از حد بزرگ است (حداکثر ۲۵ مگابایت).")
        try:
            audio, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
        except Exception as exc:  # soundfile raises several types for bad input
            raise VoiceError("فایل صوتی قابل خواندن نیست. یک فایل WAV بفرستید.") from exc
        audio = _trim_silence(audio.mean(axis=1), sr)
        seconds = audio.size / sr
        if seconds < MIN_SECONDS:
            raise VoiceError("نمونهٔ صدا باید دست‌کم ۳ ثانیه گفتار داشته باشد.")
        audio = audio[: int(MAX_SECONDS * sr)]
        peak = float(np.max(np.abs(audio))) or 1.0
        audio = audio * (0.89 / peak)  # about -1 dBFS, so quiet recordings still condition well

        voice_id = f"c_{uuid.uuid4().hex[:12]}"
        self.dir.mkdir(parents=True, exist_ok=True)
        wav_path = self.dir / f"{voice_id}.wav"
        sf.write(str(wav_path), audio, sr, subtype="PCM_16")
        voice = Voice(
            id=voice_id,
            name=(name.strip() or "صدای من")[:40],
            kind="custom",
            duration=round(audio.size / sr, 2),
            created_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        meta = {k: v for k, v in voice.public().items() if k not in ("kind", "gender")}
        (self.dir / f"{voice_id}.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")
        return voice

    def delete(self, voice_id: str) -> None:
        if not _CUSTOM_ID_RE.match(voice_id):
            raise KeyError(voice_id)
        found = False
        for suffix in (".wav", ".json"):
            path = self.dir / f"{voice_id}{suffix}"
            if path.exists():
                path.unlink()
                found = True
        if not found:
            raise KeyError(voice_id)
