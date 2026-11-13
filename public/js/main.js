import { Game, sanitizeInput } from '../shared/sim.js';
import { HITBOXES, TEAM_COLORS, TEAM_NAMES, DT } from '../shared/constants.js';
import { hostRoom, joinRoom } from './net.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { MAPS } from './maps.js';

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
const audio = createAudio();

// ---------- ajustes persistentes ----------
const CAM_PRESETS = {
  default: { fov: 110, dist: 270, height: 110, angle: -3, stiff: 0.45 },
  close: { fov: 100, dist: 200, height: 90, angle: -2, stiff: 0.6 },
  far: { fov: 100, dist: 350, height: 130, angle: -4, stiff: 0.35 },
};
// En móvil se empieza en calidad baja; en el resto, automática.
const IS_MOBILE = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent);
const DEFAULTS = { name: '', teamSize: 1, hitbox: 'estandar', ...CAM_PRESETS.default, ballcamDefault: false,
  camPreset: 'default', shake: true, swivel: 5, transition: 1, invertLook: false,
  rumble: true, showNames: true, stickSens: 100,
  botLevel: 1, map: 'clasico', infBoost: false, quality: IS_MOBILE ? 'baja' : 'auto', fpsLimit: 0, showFps: false,
  showSpeed: true, showScore: true, uiScale: 100, scheme: 'default', camMode: 'toggle',
  volMaster: 80, volSfx: 80, volEngine: 60, volMusic: 50,
  challenges: { week: '', prog: {} },
  paint: { a: '#2fd6b5', b: '#14213d', w: '#d9e2f2', t: '#ffb347' },
  stats: { matches: 0, wins: 0, goals: 0, saves: 0, shots: 0, demos: 0 } };
let cfg = { ...DEFAULTS };
try { Object.assign(cfg, JSON.parse(localStorage.getItem('balonturbo') || '{}')); } catch (e) { /* sin almacenamiento */ }
cfg.paint = { ...DEFAULTS.paint, ...(cfg.paint || {}) };
cfg.stats = { ...DEFAULTS.stats, ...(cfg.stats || {}) };
cfg.challenges = { week: '', prog: {}, ...(cfg.challenges || {}) };
function save() { try { localStorage.setItem('balonturbo', JSON.stringify(cfg)); } catch (e) { /* ignorar */ } }
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

// Definición de cada pestaña de ajustes: [tipo, clave, etiqueta, ...extra]
const SCHEMA = {
  play: [
    ['check', 'rumble', 'Vibración del mando'],
    ['check', 'showNames', 'Mostrar nombres de los jugadores'],
    ['range', 'stickSens', 'Sensibilidad del stick', 50, 150, 5, ' %'],
  ],
  cam: [
    ['seg', 'camPreset', 'Preajuste', [['default', 'Predeterminado'], ['close', 'Cercana'], ['far', 'Alejada'], ['custom', 'Personalizada']]],
    ['check', 'shake', 'Temblor de cámara'],
    ['range', 'fov', 'Campo de visión', 60, 110, 1, '°'],
    ['range', 'dist', 'Distancia', 100, 400, 5, ''],
    ['range', 'height', 'Altura', 40, 200, 5, ''],
    ['range', 'angle', 'Ángulo', -15, 0, 1, '°'],
    ['range', 'stiff', 'Rigidez', 0, 1, 0.05, ''],
    ['range', 'swivel', 'Velocidad de giro', 1, 10, 0.5, ''],
    ['range', 'transition', 'Velocidad de transición', 1, 2, 0.1, ''],
    ['check', 'invertLook', 'Invertir giro'],
    ['check', 'ballcamDefault', 'Cámara balón por defecto'],
  ],
  ctl: [
    ['seg', 'scheme', 'Esquema de controles', [['default', 'Predeterminado'], ['keys', 'Solo teclado']]],
    ['seg', 'camMode', 'Cámara balón', [['toggle', 'Alternar'], ['hold', 'Mantener']]],
  ],
  ui: [
    ['check', 'showSpeed', 'Mostrar velocímetro'],
    ['check', 'showScore', 'Mostrar marcador'],
    ['check', 'showNames', 'Mostrar nombres de los jugadores'],
    ['range', 'uiScale', 'Escala de la interfaz', 80, 120, 5, ' %'],
  ],
  vid: [
    ['seg', 'quality', 'Calidad', [['auto', 'Automática'], ['alta', 'Alta'], ['baja', 'Baja']]],
    ['seg', 'fpsLimit', 'Limitar FPS', [[30, '30'], [60, '60'], [0, 'Sin límite']]],
    ['check', 'showFps', 'Mostrar FPS'],
  ],
  aud: [
    ['range', 'volMaster', 'Volumen general', 0, 100, 5, ' %'],
    ['range', 'volSfx', 'Efectos', 0, 100, 5, ' %'],
    ['range', 'volEngine', 'Motor', 0, 100, 5, ' %'],
    ['range', 'volMusic', 'Música del menú', 0, 100, 5, ' %'],
  ],
};
// Sanear valores guardados
for (const items of Object.values(SCHEMA)) for (const it of items) {
  if (it[0] === 'range') { const v = parseFloat(cfg[it[1]]); cfg[it[1]] = Number.isFinite(v) ? clampN(v, it[3], it[4]) : DEFAULTS[it[1]]; }
  else if (it[0] === 'check') cfg[it[1]] = !!cfg[it[1]];
}
if (![30, 60].includes(cfg.fpsLimit)) cfg.fpsLimit = 0;
if (cfg.scheme !== 'keys') cfg.scheme = 'default';
if (cfg.camMode !== 'hold') cfg.camMode = 'toggle';
if (!['auto', 'alta', 'baja'].includes(cfg.quality)) cfg.quality = DEFAULTS.quality;
if (!MAPS.some((m) => m.id === cfg.map)) cfg.map = 'clasico';
if (!['default', 'close', 'far', 'custom'].includes(cfg.camPreset) ||
  (cfg.camPreset !== 'custom' && Object.keys(CAM_PRESETS.default).some((k) => cfg[k] !== CAM_PRESETS[cfg.camPreset][k]))) cfg.camPreset = 'custom';

