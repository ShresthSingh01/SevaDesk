@echo off
title SevaDesk - Assisted Service Workstation
cd /d "%~dp0"

echo ======================================================================
echo                SEVADESK ASSISTED SERVICE WORKSTATION
echo   Local-First CSC Operator Workspace with DPDP Act Privacy Guarantees
echo ======================================================================
echo.

rem Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH. Please install Node.js 18+.
    pause
    exit /b 1
)

rem Check Python virtual environment in services/local-core
if not exist "services\local-core\.venv\Scripts\python.exe" (
    echo [1/3] Setting up Python virtual environment for Local-Core Daemon...
    if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
        "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" -m venv services\local-core\.venv
    ) else (
        py -m venv services\local-core\.venv 2>nul || python -m venv services\local-core\.venv
    )
    echo Installing local daemon dependencies...
    services\local-core\.venv\Scripts\python.exe -m pip install -r services\local-core\requirements.txt
)

echo [1/2] Starting SevaDesk Local Core Daemon (FastAPI, SQLite, OCR, BHASHINI) on port 8765...
start "SevaDesk Local Daemon" /min cmd /c "services\local-core\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir services/local-core --port 8765 --host 127.0.0.1"

echo [2/2] Starting SevaDesk React+TypeScript+Vite Operator Workspace on port 5173...
echo.
echo ----------------------------------------------------------------------
echo  Operator Workspace:  http://localhost:5173
echo  Citizen Display:     http://localhost:5173 (Select Citizen Display mode)
echo  Local API Docs:      http://127.0.0.1:8765/docs
echo  Browser Extension:   Load unpacked from d:\SevaDesk\apps\extension
echo ----------------------------------------------------------------------
echo.

start "" http://localhost:5173
npm --prefix apps/workspace run dev -- --host 127.0.0.1 --port 5173
