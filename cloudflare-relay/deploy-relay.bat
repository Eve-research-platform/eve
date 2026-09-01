@echo off
setlocal
cd /d "%~dp0"
echo.
echo Eve Cloudflare Relay
echo ====================
echo.
set /p SETUP_FILE=Drag your eve-relay-setup.json file here and press Enter: 
set SETUP_FILE=%SETUP_FILE:"=%
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is required to deploy the relay.
  pause
  exit /b 1
)
node scripts\deploy-relay.mjs "%SETUP_FILE%"
echo.
pause