const R = (fn, ...args) => { if (renderer && typeof renderer[fn] === 'function') renderer[fn](...args); };
function applyCam() {
  R('setCameraSettings', { fov: cfg.fov, dist: cfg.dist, height: cfg.height, angle: cfg.angle, stiff: cfg.stiff,
    swivel: cfg.swivel, transition: cfg.transition, shake: cfg.shake });
}
function applyAudio() {
  audio.setVolumes({ master: cfg.volMaster / 100, sfx: cfg.volSfx / 100, engine: paused ? 0 : cfg.volEngine / 100, music: cfg.volMusic / 100 });
}
function applyUI() {
  document.documentElement.style.setProperty('--ui', String(cfg.uiScale / 100));
  $('speed').classList.toggle('hidden', !cfg.showSpeed);
  $('scoreboard').classList.toggle('hidden', training || !cfg.showScore);
  $('fps').classList.toggle('hidden', !cfg.showFps);
}
function applyAll() {
  input.setScheme(cfg.scheme, cfg.camMode);
  applyCam(); applyAudio(); applyUI();
  R('setQuality', cfg.quality);
  R('setDynamicAllowed', !cfg.fpsLimit);
  R('setMap', cfg.map);
  R('setShowNames', cfg.showNames);
}

// ---------- menú ----------
const refreshers = new Set();
function refreshAll() { for (const f of refreshers) { if (f.box.isConnected) f(); else refreshers.delete(f); } }
const fmtNum = (v) => String(Math.round(v * 100) / 100);
function changed(key, v) {
  cfg[key] = v;
  if (key === 'camPreset' && CAM_PRESETS[v]) Object.assign(cfg, CAM_PRESETS[v]);
  else if (key in CAM_PRESETS.default) cfg.camPreset = 'custom';
  save(); applyAll(); refreshAll();
}
function resetKeys(tab) {
  for (const it of SCHEMA[tab]) cfg[it[1]] = DEFAULTS[it[1]];
  if (tab === 'cam') Object.assign(cfg, CAM_PRESETS.default);
  save(); applyAll(); refreshAll();
}
function buildTab(box, tab, withReset) {
  box.innerHTML = '';
  for (const it of SCHEMA[tab]) {
    const [type, key, label] = it;
    const wrap = document.createElement('div');
    let refresh;
    if (type === 'range') {
      const [, , , min, max, step, unit] = it;
      wrap.className = 's';
      wrap.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}"><b></b>`;
      const r = wrap.querySelector('input'), b = wrap.querySelector('b');
      r.addEventListener('input', () => changed(key, parseFloat(r.value)));
      refresh = () => { r.value = cfg[key]; b.textContent = fmtNum(cfg[key]) + unit; };
    } else if (type === 'check') {
      wrap.innerHTML = `<label class="chk"><input type="checkbox"> ${label}</label>`;
      const c = wrap.querySelector('input');
      c.addEventListener('change', () => changed(key, c.checked));
      refresh = () => { c.checked = !!cfg[key]; };
    } else {
      wrap.innerHTML = `<div class="row-lbl">${label}</div><div class="seg"></div>`;
      const seg = wrap.querySelector('.seg');
      for (const [v, t] of it[3]) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = t;
        b.addEventListener('click', () => changed(key, v));
        seg.appendChild(b);
      }
      refresh = () => { [...seg.children].forEach((b, i) => b.classList.toggle('on', it[3][i][0] === cfg[key])); };
    }
    refresh.box = wrap;
    refreshers.add(refresh); refresh();
    box.appendChild(wrap);
  }
  if (withReset) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mini'; b.textContent = 'Restablecer';
    b.addEventListener('click', () => resetKeys(tab));
    box.appendChild(b);
  }
}
function buildSettings(box) { buildTab(box, 'cam', true); }
for (const t of ['play', 'cam', 'ui', 'vid', 'aud']) buildTab($('st-' + t), t, true);
buildTab($('st-ctl-opts'), 'ctl', true);

