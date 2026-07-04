const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;

let mainWindow = null;

// Set NODE_PATH so backend can find node_modules from root
const appPath = app.isPackaged ? path.join(process.resourcesPath, 'app.asar') : __dirname;
process.env.NODE_PATH = path.join(appPath, 'node_modules');
require('module').Module._initPaths();

function getBackendPath() {
  return path.join(appPath, 'backend', 'dist', 'index.js');
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

function startBackend() {
  return new Promise((resolve, reject) => {
    try {
      process.env.PORT = String(BACKEND_PORT);
      console.log('Starting backend from:', getBackendPath());
      require(getBackendPath());
      // Wait for server to be ready
      checkServer('http://localhost:' + BACKEND_PORT + '/api/health', 10000)
        .then(() => { console.log('Backend ready'); resolve(); })
        .catch((e) => { console.error('Backend health check failed:', e.message); resolve(); }); // continue anyway
    } catch (e) {
      console.error('Backend start error:', e.message);
      // Try connecting to existing server
      checkServer('http://localhost:' + BACKEND_PORT + '/api/health', 5000)
        .then(resolve)
        .catch(() => reject(e));
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

  const frontendPath = path.join(appPath, 'frontend', 'dist', 'index.html');
  console.log('Loading frontend from:', frontendPath);
  await mainWindow.loadFile(frontendPath);

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
    console.log('App ready');
  } catch (e) {
    console.error('Startup error:', e.message, e.stack);
    // Still try to show window
    await createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
