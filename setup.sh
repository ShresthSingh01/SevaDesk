#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "======================================================================"
echo "                SEVADESK - TEAM SETUP & INSTALLER"
echo "      Installing Dependencies for Frontend, Backend, & Extension"
echo "======================================================================"
echo ""

# 1. Check Node.js
echo "[1/4] Checking Node.js environment..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed. Please install Node.js 18+."
    exit 1
fi
node -v

# 2. Install NPM packages
echo ""
echo "[2/4] Installing NPM packages..."
npm install
npm --prefix apps/workspace install

# 3. Setup Python Virtual Environment
echo ""
echo "[3/4] Setting up Python virtual environment in services/local-core/.venv..."
VENV_DIR="services/local-core/.venv"
if [ ! -f "$VENV_DIR/bin/python" ]; then
    python3 -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install -r services/local-core/requirements.txt

# 4. Verify test suite
echo ""
echo "[4/4] Verifying with automated test suite..."
npm run test:all

echo ""
echo "======================================================================"
echo "                     SETUP COMPLETED SUCCESSFULLY!"
echo "======================================================================"
echo "To start SevaDesk: ./run.sh"
echo "See TEAM_TESTING_GUIDE.md for detailed review walkthrough."