// Tabla de controles según el esquema elegido
function renderCtlTables() {
  const kb = cfg.scheme === 'keys' ? [
    ['W / S', 'Acelerar / frenar · morro abajo / arriba'],
    ['A / D', 'Girar · guiñada'],
    ['Q / E', 'Giro en el aire izquierda / derecha'],
    ['Espacio', 'Salto (doble pulsación: voltereta)'],
    ['K / Mayús dcha.', 'Turbo'],
    ['Mayús izq. / Ctrl', 'Derrape · giro libre en el aire'],
    ['R', 'Cámara balón'],
  ] : [
    ['W / S', 'Acelerar / frenar · morro abajo / arriba'],
    ['A / D', 'Girar · guiñada'],
    ['Clic derecho', 'Salto (doble pulsación: voltereta)'],
    ['Clic izquierdo', 'Turbo'],
    ['Mayús izq.', 'Derrape · giro libre en el aire (con A / D)'],
    ['Q / E', 'Giro en el aire izquierda / derecha'],
    ['Espacio', 'Cámara balón'],
  ];
  kb.push(['Tab (mantener)', 'Ver marcador de la partida'], ['1 – 4', 'Chat rápido: grupo y después frase'],
    ['Botón central + ratón', 'Mirar alrededor'], ['Alt + ↑ ↓ ← →', 'Mirar alrededor con el teclado'],
    ['H', 'Ver hitbox'], ['T / G', 'Entrenamiento: balón delante / al centro'], ['Esc', 'Pausa']);
  const pad = [
    ['RT / LT', 'Acelerar / frenar y marcha atrás'],
    ['Stick izquierdo', 'Girar, guiñada y morro arriba / abajo'],
    ['Stick derecho', 'Mirar alrededor'],
    ['A / B / X', 'Salto / turbo / derrape y giro libre'],
    ['Y', 'Cámara balón'],
    ['LB / RB', 'Giro en el aire izquierda / derecha'],
    ['Vista (mantener)', 'Marcador · en entrenamiento, balón delante'],
    ['Cruceta', 'Chat rápido'],
    ['Start', 'Pausa'],
  ];
  const tbl = (rows) => '<table class="controls">' + rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') + '</table>';
  const hold = cfg.camMode === 'hold' ? '<p class="note">La cámara balón solo está activa mientras mantienes pulsado su botón.</p>' : '';
  $('ctl-tables').innerHTML = '<div class="lbl">Teclado y ratón</div>' + tbl(kb) + '<div class="lbl">Mando</div>' + tbl(pad) + hold;
}
renderCtlTables();
{ const f = renderCtlTables; f.box = $('ctl-tables'); refreshers.add(f); }
$('btn-set-default').addEventListener('click', () => { for (const t of Object.keys(SCHEMA)) resetKeys(t); });

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
// Selector de mapa (miniatura + nombre) en Contra bots, Crear sala y Entrenamiento
for (const seg of document.querySelectorAll('.seg.maps')) {
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.v = m.id;
    b.innerHTML = `<span class="mp" style="background:${m.thumb || '#16213a'}"></span><b>${m.name}</b>`;
    seg.appendChild(b);
  }
}
for (const seg of document.querySelectorAll('.seg[data-key]')) {
  for (const b of seg.children) b.addEventListener('click', () => {
    const k = seg.dataset.key;
    cfg[k] = typeof DEFAULTS[k] === 'number' ? +b.dataset.v : b.dataset.v;
    save(); markSel();
    if (k === 'quality') renderer.setQuality(cfg.quality);
    if (k === 'fpsLimit') R('setDynamicAllowed', !cfg.fpsLimit);
    if (k === 'map') R('setMap', cfg.map);
  });
}
markSel();

