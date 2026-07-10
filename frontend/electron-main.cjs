const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

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

function startBackend() {
  if (!isPackaged) return;

  const backendDir = path.join(process.resourcesPath, 'backend');
  const backendEntry = path.join(backendDir, 'dist', 'index.js');

  // Set NODE_PATH so backend can find its node_modules
  process.env.NODE_PATH = path.join(backendDir, 'node_modules');
  require('module').Module._initPaths();

  // Set working directory
  process.chdir(backendDir);

  console.log('[MoA] Starting backend via require:', backendEntry);

  try {
    require(backendEntry);
    console.log('[MoA] Backend loaded successfully');
  } catch (e) {
    console.error('[MoA] Backend require error:', e.message);
  }
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Mixture of Agents',
    backgroundColor: '#0a0a0f',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const loadURL = isPackaged ? BACKEND_URL : DEV_URL;
  console.log('[MoA] Loading:', loadURL);

  try {
    await mainWindow.loadURL(loadURL);
  } catch (e) {
    console.error('[MoA] Failed to load URL:', e.message);
    if (isPackaged) {
      try { await mainWindow.loadURL(DEV_URL); } catch {}
    }
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.setTitle('Mixture of Agents');

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http') && !url.includes('localhost')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  startBackend();

  const waitURL = isPackaged ? BACKEND_URL : DEV_URL;
  try {
    await waitForServer(waitURL, 15000);
  } catch (e) {
    console.warn('[MoA] Server not ready, opening anyway...');
  }

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});