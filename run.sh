#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "======================================================================"
echo "               SEVADESK ASSISTED SERVICE WORKSTATION"
echo "  Local-First CSC Operator Workspace with DPDP Act Privacy Guarantees"
echo "======================================================================"

VENV_PY="services/local-core/.venv/bin/python"
if [ ! -f "$VENV_PY" ]; then
    echo "[1/2] Creating Python virtual environment in services/local-core..."
    python3 -m venv services/local-core/.venv
    services/local-core/.venv/bin/pip install -r services/local-core/requirements.txt
fi

echo "[1/2] Starting Python Local Core Daemon on http://127.0.0.1:8765..."
services/local-core/.venv/bin/python -m uvicorn app.main:app --app-dir services/local-core --port 8765 --host 127.0.0.1 &
DAEMON_PID=$!

trap "kill $DAEMON_PID 2>/dev/null || true" EXIT

echo "[2/2] Starting React + Vite Operator Workspace on http://127.0.0.1:5173..."
echo "  Operator Workspace:  http://127.0.0.1:5173"
echo "  Citizen Display:     http://127.0.0.1:5173"
echo "  Local API Docs:      http://127.0.0.1:8765/docs"
echo "  Chrome Extension:    Load unpacked from apps/extension"
echo ""

npm --prefix apps/workspace run dev -- --host 127.0.0.1 --port 5173
