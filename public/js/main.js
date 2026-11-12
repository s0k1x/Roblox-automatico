import { Game } from '../shared/sim.js';
import { HITBOXES, TEAM_COLORS, TEAM_NAMES, DT } from '../shared/constants.js';
import { hostRoom, joinRoom } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
let renderer;
try {
  renderer = createRenderer(canvas);
} catch (e) {
  if (window.__btFatal) window.__btFatal('Tu navegador no puede mostrar gráficos 3D (WebGL)', 'Activa la aceleración por hardware en los ajustes del navegador (Chrome/Edge: Ajustes → Sistema) y recarga. Detalle: ' + (e && e.message));
  throw e;
}
const input = createInput();

// ---------- ajustes persistentes ----------
const DEFAULTS = { name: '', teamSize: 1, hitbox: 'estandar', fov: 110, dist: 270, height: 110, angle: -3, stiff: 0.45, ballcamDefault: false,
  botLevel: 1, infBoost: false, quality: 'alta', showSpeed: true,
  paint: { a: '#2fd6b5', b: '#14213d', w: '#d9e2f2', t: '#ffb347' },
  stats: { matches: 0, wins: 0, goals: 0, saves: 0, shots: 0, demos: 0 } };
let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('balonturbo') || '{}')); } catch (e) { /* sin almacenamiento */ }
cfg.paint = { ...DEFAULTS.paint, ...(cfg.paint || {}) };
cfg.stats = { ...DEFAULTS.stats, ...(cfg.stats || {}) };
function save() { try { localStorage.setItem('balonturbo', JSON.stringify(cfg)); } catch (e) { /* ignorar */ } }
function applyCam() {
  renderer.setCameraSettings({ fov: cfg.fov, dist: cfg.dist, height: cfg.height, angle: cfg.angle, stiff: cfg.stiff });
}
applyCam();
renderer.setQuality(cfg.quality);

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

const playerName = () => (cfg.name.trim() || 'Piloto').slice(0, 16);
const msg = (t) => { $('menu-msg').textContent = t || ''; };

// Carrocerías (garaje)
const hbList = $('hb-list');
for (const h of HITBOXES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.id = h.id;
  b.innerHTML = `${h.name}<small>${Math.round(h.size[0])}×${Math.round(h.size[1])}×${Math.round(h.size[2])}</small>`;
  b.addEventListener('click', () => { cfg.hitbox = h.id; save(); markSel(); });
  hbList.appendChild(b);
}

// Pintura (garaje)
const SWATCHES = ['#2fd6b5', '#e8f0ff', '#ff4d6d', '#ffd166', '#7b5cff', '#2f8cff', '#ff8a1f', '#9bff57', '#ff6fb5', '#14213d', '#5b6478', '#0b0d12'];
const PAINT_ROWS = [['a', 'Color principal'], ['b', 'Color secundario'], ['w', 'Llantas'], ['t', 'Estela de turbo']];
const paintBox = $('paint-rows');
for (const [key, label] of PAINT_ROWS) {
  const row = document.createElement('div');
  row.className = 'prow'; row.dataset.key = key;
  row.innerHTML = `<div class="lbl">${label}</div><div class="sws"></div>`;
  const sws = row.querySelector('.sws');
  for (const hex of SWATCHES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sw'; b.dataset.hex = hex;
    b.style.background = hex; b.setAttribute('aria-label', `${label}: ${hex}`);
    b.addEventListener('click', () => { cfg.paint[key] = hex; save(); markSel(); });
    sws.appendChild(b);
  }
  const inp = document.createElement('input');
  inp.type = 'color'; inp.className = 'pick'; inp.setAttribute('aria-label', `${label}: elegir otro color`);
  inp.addEventListener('input', () => { cfg.paint[key] = inp.value; save(); markSel(); });
  sws.appendChild(inp);
  paintBox.appendChild(row);
}
$('btn-paint-reset').addEventListener('click', () => { cfg.paint = { ...DEFAULTS.paint }; save(); markSel(); });

function markSel() {
  for (const b of hbList.children) b.classList.toggle('on', b.dataset.id === cfg.hitbox);
  for (const seg of document.querySelectorAll('.seg[data-key]')) {
    for (const b of seg.children) b.classList.toggle('on', String(cfg[seg.dataset.key]) === b.dataset.v);
  }
  for (const row of paintBox.children) {
    const cur = (cfg.paint[row.dataset.key] || '').toLowerCase();
    for (const b of row.querySelectorAll('.sw')) b.classList.toggle('on', b.dataset.hex === cur);
    row.querySelector('.pick').value = cur;
  }
}
for (const seg of document.querySelectorAll('.seg[data-key]')) {
  for (const b of seg.children) b.addEventListener('click', () => {
    const k = seg.dataset.key;
    cfg[k] = typeof DEFAULTS[k] === 'number' ? +b.dataset.v : b.dataset.v;
    save(); markSel();
    if (k === 'quality') renderer.setQuality(cfg.quality);
  });
}
markSel();

