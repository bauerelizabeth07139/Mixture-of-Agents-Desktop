# Mixture of Agents Launcher
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Mixture of Agents - Starting..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$nodeDir = "C:\Users\vipuser\AppData\Local\OpenAI\Codex\runtimes\cua_node\1b23c930bdf84ed6\bin"
$env:PATH = "$nodeDir;$env:PATH"

Write-Host ""
Write-Host "[1/3] Building backend..." -ForegroundColor Yellow
cd "$PSScriptRoot\backend"
& "$nodeDir\npx.cmd" tsc 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Backend build failed!" -ForegroundColor Red; exit 1 }

Write-Host "[2/3] Starting backend server..." -ForegroundColor Yellow
Start-Process -FilePath "$nodeDir\node.exe" -ArgumentList "dist/index.js" -WorkingDirectory "$PSScriptRoot\backend" -PassThru -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 2

Write-Host "[3/3] Starting frontend and opening window..." -ForegroundColor Yellow
cd "$PSScriptRoot\frontend"

# Start vite dev server in background
Start-Process -FilePath "$nodeDir\npx.cmd" -ArgumentList "vite","--host","--port","5173" -WorkingDirectory "$PSScriptRoot\frontend" -PassThru -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 4

# Open Electron window
& "$nodeDir\npx.cmd" electron .

Write-Host ""
Write-Host "Mixture of Agents stopped." -ForegroundColor Green
