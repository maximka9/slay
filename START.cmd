@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer first.
  pause
  exit /b 1
)
if not exist node_modules call npm ci
if not exist node_modules exit /b 1
echo Open the Local URL printed below in your browser.
call npm run dev
pause
