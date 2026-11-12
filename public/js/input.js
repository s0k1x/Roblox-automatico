// Entrada: teclado, ratón y mando combinados.
export function createInput() {
  const keys = new Set();
  const mouse = { left: false, right: false };
  let camFlag = false;
  let hitFlag = false;
  let padCam = false;

  const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ShiftLeft', 'ShiftRight',
    'ControlLeft', 'ControlRight', 'KeyC', 'KeyR', 'KeyH', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'KeyR') camFlag = true;
      if (e.code === 'KeyH') hitFlag = true;
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
    let jump = k('Space') || mouse.right;
    let boost = k('ShiftLeft') || k('ShiftRight') || mouse.left;
    let handbrake = k('ControlLeft') || k('ControlRight') || k('KeyC');

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
    return {
      throttle: clamp1(throttle), steer: clamp1(steer), pitch: clamp1(pitch),
      yaw: clamp1(yaw), roll: clamp1(roll), jump, boost, handbrake,
    };
  }

  return {
    read,
    ballCamToggled() { const f = camFlag; camFlag = false; return f; },
    hitboxToggled() { const f = hitFlag; hitFlag = false; return f; },
    reset() { keys.clear(); mouse.left = mouse.right = false; camFlag = hitFlag = false; },
  };
}
