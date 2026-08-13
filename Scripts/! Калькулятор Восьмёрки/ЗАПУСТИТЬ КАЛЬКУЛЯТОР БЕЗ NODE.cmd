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

echo Starting Lottery Eights Calculator without Node.js...
start "Lottery Eights Calculator - local server" /min powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\local-server.ps1" -Port 4175

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
