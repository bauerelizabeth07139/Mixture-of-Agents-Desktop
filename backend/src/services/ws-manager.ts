import WebSocket from 'ws';

export class WSManager {
  private clients: Set<WebSocket> = new Set();

  addClient(ws: WebSocket) { this.clients.add(ws); ws.on('close', () => this.clients.delete(ws)); }
  broadcast(type: string, payload: any) {
    const msg = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const ws of this.clients) { if (ws.readyState === WebSocket.OPEN) ws.send(msg); }
  }
  getClientCount() { return this.clients.size; }
}
