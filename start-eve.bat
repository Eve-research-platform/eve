@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Eve needs Node.js 20 or newer.
  echo Install Node.js, then double-click this file again.
  echo.
  pause
  exit /b 1
)
echo Starting Eve...
start "Eve server" cmd /k "node server.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8787"
