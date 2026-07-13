const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const { fork } = require('child_process');

const BACKEND_PORT = 3001;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const DEV_URL = 'http://localhost:5173';
const isPackaged = app.isPackaged;

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

function startBackend() {
  const backendDir = isPackaged ? path.join(process.resourcesPath, 'backend') : path.join(__dirname, '..', 'backend');
  const backendEntry = path.join(backendDir, 'dist', 'index.js');
  console.log('[MoA] Starting backend:', backendEntry);

  backendProcess = fork(backendEntry, [], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(BACKEND_PORT), NODE_ENV: isPackaged ? 'production' : 'development', NODE_PATH: path.join(backendDir, 'node_modules') },
    silent: false,
  });
  backendProcess.on('error', (err) => console.error('[MoA] Backend error:', err.message));
  backendProcess.on('exit', (code) => console.log('[MoA] Backend exited:', code));
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
  } catch (e) {
    console.error('[MoA] loadURL failed:', e.message);
  }

  mainWindow.focus();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  console.log('[MoA] Window ready');
}

app.whenReady().then(async () => {
  console.log('[MoA] app.whenReady');
  startBackend();

  {
    // Wait for backend to start
    try {
      await waitForServer(BACKEND_URL, 15000);
      console.log('[MoA] Backend ready');
    } catch (e) {
      console.warn('[MoA] Backend wait timeout, opening anyway');
    }
  }

  await createWindow();
  console.log('[MoA] App ready');

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (backendProcess) backendProcess.kill(); app.quit(); });
app.on('before-quit', () => { if (backendProcess) backendProcess.kill(); });




