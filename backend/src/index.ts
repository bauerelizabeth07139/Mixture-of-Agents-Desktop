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

app.use('/api/providers', createProviderRoutes(poolManager));
app.use('/api/projects', createProjectRoutes(projectManager, poolManager, wsManager.broadcast.bind(wsManager), extManager));
app.use('/api/models', createModelRoutes(poolManager));
app.use('/api/testing', createTestingRoutes(poolManager, wsManager.broadcast.bind(wsManager)));
app.use('/api/coding', createCodingRoutes(poolManager, wsManager.broadcast.bind(wsManager)));
app.use('/api/extensions', createExtensionRoutes(extManager));
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', providers: poolManager.getAllProviders().length, ws: wsManager.getClientCount() }); });

// Serve frontend static files (works in both dev and packaged Electron)
const publicDir = path.join(__dirname, '..', 'public');
const devFrontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
const staticDir = fs.existsSync(publicDir) ? publicDir : devFrontendDist;
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => { console.log('MoA backend on port ' + PORT); });

export { app, server };
