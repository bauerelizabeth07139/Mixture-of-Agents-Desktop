const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;

let mainWindow = null;

// Fix NODE_PATH so backend can resolve modules from root node_modules
const appPath = isDev ? __dirname : path.join(process.resourcesPath, 'app.asar');
process.env.NODE_PATH = path.join(appPath, 'node_modules');
require('module').Module._initPaths();

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

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      process.env.PORT = String(BACKEND_PORT);
      const backendPath = path.join(appPath, 'backend', 'dist', 'index.js');
      console.log('[MoA] Starting backend from:', backendPath);
      require(backendPath);
      // Wait for backend to be healthy
      checkServer('http://localhost:' + BACKEND_PORT + '/api/health', 15000)
        .then(() => { console.log('[MoA] Backend healthy'); resolve(); })
        .catch((e) => { console.warn('[MoA] Backend health check failed, continuing anyway'); resolve(); });
    } catch (e) {
      console.error('[MoA] Backend require error:', e.message);
      checkServer('http://localhost:' + BACKEND_PORT + '/api/health', 5000)
        .then(resolve)
        .catch(() => reject(new Error('Cannot start backend: ' + e.message)));
    }
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

  // Load from backend HTTP server (backend serves frontend static files)
  const url = 'http://localhost:' + BACKEND_PORT;
  console.log('[MoA] Loading frontend from:', url);
  await mainWindow.loadURL(url);

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
    await startBackend();
    await createWindow();
    console.log('[MoA] App ready');
  } catch (e) {
    console.error('[MoA] Fatal error:', e.message);
    // Show error in a window
    mainWindow = new BrowserWindow({ width: 600, height: 400, title: 'Mixture of Agents - Error' });
    mainWindow.loadURL('data:text/html,<h1>Startup Error</h1><pre>' + encodeURIComponent(e.message + '\n' + e.stack) + '</pre>');
    mainWindow.show();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
