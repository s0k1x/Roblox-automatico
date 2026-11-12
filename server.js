// Servidor de «Balón Turbo»: HTTP estático + WebSocket + salas con simulación autoritativa.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { Game } from './shared/sim.js';
import { DT } from './shared/constants.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');
const THREE_BUILD = path.join(ROOT, 'node_modules', 'three', 'build');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// ---------- Estáticos ----------
function resolveSafe(base, rel) {
  const full = path.resolve(base, '.' + path.sep + rel);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}

function mapUrl(pathname) {
  if (pathname === '/') return path.join(PUBLIC_DIR, 'index.html');
  if (pathname === '/vendor/three.module.js') return path.join(THREE_BUILD, 'three.module.js');
  if (pathname === '/vendor/three.core.js') return path.join(THREE_BUILD, 'three.core.js');
  if (pathname.startsWith('/shared/')) return resolveSafe(SHARED_DIR, pathname.slice('/shared/'.length));
  return resolveSafe(PUBLIC_DIR, pathname.slice(1));
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (pathname.includes('\0')) { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method not allowed');
    return;
  }
  const file = mapUrl(pathname);
  if (!file) { res.writeHead(404).end('No encontrado'); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('No encontrado'); return; }
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
    };
    if (ext === '.html' || ext === '.js') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
});

// ---------- Salas ----------
const rooms = new Map(); // código → { game, clients: Map(ws → carId), acc, tickCount, last, accTime }
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}

function createRoom(teamSize) {
  const code = newCode();
  const room = {
    code,
    game: new Game({ teamSize }),
    clients: new Map(),
    acc: [],
    tickCount: 0,
    accTime: 0,
    last: performance.now(),
  };
  rooms.set(code, room);
  console.log(`[sala] creada ${code} (teamSize ${teamSize}), salas: ${rooms.size}`);
  return room;
}

function pickCar(room) {
  const { game, clients } = room;
  const humans = [0, 0];
  for (const id of clients.values()) humans[game.cars[id].team]++;
  const order = humans[1] < humans[0] ? [1, 0] : [0, 1];
  for (const team of order) {
    const car = game.cars.find((c) => c.isBot && c.team === team);
    if (car) return game.cars.indexOf(car);
  }
  return -1;
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function leave(ws) {
  const code = ws.roomCode;
  if (!code) return;
  ws.roomCode = null;
  const room = rooms.get(code);
  if (!room) return;
  const carId = room.clients.get(ws);
  room.clients.delete(ws);
  if (carId !== undefined) room.game.setBot(carId);
  if (room.clients.size === 0) {
    rooms.delete(code);
    console.log(`[sala] borrada ${code}, salas: ${rooms.size}`);
  }
}

function onMessage(ws, raw) {
  if (raw.length > 2048) return;
  let m;
  try { m = JSON.parse(raw.toString()); } catch { return; }
  if (!m || typeof m !== 'object') return;

  if (m.type === 'join') {
    if (ws.roomCode) return;
    let room;
    if (typeof m.room === 'string' && m.room) {
      room = rooms.get(m.room.toUpperCase());
      if (!room) { send(ws, { type: 'error', message: 'Esa sala no existe' }); return; }
    } else {
      const ts = Math.min(3, Math.max(1, Math.floor(Number(m.teamSize)) || 1));
      room = createRoom(ts);
    }
    const carId = pickCar(room);
    if (carId < 0) {
      send(ws, { type: 'error', message: 'La sala está llena' });
      if (room.clients.size === 0) { rooms.delete(room.code); console.log(`[sala] borrada ${room.code}`); }
      return;
    }
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 16) : 'Jugador';
    room.game.setHuman(carId, name, m.hitbox);
    room.clients.set(ws, carId);
    ws.roomCode = room.code;
    send(ws, { type: 'welcome', room: room.code, carId, teamSize: room.game.cars.length / 2 });
    return;
  }

  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const carId = room.clients.get(ws);
  if (carId === undefined) return;
  if (m.type === 'input') room.game.setInput(carId, m.i);
  else if (m.type === 'hitbox') room.game.setHitbox(carId, m.hitbox);
  else if (m.type === 'restart') { if (room.game.phase === 'ended') room.game.restart(); }
}

// ---------- WebSocket ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });

server.on('upgrade', (req, socket, head) => {
  let p = '';
  try { p = new URL(req.url, 'http://x').pathname; } catch { /* nada */ }
  if (p !== '/ws') { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomCode = null;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => onMessage(ws, data));
  ws.on('close', () => leave(ws));
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

// ---------- Bucle de simulación ----------
const MAX_STEPS = 12;
const MAX_BUFFERED = 256 * 1024;

setInterval(() => {
  const now = performance.now();
  for (const room of rooms.values()) {
    room.accTime += (now - room.last) / 1000;
    room.last = now;
    let steps = 0;
    while (room.accTime >= DT && steps < MAX_STEPS) {
      room.game.step();
      room.accTime -= DT;
      steps++;
      if (room.game.events && room.game.events.length) room.acc.push(...room.game.events);
      room.tickCount++;
      if (room.tickCount % 3 === 0) {
        const s = room.game.serialize();
        s.events = room.acc;
        room.acc = [];
        const msg = JSON.stringify({ type: 'state', s });
        for (const ws of room.clients.keys()) {
          if (ws.readyState === 1 && ws.bufferedAmount <= MAX_BUFFERED) ws.send(msg);
        }
      }
    }
    if (room.accTime >= DT) room.accTime = 0; // descarta exceso
  }
}, 4);

server.listen(PORT, '0.0.0.0', () => console.log(`Balón Turbo escuchando en :${PORT}`));
