// Red de PC a PC (WebRTC con PeerJS). Un jugador es el anfitrión: su navegador ejecuta la física
// y los demás se conectan directamente a él. El servidor público de PeerJS solo sirve para
// presentarse (señalización); el tráfico del juego va directo entre jugadores.
/* global Peer */

const PREFIX = 'balonturbo-v1-';
const RTC = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function newCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return c;
}

// Servidor de señalización: el público de PeerJS por defecto, u otro propio con ?senal=https://host:puerto
function signalOptions() {
  try {
    const v = new URLSearchParams(location.search).get('senal');
    if (!v) return {};
    const u = new URL(v);
    return { host: u.hostname, port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80), secure: u.protocol === 'https:', path: u.pathname || '/' };
  } catch (e) { return {}; }
}

function makePeer(id) {
  if (typeof Peer === 'undefined') throw new Error('No se ha podido cargar el módulo de red.');
  const opts = { config: RTC, debug: 0, ...signalOptions() };
  return id ? new Peer(id, opts) : new Peer(opts);
}

const ERRORS = {
  'peer-unavailable': 'Esa sala no existe o el anfitrión se ha ido.',
  network: 'No hay conexión con el servicio de salas.',
  'server-error': 'El servicio de salas no responde. Prueba otra vez.',
  'browser-incompatible': 'Tu navegador no permite partidas online.',
  'unavailable-id': 'Ese código ya está en uso.',
};
const errText = (e) => ERRORS[e && e.type] || 'Error de conexión.';

// ---------- Anfitrión ----------
// handlers: onJoin(peerId, msg) -> respuesta | null, onInput(peerId, input), onControl(peerId, msg), onLeave(peerId), onError(text)
export function hostRoom(handlers, tries = 3) {
  return new Promise((resolve, reject) => {
    const code = newCode();
    const peer = makePeer(PREFIX + code);
    const peers = new Map(); // peerId -> { ctl, rt }
    let opened = false;

    const entry = (id) => {
      if (!peers.has(id)) peers.set(id, { ctl: null, rt: null });
      return peers.get(id);
    };

    peer.on('open', () => {
      opened = true;
      resolve({
        code,
        broadcast(obj) {
          for (const p of peers.values()) if (p.rt && p.rt.open && p.joined) p.rt.send(obj);
        },
        send(id, obj) {
          const p = peers.get(id);
          if (p && p.ctl && p.ctl.open) p.ctl.send(obj);
        },
        // Mensaje por el canal fiable a todos los invitados (p. ej. chat rápido)
        broadcastControl(obj) {
          for (const p of peers.values()) if (p.joined && p.ctl && p.ctl.open) p.ctl.send(obj);
        },
        kick(id) {
          const p = peers.get(id);
          if (p) { try { p.ctl && p.ctl.close(); p.rt && p.rt.close(); } catch (e) { /* nada */ } }
        },
        count: () => [...peers.values()].filter((p) => p.joined).length,
        close() { try { peer.destroy(); } catch (e) { /* nada */ } },
      });
    });

    peer.on('connection', (conn) => {
      const p = entry(conn.peer);
      if (conn.label === 'rt') p.rt = conn; else p.ctl = conn;
      conn.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (conn.label === 'rt') {
          if (m.type === 'input' && p.joined) handlers.onInput(conn.peer, m.i, m.s);
          return;
        }
        if (m.type === 'join' && !p.joined) {
          const reply = handlers.onJoin(conn.peer, m);
          if (reply && reply.type === 'welcome') p.joined = true;
          if (reply) conn.send(reply);
          if (reply && reply.type === 'error') setTimeout(() => conn.close(), 300);
        } else if (p.joined) handlers.onControl(conn.peer, m);
      });
      conn.on('close', () => {
        if (!peers.has(conn.peer)) return;
        const wasJoined = p.joined;
        peers.delete(conn.peer);
        try { p.ctl && p.ctl.close(); p.rt && p.rt.close(); } catch (e) { /* nada */ }
        if (wasJoined) handlers.onLeave(conn.peer);
      });
    });

    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* nada */ } });
    peer.on('error', (e) => {
      if (!opened && e.type === 'unavailable-id' && tries > 1) {
        peer.destroy();
        hostRoom(handlers, tries - 1).then(resolve, reject);
      } else if (!opened) {
        peer.destroy();
        reject(new Error(errText(e)));
      } else if (e.type !== 'peer-unavailable') handlers.onError(errText(e));
    });
  });
}

// ---------- Invitado ----------
// handlers: onMessage(msg), onClose()
export function joinRoom(code, joinMsg, handlers) {
  return new Promise((resolve, reject) => {
    const peer = makePeer(null);
    let done = false, closed = false;
    const fail = (text) => {
      if (done) return;
      done = true;
      try { peer.destroy(); } catch (e) { /* nada */ }
      reject(new Error(text));
    };
    const timer = setTimeout(() => fail('El anfitrión no responde. Comprobad el código o probad otra red.'), 30000);

    peer.on('error', (e) => { if (!done) fail(errText(e)); });
    peer.on('open', () => {
      const ctl = peer.connect(PREFIX + code, { label: 'ctl', reliable: true, serialization: 'json' });
      const rt = peer.connect(PREFIX + code, { label: 'rt', reliable: false, serialization: 'json' });
      let open = 0;
      const onOpen = () => {
        if (++open < 2) return;
        ctl.send(joinMsg);
      };
      ctl.on('open', onOpen);
      rt.on('open', onOpen);
      const onClose = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        if (!done) fail('Se ha cerrado la conexión con el anfitrión.');
        else handlers.onClose();
      };
      ctl.on('close', onClose);
      rt.on('close', onClose);
      const onData = (m) => {
        if (!m || typeof m !== 'object') return;
        if (!done && m.type === 'welcome') {
          done = true;
          clearTimeout(timer);
          resolve({
            sendInput(i, seq) { if (rt.open) rt.send({ type: 'input', i, s: seq }); },
            sendControl(obj) { if (ctl.open) ctl.send(obj); },
            close() { closed = true; try { peer.destroy(); } catch (e) { /* nada */ } },
          });
        }
        if (!done && m.type === 'error') { fail(m.message || 'No se ha podido entrar.'); return; }
        handlers.onMessage(m);
      };
      ctl.on('data', onData);
      rt.on('data', onData);
    });
  });
}
