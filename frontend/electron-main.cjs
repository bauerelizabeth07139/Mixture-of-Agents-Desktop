const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const BACKEND_PORT = 3001;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const DEV_URL = 'http://localhost:5173';

const isPackaged = app.isPackaged || fs.existsSync(path.join(process.resourcesPath, 'backend'));

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
  if (!isPackaged) return;

  const backendDir = path.join(process.resourcesPath, 'backend');
  const backendEntry = path.join(backendDir, 'dist', 'index.js');
  
  // Find node binary: prefer bundled node.exe in extraResources, fallback to system node
  let nodeCmd = 'node';
  const bundledNode = path.join(process.resourcesPath, 'node.exe');
  if (fs.existsSync(bundledNode)) {
    nodeCmd = bundledNode;
  }
  
  console.log('Starting backend from:', backendEntry, 'using node:', nodeCmd);
  
  backendProcess = spawn(nodeCmd, [backendEntry], {
    cwd: backendDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(BACKEND_PORT), FORCE_COLOR: '0', NODE_ENV: 'production' },
  });
  
  backendProcess.stdout?.on('data', (d) => console.log('[backend]', d.toString().trim()));
  backendProcess.stderr?.on('data', (d) => console.error('[backend]', d.toString().trim()));
  backendProcess.on('exit', (code) => console.log('Backend exited with code:', code));
  backendProcess.on('error', (err) => console.error('Backend spawn error:', err.message));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Mixture of Agents',
    backgroundColor: '#0a0a0f',
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const loadURL = isPackaged ? BACKEND_URL : DEV_URL;
  console.log('Loading:', loadURL);
  
  try {
    await mainWindow.loadURL(loadURL);
  } catch (e) {
    console.error('Failed to load URL:', e.message);
    // If backend URL fails, try dev URL as fallback
    if (isPackaged) {
      try { await mainWindow.loadURL(DEV_URL); } catch {}
    }
  }

  mainWindow.setTitle('Mixture of Agents');
  mainWindow.focus();

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
    await waitForServer(waitURL, 30000);
  } catch (e) {
    console.error('Server not ready, opening anyway...');
  }
  
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});
