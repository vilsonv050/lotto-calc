@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:8787/shutdown' -UseBasicParsing -TimeoutSec 3 | Out-Null } catch {}"
exit /b
