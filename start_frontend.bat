@echo off
REM ============================================================
REM  MediSecure AI - Frontend (Vite dev server)
REM  Detects the package manager from the lockfile. No reinstall.
REM ============================================================
setlocal
cd /d "%~dp0frontend"

if not exist "package.json" (
  echo [ERROR] frontend\package.json not found at: %CD%
  pause
  exit /b 1
)

if exist "pnpm-lock.yaml" (
  set "PM=pnpm"
) else if exist "yarn.lock" (
  set "PM=yarn"
) else (
  set "PM=npm"
)

echo [MediSecure] Package manager detected: %PM%
echo [MediSecure] Starting Vite on http://localhost:5173
echo.

where %PM% >nul 2>&1
if errorlevel 1 (
  echo [ERROR] "%PM%" not found on PATH.
  pause
  exit /b 1
)

%PM% run dev

endlocal