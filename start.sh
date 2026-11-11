#!/usr/bin/env bash
# Start Ava (offline Persian TTS) in the background and open it in the browser.
#
#   ./start.sh                 start in the background, open the browser
#   ./start.sh --no-open       start without opening the browser
#   ./start.sh --foreground    run in this terminal (Ctrl+C to stop)
#
# Stop it with ./stop.sh. Logs: .run/ava.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT/.run"
PID_FILE="$RUN_DIR/ava.pid"
LOG_FILE="$RUN_DIR/ava.log"
HOST="${AVA_HOST:-127.0.0.1}"
PORT="${AVA_PORT:-8000}"
URL="http://$HOST:$PORT"
PYTHON="$ROOT/backend/.venv/bin/python"

foreground=0
open_browser=1
for arg in "$@"; do
  case "$arg" in
    -f | --foreground) foreground=1 ;;
    --no-open) open_browser=0 ;;
    -h | --help) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

mkdir -p "$RUN_DIR"

# Already running?
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Ava is already running: $URL (PID $(cat "$PID_FILE"))"
  exit 0
fi
rm -f "$PID_FILE"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use by another program. Free it, or run: AVA_PORT=8010 ./start.sh" >&2
  exit 1
fi

# Python environment (created once; needs internet only the first time).
if [[ ! -x "$PYTHON" ]]; then
  command -v uv >/dev/null || { echo "uv is not installed: https://docs.astral.sh/uv/" >&2; exit 1; }
  echo "Setting up the Python environment (one time)…"
  (cd "$ROOT/backend" && uv sync)
fi

# Web UI: build it if it is missing or the sources changed since the last build.
index="$ROOT/web/out/index.html"
if [[ ! -f "$index" ]] || [[ -n "$(find "$ROOT/web/src" -newer "$index" -print -quit)" ]]; then
  if command -v npm >/dev/null; then
    echo "Building the web UI…"
    if ! (cd "$ROOT/web" && { [[ -d node_modules ]] || npm install --silent; } && NEXT_TELEMETRY_DISABLED=1 npm run build --silent) >>"$LOG_FILE" 2>&1; then
      echo "Building the UI failed; details in $LOG_FILE" >&2
      exit 1
    fi
  elif [[ ! -f "$index" ]]; then
    echo "The web UI is not built and Node.js is not installed." >&2
    exit 1
  else
    echo "Note: UI sources changed but Node.js is missing; serving the previous build."
  fi
fi

if [[ ! -e "$ROOT/backend/models/chatterbox-farsi/t3_mtl23ls_v2.safetensors" ]]; then
  echo "Note: model files are not installed yet; the page will show how to install them."
fi

cd "$ROOT/backend"
if (( foreground )); then
  echo "Ava: $URL  (Ctrl+C to stop)"
  exec "$PYTHON" -m app --host "$HOST" --port "$PORT" $( (( open_browser )) && echo --open )
fi

nohup "$PYTHON" -m app --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

# Wait until the server answers (the model keeps loading in the background).
for _ in $(seq 1 60); do
  if curl -fs "$URL/api/health" >/dev/null 2>&1; then
    echo "Ava is running: $URL (PID $(cat "$PID_FILE")). Stop with ./stop.sh"
    if (( open_browser )); then
      if command -v open >/dev/null; then open "$URL"; elif command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1; fi
    fi
    exit 0
  fi
  if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Ava exited during start-up. Last log lines:" >&2
    tail -n 20 "$LOG_FILE" >&2
    exit 1
  fi
  sleep 0.5
done
echo "Ava started (PID $(cat "$PID_FILE")) but is not answering yet; see $LOG_FILE" >&2
exit 1
