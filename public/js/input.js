// Entrada: teclado, ratón, mando y táctil combinados.
import { createTouchControls } from './touch.js';

export function createInput() {
  const touch = createTouchControls();
  const keys = new Set();
  const mouse = { left: false, right: false };
  let camFlag = false;
  let hitFlag = false;
  let padCam = false;
  // Esquema de controles: 'default' (teclado + ratón) o 'keys' (solo teclado). Cámara balón: 'toggle' o 'hold'.
  let scheme = 'default';
  let camMode = 'toggle';
  const chatQ = []; // chat rápido pendiente (índices 0-3)
  const padPrev = {};

  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight',
    'ControlLeft', 'ControlRight', 'KeyC', 'KeyR', 'KeyH', 'KeyK', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  const camKey = () => (scheme === 'keys' ? 'KeyR' : 'Space');
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const inGame = !!document.getElementById('hud') && !document.getElementById('hud').classList.contains('hidden');
    if (GAME_KEYS.has(e.code) || (e.code === 'Tab' && inGame)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === camKey()) camFlag = true;
      if (e.code === 'KeyH') hitFlag = true;
      const d = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      if (d && inGame && chatQ.length < 4) chatQ.push(+d[1] - 1);
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousedown', (e) => {
    if (!e.target || e.target.id !== 'game') return;
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });

  const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v);
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));

  function pad() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) if (p && p.connected) return p;
    } catch (e) { /* sin mando */ }
    return null;
  }

  function read() {
    const k = (c) => keys.has(c);
    let throttle = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0);
    let pitch = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
    let steer = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    let yaw = steer;
    let roll = (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0);
    let jump, boost, handbrake;
    if (scheme === 'keys') {
      jump = k('Space');
      boost = k('KeyK') || k('ShiftRight');
      handbrake = k('ShiftLeft') || k('ControlLeft') || k('ControlRight');
    } else {
      jump = mouse.right;
      boost = mouse.left;
      handbrake = k('ShiftLeft');
    }

    const p = pad();
    if (p) {
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const v = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const gThr = v(7) - v(6);
      const ax = dz(p.axes[0] || 0);
      const ay = dz(p.axes[1] || 0);
      if (Math.abs(gThr) > 0.02) throttle = gThr;
      if (ax) { steer = ax; yaw = ax; }
      if (ay) pitch = ay;
      const gRoll = (b(5) ? 1 : 0) - (b(4) ? 1 : 0);
      if (gRoll) roll = gRoll;
      jump = jump || b(0);
      boost = boost || b(1);
      handbrake = handbrake || b(2);
      if (b(3) && !padCam) camFlag = true;
      padCam = b(3);
    }
    const t = touch.read();
    if (t) {
      const mx = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
      throttle = mx(throttle, t.throttle); steer = mx(steer, t.steer); pitch = mx(pitch, t.pitch);
      yaw = mx(yaw, t.yaw); roll = mx(roll, t.roll);
      jump = jump || t.jump; boost = boost || t.boost; handbrake = handbrake || t.handbrake;
    }
    return {
      throttle: clamp1(throttle), steer: clamp1(steer), pitch: clamp1(pitch),
      yaw: clamp1(yaw), roll: clamp1(roll), jump, boost, handbrake,
    };
  }

  // Flanco de subida de un botón del mando
  function padEdge(p, i) {
    const on = !!(p && p.buttons[i] && p.buttons[i].pressed);
    const f = on && !padPrev[i];
    padPrev[i] = on;
    return f;
  }
  const padHeld = (i) => { const p = pad(); return !!(p && p.buttons[i] && p.buttons[i].pressed); };

  return {
    read,
    setScheme(sch, cam) {
      scheme = sch === 'keys' ? 'keys' : 'default';
      camMode = cam === 'hold' ? 'hold' : 'toggle';
      camFlag = false;
    },
    // En modo alternar devuelve true una vez por pulsación; en modo mantener solo cuenta el táctil.
    ballCamToggled() {
      const f = (camMode === 'toggle' && camFlag) || touch.camToggled();
      camFlag = false;
      return f;
    },
    // Tecla o botón de cámara balón mantenido (modo mantener)
    ballCamHeld() { return keys.has(camKey()) || padHeld(3); },
    scoreboardHeld() { return keys.has('Tab') || padHeld(8); },
    // Índice 0-3 de la tecla (1-4) o cruz del mando recién pulsada, o -1
    quickChat() {
      const p = pad();
      for (let i = 0; i < 4; i++) if (padEdge(p, 12 + i)) chatQ.push(i);
      return chatQ.length ? chatQ.shift() : -1;
    },
    hitboxToggled() { const f = hitFlag; hitFlag = false; return f; },
    reset() { touch.reset(); keys.clear(); mouse.left = mouse.right = false; camFlag = hitFlag = false; chatQ.length = 0; },
  };
}
