@echo off
REM ============================================================
REM  MediSecure AI - Backend (FastAPI)
REM  Uses the existing backend\venv. No dependency installation.
REM ============================================================
setlocal
cd /d "%~dp0backend"

if not exist "venv\Scripts\python.exe" (
  echo [ERROR] backend\venv not found at: %CD%\venv
  echo         Create it with: python -m venv venv
  pause
  exit /b 1
)

echo [MediSecure] Starting FastAPI on http://127.0.0.1:8000
echo [MediSecure] Docs: http://127.0.0.1:8000/docs
echo.
venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

endlocal