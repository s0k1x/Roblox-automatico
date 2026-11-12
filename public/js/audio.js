// Audio de Balón Turbo: todo sintetizado con Web Audio (sin archivos ni librerías).
// API: unlock(), setVolumes({master, sfx, engine, music}), menu(on), update(state, myCarId, dt),
//      events(events, state, myCarId), ui(kind).
export function createAudio() {
  let ctx = null, master, sfxBus, engBus, musBus, noiseBuf;
  const vol = { master: 0.8, sfx: 0.8, engine: 0.6, music: 0.5 };
  const engines = new Map(); // id -> nodos del motor de cada coche
  let wantMenu = false, musicTimer = 0, nextChord = 0, chordIdx = 0, nextNote = 0;
  let prevBall = null, lastTouchAt = -9, lastCount = -1, lastPhase = '';
  const prevCars = new Map(); // id -> { g, boost, sp }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function applyVol() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(vol.master, t, 0.03);
    sfxBus.gain.setTargetAtTime(vol.sfx, t, 0.03);
    engBus.gain.setTargetAtTime(vol.engine * 0.5, t, 0.03);
    musBus.gain.setTargetAtTime(wantMenu ? vol.music * 0.5 : 0, t, wantMenu ? 0.6 : 0.25);
  }

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); sfxBus = ctx.createGain(); engBus = ctx.createGain(); musBus = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      sfxBus.connect(master); engBus.connect(master); musBus.connect(master);
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVol();
    } catch (e) { ctx = null; return false; }
    return true;
  }

  // ---------- utilidades de síntesis ----------
  function noise(loop) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = !!loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }
  function env(g, t, a, peak, d) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  // Tono con barrido de frecuencia
  function tone(type, f0, f1, dur, peak, dest, t0, attack) {
    const t = t0 || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env(g, t, attack || 0.005, peak, dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + (attack || 0.005) + dur + 0.05);
    return g;
  }
  // Ráfaga de ruido filtrado
  function burst(ftype, f0, f1, dur, peak, dest, q, attack, t0) {
    const t = t0 || ctx.currentTime;
    const n = noise(false), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = ftype; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, attack || 0.004, peak, dur);
    n.connect(f); f.connect(g); g.connect(dest || sfxBus);
    n.start(t, Math.random()); n.stop(t + (attack || 0.004) + dur + 0.05);
  }
  function out(gain) { const g = ctx.createGain(); g.gain.value = gain; g.connect(sfxBus); return g; }
  const near = (state, myCarId, pos) => {
    const me = state && state.cars.find((c) => c.id === myCarId);
    if (!me || !pos) return 1;
    return 1 / (1 + dist3(me.p, pos) / 1100);
  };

  // ---------- efectos ----------
  function sfxHit(speed, gain) {
    const k = clamp(speed / 4500, 0.08, 1);
    const o = out(gain * (0.25 + k * 0.75));
    tone('sine', 190 + k * 60, 55, 0.18, 1, o);
    burst('lowpass', 1800 + k * 2500, 300, 0.12, 0.7, o, 0.8);
    if (k > 0.5) burst('highpass', 3000, 6000, 0.08, 0.35 * k, o, 0.7);
  }
  function sfxBounce(k) {
    const o = out(0.2 + 0.5 * k);
    tone('sine', 120, 50, 0.14, 1, o);
    burst('bandpass', 900, 250, 0.1, 0.5, o, 1.2);
  }
  function sfxJump(gain) {
    const o = out(gain * 0.5);
    tone('triangle', 260, 520, 0.14, 0.7, o);
    burst('bandpass', 1500, 3000, 0.1, 0.25, o, 1);
  }
  function sfxPickup() {
    const o = out(0.45), t = ctx.currentTime;
    tone('sine', 660, 660, 0.12, 0.8, o, t);
    tone('sine', 990, 990, 0.16, 0.8, o, t + 0.07);
    tone('triangle', 1320, 1320, 0.2, 0.4, o, t + 0.14);
  }
  function sfxGoal() {
    const t = ctx.currentTime, o = out(0.9);
    // explosión
    burst('lowpass', 2400, 90, 1.1, 1, o, 0.8);
    tone('sine', 110, 30, 0.9, 1, o);
    burst('highpass', 2500, 8000, 0.35, 0.3, o, 0.7);
    // ovación: ruido filtrado con oleaje + voces
    const n = noise(true), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t + 0.1);
    g.gain.linearRampToValueAtTime(0.5, t + 0.9);
    g.gain.setValueAtTime(0.5, t + 2.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5; lg.gain.value = 0.12;
    lfo.connect(lg); lg.connect(g.gain);
    n.connect(f); f.connect(g); g.connect(o);
    n.start(t); n.stop(t + 4.4); lfo.start(t); lfo.stop(t + 4.4);
    for (let i = 0; i < 6; i++) {
      const f0 = 300 + Math.random() * 300, st = t + 0.2 + Math.random() * 0.6;
      const v = ctx.createOscillator(), vf = ctx.createBiquadFilter(), vg = ctx.createGain();
      v.type = 'sawtooth'; vf.type = 'bandpass'; vf.frequency.value = 800 + Math.random() * 600; vf.Q.value = 3;
      v.frequency.setValueAtTime(f0, st); v.frequency.linearRampToValueAtTime(f0 * 1.3, st + 1.5);
      vg.gain.setValueAtTime(0.0001, st);
      vg.gain.linearRampToValueAtTime(0.12, st + 0.4);
      vg.gain.exponentialRampToValueAtTime(0.0001, st + 2.2);
      v.connect(vf); vf.connect(vg); vg.connect(o);
      v.start(st); v.stop(st + 2.4);
    }
  }
  function sfxDemo(gain) {
    const o = out(gain);
    burst('lowpass', 3500, 120, 0.7, 1, o, 1);
    tone('sawtooth', 180, 35, 0.5, 0.7, o);
    burst('highpass', 3500, 7000, 0.15, 0.4, o, 0.8);
  }
  function sfxBump(gain) {
    const o = out(gain * 0.5);
    tone('square', 120, 60, 0.1, 0.4, o);
    burst('lowpass', 1500, 300, 0.1, 0.6, o, 1);
  }
  function sfxSave(gain) {
    const o = out(gain * 0.4);
    tone('triangle', 520, 780, 0.18, 0.7, o);
  }
  function beep(f, dur) { tone('square', f, f, dur, 0.28, out(0.7), 0, 0.01); tone('sine', f * 2, f * 2, dur, 0.15, out(0.7), 0, 0.01); }

  // ---------- motores ----------
  function makeEngine() {
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 2;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(engBus);
    // turbo: ruido filtrado
    const n = noise(true), bf = ctx.createBiquadFilter(), bg = ctx.createGain();
    bf.type = 'bandpass'; bf.frequency.value = 1400; bf.Q.value = 0.8; bg.gain.value = 0;
    n.connect(bf); bf.connect(bg); bg.connect(engBus);
    o1.start(); o2.start(); n.start();
    return { g, lp, o1, o2, bg, bf, n, acc: 0 };
  }
  function killEngine(e) {
    try { e.o1.stop(); e.o2.stop(); e.n.stop(); e.g.disconnect(); e.bg.disconnect(); } catch (er) { /* ya parado */ }
  }

  return {
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setVolumes(v) {
      for (const k of ['master', 'sfx', 'engine', 'music']) if (v && typeof v[k] === 'number') vol[k] = clamp(v[k], 0, 1);
      applyVol();
    },
    // Música del menú (acordes suaves en bucle)
    menu(on) {
      wantMenu = !!on;
      if (!ctx) return;
      applyVol();
      if (on && !musicTimer) {
        nextChord = ctx.currentTime + 0.1; nextNote = nextChord;
        musicTimer = setInterval(scheduleMusic, 120);
      } else if (!on && musicTimer) {
        const id = musicTimer; musicTimer = 0;
        setTimeout(() => clearInterval(id), 50);
      }
    },
    ui(kind) {
      if (!ctx || ctx.state !== 'running') return;
      const o = out(0.35), t = ctx.currentTime;
      if (kind === 'select') { tone('triangle', 520, 520, 0.09, 0.6, o, t); tone('triangle', 780, 780, 0.12, 0.6, o, t + 0.05); }
      else if (kind === 'back') { tone('triangle', 520, 520, 0.08, 0.5, o, t); tone('triangle', 350, 350, 0.1, 0.5, o, t + 0.05); }
      else if (kind === 'start') { tone('sawtooth', 220, 660, 0.3, 0.5, o, t); burst('bandpass', 600, 3000, 0.3, 0.4, o, 1.2); }
      else tone('sine', 700, 700, 0.04, 0.5, o, t); // move
    },
    // Cada fotograma con el estado actual
    update(state, myCarId, dt) {
      if (!ctx || ctx.state !== 'running' || !state) return;
      const now = ctx.currentTime;
      const me = state.cars.find((c) => c.id === myCarId);
      const live = new Set();
      for (const c of state.cars) {
        live.add(c.id);
        let e = engines.get(c.id);
        if (!e) { e = makeEngine(); engines.set(c.id, e); }
        const sp = Math.hypot(c.v[0], c.v[1], c.v[2]);
        const pv = prevCars.get(c.id);
        const g = me && c.id !== me.id ? 1 / (1 + dist3(me.p, c.p) / 900) : 1;
        const own = !me || c.id === me.id;
        const accel = pv && dt > 0 ? clamp((sp - pv.sp) / dt / 500, -1, 1) : 0;
        e.acc += (accel - e.acc) * Math.min(1, dt * 6);
        const k = clamp(sp / 2300, 0, 1.2);
        const f = 48 + k * 95 + (c.boosting ? 14 : 0) + Math.max(0, e.acc) * 10;
        const alive = !c.dead && state.phase !== 'ended';
        e.o1.frequency.setTargetAtTime(f, now, 0.05);
        e.o2.frequency.setTargetAtTime(f * 0.5, now, 0.05);
        e.lp.frequency.setTargetAtTime(380 + k * 700 + Math.max(0, e.acc) * 300 + (c.boosting ? 300 : 0), now, 0.06);
        const base = (0.16 + k * 0.14 + Math.max(0, e.acc) * 0.1) * (own ? 1 : 0.6) * g;
        e.g.gain.setTargetAtTime(alive ? base : 0, now, 0.08);
        e.bg.gain.setTargetAtTime(alive && c.boosting ? (own ? 0.35 : 0.22) * g : 0, now, 0.06);
        e.bf.frequency.setTargetAtTime(1000 + k * 1200, now, 0.1);
        // salto: pasa de suelo a aire subiendo
        if (pv && pv.g && !c.g && c.v[2] > 250 && !c.dead) sfxJump(g);
        // recogida de turbo del coche propio
        if (pv && own && c.boost - pv.boost >= 10 && state.phase === 'play' && !c.dead) sfxPickup();
        prevCars.set(c.id, { g: c.g, boost: c.boost, sp });
      }
      for (const [id, e] of engines) if (!live.has(id)) { killEngine(e); engines.delete(id); prevCars.delete(id); }

      // rebote del balón: cambio brusco de velocidad sin golpe de coche
      const bv = state.ball.v;
      if (prevBall && dt > 0) {
        const dv = Math.hypot(bv[0] - prevBall[0], bv[1] - prevBall[1], bv[2] - prevBall[2]);
        if (dv > 450 && now - lastTouchAt > 0.12 && state.phase !== 'goal') {
          const k = clamp(dv / 2500, 0.1, 1);
          sfxBounce(k * near(state, myCarId, state.ball.p) * 1.4);
          lastTouchAt = now;
        }
      }
      prevBall = bv.slice();

      // cuenta atrás
      if (state.phase === 'countdown') {
        const n = Math.max(1, Math.ceil(state.phaseTime - 1e-6));
        if (n !== lastCount) { lastCount = n; beep(520, 0.22); }
      } else lastCount = -1;
      lastPhase = state.phase;
    },
    events(events, state, myCarId) {
      if (!ctx || ctx.state !== 'running' || !events) return;
      const car = (id) => state && state.cars.find((c) => c.id === id);
      for (const e of events) {
        if (e.type === 'touch') {
          const c = car(e.car);
          sfxHit(e.speed, c ? near(state, myCarId, c.p) * 1.2 : 0.8);
          lastTouchAt = ctx.currentTime;
        } else if (e.type === 'goal') sfxGoal();
        else if (e.type === 'demo') sfxDemo(near(state, myCarId, e.pos) * 1.3);
        else if (e.type === 'bump') { const c = car(e.a); sfxBump(c ? near(state, myCarId, c.p) : 0.5); }
        else if (e.type === 'save') { const c = car(e.car); sfxSave(c ? near(state, myCarId, c.p) : 0.5); }
        else if (e.type === 'go') beep(1040, 0.5);
      }
    },
  };

  // ---------- secuenciador de la música del menú ----------
  function scheduleMusic() {
    if (!ctx || !wantMenu) return;
    // Progresión original en la menor, ocho segundos por vuelta
    const CH = [
      [57, 60, 64, 67], // Am7
      [53, 57, 60, 64], // Fmaj7
      [48, 55, 60, 64], // C
      [55, 59, 62, 65], // G7
    ];
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const dur = 3.2;
    while (nextChord < ctx.currentTime + 0.6) {
      const ch = CH[chordIdx % CH.length];
      const t = nextChord;
      ch.forEach((m, i) => {
        for (const det of [-5, 5]) {
          const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
          o.type = 'triangle'; o.frequency.value = mf(m - (i === 0 ? 12 : 0)); o.detune.value = det;
          lp.type = 'lowpass'; lp.frequency.value = 1100;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.07, t + 0.9);
          g.gain.linearRampToValueAtTime(0.05, t + dur - 0.3);
          g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.7);
          o.connect(lp); lp.connect(g); g.connect(musBus);
          o.start(t); o.stop(t + dur + 0.8);
        }
      });
      // arpegio suave
      for (let i = 0; i < 8; i++) {
        const tt = t + i * (dur / 8), m = ch[(i * 3) % 4] + 12;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = mf(m);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.linearRampToValueAtTime(0.05, tt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.7);
        o.connect(g); g.connect(musBus);
        o.start(tt); o.stop(tt + 0.8);
      }
      nextChord += dur; chordIdx++;
    }
  }
}
