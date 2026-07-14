const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const { fork, execSync, execFile } = require('child_process');
const fs = require('fs');

const BACKEND_PORT = 3001;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const DEV_URL = 'http://localhost:5173';
const isPackaged = app.isPackaged;

// ============================================================
// Kill stale MOA / backend node processes before starting
// ============================================================
function killExistingProcesses() {
  const selfPid = process.pid;
  try {
    if (process.platform === 'win32') {
      // Kill any existing "Mixture of Agents" processes (except self)
      try {
        const out = execSync('tasklist /FI "IMAGENAME eq Mixture of Agents.exe" /FO CSV /NH', { encoding: 'utf8', timeout: 5000 });
        for (const line of out.split(/\r?\n/)) {
          const match = line.match(/"Mixture of Agents\.exe","(\d+)"/);
          if (match && parseInt(match[1]) !== selfPid) {
            try { execSync(`taskkill /F /PID ${match[1]}`, { timeout: 3000, stdio: 'ignore' }); } catch {}
          }
        }
      } catch {}

      // Kill any node on our backend port
      try {
        const netstat = execSync(`netstat -ano | findstr ":${BACKEND_PORT} "`, { encoding: 'utf8', timeout: 5000 });
        for (const line of netstat.split(/\r?\n/)) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[parts.length - 1]);
          if (pid && pid !== selfPid && pid !== 0) {
            try { execSync(`taskkill /F /PID ${pid}`, { timeout: 3000, stdio: 'ignore' }); } catch {}
          }
        }
      } catch {}
    }
    console.log('[MoA] Cleanup done');
  } catch (e) {
    console.log('[MoA] Cleanup note:', e.message);
  }
}

function waitForServer(url, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - start > timeout) reject(new Error('Timeout'));
        else setTimeout(check, 500);
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Timeout'));
        else setTimeout(check, 500);
      });
      req.setTimeout(2000, () => { req.destroy(); });
    };
    check();
  });
}

let mainWindow = null;
let backendProcess = null;
let isQuitting = false;

function startBackend() {
  let backendDir;
  if (isPackaged) {
    // In packaged mode, backend is in resources/backend/ (extraResources)
    backendDir = path.join(process.resourcesPath, 'backend');
  } else {
    // In dev mode, backend is relative to this file
    backendDir = path.join(__dirname, '..', 'backend');
  }
  
  const backendEntry = path.join(backendDir, 'dist', 'index.js');
  console.log('[MoA] Backend dir:', backendDir);
  console.log('[MoA] Backend entry:', backendEntry);
  console.log('[MoA] Entry exists:', fs.existsSync(backendEntry));

  if (!fs.existsSync(backendEntry)) {
    console.error('[MoA] CRITICAL: Backend entry not found!');
    return;
  }

  backendProcess = fork(backendEntry, [], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: isPackaged ? 'production' : 'development',
      NODE_PATH: path.join(backendDir, 'node_modules'),
    },
    silent: false,
  });
  backendProcess.on('error', (err) => console.error('[MoA] Backend error:', err.message));
  backendProcess.on('exit', (code) => { console.log('[MoA] Backend exited:', code); backendProcess = null; });
}

function killBackend() {
  return new Promise((resolve) => {
    if (!backendProcess) { resolve(); return; }
    const bp = backendProcess;
    backendProcess = null;
    const timeout = setTimeout(() => {
      try { bp.kill('SIGKILL'); } catch {}
      resolve();
    }, 3000);
    bp.on('exit', () => { clearTimeout(timeout); resolve(); });
    try { bp.kill('SIGTERM'); } catch { clearTimeout(timeout); resolve(); }
  });
}

async function createWindow() {
  console.log('[MoA] Creating window...');
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    title: 'Mixture of Agents',
    backgroundColor: '#0a0a0f',
    show: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  const loadURL = isPackaged ? BACKEND_URL : DEV_URL;
  console.log('[MoA] Loading:', loadURL);
  try {
    await mainWindow.loadURL(loadURL);
    console.log('[MoA] URL loaded');
    mainWindow.show();
    mainWindow.focus();
  } catch (e) {
    console.error('[MoA] loadURL failed:', e.message);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  console.log('[MoA] PID:', process.pid, 'packaged:', isPackaged);
  console.log('[MoA] resourcesPath:', process.resourcesPath);
  
  killExistingProcesses();
  await new Promise(r => setTimeout(r, 1000));

  startBackend();

  try {
    await waitForServer(BACKEND_URL, 15000);
    console.log('[MoA] Backend ready');
  } catch (e) {
    console.warn('[MoA] Backend timeout');
  }

  await createWindow();
  console.log('[MoA] App ready');

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', async () => {
  isQuitting = true;
  await killBackend();
  app.quit();
});

app.on('before-quit', async (e) => {
  if (!isQuitting) {
    e.preventDefault();
    isQuitting = true;
    await killBackend();
    app.quit();
  }
});