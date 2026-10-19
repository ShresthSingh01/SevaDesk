# SevaDesk Assisted Service Workstation - PowerShell Installer & Setup
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "                SEVADESK - TEAM SETUP & INSTALLER" -ForegroundColor Green
Write-Host "      Installing Dependencies for Frontend, Backend, & Extension" -ForegroundColor Gray
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Node.js
Write-Host "[1/4] Checking Node.js environment..." -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not found in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js 18+ from https://nodejs.org/ and try again." -ForegroundColor Red
    exit 1
}
$nodeVersion = node -v
Write-Host "  Found Node.js $nodeVersion" -ForegroundColor Green

# 2. Install NPM packages
Write-Host ""
Write-Host "[2/4] Installing NPM packages (Workspaces & Frontend UI)..." -ForegroundColor Yellow
npm install
npm --prefix apps/workspace install

# 3. Setup Python Virtual Environment
Write-Host ""
Write-Host "[3/4] Setting up Python virtual environment in services\local-core\.venv..." -ForegroundColor Yellow
$PythonExe = Join-Path $ScriptDir "services\local-core\.venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    Write-Host "  Creating virtual environment..." -ForegroundColor Cyan
    if (Get-Command py -ErrorAction SilentlyContinue) {
        py -m venv "services\local-core\.venv"
    } else {
        python -m venv "services\local-core\.venv"
    }
}

Write-Host "  Installing Python daemon dependencies..." -ForegroundColor Cyan
& (Join-Path $ScriptDir "services\local-core\.venv\Scripts\python.exe") -m pip install --upgrade pip
& (Join-Path $ScriptDir "services\local-core\.venv\Scripts\python.exe") -m pip install -r "services\local-core\requirements.txt"

# 4. Verify test suite
Write-Host ""
Write-Host "[4/4] Verifying installation with automated test suite..." -ForegroundColor Yellow
npm run test:all

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host "                     SETUP COMPLETED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  To start SevaDesk:  .\run.ps1  (or double-click run.bat)" -ForegroundColor Cyan
Write-Host "  Testing guide:      TEAM_TESTING_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
