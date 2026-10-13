@echo off
cd /d "%~dp0"
echo Starting SevaDesk at http://127.0.0.1:4173
py -m http.server 4173 --bind 127.0.0.1
pause
