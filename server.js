const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();
const sockets = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? genCode() : code;
}

function findRoomByWs(ws) {
  const code = sockets.get(ws);
  return code ? rooms.get(code) : null;
}

function leaveRoom(ws) {
  const code = sockets.get(ws);
  if (!code) return;
  const room = rooms.get(code);
  sockets.delete(ws);
  if (!room) return;
  const other = ws === room.host ? room.guest : room.host;
  if (other && other.readyState === WebSocket.OPEN) {
    other.send(JSON.stringify({ type: 'opponent_left' }));
  }
  rooms.delete(code);
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'create': {
        const code = genCode();
        rooms.set(code, { host: ws, guest: null, code });
        sockets.set(ws, code);
        ws.send(JSON.stringify({ type: 'created', code }));
        break;
      }
      case 'join': {
        const room = rooms.get(msg.code);
        if (!room) { ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' })); return; }
        if (room.guest) { ws.send(JSON.stringify({ type: 'error', msg: '房间已满' })); return; }
        room.guest = ws;
        sockets.set(ws, msg.code);
        ws.send(JSON.stringify({ type: 'joined', code: msg.code }));
        room.host.send(JSON.stringify({ type: 'opponent_joined' }));
        break;
      }
      case 'action':
      case 'chat':
      case 'sync_state':
      case 'game_init':
      case 'concede': {
        const room = findRoomByWs(ws);
        if (!room) return;
        const other = ws === room.host ? room.guest : room.host;
        if (other && other.readyState === WebSocket.OPEN) {
          other.send(raw.toString());
        }
        break;
      }
      case 'leave':
        leaveRoom(ws);
        break;
    }
  });

  ws.on('close', () => leaveRoom(ws));
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log('Moyu Cards server running on port ' + port);
});
