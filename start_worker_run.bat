@echo off
REM ============================================================
REM  MediSecure AI - Celery worker (foreground runner)
REM  Started by start_worker.bat in its own window at
REM  BELOW_NORMAL priority. Do not double-click this directly.
REM ============================================================
setlocal
cd /d "%~dp0backend"

if not exist "venv\Scripts\python.exe" (
  echo [ERROR] backend\venv not found at: %CD%\venv
  pause
  exit /b 1
)

set "PYTHONPATH=."

REM CPU budget: leave the remaining cores to the API process.
if "%OMP_NUM_THREADS%"=="" set "OMP_NUM_THREADS=2"
if "%MKL_NUM_THREADS%"=="" set "MKL_NUM_THREADS=2"
if "%OPENBLAS_NUM_THREADS%"=="" set "OPENBLAS_NUM_THREADS=2"
if "%NUMEXPR_NUM_THREADS%"=="" set "NUMEXPR_NUM_THREADS=2"
echo [MediSecure] Celery worker - OMP/MKL threads: %OMP_NUM_THREADS%

venv\Scripts\python -m celery -A app.celery_worker.celery_app worker ^
  --loglevel=info --pool=solo --concurrency=1 --without-gossip --without-mingle

echo.
echo [MediSecure] Worker exited with code %ERRORLEVEL%
endlocal