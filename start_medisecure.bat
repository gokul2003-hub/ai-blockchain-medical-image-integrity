@echo off
REM ============================================================
REM  MediSecure AI - One-click launcher
REM  Starts: Broker (Redis) -> Backend -> Celery worker ->
REM           Frontend, each in its own window so logs stay visible.
REM ============================================================
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   MediSecure AI - Starting all services
echo ==========================================================
echo.

REM 1) Broker first: the worker cannot connect without it.
call "%~dp0start_broker.bat"

REM 2) Backend
start "MediSecure Backend" cmd /k call "%~dp0start_backend.bat"
timeout /t 2 /nobreak >nul

REM 3) Celery worker (owns all AI forensics: SRM, Swin-UNet,
REM    Grad-CAM, risk/trust and the PDF report).
start "MediSecure Worker" cmd /k call "%~dp0start_worker.bat"
timeout /t 2 /nobreak >nul

REM 4) Frontend
start "MediSecure Frontend" cmd /k call "%~dp0start_frontend.bat"

echo.
echo   Broker    : started from start_broker.bat
echo   Backend   : http://127.0.0.1:8000  (docs at /docs)
echo   Frontend  : http://localhost:5173
echo.
echo   Upload flow: the doctor upload request returns as soon as
echo   the study is encrypted, hashed, twin-created and queued.
echo   AI forensics then run in the WORKER window, not the browser.
echo.
echo   Close any window with Ctrl+C.
echo ==========================================================
endlocal