$('in-name').value = cfg.name;
$('in-name').addEventListener('input', () => { cfg.name = $('in-name').value; save(); });
$('in-code').addEventListener('input', () => { $('in-code').value = $('in-code').value.replace(/[^a-zA-Z]/g, '').toUpperCase(); });
$('chk-boost').checked = !!cfg.infBoost;
$('chk-boost').addEventListener('change', () => { cfg.infBoost = $('chk-boost').checked; save(); });
// Pestañas de ajustes
const TABS = ['play', 'cam', 'ctl', 'ui', 'vid', 'aud'];
function setSettingsTab(t) {
  for (const b of $('set-tabs').children) { const on = b.dataset.stab === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
  for (const id of TABS) $('st-' + id).classList.toggle('hidden', id !== t);
}
for (const b of $('set-tabs').children) b.addEventListener('click', () => setSettingsTab(b.dataset.stab));
setSettingsTab('play');

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
$('btn-stats-reset').addEventListener('click', () => { cfg.stats = { ...DEFAULTS.stats }; cfg.challenges.prog = {}; save(); renderStats(); renderChallenges(); });
renderStats();

// Experiencia y nivel (según estadísticas locales)
const XP_PER = { matches: 100, goals: 50, wins: 30, saves: 20, demos: 25, shots: 5 };
function levelInfo() {
  let xp = 0;
  for (const k in XP_PER) xp += (cfg.stats[k] | 0) * XP_PER[k];
  const lvl = 1 + Math.floor(Math.sqrt(xp / 150));
  const lo = 150 * (lvl - 1) ** 2, hi = 150 * lvl * lvl;
  return { lvl, frac: (xp - lo) / (hi - lo) };
}
function renderProfBar() {
  const { lvl, frac } = levelInfo();
  const name = (cfg.name.trim() || 'Piloto').slice(0, 16);
  $('pb-name').textContent = name;
  $('pb-avatar').textContent = name.charAt(0).toUpperCase();
  $('pb-lvl').textContent = String(lvl);
  $('pb-xpbar').style.width = Math.round(clampN(frac, 0, 1) * 100) + '%';
}
$('in-name').addEventListener('input', renderProfBar);

// Desafíos semanales (se renuevan cada lunes)
const CH_POOL = [
  { id: 'goals', txt: 'Marca 5 goles', n: 5 }, { id: 'wins', txt: 'Gana 2 partidos', n: 2 }, { id: 'saves', txt: 'Haz 3 paradas', n: 3 },
  { id: 'demos', txt: 'Haz 2 demoliciones', n: 2 }, { id: 'shots', txt: 'Haz 8 tiros', n: 8 }, { id: 'matches', txt: 'Juega 3 partidos', n: 3 },
];
function weekInfo() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes de esta semana
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  return { key, idx: Math.floor(d.getTime() / 604800000) };
}
function currentChallenges() {
  const w = weekInfo();
  if (cfg.challenges.week !== w.key) { cfg.challenges = { week: w.key, prog: {} }; save(); }
  const base = (w.idx % 2) * 3;
  return [0, 1, 2].map((i) => CH_POOL[base + i]);
}
function renderChallenges() {
  const box = $('ch-list');
  box.innerHTML = '';
  for (const c of currentChallenges()) {
    const v = Math.min(c.n, cfg.challenges.prog[c.id] | 0);
    const d = document.createElement('div');
    d.className = 'ch' + (v >= c.n ? ' done' : '');
    d.innerHTML = '<div class="ch-top"><b></b><span></span></div><div class="ch-bar"><i></i></div>';
    d.querySelector('b').textContent = c.txt;
    d.querySelector('span').textContent = `${v}/${c.n}`;
    d.querySelector('i').style.width = Math.round(v / c.n * 100) + '%';
    box.appendChild(d);
  }
}
function refreshProfile() { renderProfBar(); renderChallenges(); }
refreshProfile();

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
  menuEl.classList.toggle('in-home', v === 'home');
  menuEl.classList.toggle('in-settings', v === 'settings');
  if (v === 'profile') { renderStats(); renderProfBar(); }
  if (v === 'home') refreshProfile();
  if (!keepFocus) focusFirst();
}
function back() { if (view !== 'home') { audio.ui('back'); msg(''); go(VIEW_PARENT[view] || 'home'); } }
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
  if (best) { best.focus(); audio.ui('move'); }
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
  if (mode !== 'menu' || onTitle) return;
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
  if (onTitle) {
    if (p.buttons.some((b) => b && b.pressed) || Math.abs(p.axes[0] || 0) > 0.7 || Math.abs(p.axes[1] || 0) > 0.7) leaveTitle();
    return;
  }
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
let onTitle = true; // pantalla de título (modo 'menu' con el menú oculto)
let ignoreClickUntil = 0;
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
let padSt9 = true, camHeldPrev = false;
let showHit = false;

function show(id, v) { $(id).classList.toggle('hidden', !v); }

// ---------- pantalla de título ----------
function leaveTitle() {
  if (!onTitle) return;
  onTitle = false;
  audio.unlock();
  ignoreClickUntil = performance.now() + 400; // que el clic de entrada no pulse nada del menú
  show('title', false); show('menu', true);
  resetPadMenu();
  go('home');
  audio.menu(true);
  audio.ui('select');
}
function showTitle() {
  onTitle = true;
  show('menu', false); show('title', true);
  resetPadMenu();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
$('title').addEventListener('pointerdown', (e) => { e.preventDefault(); leaveTitle(); });
window.addEventListener('keydown', (e) => {
  if (!onTitle || mode !== 'menu') return;
  if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code)) return;
  e.preventDefault(); leaveTitle();
});
window.addEventListener('click', (e) => { if (performance.now() < ignoreClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);
$('btn-exit').addEventListener('click', showTitle);
// sonidos del menú
menuEl.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (!b || b.id === 'btn-back' || b.id === 'btn-set-back') return;
  audio.ui(['btn-bots', 'btn-train', 'btn-create', 'btn-join'].includes(b.id) ? 'start' : 'select');
});
$('btn-set-back').addEventListener('click', back);
let hoverBtn = null;
menuEl.addEventListener('mouseover', (e) => {
  const b = e.target.closest && e.target.closest('button');
  if (b && b !== hoverBtn) audio.ui('move');
  hoverBtn = b || null;
});

