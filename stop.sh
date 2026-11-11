#!/usr/bin/env bash
# Stop Ava started with ./start.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$ROOT/.run/ava.pid"
PORT="${AVA_PORT:-8000}"

pid=""
[[ -f "$PID_FILE" ]] && pid="$(cat "$PID_FILE")"

# No (live) PID file: fall back to an Ava server listening on the port. Only a process
# running `python -m app` from this project is touched; anything else is left alone.
if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
  pid=""
  for candidate in $(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true); do
    cmd="$(ps -o command= -p "$candidate" 2>/dev/null || true)"
    cwd="$(lsof -a -d cwd -p "$candidate" -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
    if [[ "$cmd" == *"-m app"* && "$cwd" == "$ROOT/backend" ]]; then
      pid="$candidate"
      break
    fi
  done
fi

if [[ -z "$pid" ]]; then
  rm -f "$PID_FILE"
  echo "Ava is not running."
  exit 0
fi

kill -TERM "$pid" 2>/dev/null || true
for _ in $(seq 1 30); do
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.5
done
if kill -0 "$pid" 2>/dev/null; then
  echo "Ava did not exit within 15 s; forcing it to stop."
  kill -KILL "$pid" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "Ava stopped."
