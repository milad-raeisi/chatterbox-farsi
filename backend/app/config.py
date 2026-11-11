"""Runtime settings. Everything is local: no setting here points at the network."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent

# Fine-tuned Persian T3 weights + built-in voices.
FARSI_REPO = "mehdi-hf/chatterbox-farsi"
# Unchanged base components (voice encoder, S3Gen decoder, tokenizer vocab).
BASE_REPO = "ResembleAI/chatterbox"
MODEL_PAGE_URL = "https://huggingface.co/mehdi-hf/chatterbox-farsi"

# File names the multilingual loader (`ChatterboxMultilingualTTS.from_local`) expects.
T3_FILENAME = "t3_mtl23ls_v2.safetensors"
BASE_FILES = ("ve.pt", "s3gen.pt", "conds.pt", "grapheme_mtl_merged_expanded_v1.json")
REQUIRED_FILES = (*BASE_FILES, T3_FILENAME)
# Files from the Farsi repo live in <model_dir>/farsi/ (kept with their LICENSE and NOTICE).
FARSI_SUBDIR = "farsi"
FARSI_T3_FILENAME = "t3_fa.safetensors"
BUILTIN_VOICES = {
    "female": {"name": "بانو", "file": f"{FARSI_SUBDIR}/voices/female.wav", "gender": "female"},
    "male": {"name": "آقا", "file": f"{FARSI_SUBDIR}/voices/male.wav", "gender": "male"},
}

# Persian has no language token in the base model; the fine-tune was trained on "ar".
LANGUAGE_ID = "ar"


def _env_path(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser().resolve() if value else default


def _env_list(name: str, default: list[str]) -> list[str]:
    value = os.environ.get(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    model_dir: Path = field(
        default_factory=lambda: _env_path("AVA_MODEL_DIR", BACKEND_DIR / "models" / "chatterbox-farsi")
    )
    data_dir: Path = field(default_factory=lambda: _env_path("AVA_DATA_DIR", BACKEND_DIR / "data"))
    web_dir: Path = field(default_factory=lambda: _env_path("AVA_WEB_DIR", PROJECT_DIR / "web" / "out"))
    # Optional: load T3 weights from another file instead of <model_dir>/t3_mtl23ls_v2.safetensors.
    t3_checkpoint: Path | None = field(
        default_factory=lambda: _env_path("AVA_T3_CHECKPOINT", Path()) if os.environ.get("AVA_T3_CHECKPOINT") else None
    )
    device: str = field(default_factory=lambda: os.environ.get("AVA_DEVICE", "auto").lower())
    cors_origins: list[str] = field(
        default_factory=lambda: _env_list(
            "AVA_CORS_ORIGINS", ["http://localhost:3000", "http://127.0.0.1:3000"]
        )
    )
    max_text_chars: int = field(default_factory=lambda: int(os.environ.get("AVA_MAX_TEXT_CHARS", "5000")))
    chunk_chars: int = field(default_factory=lambda: int(os.environ.get("AVA_CHUNK_CHARS", "180")))
    autoload: bool = field(default_factory=lambda: os.environ.get("AVA_AUTOLOAD", "1") != "0")

    @property
    def voices_dir(self) -> Path:
        return self.data_dir / "voices"

    @property
    def outputs_dir(self) -> Path:
        return self.data_dir / "outputs"

    def t3_path(self) -> Path:
        return self.t3_checkpoint or (self.model_dir / T3_FILENAME)

    def missing_model_files(self) -> list[str]:
        missing = [name for name in BASE_FILES if not (self.model_dir / name).is_file()]
        if not self.t3_path().is_file():
            missing.append(T3_FILENAME)
        return missing


def force_offline_env() -> None:
    """Make every Hugging Face / transformers code path refuse network access."""
    for key in ("HF_HUB_OFFLINE", "TRANSFORMERS_OFFLINE", "HF_DATASETS_OFFLINE"):
        os.environ[key] = "1"
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("DO_NOT_TRACK", "1")
