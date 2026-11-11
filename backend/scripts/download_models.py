"""One-time model download: the only step of the whole app that needs internet.

    uv run python scripts/download_models.py               # uses `hf auth login` or HF_TOKEN
    uv run python scripts/download_models.py --token hf_…

The Farsi weights are gated. Accept the license on the model page first:
    https://huggingface.co/mehdi-hf/chatterbox-farsi

Everything lands in backend/models/chatterbox-farsi/ (or --model-dir). That folder is
self-contained: copy it to an offline machine and the app runs there with no network.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import (  # noqa: E402
    BASE_FILES,
    BASE_REPO,
    FARSI_REPO,
    FARSI_SUBDIR,
    FARSI_T3_FILENAME,
    MODEL_PAGE_URL,
    T3_FILENAME,
    Settings,
)

FARSI_FILES = (FARSI_T3_FILENAME, "voices/female.wav", "voices/male.wav", "LICENSE", "NOTICE", "README.md")


def _link_or_copy(src: Path, dst: Path) -> None:
    """Expose the Farsi T3 under the file name the loader expects, without a 2 GB copy."""
    if dst.exists() or dst.is_symlink():
        dst.unlink()
    try:
        dst.symlink_to(src.relative_to(dst.parent))  # relative, so the folder can be moved
    except (OSError, ValueError):
        try:
            os.link(src, dst)
        except OSError:
            shutil.copy2(src, dst)


def _size(path: Path) -> str:
    size = path.stat().st_size
    return f"{size / 1e9:.2f} GB" if size > 1e8 else f"{size / 1e6:.1f} MB"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model-dir", type=Path, help="where to put the files")
    parser.add_argument("--token", help="Hugging Face access token (default: HF_TOKEN or `hf auth login`)")
    args = parser.parse_args()
    if args.model_dir:
        os.environ["AVA_MODEL_DIR"] = str(args.model_dir.expanduser().resolve())
    settings = Settings()
    model_dir = settings.model_dir
    model_dir.mkdir(parents=True, exist_ok=True)
    token = args.token or os.environ.get("HF_TOKEN") or None

    from huggingface_hub import hf_hub_download
    from huggingface_hub.errors import GatedRepoError, HfHubHTTPError, RepositoryNotFoundError

    print(f"→ Model folder: {model_dir}\n")
    print(f"[1/2] Base components from {BASE_REPO} (MIT license)")
    for name in BASE_FILES:
        path = Path(hf_hub_download(BASE_REPO, name, local_dir=model_dir, token=token))
        print(f"      ✓ {name}  ({_size(path)})")

    print(f"\n[2/2] Persian weights and voices from {FARSI_REPO} (non-commercial license)")
    farsi_dir = model_dir / FARSI_SUBDIR
    try:
        for name in FARSI_FILES:
            path = Path(hf_hub_download(FARSI_REPO, name, local_dir=farsi_dir, token=token))
            print(f"      ✓ {name}  ({_size(path)})")
    except (GatedRepoError, RepositoryNotFoundError) as exc:
        print(
            "\n✗ Access to the Farsi model was refused.\n"
            f"  1. Open {MODEL_PAGE_URL} and accept the license (signed in).\n"
            "  2. Log in on this machine:  uv run hf auth login\n"
            "     or pass a token:          --token hf_…  (read access is enough)\n"
            "  3. Run this script again.\n"
            f"\n  Details: {type(exc).__name__}",
            file=sys.stderr,
        )
        return 2
    except HfHubHTTPError as exc:
        print(f"\n✗ Download failed: {exc}", file=sys.stderr)
        return 1

    _link_or_copy(farsi_dir / FARSI_T3_FILENAME, model_dir / T3_FILENAME)

    missing = settings.missing_model_files()
    if missing:
        print(f"\n✗ Still missing: {', '.join(missing)}", file=sys.stderr)
        return 1
    print(
        "\n✓ All model files are in place. From now on the app runs fully offline:\n"
        "    uv run python -m app --open"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
