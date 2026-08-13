@echo off
setlocal

set "APP_URL=http://127.0.0.1:4175/"
cd /d "%~dp0"

call :server_ready
if not errorlevel 1 (
  if /I "%~1"=="--check" (
    echo Calculator is already running: %APP_URL%
    exit /b 0
  )
  start "" "%APP_URL%"
  exit /b 0
)

if /I "%~1"=="--check" (
  echo Calculator is not running now.
  exit /b 1
)

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%I"

if not defined NODE_EXE (
  echo.
  echo Node.js was not found.
  echo Install Node.js from https://nodejs.org/ and try again.
  echo.
  pause
  exit /b 1
)

echo Starting Lottery Eights Calculator...
start "Lottery Eights Calculator - local server" /min "%NODE_EXE%" "scripts\dev-server.mjs"

for /l %%N in (1,1,30) do (
  call :server_ready
  if not errorlevel 1 goto open_calculator
  >nul timeout /t 1 /nobreak
)

echo.
echo The calculator did not start within 30 seconds.
echo Check whether another program uses port 4175, then try again.
echo.
pause
exit /b 1

:open_calculator
start "" "%APP_URL%"
exit /b 0

:server_ready
powershell.exe -NoLogo -NoProfile -NonInteractive -Command ^
  "try { $r = Invoke-WebRequest -UseBasicParsing -Uri $env:APP_URL -TimeoutSec 2; if ($r.StatusCode -eq 200 -and $r.Content -match 'og-v3\.png') { exit 0 } } catch {}; exit 1" >nul 2>&1
exit /b %errorlevel%
