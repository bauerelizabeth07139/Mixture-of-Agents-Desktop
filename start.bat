@echo off
echo ============================================
echo   Mixture of Agents - Starting...
echo ============================================

set NODE_DIR=C:\Users\vipuser\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin
set PATH=%NODE_DIR%;%PATH%

echo.
echo [1/3] Building backend...
cd /d "%~dp0backend"
call npx.cmd tsc
if %ERRORLEVEL% NEQ 0 (echo Backend build failed! & pause & exit /b 1)

echo [2/3] Starting backend server...
start /B node dist/index.js

echo [3/3] Starting frontend and opening window...
cd /d "%~dp0frontend"

:: Start vite dev server in background
start /B npx.cmd vite --host --port 5173

:: Wait a moment for vite to be ready
timeout /t 4 /nobreak >nul

:: Open Electron window
npx.cmd electron .

echo.
echo Mixture of Agents is running!
echo Close this window to stop all services.
pause
