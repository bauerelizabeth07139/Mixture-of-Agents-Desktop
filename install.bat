@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Mixture of Agents - 一键安装           ║
echo  ║   多模型协同智能体系统                    ║
echo  ╚══════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo  [!] 未检测到 Node.js
    echo  正在下载 Node.js 安装程序...
    
    :: Download Node.js LTS
    curl -L -o "%TEMP%\node-installer.msi" "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    if %ERRORLEVEL% NEQ 0 (
        echo  下载失败，请手动安装 Node.js: https://nodejs.org
        pause
        exit /b 1
    )
    
    echo  正在安装 Node.js（需要管理员权限）...
    msiexec /i "%TEMP%\node-installer.msi" /quiet /norestart
    timeout /t 10 /nobreak >nul
    
    :: Refresh PATH
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

echo  [1/4] 检查 Node.js...
node --version
if %ERRORLEVEL% NEQ 0 (
    echo  Node.js 安装失败，请手动安装后重试
    pause
    exit /b 1
)

echo  [2/4] 安装依赖...
cd /d "%~dp0"
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
npm install

echo  [3/4] 构建项目...
cd backend && npx tsc && cd ..
cd frontend && npx vite build && cd ..

echo  [4/4] 打包为 exe...
set CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --win portable --x64

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║  安装完成！                               ║
echo  ║  exe 位于: release\Mixture-of-Agents-*.exe ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
