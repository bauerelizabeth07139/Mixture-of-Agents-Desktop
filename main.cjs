const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const http = require('http');

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;
const FRONTEND_PORT = isDev ? 5173 : null;

let mainWindow = null;
let backendProcess = null;

function getBackendPath() {
  if (isDev) return path.join(__dirname, 'backend', 'dist', 'index.js');
  return path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
}

function getFrontendPath() {
  if (isDev) return null; // use vite dev server
  return path.join(__dirname, 'frontend', 'dist', 'index.html');
}

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      process.env.PORT = String(BACKEND_PORT);
      const backend = require(getBackendPath());
      // Backend exports or starts listening
      setTimeout(() => resolve(), 1500);
    } catch (e) {
      console.error('Backend start error:', e.message);
      // Fallback: try to connect to existing backend
      checkServer('http://localhost:' + BACKEND_PORT + '/api/health', 5000)
        .then(resolve)
        .catch(reject);
    }
  });
}

function checkServer(url, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => { req.destroy(); retry(); });
      function retry() {
        if (Date.now() - start > timeout) reject(new Error('Server timeout'));
        else setTimeout(check, 500);
      }
    };
    check();
  });
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

  if (isDev) {
    await mainWindow.loadURL('http://localhost:' + FRONTEND_PORT);
  } else {
    await mainWindow.loadFile(getFrontendPath());
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

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
  try {
    if (!isDev) {
      await startBackend();
    } else {
      // Dev mode: check if backend is already running
      try {
        await checkServer('http://localhost:' + BACKEND_PORT + '/api/health', 3000);
      } catch {
        console.log('Backend not running in dev mode. Start it manually.');
      }
    }
    await createWindow();
  } catch (e) {
    console.error('Startup error:', e.message);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
