@echo off
title SevaDesk - Initial Setup & Dependencies Installer
cd /d "%~dp0"

echo ======================================================================
echo                SEVADESK - TEAM SETUP & INSTALLER
echo      Installing Dependencies for Frontend, Backend, & Extension
echo ======================================================================
echo.

rem 1. Check Node.js
echo [1/4] Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH.
    echo Please install Node.js 18+ from https://nodejs.org/ and try again.
    pause
    exit /b 1
)
node -v

rem 2. Install Root & Workspace NPM Packages
echo.
echo [2/4] Installing NPM packages (Workspaces & Frontend UI)...
call npm install
call npm --prefix apps/workspace install

rem 3. Setup Python Virtual Environment
echo.
echo [3/4] Setting up Python virtual environment in services\local-core\.venv...
where python >nul 2>nul
if %errorlevel% neq 0 (
    where py >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] Python is not found in PATH.
        echo Please install Python 3.10+ from https://python.org/ and try again.
        pause
        exit /b 1
    ) else (
        set PYCMD=py
    )
) else (
    set PYCMD=python
)

if not exist "services\local-core\.venv\Scripts\python.exe" (
    echo Creating virtual environment...
    %PYCMD% -m venv services\local-core\.venv
)

echo Installing Python daemon dependencies...
services\local-core\.venv\Scripts\python.exe -m pip install --upgrade pip
services\local-core\.venv\Scripts\python.exe -m pip install -r services\local-core\requirements.txt

rem 4. Run Automated Test Verification
echo.
echo [4/4] Verifying installation with automated test suite...
call npm run test:all

echo.
echo ======================================================================
echo                     SETUP COMPLETED SUCCESSFULLY!
echo ======================================================================
echo.
echo  To start SevaDesk:
echo    Double-click run.bat (or execute .\run.ps1 in PowerShell)
echo.
echo  To test with team members:
echo    See TEAM_TESTING_GUIDE.md for complete step-by-step instructions.
echo.
pause
