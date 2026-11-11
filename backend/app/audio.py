"""Small audio helpers: stitching chunks together and writing 16-bit WAV files."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

_FADE_MS = 8


def _fade(audio: np.ndarray, sr: int) -> np.ndarray:
    n = min(int(sr * _FADE_MS / 1000), audio.size // 2)
    if n <= 0:
        return audio
    audio = audio.copy()
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    audio[:n] *= ramp
    audio[-n:] *= ramp[::-1]
    return audio


def trim_edges(audio: np.ndarray, sr: int, threshold_db: float = -40.0, pad_ms: int = 80) -> np.ndarray:
    """Cut silence and low-level tails (hum, breath noise) before and after the speech.
    Conservative: anything within 40 dB of the loudest frame is kept, plus 80 ms of padding,
    so word endings are never clipped."""
    frame = max(1, int(sr * 0.02))
    n = audio.size // frame
    if n < 3:
        return audio
    frames = audio[: n * frame].reshape(n, frame)
    rms_db = 20 * np.log10(np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1)) + 1e-9)
    loud = np.flatnonzero(rms_db > rms_db.max() + threshold_db)
    if loud.size == 0:
        return audio
    pad = int(sr * pad_ms / 1000)
    start = max(0, int(loud[0]) * frame - pad)
    end = min(audio.size, (int(loud[-1]) + 1) * frame + pad)
    return audio[start:end]


def normalize_loudness(audio: np.ndarray, sr: int, target_lufs: float = -18.0, peak: float = 0.89) -> np.ndarray:
    """Bring every sentence to the same perceived loudness (ITU-R BS.1770 via pyloudnorm),
    then keep peaks below about -1 dBFS so nothing clips."""
    out = audio.astype(np.float64)
    if out.size >= int(0.5 * sr):
        try:
            import pyloudnorm as pyln

            loudness = pyln.Meter(sr).integrated_loudness(out)
            if np.isfinite(loudness):
                out = out * 10 ** ((target_lufs - loudness) / 20)
        except ValueError:
            pass  # too short or silent to measure: fall through to the peak limit
    top = float(np.max(np.abs(out))) if out.size else 0.0
    if top > peak:
        out = out * (peak / top)
    return out.astype(np.float32)


def join_chunks(pieces: list[np.ndarray], pauses_ms: list[int], sr: int) -> np.ndarray:
    """Concatenate chunks with a short fade at each edge (no clicks) and silence between them."""
    out: list[np.ndarray] = []
    for i, piece in enumerate(pieces):
        out.append(_fade(piece.astype(np.float32), sr))
        if i < len(pieces) - 1 and i < len(pauses_ms) and pauses_ms[i] > 0:
            out.append(np.zeros(int(sr * pauses_ms[i] / 1000), dtype=np.float32))
    if not out:
        return np.zeros(0, dtype=np.float32)
    return np.clip(np.concatenate(out), -1.0, 1.0)


def write_wav(path: Path, audio: np.ndarray, sr: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio, sr, subtype="PCM_16")
