# SevaDesk Assisted Service Workstation - PowerShell Launcher
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "               SEVADESK ASSISTED SERVICE WORKSTATION" -ForegroundColor Green
Write-Host "  Local-First CSC Operator Workspace with DPDP Act Privacy Guarantees" -ForegroundColor Gray
Write-Host "======================================================================" -ForegroundColor Cyan

# Check Python environment
$PythonExe = Join-Path $ScriptDir "services\local-core\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Write-Host "[1/2] Creating Python virtual environment..." -ForegroundColor Yellow
    python -m venv "services\local-core\.venv"
    & (Join-Path $ScriptDir "services\local-core\.venv\Scripts\pip.exe") install -r "services\local-core\requirements.txt"
}

Write-Host "[1/2] Launching Local Core Daemon (FastAPI, SQLite, OCR) on http://127.0.0.1:8765..." -ForegroundColor Green
$daemonProcess = Start-Process -FilePath $PythonExe -ArgumentList "-m uvicorn app.main:app --app-dir services/local-core --port 8765 --host 127.0.0.1" -PassThru -WindowStyle Hidden

Write-Host "[2/2] Launching React+Vite Operator Workspace on http://127.0.0.1:5173..." -ForegroundColor Green
Write-Host ""
Write-Host "  Operator Workspace:  http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "  Citizen Display:     http://127.0.0.1:5173" -ForegroundColor Cyan
Write-Host "  Local API Docs:      http://127.0.0.1:8765/docs" -ForegroundColor Cyan
Write-Host "  Chrome Extension:    Load unpacked from $ScriptDir\apps\extension" -ForegroundColor Cyan
Write-Host ""

Start-Process "http://127.0.0.1:5173"

try {
    npm --prefix apps/workspace run dev -- --host 127.0.0.1 --port 5173
} finally {
    if ($daemonProcess -and -not $daemonProcess.HasExited) {
        Stop-Process -Id $daemonProcess.Id -Force -ErrorAction SilentlyContinue
    }
}
