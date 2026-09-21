@echo off
echo ============================================================
echo  Medical Access Control - Local Hardhat Blockchain
echo ============================================================
echo.

REM Check if node_modules exists
if not exist "%~dp0node_modules" (
    echo Installing dependencies...
    cd /d "%~dp0"
    npm install
    if errorlevel 1 (
        echo ERROR: npm install failed. Make sure Node.js 18+ is installed.
        pause
        exit /b 1
    )
    echo.
)

echo Starting Hardhat local blockchain node in a new window...
start "Hardhat Node" cmd /k "cd /d "%~dp0" && npx hardhat node"

echo Waiting 5 seconds for node to start...
timeout /t 5 /nobreak > nul

echo Compiling and deploying MedicalAccessControl contract...
cd /d "%~dp0"
npx hardhat run scripts/deploy.js --network localhost

echo.
echo ============================================================
echo  SUCCESS: Hardhat node running at http://127.0.0.1:8545
echo  Contract address saved in: blockchain\deployment.json
echo  Copy the .env settings printed above to your backend .env
echo ============================================================
pause
