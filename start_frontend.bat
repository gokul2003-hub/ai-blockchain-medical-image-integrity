@echo off
REM ============================================================
REM  MediSecure AI - Frontend (Vite dev server)
REM  Uses the existing node_modules and the existing
REM  package.json scripts. No reinstall on every start.
REM ============================================================
setlocal
cd /d "%~dp0frontend"

if not exist "package.json" (
  echo [ERROR] frontend\package.json not found at: %CD%
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] node_modules not found at: %CD%\node_modules
  echo         Install once with:  npm install
  echo         This script never installs dependencies for you.
  pause
  exit /b 1
)

REM Pick the first package manager that is BOTH lockfile-backed AND actually
REM installed on this machine. Checking only for a lockfile is not enough:
REM a stale yarn.lock with no yarn binary would fail at runtime.
set "PM="
where pnpm >nul 2>&1
if not errorlevel 1 if exist "pnpm-lock.yaml" set "PM=pnpm"

if not defined PM (
  where yarn >nul 2>&1
  if not errorlevel 1 if exist "yarn.lock" set "PM=yarn"
)

REM npm ships with Node.js, so it is the reliable fallback here.
if not defined PM set "PM=npm"

echo [MediSecure] Package manager : %PM%
echo [MediSecure] Dev server      : http://localhost:5173
echo.

where %PM% >nul 2>&1
if errorlevel 1 (
  echo [ERROR] "%PM%" is not available on PATH.
  pause
  exit /b 1
)

call %PM% run dev

endlocal