// ---------- mirar alrededor ----------
const look = { x: 0, y: 0, mid: false, mx: 0, my: 0, sent: false };
const altArrows = new Set();
const LOOK_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
window.addEventListener('mousedown', (e) => { if (e.button === 1 && mode !== 'menu') { e.preventDefault(); look.mid = true; } });
window.addEventListener('mouseup', (e) => { if (e.button === 1) look.mid = false; });
window.addEventListener('mousemove', (e) => { look.mx = e.clientX / innerWidth * 2 - 1; look.my = e.clientY / innerHeight * 2 - 1; });
window.addEventListener('blur', () => { look.mid = false; altArrows.clear(); });
// Alt + flechas: se capturan antes que la conducción para no mover el coche
window.addEventListener('keydown', (e) => {
  if (mode === 'menu' || !e.altKey || !LOOK_KEYS.includes(e.code)) return;
  e.preventDefault(); e.stopImmediatePropagation(); altArrows.add(e.code);
}, true);
window.addEventListener('keyup', (e) => { altArrows.delete(e.code); }, true);
const dz15 = (v) => (Math.abs(v) < 0.15 ? 0 : v);
function updateLook() {
  let x = 0, y = 0;
  if (!paused && mode !== 'menu') {
    if (look.mid) { x = look.mx; y = -look.my; }
    if (altArrows.has('ArrowRight')) x += 1;
    if (altArrows.has('ArrowLeft')) x -= 1;
    if (altArrows.has('ArrowUp')) y += 1;
    if (altArrows.has('ArrowDown')) y -= 1;
    const p = firstPad();
    if (p) { const rx = dz15(p.axes[2] || 0), ry = dz15(p.axes[3] || 0); if (rx || ry) { x = rx; y = -ry; } }
    if (cfg.invertLook) { x = -x; y = -y; }
    x = clampN(x, -1, 1); y = clampN(y, -1, 1);
  }
  if (x || y || look.sent) { R('setLook', x, y); look.sent = !!(x || y); }
}

// Entrada con sensibilidad del stick aplicada
function readInput() {
  const i = input.read();
  const p = cfg.stickSens !== 100 ? firstPad() : null;
  if (p) {
    const k = cfg.stickSens / 100;
    if (Math.abs(p.axes[0] || 0) > 0.12) { i.steer = clampN(i.steer * k, -1, 1); i.yaw = clampN(i.yaw * k, -1, 1); }
    if (Math.abs(p.axes[1] || 0) > 0.12) i.pitch = clampN(i.pitch * k, -1, 1);
  }
  return i;
}

// Vibración del mando
function rumble(strong, weak, ms) {
  if (!cfg.rumble) return;
  const p = firstPad(), a = p && p.vibrationActuator;
  if (!a || !a.playEffect) return;
  try {
    const r = a.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: weak, strongMagnitude: strong });
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* sin vibración */ }
}
function onEvents(events, s) {
  renderer.handleEvents(events, s);
  audio.events(events, s, myCarId);
  handleHudEvents(events, s);
  for (const e of events) {
    if (e.type === 'touch' && e.car === myCarId) rumble(clampN(0.15 + e.speed / 4500, 0.15, 1), 0.3, 130);
    else if (e.type === 'demo' && (e.attacker === myCarId || e.victim === myCarId)) rumble(1, 0.8, 380);
    else if (e.type === 'bump' && (e.a === myCarId || e.b === myCarId)) rumble(0.5, 0.3, 100);
  }
}

let training = false;
let trainGoals = 0;
function enterGame(m) {
  mode = m; paused = false;
  training = !!(game && game.freePlay);
  trainGoals = 0; $('train-goals').textContent = '0';
  show('train-info', training);
  applyUI();
  audio.menu(false);
  show('menu', false); show('hud', true); show('pause', false); show('endscreen', false);
  show('room-code', m === 'online' || m === 'host'); show('conn', false);
  ballCam = !!cfg.ballcamDefault;
  renderer.setBallCam(ballCam);
  renderer.setShowHitbox(showHit);
  show('ballcam-ind', ballCam);
  hudState = { ended: false, goFlash: 0, banner: 0 };
  $('banner').classList.remove('show'); $('sub-banner').textContent = '';
  input.reset();
  closeChatMenu(); chatSpam.clear(); $('chat-log').innerHTML = ''; camHeldPrev = false;
}

function toMenu(message) {
  if (ws) { try { ws.close(); } catch (e) { /* nada */ } ws = null; }
  if (host) { try { host.close(); } catch (e) { /* nada */ } host = null; hostHumans.clear(); }
  mode = 'menu'; game = null; latest = null; snaps = []; paused = false;
  applyAudio(); audio.menu(true); R('setMap', cfg.map);
  show('menu', true); show('hud', false); show('pause', false); show('endscreen', false);
  msg(message);
  resetPadMenu();
  go(message ? 'online' : 'home');
}

function startLocal() {
  game = new Game({ teamSize: cfg.teamSize, botLevel: cfg.botLevel, map: cfg.map });
  game.setHuman(0, playerName(), cfg.hitbox, cfg.paint);
  myCarId = 0; acc = 0; pendingEvents = [];
  enterGame('local');
}

