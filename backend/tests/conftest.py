"""Point the app at throw-away directories *before* `app.main` is imported."""

import os
import tempfile
from pathlib import Path

_ROOT = Path(tempfile.mkdtemp(prefix="ava-test-"))
os.environ["AVA_DATA_DIR"] = str(_ROOT / "data")
os.environ["AVA_MODEL_DIR"] = str(_ROOT / "models")
os.environ["AVA_WEB_DIR"] = str(_ROOT / "no-web")
os.environ["AVA_AUTOLOAD"] = "0"
