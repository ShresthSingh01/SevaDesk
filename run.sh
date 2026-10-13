#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-4173}"
echo "SevaDesk is running at http://127.0.0.1:${PORT}"
echo "Press Ctrl+C to stop the local server."
exec python3 -m http.server "$PORT" --bind 127.0.0.1
