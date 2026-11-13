// Controles táctiles: joystick flotante + botones. Solo en dispositivos táctiles y durante la partida.
export function createTouchControls() {
  const state = { x: 0, y: 0, jump: false, boost: false, drift: false, brake: false, cam: false };
  let camFlag = false;
  let isTouch = false;
  let active = false;
  let forced = null;

  const root = document.createElement('div');
  root.className = 'tc-root tc-off';
  root.innerHTML = `
    <div class="tc-zone"></div>
    <div class="tc-stick"><i class="tc-knob"></i></div>
    <button class="tc-btn tc-small tc-cam" data-k="cam" type="button">CÁMARA<br>BALÓN</button>
    <button class="tc-btn tc-small tc-pause" data-k="pause" type="button">PAUSA</button>
    <button class="tc-btn tc-brake" data-k="brake" type="button">FRENO</button>
    <button class="tc-btn tc-drift" data-k="drift" type="button">DERRAPE</button>
    <button class="tc-btn tc-boost" data-k="boost" type="button">TURBO</button>
    <button class="tc-btn tc-jump" data-k="jump" type="button">SALTO</button>
    <div class="tc-rotate">Gira el móvil para jugar mejor</div>`;
  document.body.appendChild(root);

  const zone = root.querySelector('.tc-zone');
  const stick = root.querySelector('.tc-stick');
  const knob = root.querySelector('.tc-knob');
  const RADIUS = 60;
  let joyId = null;
  let cx = 0, cy = 0;

  function refresh() {
    const hud = document.getElementById('hud');
    const playing = forced !== null ? forced : (active || (hud && !hud.classList.contains('hidden')));
    const show = isTouch && !!playing;
    root.classList.toggle('tc-off', !show);
    document.body.classList.toggle('tc-touch', show); // el HUD se recoloca para no quedar bajo los botones
    root.classList.toggle('tc-portrait', show && window.innerHeight > window.innerWidth);
    if (!show) releaseAll();
  }

  function releaseAll() {
    state.x = state.y = 0;
    state.jump = state.boost = state.drift = state.brake = state.cam = false;
    joyId = null;
    stick.classList.remove('tc-on');
    root.querySelectorAll('.tc-btn.tc-down').forEach((b) => b.classList.remove('tc-down'));
    btnPtr.clear();
  }

  function markTouch() {
    if (isTouch) return;
    isTouch = true;
    refresh();
  }
  try { if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) isTouch = true; } catch (e) { /* nada */ }
  window.addEventListener('touchstart', markTouch, { passive: true });
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') markTouch(); }, true);

  // Joystick flotante
  function moveStick(e) {
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = dx / len * RADIUS; dy = dy / len * RADIUS; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    let x = dx / RADIUS, y = dy / RADIUS;
    if (Math.hypot(x, y) < 0.1) { x = 0; y = 0; }
    state.x = x; state.y = y;
  }
  zone.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return;
    e.preventDefault();
    joyId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
    cx = e.clientX; cy = e.clientY;
    stick.style.left = cx + 'px';
    stick.style.top = cy + 'px';
    stick.classList.add('tc-on');
    moveStick(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) { e.preventDefault(); moveStick(e); } });
  const endJoy = (e) => {
    if (e.pointerId !== joyId) return;
    joyId = null;
    state.x = state.y = 0;
    knob.style.transform = '';
    stick.classList.remove('tc-on');
  };
  zone.addEventListener('pointerup', endJoy);
  zone.addEventListener('pointercancel', endJoy);

  // Botones (multitáctil por pointerId)
  const btnPtr = new Map(); // pointerId -> botón
  function press(k, btn, down) {
    btn.classList.toggle('tc-down', down);
    if (k === 'pause') {
      if (down) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
      return;
    }
    if (k === 'cam') { if (down) camFlag = true; return; }
    state[k] = down;
    if (k === 'jump' && down && navigator.vibrate) navigator.vibrate(10);
  }
  root.querySelectorAll('.tc-btn').forEach((btn) => {
    const k = btn.dataset.k;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
      btnPtr.set(e.pointerId, btn);
      press(k, btn, true);
    });
    const up = (e) => {
      if (btnPtr.get(e.pointerId) !== btn) return;
      btnPtr.delete(e.pointerId);
      // solo suelta si ningún otro dedo sigue en el mismo botón
      for (const b of btnPtr.values()) if (b === btn) return;
      press(k, btn, false);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // Detección de partida
  const hud = document.getElementById('hud');
  if (hud && window.MutationObserver) new MutationObserver(refresh).observe(hud, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  setInterval(refresh, 500);
  refresh();

  return {
    setActive(v) { active = !!v; forced = v ? true : null; refresh(); },
    isVisible() { return !root.classList.contains('tc-off'); },
    read() {
      const vis = !root.classList.contains('tc-off');
      if (!vis) return null;
      const mag = Math.hypot(state.x, state.y);
      let throttle = 0;
      if (state.brake) throttle = -1;
      else if (state.y > 0.85) throttle = -1;
      else if (mag > 0.15) throttle = 1;
      return {
        throttle, steer: state.x, yaw: state.x, pitch: state.y,
        jump: state.jump, boost: state.boost, handbrake: state.drift,
        roll: state.drift ? state.x : 0,
      };
    },
    camToggled() { const f = camFlag; camFlag = false; return f; },
    reset() { releaseAll(); camFlag = false; },
  };
}
