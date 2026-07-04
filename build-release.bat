@echo off
chcp 65001 >nul
echo ============================================
echo   Mixture of Agents - Build Release
echo ============================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js not found! Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo [1/5] Installing backend dependencies...
cd /d "%~dp0backend"
call npm install --production=false
if %ERRORLEVEL% NEQ 0 (echo FAILED! & pause & exit /b 1)

echo [2/5] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install
if %ERRORLEVEL% NEQ 0 (echo FAILED! & pause & exit /b 1)

echo [3/5] Installing root dependencies...
cd /d "%~dp0"
call npm install
if %ERRORLEVEL% NEQ 0 (echo FAILED! & pause & exit /b 1)

echo [4/5] Building backend and frontend...
cd /d "%~dp0backend"
call npx tsc
if %ERRORLEVEL% NEQ 0 (echo Backend build FAILED! & pause & exit /b 1)
cd /d "%~dp0frontend"
call npx vite build
if %ERRORLEVEL% NEQ 0 (echo Frontend build FAILED! & pause & exit /b 1)

echo [5/5] Packaging as exe...
cd /d "%~dp0"
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win portable --x64
if %ERRORLEVEL% NEQ 0 (echo Package FAILED! & pause & exit /b 1)

echo.
echo ============================================
echo   Build complete!
echo   Output: release\Mixture-of-Agents-1.0.0-portable.exe
echo ============================================
pause
