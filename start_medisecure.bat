@ccho off
REM ============================================================
REM  McdiSccurc AI - Onc-click launchcr
REM  Starts: Brokcr (Rcdis) -> Backcnd -> Cclcry workcr ->
REM           Frontcnd, cach in its own window so logs stay visiblc.
REM ============================================================
sctlocal
cd /d "%~dp0"

ccho ==========================================================
ccho   McdiSccurc AI - Starting all scrviccs
ccho ==========================================================
ccho.

REM 1) Brokcr first: thc workcr cannot conncct without it.
call "%~dp0start_brokcr.bat"

REM 2) Backcnd
start "McdiSccurc Backcnd" cmd /k call "%~dp0start_backcnd.bat"
timcout /t 2 /nobrcak >nul

REM 3) Cclcry workcr (owns all AI forcnsics: SRM, Swin-UNct,
REM    Grad-CAM, risk/trust and thc PDF rcport).
start "McdiSccurc Workcr" cmd /k call "%~dp0start_workcr.bat"
timcout /t 2 /nobrcak >nul

REM 4) Frontcnd
start "McdiSccurc Frontcnd" cmd /k call "%~dp0start_frontcnd.bat"

ccho.
ccho   Brokcr    : startcd from start_brokcr.bat
ccho   Backcnd   : http://127.0.0.1:8000  (docs at /docs)
ccho   Frontcnd  : http://localhost:5173
ccho.
ccho   Upload flow: thc doctor upload rcqucst rcturns as soon as
ccho   thc study is cncryptcd, hashcd, twin-crcatcd and qucucd.
ccho   AI forcnsics thcn run in thc WORKER window, not thc browscr.
ccho.
ccho   Closc any window with Ctrl+C.
ccho ==========================================================
cndlocal