$('in-name').value = cfg.name;
$('in-name').addEventListener('input', () => { cfg.name = $('in-name').value; save(); });
$('in-code').addEventListener('input', () => { $('in-code').value = $('in-code').value.replace(/[^a-zA-Z]/g, '').toUpperCase(); });
$('chk-boost').checked = !!cfg.infBoost;
$('chk-boost').addEventListener('change', () => { cfg.infBoost = $('chk-boost').checked; save(); });
$('chk-speed').checked = cfg.showSpeed !== false;
$('chk-speed').addEventListener('change', () => { cfg.showSpeed = $('chk-speed').checked; save(); $('speed').classList.toggle('hidden', !cfg.showSpeed); });

// Pestañas de ajustes
function setSettingsTab(t) {
  for (const b of $('set-tabs').children) { const on = b.dataset.stab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
  for (const id of ['cam', 'ctl', 'gfx', 'ui']) $('st-' + id).classList.toggle('hidden', id !== t);
}
for (const b of $('set-tabs').children) b.addEventListener('click', () => setSettingsTab(b.dataset.stab));
setSettingsTab('cam');

// Perfil
const STAT_LABELS = [['matches', 'Partidos'], ['wins', 'Victorias'], ['goals', 'Goles'], ['saves', 'Paradas'], ['shots', 'Tiros'], ['demos', 'Demoliciones']];
function renderStats() {
  const box = $('stats');
  box.innerHTML = '';
  for (const [k, label] of STAT_LABELS) {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<b>${cfg.stats[k] | 0}</b><span>${label}</span>`;
    box.appendChild(d);
  }
}
$('btn-stats-reset').addEventListener('click', () => { cfg.stats = { ...DEFAULTS.stats }; save(); renderStats(); });
renderStats();

// ---------- navegación del menú (ratón, teclado y mando) ----------
const VIEW_TITLES = { home: '', play: 'Jugar', online: 'Online', bots: 'Contra bots', train: 'Entrenamiento libre', garage: 'Garaje', settings: 'Ajustes', profile: 'Perfil' };
const VIEW_PARENT = { play: 'home', online: 'play', bots: 'play', train: 'home', garage: 'home', settings: 'home', profile: 'home' };
let view = 'home';
const menuEl = $('menu');
function focusables() {
  return [...menuEl.querySelectorAll('button, input')].filter((el) => !el.disabled && el.getClientRects().length > 0);
}
function focusFirst() {
  const v = $('v-' + view);
  const el = v.querySelector('[data-focus]') || v.querySelector('button, input[type=range], input[type=checkbox]') || $('btn-back');
  if (el && el.getClientRects().length) el.focus({ preventScroll: true });
}
function go(v, keepFocus) {
  view = v;
  for (const el of menuEl.querySelectorAll('.view')) el.classList.toggle('hidden', el.id !== 'v-' + v);
  $('view-title').textContent = VIEW_TITLES[v] || '';
  $('btn-back').classList.toggle('hidden', v === 'home');
  menuEl.classList.toggle('in-garage', v === 'garage');
  if (v === 'profile') renderStats();
  if (!keepFocus) focusFirst();
}
function back() { if (view !== 'home') { msg(''); go(VIEW_PARENT[view] || 'home'); } }
$('btn-back').addEventListener('click', back);
for (const b of menuEl.querySelectorAll('[data-go]')) b.addEventListener('click', () => { msg(''); go(b.dataset.go); });

// Navegación espacial con flechas / cruceta
function moveFocus(dir) {
  const list = focusables();
  let cur = document.activeElement;
  if (!cur || !menuEl.contains(cur) || !list.includes(cur)) { focusFirst(); return; }
  const r0 = cur.getBoundingClientRect();
  const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
    const horiz = dir === 'left' || dir === 'right';
    const main = horiz ? (dir === 'right' ? dx : -dx) : (dir === 'down' ? dy : -dy);
    if (main < 3) continue;
    const perp = Math.abs(horiz ? dy : dx);
    const sc = main + perp * 3;
    if (sc < bestScore) { bestScore = sc; best = el; }
  }
  if (best) best.focus();
}
function fireDir(dir) {
  const el = document.activeElement;
  if (el && el.type === 'range' && (dir === 'left' || dir === 'right')) {
    const step = parseFloat(el.step) || 1;
    el.value = String(parseFloat(el.value) + (dir === 'right' ? step : -step));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  moveFocus(dir);
}
const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
window.addEventListener('keydown', (e) => {
  if (mode !== 'menu') return;
  document.body.classList.remove('usepad');
  if (e.code === 'Escape') { e.preventDefault(); back(); return; }
  const dir = ARROWS[e.code];
  if (!dir) return;
  const t = e.target;
  const horiz = dir === 'left' || dir === 'right';
  if (t && t.type === 'range' && horiz) return;
  if (t && t.tagName === 'INPUT' && (t.type === 'text' || !t.type) && horiz) return;
  e.preventDefault();
  moveFocus(dir);
});
window.addEventListener('mousemove', () => document.body.classList.remove('usepad'));

// Mando en el menú
const padSt = { up: { on: false, t: 0 }, down: { on: false, t: 0 }, left: { on: false, t: 0 }, right: { on: false, t: 0 }, a: true, b: true };
function firstPad() {
  try { for (const p of (navigator.getGamepads ? navigator.getGamepads() : [])) if (p && p.connected) return p; } catch (e) { /* sin mando */ }
  return null;
}
function resetPadMenu() { padSt.a = padSt.b = true; for (const k of ['up', 'down', 'left', 'right']) padSt[k].on = false; }
function pollMenuPad(now) {
  const p = firstPad();
  if (!p) return;
  const btn = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  const want = { up: ay < -0.6 || btn(12), down: ay > 0.6 || btn(13), left: ax < -0.6 || btn(14), right: ax > 0.6 || btn(15) };
  for (const k of ['up', 'down', 'left', 'right']) {
    const st = padSt[k];
    if (want[k]) {
      if (!st.on) { st.on = true; st.t = now + 380; document.body.classList.add('usepad'); fireDir(k); }
      else if (now >= st.t) { st.t = now + 120; fireDir(k); }
    } else st.on = false;
  }
  const a = btn(0), b = btn(1);
  if (a && !padSt.a) {
    document.body.classList.add('usepad');
    const el = document.activeElement;
    if (el && menuEl.contains(el) && el.tagName !== 'BODY') el.click(); else focusFirst();
  }
  if (b && !padSt.b) { document.body.classList.add('usepad'); back(); }
  padSt.a = a; padSt.b = b;
}

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

let training = false;
let trainGoals = 0;
function enterGame(m) {
  mode = m; paused = false;
  training = !!(game && game.freePlay);
  trainGoals = 0; $('train-goals').textContent = '0';
  $('scoreboard').classList.toggle('hidden', training);
  show('train-info', training);
  $('speed').classList.toggle('hidden', cfg.showSpeed === false);
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
  resetPadMenu();
  go(message ? 'play' : 'home');
}

function startLocal() {
  game = new Game({ teamSize: cfg.teamSize, botLevel: cfg.botLevel });
  game.setHuman(0, playerName(), cfg.hitbox, cfg.paint);
  myCarId = 0; acc = 0; pendingEvents = [];
  enterGame('local');
}

function startTraining() {
  game = new Game({ freePlay: true, infiniteBoost: !!cfg.infBoost });
  game.setHuman(0, playerName(), cfg.hitbox, cfg.paint);
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
  msg('Creando sala…');
  game = new Game({ teamSize: cfg.teamSize });
  game.setHuman(0, playerName(), cfg.hitbox, cfg.paint);
  myCarId = 0; acc = 0; pendingEvents = []; netEvents = []; tickCount = 0; hostHumans.clear();
  try {
    host = await hostRoom({
      onJoin(peerId, m) {
        if (!game) return { type: 'error', message: 'La sala ya no existe.' };
        const carId = pickCar();
        if (carId < 0) return { type: 'error', message: 'La sala está llena.' };
        const hb = typeof m.hitbox === 'string' ? m.hitbox : 'estandar';
        game.setHuman(carId, String(m.name || 'Jugador').slice(0, 16), hb, m.paint);
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
  msg('Conectando con el anfitrión…');
  snaps = []; latest = null; roomCode = '';
  let conn;
  try {
    conn = await joinRoom(code, { type: 'join', name: playerName(), hitbox: cfg.hitbox, paint: cfg.paint }, {
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
$('btn-train').addEventListener('click', startTraining);
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
function trainBall(inFront) {
  if (mode === 'local' && game && game.freePlay && !paused) game.resetBall(inFront);
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && mode !== 'menu') { e.preventDefault(); setPause(!paused); }
  if (!e.repeat && mode !== 'menu' && !(e.target && e.target.tagName === 'INPUT')) {
    if (e.code === 'KeyT') trainBall(true);
    else if (e.code === 'KeyG') trainBall(false);
  }
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
    if (e.type === 'goal' && training) {
      trainGoals++; $('train-goals').textContent = String(trainGoals);
      banner('¡GOL!', `${e.speed} km/h`, TEAM_COLORS[0], 2, 3);
    } else if (e.type === 'goal') {
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
function addStats(s) {
  const me = s.cars.find((c) => c.id === myCarId);
  if (!me) return;
  const st = cfg.stats;
  st.matches++;
  if (s.score[me.team] > s.score[1 - me.team]) st.wins++;
  st.goals += me.st[0]; st.saves += me.st[1]; st.shots += me.st[2]; st.demos += me.st[3];
  save();
}
function showEnd(s) {
  if (!s.freePlay) addStats(s);
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
let selPrev = false;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (mode === 'menu') {
    pollMenuPad(now);
    renderer.renderMenu(dt, { hb: cfg.hitbox, paint: cfg.paint, team: 0, view: view === 'garage' ? 'garage' : 'menu' });
    return;
  }

  // Entrenamiento: botón Select/View del mando = balón delante del coche
  const gp = firstPad();
  const sel = !!(gp && gp.buttons[8] && gp.buttons[8].pressed);
  if (sel && !selPrev) trainBall(true);
  selPrev = sel;

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
