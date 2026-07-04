@echo off
chcp 65001 >nul
echo ============================================
echo   Mixture of Agents - Dev Mode
echo ============================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found! Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

:: Install deps if needed
if not exist "%~dp0backend\node_modules" (
    echo Installing backend dependencies...
    cd /d "%~dp0backend"
    call npm install
)
if not exist "%~dp0frontend\node_modules" (
    echo Installing frontend dependencies...
    cd /d "%~dp0frontend"
    call npm install
)

:: Build backend
echo Building backend...
cd /d "%~dp0backend"
call npx tsc

:: Start backend
echo Starting backend on port 3001...
start /B node dist\index.js
cd /d "%~dp0"

:: Start frontend
echo Starting frontend on port 5173...
cd /d "%~dp0frontend"
start /B npx vite --host --port 5173

:: Wait then open Electron
timeout /t 5 /nobreak >nul
cd /d "%~dp0"
if exist "node_modules\electron\dist\electron.exe" (
    echo Opening desktop window...
    node_modules\electron\dist\electron.exe .
) else (
    echo Electron not installed. Installing...
    call npm install
    node_modules\electron\dist\electron.exe .
)
