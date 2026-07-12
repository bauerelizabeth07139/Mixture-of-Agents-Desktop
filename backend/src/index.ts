import express from 'express';
import path from 'path';
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

const poolManager = new ApiPoolManager();
const projectManager = new ProjectManager();
const wsManager = new WSManager();
const extManager = new ExtensionManager();
wss.on('connection', (ws) => { wsManager.addClient(ws); });

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    else if (filePath.endsWith('.js') || filePath.endsWith('.css')) res.setHeader('Cache-Control', 'public, max-age=3600');
  }
}));

app.use('/api/providers', createProviderRoutes(poolManager));
app.use('/api/projects', createProjectRoutes(projectManager, poolManager, wsManager.broadcast.bind(wsManager), extManager));
app.use('/api/models', createModelRoutes(poolManager));
app.use('/api/testing', createTestingRoutes(poolManager, wsManager.broadcast.bind(wsManager)));
app.use('/api/coding', createCodingRoutes(poolManager, wsManager.broadcast.bind(wsManager), projectManager));
app.use('/api/extensions', createExtensionRoutes(extManager));
app.use('/api/chat', createChatRoutes(poolManager));
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', providers: poolManager.getAllProviders().length, ws: wsManager.getClientCount() }); });

const PORT = process.env.PORT || 3001;
// SPA fallback - serve index.html for non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

server.listen(PORT, () => { console.log('MoA backend on port ' + PORT); });
