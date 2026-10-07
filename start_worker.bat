@echo off
REM ============================================================
REM  MediSecure AI - Celery Worker
REM  Broker URL is read from the project's own config
REM  (backend\app\config.py -> CELERY_BROKER_URL). Nothing is
REM  invented here and there is NO silent fallback to
REM  synchronous AI processing.
REM ============================================================
setlocal
cd /d "%~dp0backend"

if not exist "venv\Scripts\python.exe" (
  echo [ERROR] backend\venv not found at: %CD%\venv
  echo         Create it with: python -m venv venv
  pause
  exit /b 1
)

set "PYTHONPATH=."

REM ---------------------------------------------------------------------------
REM CPU budget.
REM The API process must stay responsive while this worker runs PyTorch. Both
REM processes would otherwise spawn one BLAS/OMP thread per core and starve
REM each other (measured: upload crypto stage 2.2s -> 10.4s under load).
REM Capping the worker's threads and lowering its priority keeps the API fast
REM without changing any cryptographic parameter.
REM ---------------------------------------------------------------------------
if "%OMP_NUM_THREADS%"=="" set "OMP_NUM_THREADS=2"
if "%MKL_NUM_THREADS%"=="" set "MKL_NUM_THREADS=2"
if "%OPENBLAS_NUM_THREADS%"=="" set "OPENBLAS_NUM_THREADS=2"
if "%NUMEXPR_NUM_THREADS%"=="" set "NUMEXPR_NUM_THREADS=2"
echo [MediSecure] Worker thread budget : %OMP_NUM_THREADS% (API keeps the rest)

REM 1) Show the broker the project actually uses.
echo [MediSecure] Reading Celery broker from backend\app\config.py ...
venv\Scripts\python -c "from app.config import CELERY_BROKER_URL as b; print('[MediSecure] Broker    :', b)" || goto :cfgerror

REM 2) Probe it with the SAME helper the API uses (bounded TCP connect).
venv\Scripts\python -c "import sys; from app.celery_worker import broker_reachable; sys.exit(0 if broker_reachable() else 1)"
if errorlevel 1 goto :brokerdown

echo [MediSecure] Starting Celery worker (prefetch=1, acks_late, concurrency 1)
REM Run the worker BELOW_NORMAL priority so an in-flight forensic job never
REM starves the API process handling the doctor's upload.
start "MediSecure Worker" /low "%~dp0start_worker_run.bat"
echo [MediSecure] Worker started in its own window at BELOW_NORMAL priority.
goto :done

:brokerdown
echo.
echo [ERROR] The configured Celery broker is NOT reachable.
echo         AI forensic processing runs ONLY in this worker.
echo         Start the broker, for example:
echo           docker run -d -p 6379:6379 redis:7-alpine
echo         or point REDIS_URL at a running Redis instance, then
echo         re-run start_worker.bat.
echo.
echo         The API will keep accepting studies and will report
echo         worker_queued=false with the real broker error - it
echo         will NOT run the AI inline as a silent fallback.
pause
exit /b 1

:cfgerror
echo [ERROR] Could not load the Celery configuration from the backend.
pause
exit /b 1

:done
endlocal