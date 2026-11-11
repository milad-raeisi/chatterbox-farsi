"""Model loading and synthesis.

Loads Chatterbox Farsi from local files only. The server process sets HF_HUB_OFFLINE=1 before
this module runs, and `_strip_network_side_effects` removes the one loader path that would
otherwise try to download data (the Chinese tokenizer helpers).
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .audio import trim_edges
from .config import BASE_FILES, LANGUAGE_ID, T3_FILENAME, Settings

log = logging.getLogger("ava.engine")

_COND_CACHE_SIZE = 8
_RETRIES = 3


def duration_window(text: str) -> tuple[float, float, float]:
    """(shortest acceptable, expected, longest acceptable) seconds of speech for ``text``.
    Too short: the model card's early-stop check (≥ 1 s per 40 characters).
    Too long: slower than ~5 letters per second means rambling, repeats or a noisy tail.
    Natural Persian runs at roughly 13 letters per second."""
    letters = sum(1 for ch in text if not ch.isspace())
    return len(text) / 40, max(0.5, letters / 13), letters / 5 + 2.0


@dataclass(frozen=True)
class GenParams:
    exaggeration: float = 0.5
    cfg_weight: float = 0.5
    temperature: float = 0.8


@dataclass(frozen=True)
class VoiceRef:
    id: str
    path: Path


class ModelNotReady(RuntimeError):
    pass


def pick_device(preference: str) -> str:
    """`auto` → CUDA when present, otherwise CPU. Apple's MPS is opt-in (AVA_DEVICE=mps): the
    model card reports noticeably worse audio on MPS, and on an M5 Pro it was also slower than
    the CPU (≈5.7× vs ≈2.5–3.5× real time)."""
    import torch

    if preference in ("", "auto"):
        return "cuda" if torch.cuda.is_available() else "cpu"
    if preference.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError("AVA_DEVICE=cuda but no CUDA GPU is available")
    if preference == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("AVA_DEVICE=mps but Apple Metal (MPS) is not available")
    return preference


def device_label(device: str) -> str:
    import torch

    if device.startswith("cuda"):
        return torch.cuda.get_device_name(0)
    if device == "mps":
        return "Apple Silicon (Metal)"
    return "CPU"


def _strip_network_side_effects() -> None:
    """MTLTokenizer builds a Chinese Cangjie converter on every load. That converter calls
    `hf_hub_download` and `spacy_pkuseg.pkuseg()`, which downloads a segmentation model.
    Persian never uses it, so swap in a no-op and keep start-up fully offline."""
    from chatterbox.models.tokenizers import tokenizer as tok

    class _NoChineseConverter:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        def __call__(self, text: str) -> str:
            return text

    tok.ChineseCangjieConverter = _NoChineseConverter


class TTSEngine:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.status = "idle"  # idle | loading | ready | missing_models | error
        self.stage = ""
        self.error: str | None = None
        self.device: str | None = None
        self.device_name: str | None = None
        self.sample_rate = 24_000
        self.load_seconds: float | None = None
        self.model = None
        self._infer_lock = threading.Lock()  # one synthesis at a time on the device
        self._load_lock = threading.Lock()
        self._conds: OrderedDict[str, object] = OrderedDict()

    # ------------------------------------------------------------------ loading

    def start_loading(self) -> bool:
        if self.status in ("loading", "ready"):
            return False
        self.status = "loading"
        self.stage = "starting"
        threading.Thread(target=self.load, name="ava-model-loader", daemon=True).start()
        return True

    def _checkpoint_dir(self) -> Path:
        """Directory laid out the way `from_local` expects. With AVA_T3_CHECKPOINT set,
        build a small directory of links so any T3 file can be used."""
        if self.settings.t3_checkpoint is None:
            return self.settings.model_dir
        link_dir = self.settings.data_dir / ".checkpoint"
        link_dir.mkdir(parents=True, exist_ok=True)
        for name, src in [(n, self.settings.model_dir / n) for n in BASE_FILES] + [
            (T3_FILENAME, self.settings.t3_checkpoint)
        ]:
            dst = link_dir / name
            if dst.is_symlink() or dst.exists():
                dst.unlink()
            dst.symlink_to(src.resolve())
        return link_dir

    def load(self) -> None:
        with self._load_lock:
            if self.model is not None:
                self.status = "ready"
                return
            missing = self.settings.missing_model_files()
            if missing:
                self.status = "missing_models"
                self.stage = ""
                self.error = "Model files are missing: " + ", ".join(missing)
                log.warning("%s (model dir: %s)", self.error, self.settings.model_dir)
                return
            self.status, self.error = "loading", None
            started = time.perf_counter()
            try:
                self.stage = "importing"
                import torch

                _strip_network_side_effects()
                from chatterbox.mtl_tts import ChatterboxMultilingualTTS

                device = pick_device(self.settings.device)
                if device == "cpu":
                    torch.set_num_threads(max(1, os.cpu_count() or 1))
                self.device, self.device_name = device, device_label(device)
                self.stage = "loading_weights"
                log.info("Loading Chatterbox Farsi on %s (%s)", device, self.device_name)
                self.model = ChatterboxMultilingualTTS.from_local(self._checkpoint_dir(), device)
                self.sample_rate = int(self.model.sr)
                self.load_seconds = round(time.perf_counter() - started, 1)
                self.status, self.stage = "ready", ""
                log.info("Model ready in %.1fs", self.load_seconds)
            except Exception as exc:  # surfaced to the UI through /api/health
                log.exception("Model failed to load")
                self.status, self.stage = "error", ""
                self.error = f"{type(exc).__name__}: {exc}"

    # --------------------------------------------------------------- synthesis

    def _use_voice(self, voice: VoiceRef, exaggeration: float) -> None:
        stat = voice.path.stat()
        key = f"{voice.id}:{stat.st_mtime_ns}:{stat.st_size}"
        cached = self._conds.get(key)
        if cached is None:
            self.model.prepare_conditionals(str(voice.path), exaggeration=exaggeration)
            cached = self.model.conds
            self._conds[key] = cached
            while len(self._conds) > _COND_CACHE_SIZE:
                self._conds.popitem(last=False)
        else:
            self._conds.move_to_end(key)
        self.model.conds = cached

    def forget_voice(self, voice_id: str) -> None:
        with self._infer_lock:
            for key in [k for k in self._conds if k.startswith(f"{voice_id}:")]:
                del self._conds[key]

    def generate_chunk(
        self, text: str, voice: VoiceRef, params: GenParams, seed: int | None = None
    ) -> np.ndarray:
        """Synthesize one chunk. Each take is trimmed of silence/tails, then checked against
        `duration_window`: the model sometimes stops almost at once (the card warns about this)
        or keeps going with stray sounds. Bad takes are retried; if every take is off, the one
        closest to the expected length wins."""
        if self.status != "ready" or self.model is None:
            raise ModelNotReady(self.error or f"model is {self.status}")
        import torch

        shortest, expected, longest = duration_window(text)
        with self._infer_lock:
            self._use_voice(voice, params.exaggeration)
            takes: list[np.ndarray] = []
            for attempt in range(_RETRIES):
                if seed is not None:
                    torch.manual_seed(seed + attempt * 7919)
                wav = self.model.generate(
                    text,
                    language_id=LANGUAGE_ID,
                    exaggeration=params.exaggeration,
                    cfg_weight=params.cfg_weight,
                    temperature=params.temperature,
                )
                audio = trim_edges(wav.squeeze(0).detach().cpu().numpy().astype(np.float32), self.sample_rate)
                seconds = audio.size / self.sample_rate
                if shortest <= seconds <= longest:
                    return audio
                takes.append(audio)
                log.warning(
                    "Take %d is %.1fs (want %.1f–%.1fs), retrying: %s",
                    attempt + 1, seconds, shortest, longest, text[:60],
                )
            return min(takes, key=lambda a: abs(a.size / self.sample_rate - expected))
