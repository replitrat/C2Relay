// server.js - WebSocket relay
const WebSocket = require('ws');
const port = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port });

console.log(`Relay WS running on port ${port}`);

const agents = new Map();
const controllers = new Set();

function safeSend(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  if (!token || token !== process.env.RELAY_TOKEN) {
    safeSend(ws, { type: 'error', message: 'invalid token' });
    ws.close();
    return;
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }

    if (msg.type === 'register') {
      if (msg.role === 'agent') {
        const id = msg.id || `agent-${Math.random().toString(36).substring(2, 8)}`;
        ws._role = 'agent';
        ws._id = id;
        agents.set(id, ws);
        console.log(`Agent registered: ${id}`);
        safeSend(ws, { type: 'registered', id });
        broadcastControllers();
      } else if (msg.role === 'controller') {
        ws._role = 'controller';
        controllers.add(ws);
        console.log('Controller connected');
        safeSend(ws, { type: 'registered', role: 'controller' });
        broadcastControllers();
      }
    }

    else if (msg.type === 'exec' && ws._role === 'controller') {
      const target = agents.get(msg.targetAgentId);
      if (target) safeSend(target, msg);
      else safeSend(ws, { type: 'error', message: 'agent not found' });
    }

    else if (msg.type === 'result' && ws._role === 'agent') {
      for (const c of controllers) safeSend(c, msg);
    }
  });

  ws.on('close', () => {
    if (ws._role === 'agent') agents.delete(ws._id);
    if (ws._role === 'controller') controllers.delete(ws);
    broadcastControllers();
  });
});

function broadcastControllers() {
  const list = Array.from(agents.keys());
  for (const c of controllers) safeSend(c, { type: 'agent_list', agents: list });
}
