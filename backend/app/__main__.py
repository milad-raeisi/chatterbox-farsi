"""Run the whole app locally: `uv run python -m app` → http://127.0.0.1:8000"""

from __future__ import annotations

import argparse
import os
import threading
import webbrowser


def main() -> None:
    parser = argparse.ArgumentParser(description="Ava · offline Persian text-to-speech")
    parser.add_argument("--host", default=os.environ.get("AVA_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("AVA_PORT", "8000")))
    parser.add_argument("--open", action="store_true", help="open the UI in the default browser")
    parser.add_argument("--reload", action="store_true", help="auto-reload on code changes (dev)")
    args = parser.parse_args()

    import uvicorn

    if args.open:
        url = f"http://{'127.0.0.1' if args.host in ('0.0.0.0', '::') else args.host}:{args.port}"
        threading.Timer(1.5, webbrowser.open, args=(url,)).start()
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload, log_level="info")


if __name__ == "__main__":
    main()