function startTraining() {
  game = new Game({ freePlay: true, infiniteBoost: !!cfg.infBoost, map: cfg.map });
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
  game = new Game({ teamSize: cfg.teamSize, map: cfg.map });
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
      onInput(peerId, i, seq) {
        const carId = hostHumans.get(peerId);
        if (carId !== undefined && game) {
          game.setInput(carId, i);
          if (Number.isFinite(seq)) hostAck.set(carId, seq);
        }
      },
      onControl(peerId, m) {
        if (m.type === 'chat') { const cid = hostHumans.get(peerId); if (cid !== undefined) emitChat(cid, m.k); return; }
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
  snaps = []; latest = null; roomCode = ''; resetPrediction(); seqNo = 0;
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
          reconcile(s);
          snaps.push(s);
          if (snaps.length > 80) snaps.shift();
          if (s.events && s.events.length) onEvents(s.events, s);
        } else if (m.type === 'chat') {
          if (Number.isInteger(m.car) && Number.isInteger(m.k) && m.k >= 0 && m.k < 16) addChat(m.car, m.k);
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
  if (v) closeChatMenu();
  show('pause', v);
  applyAudio();
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
      if (!e.own) botChat(e.team, 4, 0.25);
    } else if (e.type === 'demo') {
      banner('DEMOLICIÓN', `${carName(s, e.attacker)} ➜ ${carName(s, e.victim)}`, '#ff5a5a', 1.6, 1);
    } else if (e.type === 'save') {
      banner('¡PARADA!', carName(s, e.car), '#39f3c8', 1.6, 1);
      const sc = s.cars.find((x) => x.id === e.car);
      if (sc) botChat(sc.team, 6, 0.3);
    } else if (e.type === 'overtime') {
      banner('PRÓRROGA', 'El próximo gol gana', '#ffd24a', 2.8, 2);
    } else if (e.type === 'go') {
      goTimer = 0.8;
    }
  }
}

// ---------- chat rápido y marcador ----------
const CHAT_GROUPS = [
  { name: 'Información', l: ['¡Lo tengo!', '¡Toda tuya!', '¡Necesito turbo!', '¡Defiendo!'] },
  { name: 'Elogios', l: ['¡Buen tiro!', '¡Buen pase!', '¡Paradón!', '¡Gracias!'] },
  { name: 'Reacciones', l: ['¡Uf!', '¡Casi!', '¡Increíble!', '¡Vaya!'] },
  { name: 'Disculpas', l: ['¡Perdón!', '¡Ups!', '¡Culpa mía!', '¡No pasa nada!'] },
];
const CHAT_TEXT = CHAT_GROUPS.flatMap((g) => g.l);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const curCars = () => (game && (mode === 'local' || mode === 'host') ? game.cars : latest ? latest.cars : []);
let chatGroup = -1, chatMenuT = 0;
const chatSpam = new Map(); // coche -> { last, times, block }
// Anti-spam: 1 mensaje cada 0,6 s; 4 en 3 s y luego 4 s de espera
function chatAllowed(car) {
  const now = performance.now();
  let r = chatSpam.get(car);
  if (!r) { r = { last: -1e9, times: [], block: 0 }; chatSpam.set(car, r); }
  if (now < r.block || now - r.last < 600) return false;
  r.times = r.times.filter((t) => now - t < 3000);
  if (r.times.length >= 4) { r.block = now + 4000; r.times = []; return false; }
  r.times.push(now); r.last = now;
  return true;
}
function addChat(car, k) {
  const c = curCars().find((x) => x.id === car);
  if (!c || !(k >= 0 && k < 16)) return;
  const d = document.createElement('div');
  d.className = 'msg';
  d.style.borderLeftColor = TEAM_COLORS[c.team];
  d.innerHTML = `<b style="color:${TEAM_COLORS[c.team]}">${esc(c.name)}</b>${esc(CHAT_TEXT[k])}`;
  const log = $('chat-log');
  log.appendChild(d);
  while (log.children.length > 6) log.firstChild.remove();
  setTimeout(() => d.remove(), 6000);
}
// Anfitrión o local: acepta, muestra y reenvía un mensaje de un coche (humano o bot)
function emitChat(car, k) {
  if (!Number.isInteger(k) || k < 0 || k > 15 || !chatAllowed(car)) return;
  addChat(car, k);
  if (host) host.broadcastControl({ type: 'chat', car, k });
}
function sendMyChat(k) {
  if (mode === 'online') { if (ws && chatAllowed(-1)) ws.sendControl({ type: 'chat', k }); }
  else emitChat(myCarId, k);
}
function closeChatMenu() { chatGroup = -1; chatMenuT = 0; show('chat-menu', false); }
function chatKey(i) {
  if (chatGroup < 0) {
    chatGroup = i; chatMenuT = 4;
    const g = CHAT_GROUPS[i];
    $('chat-menu').innerHTML = `<h4>${g.name}</h4>` + g.l.map((t, j) => `<div><kbd>${j + 1}</kbd>${esc(t)}</div>`).join('');
    show('chat-menu', true);
  } else { const k = chatGroup * 4 + i; closeChatMenu(); sendMyChat(k); }
}
// Los bots a veces felicitan tras un gol o una parada de su equipo
function botChat(team, k, prob) {
  if (!(mode === 'local' || mode === 'host') || training || Math.random() > prob) return;
  const bots = curCars().filter((c) => c.bot !== undefined ? c.bot : c.isBot).filter((c) => c.team === team);
  if (!bots.length) return;
  const b = bots[Math.floor(Math.random() * bots.length)];
  setTimeout(() => { if (mode !== 'menu') emitChat(b.id, k); }, 600 + Math.random() * 900);
}

