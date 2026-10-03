@echo off
REM Double-click to start Bible Journal on Windows.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org, install it, then double-click this file again.
  pause
  exit /b 1
)
node --disable-warning=ExperimentalWarning server.js
echo Bible Journal has stopped.
pause
