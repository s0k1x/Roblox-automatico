import { Game } from '../shared/sim.js';
import { HITBOXES, TEAM_COLORS, TEAM_NAMES, DT } from '../shared/constants.js';
import { hostRoom, joinRoom } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = createRenderer(canvas);
const input = createInput();

// ---------- ajustes persistentes ----------
const DEFAULTS = { name: '', teamSize: 1, hitbox: 'estandar', fov: 110, dist: 270, height: 110, angle: -3, stiff: 0.45, ballcamDefault: false };
let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('balonturbo') || '{}')); } catch (e) { /* sin almacenamiento */ }
function save() { try { localStorage.setItem('balonturbo', JSON.stringify(cfg)); } catch (e) { /* ignorar */ } }
function applyCam() {
  renderer.setCameraSettings({ fov: cfg.fov, dist: cfg.dist, height: cfg.height, angle: cfg.angle, stiff: cfg.stiff });
}
applyCam();

// ---------- menú ----------
const SLIDERS = [
  ['fov', 'Campo de visión', 70, 130, 1, '°'],
  ['dist', 'Distancia', 100, 400, 5, ''],
  ['height', 'Altura', 20, 250, 5, ''],
  ['angle', 'Ángulo', -15, 10, 1, '°'],
  ['stiff', 'Rigidez', 0, 1, 0.05, ''],
];
function buildSettings(box) {
  box.innerHTML = '';
  for (const [key, label, min, max, step, unit] of SLIDERS) {
    const row = document.createElement('div');
    row.className = 's';
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><b></b>`;
    const r = row.querySelector('input'), b = row.querySelector('b');
    r.value = cfg[key]; b.textContent = cfg[key] + unit;
    r.addEventListener('input', () => { cfg[key] = parseFloat(r.value); b.textContent = cfg[key] + unit; applyCam(); save(); });
    box.appendChild(row);
  }
  const chk = document.createElement('label');
  chk.className = 'chk';
  chk.innerHTML = '<input type="checkbox"> Cámara balón por defecto';
  const c = chk.querySelector('input');
  c.checked = !!cfg.ballcamDefault;
  c.addEventListener('change', () => { cfg.ballcamDefault = c.checked; save(); });
  box.appendChild(chk);
}
buildSettings($('settings'));

$('in-name').value = cfg.name;
const hbList = $('hb-list');
for (const h of HITBOXES) {
  const b = document.createElement('button');
  b.dataset.id = h.id;
  b.innerHTML = `${h.name}<small>${Math.round(h.size[0])}×${Math.round(h.size[1])}×${Math.round(h.size[2])}</small>`;
  b.addEventListener('click', () => { cfg.hitbox = h.id; save(); markSel(); });
  hbList.appendChild(b);
}
function markSel() {
  for (const b of hbList.children) b.classList.toggle('on', b.dataset.id === cfg.hitbox);
  for (const b of $('seg-mode').children) b.classList.toggle('on', +b.dataset.n === cfg.teamSize);
}
for (const b of $('seg-mode').children) b.addEventListener('click', () => { cfg.teamSize = +b.dataset.n; save(); markSel(); });
markSel();
$('in-name').addEventListener('input', () => { cfg.name = $('in-name').value; save(); });
$('in-code').addEventListener('input', () => { $('in-code').value = $('in-code').value.replace(/[^a-zA-Z]/g, '').toUpperCase(); });

const playerName = () => ($('in-name').value.trim() || 'Piloto').slice(0, 16);
const msg = (t) => { $('menu-msg').textContent = t || ''; };

// ---------- estado de la aplicación ----------
let mode = 'menu'; // menu | local | host | online
let paused = false;
let game = null;
let acc = 0;
let pendingEvents = [];
let ws = null; // conexión del invitado con el anfitrión
let host = null; // sala propia (anfitrión)
let hostHumans = new Map(); // peerId -> carId
let netEvents = [];
let tickCount = 0;
let myCarId = 0;
let roomCode = '';
let snaps = [];
let renderT = 0;
let lastSent = 0;
let latest = null;
let hudState = { ended: false, goFlash: 0, banner: 0 };
let ballCam = false;
let showHit = false;

function show(id, v) { $(id).classList.toggle('hidden', !v); }

function enterGame(m) {
  mode = m; paused = false;
  show('menu', false); show('hud', true); show('pause', false); show('endscreen', false);
  show('room-code', m === 'online' || m === 'host'); show('conn', false);
  ballCam = !!cfg.ballcamDefault;
  renderer.setBallCam(ballCam);
  renderer.setShowHitbox(showHit);
  show('ballcam-ind', ballCam);
  hudState = { ended: false, goFlash: 0, banner: 0 };
  $('banner').classList.remove('show'); $('sub-banner').textContent = '';
  input.reset();
}

function toMenu(message) {
  if (ws) { try { ws.close(); } catch (e) { /* nada */ } ws = null; }
  if (host) { try { host.close(); } catch (e) { /* nada */ } host = null; hostHumans.clear(); }
  mode = 'menu'; game = null; latest = null; snaps = []; paused = false;
  show('menu', true); show('hud', false); show('pause', false); show('endscreen', false);
  msg(message);
}

function startLocal() {
  cfg.name = $('in-name').value; save();
  game = new Game({ teamSize: cfg.teamSize });
  game.setHuman(0, playerName(), cfg.hitbox);
  myCarId = 0; acc = 0; pendingEvents = [];
  enterGame('local');
}

// ---------- Anfitrión: este PC ejecuta la física y los demás se conectan ----------
function pickCar() {
  const humans = [0, 0];
  for (const c of game.cars) if (!c.isBot) humans[c.team]++;
  const order = humans[1] < humans[0] ? [1, 0] : [0, 1];
  for (const team of order) {
    const c = game.cars.find((x) => x.team === team && x.isBot);
    if (c) return c.id;
  }
  return -1;
}

async function startHost() {
  cfg.name = $('in-name').value; save();
  msg('Creando sala…');
  game = new Game({ teamSize: cfg.teamSize });
  game.setHuman(0, playerName(), cfg.hitbox);
  myCarId = 0; acc = 0; pendingEvents = []; netEvents = []; tickCount = 0; hostHumans.clear();
  try {
    host = await hostRoom({
      onJoin(peerId, m) {
        if (!game) return { type: 'error', message: 'La sala ya no existe.' };
        const carId = pickCar();
        if (carId < 0) return { type: 'error', message: 'La sala está llena.' };
        const hb = typeof m.hitbox === 'string' ? m.hitbox : 'estandar';
        game.setHuman(carId, String(m.name || 'Jugador').slice(0, 16), hb);
        hostHumans.set(peerId, carId);
        banner(`${game.cars[carId].name} se ha unido`, '', '#39f3c8', 2, 0);
        return { type: 'welcome', room: host ? host.code : '', carId, teamSize: game.teamSize };
      },
      onInput(peerId, i) {
        const carId = hostHumans.get(peerId);
        if (carId !== undefined && game) game.setInput(carId, i);
      },
      onControl(peerId, m) {
        if (m.type === 'restart' && game && game.phase === 'ended') { game.restart(); show('endscreen', false); hudState.ended = false; }
      },
      onLeave(peerId) {
        const carId = hostHumans.get(peerId);
        hostHumans.delete(peerId);
        if (carId !== undefined && game) {
          const name = game.cars[carId].name;
          game.setBot(carId);
          banner(`${name} se ha ido`, 'Su coche lo lleva un bot', '#ffb347', 2, 0);
        }
      },
      onError(text) { msg(text); },
    });
  } catch (e) {
    game = null;
    toMenu(e.message || 'No se pudo crear la sala.');
    return;
  }
  if (mode !== 'menu' || !host) return;
  roomCode = host.code;
  $('room-code').innerHTML = `Sala <b>${host.code}</b> · pásale el código a tus amigos · no cierres ni minimices esta pestaña`;
  enterGame('host');
}

// ---------- Invitado ----------
async function startOnline(code) {
  cfg.name = $('in-name').value; save();
  msg('Conectando con el anfitrión…');
  snaps = []; latest = null; roomCode = '';
  let conn;
  try {
    conn = await joinRoom(code, { type: 'join', name: playerName(), hitbox: cfg.hitbox }, {
      onMessage(m) {
        if (m.type === 'welcome') {
          myCarId = m.carId; roomCode = m.room;
          $('room-code').innerHTML = `Sala <b>${m.room}</b>`;
          enterGame('online');
        } else if (m.type === 'state') {
          const s = m.s;
          if (latest && s.t < latest.t) return; // paquete desordenado
          latest = s;
          snaps.push(s);
          if (snaps.length > 80) snaps.shift();
          if (s.events && s.events.length) { renderer.handleEvents(s.events, s); handleHudEvents(s.events, s); }
        } else if (m.type === 'error') msg(m.message || '');
      },
      onClose() { if (mode === 'online') toMenu('El anfitrión ha cerrado la sala o se ha perdido la conexión.'); },
    });
  } catch (e) {
    toMenu(e.message || 'No se pudo conectar.');
    return;
  }
  if (mode !== 'online') { conn.close(); return; }
  ws = conn;
}

$('btn-bots').addEventListener('click', startLocal);
$('btn-create').addEventListener('click', () => startHost());
$('btn-join').addEventListener('click', () => {
  const code = $('in-code').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { msg('El código tiene 4 letras.'); return; }
  startOnline(code);
});
$('btn-resume').addEventListener('click', () => setPause(false));
$('btn-pause-menu').addEventListener('click', () => toMenu(''));
$('btn-end-menu').addEventListener('click', () => toMenu(''));
$('btn-pause-settings').addEventListener('click', () => {
  let box = $('settings2');
  if (!box) { box = document.createElement('div'); box.id = 'settings2'; box.className = 'sset'; $('btn-pause-settings').after(box); buildSettings(box); box.style.textAlign = 'left'; box.querySelectorAll('.s').forEach((r) => { r.style.gridTemplateColumns = '90px 1fr 40px'; }); }
  else box.remove();
});
$('btn-rematch').addEventListener('click', () => {
  if ((mode === 'local' || mode === 'host') && game) { game.restart(); pendingEvents = []; }
  else if (mode === 'online' && ws) ws.sendControl({ type: 'restart' });
  show('endscreen', false); hudState.ended = false;
});

function setPause(v) {
  if (mode === 'menu') return;
  paused = v;
  show('pause', v);
  if (!v) { const b = $('settings2'); if (b) b.remove(); input.reset(); }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && mode !== 'menu') { e.preventDefault(); setPause(!paused); }
  if (e.code === 'Enter' && mode === 'menu' && e.target && e.target.id === 'in-code') $('btn-join').click();
});

// ---------- HUD ----------
const fmt = (s) => { s = Math.max(0, Math.ceil(s - 1e-6)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
let bannerTimer = 0, bannerPrio = 0, goTimer = 0;
function banner(text, sub, color, secs, prio) {
  if (bannerTimer > 0 && prio < bannerPrio) return;
  bannerPrio = prio; bannerTimer = secs;
  const b = $('banner');
  b.textContent = text; b.style.color = color || '#fff'; b.classList.add('show');
  $('sub-banner').textContent = sub || '';
}
function carName(s, id) { const c = s.cars.find((x) => x.id === id); return c ? c.name : ''; }
function handleHudEvents(events, s) {
  for (const e of events) {
    if (e.type === 'goal') {
      const who = e.scorer !== null && e.scorer !== undefined ? carName(s, e.scorer) : '';
      banner('¡GOL!', `${who ? who + ' · ' : ''}${e.own ? 'en propia puerta · ' : ''}${e.speed} km/h`, TEAM_COLORS[e.team], 3, 3);
    } else if (e.type === 'demo') {
      banner('DEMOLICIÓN', `${carName(s, e.attacker)} ➜ ${carName(s, e.victim)}`, '#ff5a5a', 1.6, 1);
    } else if (e.type === 'save') {
      banner('¡PARADA!', carName(s, e.car), '#39f3c8', 1.6, 1);
    } else if (e.type === 'overtime') {
      banner('PRÓRROGA', 'El próximo gol gana', '#ffd24a', 2.8, 2);
    } else if (e.type === 'go') {
      goTimer = 0.8;
    }
  }
}
function updateHud(s, dt) {
  $('sc-blue').textContent = s.score[0];
  $('sc-orange').textContent = s.score[1];
  const ck = $('clock');
  ck.textContent = s.overtime ? '+' + fmt(s.clock) : fmt(s.clock);
  ck.classList.toggle('ot', !!s.overtime);
  // cuenta atrás
  const cd = $('countdown');
  if (s.phase === 'countdown') cd.textContent = String(Math.max(1, Math.ceil(s.phaseTime - 1e-6)));
  else if (goTimer > 0) { goTimer -= dt; cd.textContent = '¡YA!'; }
  else cd.textContent = '';
  if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) { $('banner').classList.remove('show'); $('sub-banner').textContent = ''; bannerPrio = 0; } }
  const me = s.cars.find((c) => c.id === myCarId);
  if (me) {
    const sp = Math.hypot(me.v[0], me.v[1], me.v[2]) * 0.036;
    $('speed-val').textContent = Math.round(sp);
    $('boost-val').textContent = me.boost;
    $('boost-arc').style.strokeDashoffset = String(326.7 * (1 - Math.max(0, Math.min(100, me.boost)) / 100));
  }
  if (s.phase === 'ended' && !hudState.ended) { hudState.ended = true; showEnd(s); }
  else if (s.phase !== 'ended' && hudState.ended) { hudState.ended = false; show('endscreen', false); }
}
function showEnd(s) {
  const [a, b] = s.score;
  $('end-title').textContent = a === b ? 'Empate' : `Gana ${TEAM_NAMES[a > b ? 0 : 1]}`;
  $('end-score').innerHTML = `<span class="b">${a}</span> – <span class="o">${b}</span>`;
  const tb = $('end-table').querySelector('tbody');
  tb.innerHTML = '';
  for (const c of s.cars) {
    const tr = document.createElement('tr');
    tr.className = c.team === 0 ? 'blue' : 'orange';
    const name = document.createElement('td'); name.textContent = c.name + (c.id === myCarId ? ' (tú)' : '');
    tr.appendChild(name);
    for (const v of c.st) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
    tb.appendChild(tr);
  }
  show('endscreen', true);
}

// ---------- interpolación online ----------
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function lerpPos(a, b, t) {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return d > 1500 ? b : lerp3(a, b, t);
}
function interpolated(dt) {
  if (!snaps.length) return null;
  const last = snaps[snaps.length - 1];
  const target = last.t - 0.075;
  if (!renderT || Math.abs(target - renderT) > 0.5) renderT = target;
  else { renderT += dt; renderT += (target - renderT) * Math.min(1, dt * 4); }
  let a = snaps[0], b = snaps[0];
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i].t <= renderT) { a = snaps[i]; b = snaps[Math.min(i + 1, snaps.length - 1)]; break; }
    a = b = snaps[i];
  }
  const span = b.t - a.t;
  const t = span > 1e-6 ? Math.max(0, Math.min(1, (renderT - a.t) / span)) : 1;
  const o = Object.assign({}, b);
  o.ball = { ...b.ball, p: lerpPos(a.ball.p, b.ball.p, t), f: nrm(lerp3(a.ball.f, b.ball.f, t)), u: nrm(lerp3(a.ball.u, b.ball.u, t)) };
  o.cars = b.cars.map((cb) => {
    const ca = a.cars.find((c) => c.id === cb.id);
    if (!ca) return cb;
    return { ...cb, p: lerpPos(ca.p, cb.p, t), f: nrm(lerp3(ca.f, cb.f, t)), u: nrm(lerp3(ca.u, cb.u, t)) };
  });
  o.events = [];
  return o;
}

// ---------- bucle ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (mode === 'menu') { renderer.render(null, null, dt); return; }

  if (input.ballCamToggled() && !paused) { ballCam = !ballCam; renderer.setBallCam(ballCam); show('ballcam-ind', ballCam); }
  if (input.hitboxToggled() && !paused) { showHit = !showHit; renderer.setShowHitbox(showHit); }

  if ((mode === 'local' || mode === 'host') && game) {
    // El anfitrión no puede pausar: los demás siguen jugando.
    if (!paused || mode === 'host') {
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 12) {
        game.setInput(0, paused ? {} : input.read());
        game.step();
        if (game.events.length) for (const e of game.events) { pendingEvents.push(e); if (host) netEvents.push(e); }
        if (host && ++tickCount % 3 === 0) {
          const ns = game.serialize();
          ns.events = netEvents;
          netEvents = [];
          host.broadcast({ type: 'state', s: ns });
        }
        acc -= DT; steps++;
      }
      if (steps >= 12) acc = 0;
    }
    const s = game.serialize();
    s.events = pendingEvents;
    if (pendingEvents.length) { renderer.handleEvents(pendingEvents, s); handleHudEvents(pendingEvents, s); }
    pendingEvents = [];
    s.events = [];
    updateHud(s, paused ? 0 : dt);
    renderer.render(s, myCarId, paused ? 0.0001 : dt);
  } else if (mode === 'online') {
    if (ws && now - lastSent >= 1000 / 60 - 1) {
      lastSent = now;
      ws.sendInput(paused ? { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false } : input.read());
    }
    const s = interpolated(dt);
    if (s) {
      updateHud(latest || s, dt);
      renderer.render(s, myCarId, dt);
    }
  }
}
requestAnimationFrame(frame);

// Útil para pruebas
window.__bt = { get game() { return game; } };