let tabHtml = '';
function renderTabBoard(s) {
  const pts = (st) => 100 * st[0] + 50 * st[1] + 20 * st[2] + 25 * st[3];
  let h = `<div class="tb-head"><span class="b">${s.score[0]}</span><small>${fmt(s.clock)}${s.overtime ? ' · prórroga' : ''}</small><span class="o">${s.score[1]}</span></div>`;
  for (const team of [0, 1]) {
    const rows = s.cars.filter((c) => c.team === team).sort((a, b) => pts(b.st) - pts(a.st));
    h += `<table class="${team ? 'tm-o' : 'tm-b'}"><caption>${TEAM_NAMES[team]}</caption><thead><tr><th>Jugador</th><th>Puntos</th><th>Goles</th><th>Paradas</th><th>Tiros</th><th>Demos</th></tr></thead><tbody>`;
    for (const c of rows) {
      h += `<tr${c.id === myCarId ? ' class="me"' : ''}><td>${esc(c.name)}${c.bot ? ' (Bot)' : ''}</td><td class="pts">${pts(c.st)}</td><td>${c.st[0]}</td><td>${c.st[1]}</td><td>${c.st[2]}</td><td>${c.st[3]}</td></tr>`;
    }
    h += '</tbody></table>';
  }
  if (h !== tabHtml) { tabHtml = h; $('tab-board').innerHTML = h; }
}
function updateHud(s, dt) {
  const showTab = !training && input.scoreboardHeld();
  show('tab-board', showTab);
  if (showTab) renderTabBoard(s);
  if (chatMenuT > 0 && (chatMenuT -= dt) <= 0) closeChatMenu();
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
  currentChallenges();
  const pr = cfg.challenges.prog, won = s.score[me.team] > s.score[1 - me.team] ? 1 : 0;
  const add = { goals: me.st[0], saves: me.st[1], shots: me.st[2], demos: me.st[3], wins: won, matches: 1 };
  for (const k in add) pr[k] = (pr[k] | 0) + add[k];
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
// ---------- predicción del coche propio (invitado) ----------
// El invitado simula su coche al instante con la misma física; al llegar el estado del anfitrión
// se coloca en él y repite las entradas que el anfitrión aún no había aplicado.
const hostAck = new Map(); // anfitrión: última entrada aplicada por coche
let pg = null, predicting = false, pHist = [], seqNo = 0, pAcc = 0;
let curInp = sanitizeInput({});
let pOff = [0, 0, 0];
function resetPrediction() { pg = null; predicting = false; pHist = []; pAcc = 0; pOff = [0, 0, 0]; }
function reconcile(s) {
  const me = s.cars.find((c) => c.id === myCarId);
  if (!me || !me.x || me.dead || s.phase === 'countdown' || s.phase === 'ended') { predicting = false; pHist = []; return; }
  if (!pg || pg.teamSize !== s.teamSize) pg = new Game({ teamSize: s.teamSize });
  const car = pg.cars[myCarId];
  if (!car) { predicting = false; return; }
  if (car.hb.id !== me.hb) pg.setHitbox(myCarId, me.hb);
  const before = car.pos.slice();
  const was = predicting;
  const ack = s.ack && Number.isFinite(s.ack[myCarId]) ? s.ack[myCarId] : -1;
  pg.importCar(car, me.x);
  pHist = pHist.filter((h) => h.seq > ack);
  for (const h of pHist) pg.stepCar(car, h.inp, DT);
  if (was) {
    for (let k = 0; k < 3; k++) pOff[k] += before[k] - car.pos[k];
    if (Math.hypot(pOff[0], pOff[1], pOff[2]) > 400) pOff = [0, 0, 0];
  } else pOff = [0, 0, 0];
  predicting = true;
}
function stepPrediction(dt) {
  if (!predicting || !pg) return;
  const car = pg.cars[myCarId];
  pAcc += dt;
  let n = 0;
  while (pAcc >= DT && n < 12) {
    pg.stepCar(car, curInp, DT);
    pHist.push({ seq: seqNo, inp: curInp });
    pAcc -= DT; n++;
  }
  if (n >= 12) pAcc = 0;
  if (pHist.length > 360) pHist.splice(0, pHist.length - 360);
  const k = Math.exp(-dt * 10);
  pOff = pOff.map((v) => v * k);
}
function withPrediction(s) {
  if (!s || !predicting || !pg) return s;
  const car = pg.cars[myCarId];
  s.cars = s.cars.map((c) => (c.id !== myCarId ? c : {
    ...c,
    p: [car.pos[0] + pOff[0], car.pos[1] + pOff[1], car.pos[2] + pOff[2]],
    v: car.vel.slice(), f: car.o.f.slice(), u: car.o.u.slice(),
    g: car.grounded, boost: Math.round(car.boost), boosting: car.boosting, ss: car.supersonic,
  }));
  return s;
}

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
let cursorHidden = false;
let selPrev = false;
let fpsN = 0, fpsT = 0;
// Diagnóstico (F9 o ?perf=1): FPS, ms por imagen, dibujos y triángulos.
let perfEl = null, perfN = 0, perfT = 0;
function setPerf(on) {
  if (on && !perfEl) {
    perfEl = document.createElement('div');
    perfEl.style.cssText = 'position:fixed;left:8px;top:28px;z-index:60;font:12px/1.4 monospace;color:#9bff57;background:#000b;padding:4px 8px;border-radius:4px;pointer-events:none;white-space:pre';
    document.body.appendChild(perfEl);
  }
  if (perfEl) perfEl.style.display = on ? 'block' : 'none';
  window.__bt = on ? { get renderer() { return renderer; } } : undefined; // gancho para medir (debugFx, getStats)
}
if (/[?&]perf=1/.test(location.search)) setPerf(true);
window.addEventListener('keydown', (e) => { if (e.key === 'F9') { e.preventDefault(); setPerf(!(perfEl && perfEl.style.display === 'block')); } });
function perfTick(dt) {
  if (!perfEl || perfEl.style.display !== 'block') return;
  perfN++; perfT += dt;
  if (perfT < 0.5) return;
  const st = renderer.getStats ? renderer.getStats() : null;
  if (st) perfEl.textContent = Math.round(perfN / perfT) + ' FPS  ' + (perfT / perfN * 1000).toFixed(1) + ' ms/img\n' +
    'dibujos ' + st.calls + '  triángulos ' + st.tris + '\nresolución x' + st.pr.toFixed(2) + (st.bloom ? '  brillo on' : '  brillo off') + '  cpu ' + st.cpu.toFixed(1) + ' ms';
  perfN = 0; perfT = 0;
}
function frame(now) {
  requestAnimationFrame(frame);
  if (cfg.fpsLimit && now - last < 1000 / cfg.fpsLimit - 1.5) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  perfTick(dt);
  if (cfg.showFps) {
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { $('fps').textContent = Math.round(fpsN / fpsT) + ' FPS'; fpsN = 0; fpsT = 0; }
  }

  // Ratón oculto mientras se juega (vuelve en menús y pausa)
  const playingNow = mode !== 'menu' && !paused;
  if (playingNow !== cursorHidden) { cursorHidden = playingNow; document.body.classList.toggle('jugando', playingNow); }

  if (mode === 'menu') {
    pollMenuPad(now);
    renderer.renderMenu(dt, { hb: cfg.hitbox, paint: cfg.paint, team: 0, view: onTitle ? 'title' : view === 'garage' ? 'garage' : view === 'home' ? 'home' : 'menu' });
    return;
  }
  updateLook();

  // Entrenamiento: botón Select/View del mando = balón delante del coche
  const gp = firstPad();
  const sel = !!(gp && gp.buttons[8] && gp.buttons[8].pressed);
  if (sel && !selPrev) trainBall(true);
  selPrev = sel;

  const st9 = !!(gp && gp.buttons[9] && gp.buttons[9].pressed);
  if (st9 && !padSt9) setPause(!paused);
  padSt9 = st9;

  const setCam = (v) => { ballCam = v; renderer.setBallCam(ballCam); show('ballcam-ind', ballCam); };
  if (cfg.camMode === 'hold') {
    const h = input.ballCamHeld() && !paused;
    if (h !== camHeldPrev) { camHeldPrev = h; setCam(h ? !cfg.ballcamDefault : !!cfg.ballcamDefault); }
  }
  if (input.ballCamToggled() && !paused) setCam(!ballCam);
  if (!paused) { const q = input.quickChat(); if (q >= 0) chatKey(q); }
  if (input.hitboxToggled() && !paused) { showHit = !showHit; renderer.setShowHitbox(showHit); }

  if ((mode === 'local' || mode === 'host') && game) {
    // El anfitrión no puede pausar: los demás siguen jugando.
    if (!paused || mode === 'host') {
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 12) {
        game.setInput(0, paused ? {} : readInput());
        game.step();
        if (game.events.length) for (const e of game.events) { pendingEvents.push(e); if (host) netEvents.push(e); }
        if (host && ++tickCount % 3 === 0) {
          const ns = game.serialize(true);
          ns.ack = Object.fromEntries(hostAck);
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
    if (pendingEvents.length) onEvents(pendingEvents, s);
    pendingEvents = [];
    s.events = [];
    updateHud(s, paused ? 0 : dt);
    renderer.render(s, myCarId, paused ? 0.0001 : dt);
    if (!paused) audio.update(s, myCarId, dt);
  } else if (mode === 'online') {
    if (ws && now - lastSent >= 1000 / 60 - 1) {
      lastSent = now;
      curInp = sanitizeInput(paused ? {} : readInput());
      ws.sendInput(curInp, ++seqNo);
    }
    stepPrediction(dt);
    const s = withPrediction(interpolated(dt));
    if (s) {
      updateHud(latest || s, dt);
      renderer.render(s, myCarId, dt);
      if (!paused) audio.update(s, myCarId, dt);
    }
  }
}
applyAll();
requestAnimationFrame(frame);

// Útil para pruebas
window.__bt = { get dbg() { const me = latest && latest.cars.find((c) => c.id === myCarId); return { mode, ws: !!ws, predicting, snaps: snaps.length, myCarId, phase: latest && latest.phase, hasX: !!(me && me.x), ack: latest && latest.ack, seqNo }; }, get game() { return game; }, get pred() { return predicting && pg ? { pos: pg.cars[myCarId].pos.slice(), hist: pHist.length, off: pOff.slice() } : null; } };
