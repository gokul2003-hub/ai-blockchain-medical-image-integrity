@echo off
REM ============================================================
REM  MediSecure AI - Celery broker (Redis)
REM
REM  The project's Celery broker is REDIS_URL (see
REM  backend\app\config.py -> CELERY_BROKER_URL). This script
REM  starts a LOCAL, PORTABLE Redis on the exact host/port
REM  that config expects. No system install, no Windows
REM  service, no admin rights - it is just a process.
REM
REM  Already-running brokers are detected and left alone.
REM ============================================================
setlocal
cd /d "%~dp0"

set "REDIS_DIR=%~dp0.tools\redis"
if not exist "%REDIS_DIR%\redis-server.exe" (
  echo [ERROR] Portable Redis not found at: %REDIS_DIR%
  echo         Restore .tools\redis\ from your checkout, or point
  echo         REDIS_URL in backend\app\config.py at any other
  echo         running Redis instance.
  pause
  exit /b 1
)

REM Ask Python for the host:port the project is configured to use, so this
REM script can never disagree with the application configuration.
set "PYTHONIOENCODING=utf-8"
for /f "usebackq delims=" %%h in (`powershell -NoProfile -Command ^
  "$u=[Uri]$env:CELERY_BROKER_URL; if(-not $u){$u=[Uri]'redis://127.0.0.1:6379/0'}; '{0}:{1}' -f $u.Host,$u.Port"`) do set "HOSTPORT=%%h"
if not defined HOSTPORT set "HOSTPORT=127.0.0.1:6379"

REM Split host / port
for /f "tokens=1,2 delims=:" %%a in ("%HOSTPORT%") do (
  set "RHOST=%%a"
  set "RPORT=%%b"
)

echo [MediSecure] Broker target from project config: %RHOST%:%RPORT%

powershell -NoProfile -Command "try{$c=New-Object System.Net.Sockets.TcpClient;$c.Connect('%RHOST%',%RPORT%);$c.Close();exit 0}catch{exit 1}"
if not errorlevel 1 (
  echo [MediSecure] Broker already listening on %RHOST%:%RPORT% - nothing to do.
  goto :done
)

echo [MediSecure] Starting portable Redis 8.10.2 (in-memory, no persistence) ...
start "MediSecure Redis" /min "%REDIS_DIR%\redis-server.exe" --port %RPORT% --bind %RHOST% --save "" --appendonly no

REM Wait (max ~10s) for it to accept connections.
for /l %%i in (1,1,20) do (
  powershell -NoProfile -Command "try{$c=New-Object System.Net.Sockets.TcpClient;$c.Connect('%RHOST%',%RPORT%);$c.Close();exit 0}catch{exit 1}"
  if not errorlevel 1 goto :up
  ping -n 1 127.0.0.1 >nul
)

echo [ERROR] Redis did not come up on %RHOST%:%RPORT%.
pause
exit /b 1

:up
echo [MediSecure] Broker is UP on %RHOST%:%RPORT%
echo.
echo         This window can be closed; Redis keeps running.
echo         Stop it with:  .tools\redis\redis-cli.exe -h %RHOST% -p %RPORT% SHUTDOWN NOSAVE

:done
endlocal