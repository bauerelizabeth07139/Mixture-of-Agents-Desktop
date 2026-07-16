import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { ApiPoolManager } from './providers/api-pool';
import { ProjectManager } from './services/project-manager';
import { WSManager } from './services/ws-manager';
import { createProviderRoutes } from './routes/providers';
import { createProjectRoutes } from './routes/projects';
import { createModelRoutes } from './routes/models';
import { createTestingRoutes } from './routes/testing';
import { createCodingRoutes } from './routes/coding';
import { createExtensionRoutes } from './routes/extensions';
import { createChatRoutes } from './routes/chat';
import { ExtensionManager } from './services/extensions/extension-manager';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(__dirname, '..', 'data', 'pool-state.json');
const poolManager = new ApiPoolManager();
const projectManager = new ProjectManager();
const wsManager = new WSManager();
const extManager = new ExtensionManager();

// Load persisted state
function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) {
        poolManager.importState(data);
        console.log(`[MoA] Restored ${data.length} providers from disk`);
      }
    }
  } catch (e) { console.warn('[MoA] Failed to load state:', (e as Error).message); }
}

// Save state to disk
function saveState() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(poolManager.exportState(), null, 2));
  } catch (e) { console.warn('[MoA] Failed to save state:', (e as Error).message); }
}

loadState();

// Auto-save every 30 seconds
setInterval(saveState, 30000);
// Save on exit
process.on('SIGINT', () => { saveState(); process.exit(0); });
process.on('SIGTERM', () => { saveState(); process.exit(0); });

wss.on('connection', (ws) => { wsManager.addClient(ws); });

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    else if (filePath.endsWith('.js') || filePath.endsWith('.css')) res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

// Wrap provider routes to auto-save after mutations
const providerRouter = createProviderRoutes(poolManager);
app.use('/api/providers', (req, res, next) => {
  providerRouter(req, res, (err?: any) => {
    if (!err && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) saveState();
    next(err);
  });
});
app.use('/api/projects', createProjectRoutes(projectManager, poolManager, wsManager.broadcast.bind(wsManager), extManager));
app.use('/api/models', createModelRoutes(poolManager));
app.use('/api/testing', createTestingRoutes(poolManager, wsManager.broadcast.bind(wsManager)));
app.use('/api/coding', createCodingRoutes(poolManager, wsManager.broadcast.bind(wsManager), projectManager));
app.use('/api/extensions', createExtensionRoutes(extManager));
app.use('/api/chat', createChatRoutes(poolManager, extManager));
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', providers: poolManager.getAllProviders().length, ws: wsManager.getClientCount() }); });

const PORT = process.env.PORT || 3001;
// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

server.listen(PORT, () => { console.log('MoA backend on port ' + PORT); });
