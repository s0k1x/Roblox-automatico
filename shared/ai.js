// IA de los bots: predicción del balón, punto de golpeo, aproximación, aéreos, saques y rotación.
// botInput(game, car) → { throttle, steer, pitch, yaw, roll, jump, boost, handbrake }, una vez por tick (1/120 s).
// Nivel por coche: car.botLevel si existe, si no game.botLevel (0 Novato, 1 Profesional, 2 Experto).
// Convenciones de la simulación: pitch +1 = morro arriba, yaw +1 = giro a la derecha,
// roll +1 = inclinar a la derecha; steer negativo gira a la izquierda; en el aire handbrake + steer = roll libre.
import { dot, len, norm, clamp, toLocal } from './vec.js';
import { ARENA } from './arena.js';
import { PHYS as P } from './constants.js';

const { HX, HY, GW, GH } = ARENA;
const R = P.BALL_RADIUS;
const PS = 1 / 60; // paso de la predicción
const PN = 240; // 4 s
const ST = 7; // valores por muestra: t, x, y, z, vx, vy, vz
const REACT = [12, 4, 1]; // ticks entre decisiones por nivel
const AERIAL_MAX = [0, 900, 1500]; // altura máxima de aéreo por nivel
const ERR = [0.3, 0.08, 0.02]; // error de puntería (rad)
const TAB_N = 100; // tabla de distancia recorrida: 100 pasos de 0.05 s

// ---------- Contexto compartido por tick (predicción y roles) ----------
function ctx(game) {
  let X = game._ai;
  if (!X) X = game._ai = { tick: -1, predTick: -99, off: 0, pred: new Float64Array((PN + 1) * ST), roles: new Map(), done: [false, false], att: [-1, -1], threat: [99, 99], threatX: [0, 0] };
  if (X.tick !== game.tick) {
    X.tick = game.tick;
    X.roles.clear();
    X.done[0] = X.done[1] = false;
    // La predicción se reutiliza hasta 3 ticks mientras el balón siga la trayectoria prevista.
    let stale = game.tick - X.predTick > 3 || game.tick < X.predTick;
    if (!stale) {
      const b = game.ball, o = X.off = (game.tick - X.predTick) / 120, f = o / PS, k = f | 0, d = X.pred, q = k * ST;
      const ex = d[q + 1] + (d[q + 1 + ST] - d[q + 1]) * (f - k) - b.pos[0], ey = d[q + 2] + (d[q + 2 + ST] - d[q + 2]) * (f - k) - b.pos[1], ez = d[q + 3] + (d[q + 3 + ST] - d[q + 3]) * (f - k) - b.pos[2];
      if (ex * ex + ey * ey + ez * ez > 36) stale = true;
    }
    if (stale) { fillPred(game, X); X.predTick = game.tick; X.off = 0; }
  }
  return X;
}

// Predicción del balón: gravedad, arrastre, rebote de suelo (0.6), paredes, techo y esquinas cortadas.
function fillPred(game, X) {
  const b = game.ball, d = X.pred;
  let x = b.pos[0], y = b.pos[1], z = b.pos[2], vx = b.vel[0], vy = b.vel[1], vz = b.vel[2];
  X.threat[0] = X.threat[1] = 99;
  const ax = HX - R, ay = HY - R, az = ARENA.H - R, drag = 1 - P.BALL_DRAG * PS;
  const diag = HX + HY - ARENA.CORNER - R * 1.4142;
  const rest = P.BALL_RESTITUTION;
  for (let k = 0; k <= PN; k++) {
    const o = k * ST;
    d[o] = k * PS; d[o + 1] = x; d[o + 2] = y; d[o + 3] = z; d[o + 4] = vx; d[o + 5] = vy; d[o + 6] = vz;
    if (k === PN) break;
    if (Math.abs(y) > HY && z < GH && Math.abs(x) < GW) {
      const tm = y < 0 ? 0 : 1;
      if (X.threat[tm] === 99) { X.threat[tm] = k * PS; X.threatX[tm] = x; }
    }
    vz += P.GRAVITY * PS;
    vx *= drag; vy *= drag; vz *= drag;
    x += vx * PS; y += vy * PS; z += vz * PS;
    if (z < R) { z = R; if (vz < 0) { vz = -vz * rest; if (vz < 60) vz = 0; } }
    else if (z > az) { z = az; if (vz > 0) vz = -vz * rest; }
    if (x > ax) { x = ax; if (vx > 0) vx = -vx * rest; } else if (x < -ax) { x = -ax; if (vx < 0) vx = -vx * rest; }
    const mouth = Math.abs(x) < GW - R * 0.3 && z < GH - R * 0.5;
    const yl = mouth ? HY + ARENA.GD - R : ay;
    if (y > yl) { y = yl; if (vy > 0) vy = -vy * (mouth ? 0.3 : rest); } else if (y < -yl) { y = -yl; if (vy < 0) vy = -vy * (mouth ? 0.3 : rest); }
    if (!mouth || Math.abs(y) < HY - R) {
      const s = Math.abs(x) + Math.abs(y);
      if (s > diag) {
        const sx = x > 0 ? 1 : -1, sy = y > 0 ? 1 : -1, e = (s - diag) * 0.7071;
        x -= sx * e * 0.7071; y -= sy * e * 0.7071;
        const vn = (vx * sx + vy * sy) * 0.7071;
        if (vn > 0) { vx -= sx * 0.7071 * vn * (1 + rest); vy -= sy * 0.7071 * vn * (1 + rest); }
      }
    }
  }
}

function ballAt(X, t, out) {
  const f = clamp((t + X.off) / PS, 0, PN - 1.001), k = f | 0, a = f - k, d = X.pred, o = k * ST;
  out[0] = d[o + 1] + (d[o + 1 + ST] - d[o + 1]) * a;
  out[1] = d[o + 2] + (d[o + 2 + ST] - d[o + 2]) * a;
  out[2] = d[o + 3] + (d[o + 3 + ST] - d[o + 3]) * a;
  return out;
}

function newAI() {
  return { seq: null, inp: null, left: 0, last: -1, stuck: 0, unstuck: 0, dir: 1, stuckN: 0, err: 0, errTick: -999, koDone: false, ip: null, ipTick: -1, tab: new Float64Array(TAB_N + 1) };
}

// ---------- Entrada principal ----------
export function botInput(game, c) {
  const level = c.botLevel ?? game.botLevel ?? 1;
  const ai = c.ai || (c.ai = newAI());
  // Reacción lenta: se repite la última decisión en suelo mientras no haya una secuencia en marcha.
  if (ai.inp && ai.left > 0 && c.grounded && !ai.seq && game.phase === 'play' && !c.dead) { ai.left--; return ai.inp; }
  const X = ctx(game);
  const inp = think(game, X, c, level, ai);
  ai.inp = inp;
  ai.left = REACT[level] - 1;
  return inp;
}

function think(game, X, c, level, ai) {
  const inp = { throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false };
  const dts = ai.last < 0 ? 0 : Math.min(60, game.tick - ai.last) / 120;
  ai.last = game.tick;
  if (c.dead) return inp;
  if (game.kickoffTouched) ai.koDone = false;
  if (ai.seq && runSeq(game, X, c, level, ai, inp)) return inp;
  if (!c.grounded) { airControl(game, c, level, ai, inp); return inp; }
  groundBrain(game, X, c, level, ai, inp, dts);
  return inp;
}

// ---------- Control aéreo ----------
function rollFix(c, inp) {
  const lu = toLocal(c.o, [0, 0, 1]), wl = toLocal(c.o, c.ang);
  const er = Math.atan2(lu[1], lu[2]);
  inp.roll = clamp(-1.5 * er - 0.45 * wl[0], -1, 1);
}

// Orienta el morro hacia la dirección mundial D (unitaria) con un PD sobre cabeceo y guiñada.
function orient(c, inp, D, level, noise) {
  const dl = toLocal(c.o, D), wl = toLocal(c.o, c.ang);
  const ep = Math.atan2(dl[2], dl[0]) + noise, ey = Math.atan2(dl[1], dl[0]);
  inp.pitch = clamp(2.5 * ep + 0.8 * wl[1], -1, 1);
  inp.yaw = clamp(-2.5 * ey + 1.0 * wl[2], -1, 1);
  rollFix(c, inp);
}

function recover(c, inp) {
  const vh = Math.hypot(c.vel[0], c.vel[1]);
  const D = vh > 300 ? [c.vel[0] / vh, c.vel[1] / vh, 0] : norm([c.o.f[0], c.o.f[1], 0], [1, 0, 0]);
  orient(c, inp, D, 0, 0);
}

function airControl(game, c, level, ai, inp) {
  // Volcado apoyado de lado o de techo: pulsar salto para enderezarse.
  if (c.touching && c.touchN && dot(c.o.u, c.touchN) < 0.6) { inp.jump = (game.tick & 1) === 0; rollFix(c, inp); return; }
  recover(c, inp);
  inp.throttle = 1;
  // Wavedash (nivel 2): flip hacia delante justo antes de tocar el suelo.
  if (level === 2 && c.canFlip && !c.dodge && c.vel[2] < -150 && c.pos[2] < 55 && c.o.u[2] > 0.8 && Math.abs(c.o.f[2]) < 0.45 && Math.hypot(c.vel[0], c.vel[1]) > 500) {
    inp.jump = true; inp.pitch = -1; inp.yaw = 0; inp.roll = 0;
  }
}

// ---------- Secuencias (saltos, dodges, aéreos) ----------
const _b = [0, 0, 0];
function dodgeInputs(c, ball, inp) {
  const lb = toLocal(c.o, [ball.pos[0] - c.pos[0], ball.pos[1] - c.pos[1], 0]);
  const a = Math.atan2(lb[1], lb[0]);
  let p = -Math.cos(a), y = -Math.sin(a);
  const m = Math.max(Math.abs(p), Math.abs(y)) || 1;
  inp.pitch = p / m; inp.yaw = y / m; inp.roll = 0;
}

function runSeq(game, X, c, level, ai, inp) {
  const s = ai.seq, e = (game.tick - s.t0) / 120;
  inp.throttle = 1;
  const end = () => { ai.seq = null; return false; };
  switch (s.type) {
    case 'jump': {
      if (e < s.hold) inp.jump = true;
      else if (s.dbl && e >= s.hold + 0.06 && e < s.hold + 0.1) inp.jump = true;
      if (e > 0.15 && c.grounded) return end();
      if (e > 0.7) return end();
      if (e >= s.hold) recover(c, inp);
      return true;
    }
    case 'dodge': {
      if (e < 0.03) inp.jump = true;
      else if (e >= 0.09 && !s.done && !c.grounded) {
        inp.jump = true; s.done = true; dodgeInputs(c, game.ball, inp);
      } else if (e > 0.25 && c.grounded) return end();
      if (e > 0.75) return end();
      if (!inp.jump && !s.done) recover(c, inp);
      return true;
    }
    case 'speed': { // speed flip: dodge diagonal + cancelación del cabeceo + turbo
      inp.boost = true;
      if (e < 0.03) inp.jump = true;
      else if (e >= 0.09 && !s.done && !c.grounded) { inp.jump = true; inp.pitch = -1; inp.roll = s.side; s.done = true; s.t1 = e; }
      else if (s.done && e < s.t1 + 0.42) { inp.pitch = 1; inp.roll = 0; }
      else if (s.done) { recover(c, inp); }
      if (e > 0.25 && c.grounded && e < 0.6) return end();
      if (e > 1.0) return end();
      if (e >= 0.03 && e < 0.09) inp.pitch = 0;
      return true;
    }
    case 'aerial': {
      if (e < 0.2) inp.jump = true;
      const tRem = Math.max(0.05, (s.hit - game.tick) / 120);
      if (e > 0.3 && c.grounded) return end();
      if (e > 3 || tRem < 0.05 && e > 0.6 && game.tick > s.hit + 60) return end();
      if (e > 0.1 && c.touching) { /* tras tocar algo, sigue igual */ }
      let tp;
      if (level === 2) { tp = ballAt(X, tRem, _b); s.tp = [tp[0], tp[1], tp[2]]; }
      tp = s.tp;
      const g = [tp[0] - s.ax * 135 - c.pos[0], tp[1] - s.ay * 135 - c.pos[1], tp[2] - s.az * 135 - c.pos[2]];
      let D, need = 1000;
      if (level === 2 && tRem > 0.12) {
        const a = [2 * (g[0] - c.vel[0] * tRem) / (tRem * tRem), 2 * (g[1] - c.vel[1] * tRem) / (tRem * tRem), 2 * (g[2] - c.vel[2] * tRem) / (tRem * tRem) + 650];
        need = len(a);
        D = norm(a, [0, 0, 1]);
      } else D = norm(g, [0, 0, 1]);
      orient(c, inp, D, level, 0);
      const dl = toLocal(c.o, D);
      const ang = Math.acos(clamp(dl[0], -1, 1));
      inp.boost = e > 0.12 && ang < 0.85 && need > 200 && c.boost > 0;
      if (!inp.boost && ang > 1.0 && e > 0.3) inp.boost = false;
      return true;
    }
    default: ai.seq = null; return false;
  }
}

// ---------- Tabla de distancia recorrida y punto de golpeo ----------
function buildTab(c, level, v0, tab) {
  let v = v0, D = 0;
  let bt = (level === 0 && c.boost < 60) ? 0 : c.boost / P.BOOST_USE;
  tab[0] = 0;
  const dt = 0.05;
  for (let i = 1; i <= TAB_N; i++) {
    let a = v < 1410 ? 1600 - 1.0286 * v : 0;
    const boosting = bt > 0;
    if (boosting) { a += P.BOOST_ACCEL; bt -= dt; }
    v += a * dt;
    const cap = boosting ? 2300 : 1410;
    if (v > cap) v = Math.max(cap, v - 525 * dt);
    D += v * dt;
    tab[i] = D;
  }
}
function tabAt(tab, t) {
  const f = t / 0.05;
  if (f >= TAB_N) return tab[TAB_N];
  const i = f | 0;
  return tab[i] + (tab[i + 1] - tab[i]) * (f - i);
}

// Primer instante alcanzable a una altura alcanzable (suelo / salto / doble salto / aéreo).
function findIntercept(game, X, c, level) {
  const ai = c.ai;
  if (ai.ipTick === game.tick) return ai.ip;
  const b = game.ball, p = X.pred, cx = c.pos[0], cy = c.pos[1];
  const dx0 = b.pos[0] - cx, dy0 = b.pos[1] - cy, dn0 = Math.hypot(dx0, dy0) || 1;
  const v0 = Math.max(0, (c.vel[0] * dx0 + c.vel[1] * dy0) / dn0);
  buildTab(c, level, v0, ai.tab);
  const cap = AERIAL_MAX[level];
  let ip = null;
  const fx = c.o.f[0], fy = c.o.f[1], fn = Math.hypot(fx, fy) || 1;
  for (let k = 2; k <= PN; k++) {
    const o = k * ST, t = p[o] - X.off, x = p[o + 1], y = p[o + 2], z = p[o + 3];
    if (t < 0.03 || Math.abs(y) > HY + 20) continue;
    let startup;
    if (z < 150) startup = 0;
    else if (z < 300) startup = 0.12;
    else if (z < 450) { if (level < 1) continue; startup = 0.3; }
    else if (z < cap && c.boost > 12 + z / 40) startup = 0.3 + (z - 300) / 900;
    else continue;
    const dx = x - cx, dy = y - cy, dn = Math.hypot(dx, dy);
    const d = Math.max(0, dn - 130);
    const cosA = dn > 1 ? (fx * dx + fy * dy) / (fn * dn) : 1;
    const turn = Math.acos(clamp(cosA, -1, 1)) * 0.2;
    const ta = t - startup - turn;
    if (ta <= 0) continue;
    if (tabAt(ai.tab, ta) >= d) { ip = { t, x, y, z, k }; break; }
  }
  if (!ip) { const o = 45 * ST; ip = { t: p[o] - X.off, x: p[o + 1], y: p[o + 2], z: Math.min(p[o + 3], 140), k: 45, far: true }; }
  ai.ip = ip; ai.ipTick = game.tick;
  return ip;
}

// ---------- Roles del equipo ----------
// 0 ataca, 1 apoya, 2 portero. Se calcula una vez por tick y equipo.
function teamRoles(game, X, team, level) {
  if (X.done[team]) return;
  X.done[team] = true;
  const fwd = team === 0 ? 1 : -1, ownY = -fwd * HY;
  const mates = [];
  for (const m of game.cars) if (m.team === team && !m.dead) mates.push(m);
  if (!mates.length) return;
  const b = game.ball;
  const bx = b.pos[0] + b.vel[0] * 0.3, by = b.pos[1] + b.vel[1] * 0.3;
  const sc = (m) => {
    const dx = bx - m.pos[0], dy = by - m.pos[1], d = Math.hypot(dx, dy) || 1;
    const vt = Math.max(0, (m.vel[0] * dx + m.vel[1] * dy) / d);
    let s = d - 0.4 * vt;
    if ((by - m.pos[1]) * fwd < -250) s += 1600; // fuera de posición (por delante del balón)
    return s;
  };
  let best = null, bs = 1e9, prev = null, ps = 1e9;
  for (const m of mates) {
    const s = sc(m);
    if (s < bs) { bs = s; best = m; }
    if (m.id === X.att[team]) { prev = m; ps = s; }
  }
  // Con peligro de gol cerca, ataca quien primero llega al balón
  const th = X.threat[team] - X.off;
  if (th < 2.5 && mates.length > 1) {
    let bm = null, bt = 1e9;
    for (const m of mates) {
      if (!m.ai) m.ai = newAI();
      const ip = findIntercept(game, X, m, m.botLevel ?? game.botLevel ?? 1);
      const t = ip.far ? 99 : ip.t;
      if (t < bt) { bt = t; bm = m; }
    }
    if (bm && bt < th + 0.3) { best = bm; prev = null; }
  }
  const att = prev && ps < bs + 450 ? prev : best;
  X.att[team] = att.id;
  X.roles.set(att.id, 0);
  const rest = mates.filter((m) => m !== att);
  if (rest.length === 1) {
    // 2v2: el otro defiende si el balón está en nuestro campo o viene hacia la portería; si no, apoya.
    const own = (by - ownY) * fwd < HY * 0.9 || X.threat[team] - X.off < 3;
    X.roles.set(rest[0].id, own ? 2 : 1);
  } else if (rest.length >= 2) {
    rest.sort((m1, m2) => (m1.pos[1] - ownY) * fwd - (m2.pos[1] - ownY) * fwd);
    X.roles.set(rest[0].id, 2);
    for (let i = 1; i < rest.length; i++) X.roles.set(rest[i].id, 1);
  }
}

// ---------- Conducción ----------
const _d = { angle: 0, dist: 0, vf: 0 };
function drive(c, inp, tx, ty, o) {
  const dx = tx - c.pos[0], dy = ty - c.pos[1], f = c.o.f, l = c.o.l;
  const lf = dx * f[0] + dy * f[1], ll = dx * l[0] + dy * l[1];
  const angle = Math.atan2(ll, lf), dist = Math.hypot(dx, dy), vf = dot(c.vel, f);
  _d.angle = angle; _d.dist = dist; _d.vf = vf;
  const aa = Math.abs(angle);
  if (o.rev && aa > 2.2 && dist < (o.revDist || 1200) && vf < 500) {
    inp.throttle = -1;
    inp.steer = -Math.sign(angle) * clamp(2.5 * (Math.PI - aa) + 0.15, 0, 1);
    return _d;
  }
  inp.steer = clamp(-angle * 3.2, -1, 1);
  const vT = o.speed === undefined ? 2300 : o.speed;
  inp.throttle = clamp((vT - vf) / 120, -1, 1);
  if (aa > 1.75 && vf > 500 && dist > 600) { inp.handbrake = true; inp.steer = -Math.sign(angle); inp.throttle = 1; } // derrape
  else if (aa > 1.2 && vf > 1000 && dist > 800) inp.throttle = 0.3;
  inp.boost = !!o.boost && aa < 0.3 && c.boost > 0 && vf < 2250 && vf > -50 && inp.throttle > 0.9 && !inp.handbrake;
  return _d;
}

// Casillas de turbo: grande cercana (o pequeña muy cercana) disponible.
function bestPad(game, c, maxBig, maxSmall) {
  let best = null, bd = 1e9;
  for (const p of game.pads) {
    if (p.timer > 0.2) continue;
    const d = Math.hypot(p.x - c.pos[0], p.y - c.pos[1]);
    if (d > (p.big ? maxBig : maxSmall)) continue;
    const s = p.big ? d * 0.6 : d;
    if (s < bd) { bd = s; best = p; }
  }
  return best;
}

// ---------- Cerebro en suelo ----------
function groundBrain(game, X, c, level, ai, inp, dts) {
  const b = game.ball, fwd = c.team === 0 ? 1 : -1, ownY = -fwd * HY;
  const kickoff = !game.kickoffTouched;
  const play = game.phase === 'play';
  teamRoles(game, X, c.team, level);
  const role = X.roles.get(c.id) ?? 0;
  if (game.tick - ai.errTick > (level === 0 ? 1 : 30)) { ai.err = (Math.random() * 2 - 1) * ERR[level]; ai.errTick = game.tick; }
  const sp = len(c.vel);

  // En paredes/techo: volver al suelo
  if (c.n[2] < 0.7) {
    if (c.n[2] < -0.3) { inp.jump = (game.tick & 7) === 0; return; }
    const dl = toLocal(c.o, [0, 0, -1]);
    inp.throttle = dl[0] >= 0 ? 1 : -1;
    inp.steer = clamp(-dl[1] * 2.5, -1, 1) * (dl[0] >= 0 ? 1 : -1);
    return;
  }

  // Antiatascos: marcha atrás girando
  if (ai.unstuck > game.tick) {
    inp.throttle = -1; inp.steer = ai.dir;
    if (ai.stuckN >= 2 && ((game.tick - ai.unstuck) & 31) === 0) inp.jump = true;
    return;
  }

  let tx = 0, ty = 0, speed, boostOK = false, rev = true, revDist = 1200;
  let strike = null, onPad = false;
  if (!play) { inp.throttle = 0; return; }

  if (role === 0) {
    // ---------- Ataque / golpeo ----------
    let ip;
    if (kickoff) ip = { t: 0.5, x: b.pos[0], y: b.pos[1], z: b.pos[2], k: 0 };
    else ip = findIntercept(game, X, c, level);
    // Dirección de tiro: hacia la portería rival o despeje a las bandas si estamos en nuestro tercio
    const depth = (ip.y - ownY) * fwd;
    let ax, ay;
    if (kickoff) { ax = 0; ay = -ownY; }
    else if (depth < 1900 || X.threat[c.team] - X.off < 3) {
      const sx = Math.abs(ip.x) > 500 ? Math.sign(ip.x) : (c.pos[0] < ip.x ? 1 : -1);
      ax = sx * HX; ay = ip.y + fwd * 2200;
    } else {
      ax = depth > HY * 1.15 ? (ip.x > 300 ? -GW * 0.4 : ip.x < -300 ? GW * 0.4 : 0) : 0;
      ay = -ownY;
    }
    let ux = ax - ip.x, uy = ay - ip.y;
    const un = Math.hypot(ux, uy) || 1; ux /= un; uy /= un;
    const ce = Math.cos(ai.err), se = Math.sin(ai.err);
    const aimx = ux * ce - uy * se, aimy = ux * se + uy * ce;
    const dIp = Math.hypot(ip.x - c.pos[0], ip.y - c.pos[1]);
    const toIx = (ip.x - c.pos[0]) / (dIp || 1), toIy = (ip.y - c.pos[1]) / (dIp || 1);
    const behind = (ip.x - c.pos[0]) * aimx + (ip.y - c.pos[1]) * aimy; // >0: estamos detrás del balón respecto al tiro
    const cosAim = toIx * aimx + toIy * aimy;
    if (kickoff) { tx = b.pos[0]; ty = b.pos[1]; }
    else if (behind < -120 && dIp > 250) {
      // Estamos por delante del balón: rodearlo por un lado hacia atrás
      const px = -aimy, py = aimx;
      const s = ((c.pos[0] - ip.x) * px + (c.pos[1] - ip.y) * py) >= 0 ? 1 : -1;
      tx = ip.x - aimx * 1100 + px * s * 900; ty = ip.y - aimy * 1100 + py * s * 900;
    } else if (cosAim > 0.85 || dIp < 350) {
      tx = ip.x - aimx * 60; ty = ip.y - aimy * 60;
    } else {
      const off = clamp(dIp * 0.4, 150, 800);
      tx = ip.x - aimx * off; ty = ip.y - aimy * off;
    }
    tx = clamp(tx, -HX + 250, HX - 250); ty = clamp(ty, -HY + 250, HY - 250);
    if (!kickoff && dIp > 300 && ip.t > 0.35) speed = Math.max(300, dIp / ip.t * 1.15);
    if (level === 0 && speed === undefined && sp > 1450) speed = 1450;
    boostOK = level === 0 ? (c.boost > 60 && dIp > 1800) : (dIp > 700 || kickoff);
    revDist = 700;
    strike = { ip, aimx, aimy, dIp, kickoff };
  } else {
    // ---------- Apoyo / portero ----------
    const bp = ballAt(X, 0.6, _b);
    const depth = (bp[1] - ownY) * fwd;
    const patrol = (((game.tick / 360) | 0) & 1) ? 1 : -1;
    if (role === 2) {
      let gx = clamp(bp[0] * 0.4, -GW * 0.7, GW * 0.7), gy = ownY + fwd * clamp(450 + depth * 0.1, 500, 1500);
      const th = X.threat[c.team] - X.off;
      if (th < 2.5) { gx = clamp(X.threatX[c.team], -GW * 0.8, GW * 0.8); gy = ownY + fwd * 350; }
      else gx += patrol * 350;
      tx = gx; ty = gy;
    } else {
      const att = game.cars[X.att[c.team]];
      const side = att && att.pos[0] > bp[0] ? -1 : 1;
      tx = clamp(bp[0] * 0.5 + side * 800 + patrol * 250, -2800, 2800);
      ty = bp[1] - fwd * 1900;
      const lim = ownY + fwd * 1600;
      if ((ty - lim) * fwd < 0) ty = lim;
      if (ty * fwd > 1400) ty = fwd * 1400;
    }
    if (kickoff) {
      const pad = bestPad(game, c, 2300, 2300);
      if (pad) { tx = pad.x; ty = pad.y; onPad = true; } else { tx = c.pos[0]; ty = c.pos[1]; }
    } else {
      if (c.boost < 35) {
        const pad = bestPad(game, c, 3800, 1700);
        if (pad) { tx = pad.x; ty = pad.y; onPad = true; }
      }
      // Volver por los lados si estamos por delante del balón
      if ((c.pos[1] - bp[1]) * fwd > 300 && Math.hypot(tx - c.pos[0], ty - c.pos[1]) > 2500 && Math.abs(c.pos[0] - bp[0]) < 1700) {
        tx = (c.pos[0] >= 0 ? 1 : -1) * 2900;
      }
    }
    const dd = Math.hypot(tx - c.pos[0], ty - c.pos[1]);
    speed = clamp(dd * 1.5, 0, 2300);
    boostOK = level > 0 && dd > 2500 && c.boost > (c.boost < 35 ? 0 : 45);
    revDist = 2200;
    if (onPad) speed = Math.max(speed, 500);
    else if (dd < 200) { inp.throttle = 0; speed = 0; }
  }

  // Saque del Experto: speed flip nada más empezar
  if (kickoff && role === 0 && level === 2 && !ai.koDone) {
    ai.koDone = true;
    const lb = toLocal(c.o, [b.pos[0] - c.pos[0], b.pos[1] - c.pos[1], 0]);
    const a = Math.atan2(lb[1], lb[0]);
    if (Math.abs(a) < 0.9) { ai.seq = { type: 'speed', t0: game.tick, side: a > 0 ? -1 : 1 }; runSeq(game, X, c, level, ai, inp); return; }
  }

  const dr = drive(c, inp, tx, ty, { speed, boost: boostOK, rev, revDist });
  ai.dbg = [role, tx | 0, ty | 0, speed | 0];

  // Ejecución del golpeo
  if (strike) execStrike(game, X, c, level, ai, inp, strike, dr);

  // Antiatascos: velocidad < 100 durante 1 s fuera del saque
  if (!kickoff && sp < 100 && dr.dist > 450 && !(role !== 0 && speed === 0)) {
    ai.stuck += dts;
    if (ai.stuck > 1) { ai.stuck = 0; ai.unstuck = game.tick + 100; ai.dir = Math.random() < 0.5 ? -1 : 1; ai.stuckN++; }
  } else { ai.stuck = 0; if (sp > 400) ai.stuckN = 0; }
}

function execStrike(game, X, c, level, ai, inp, st, dr) {
  const b = game.ball, ip = st.ip;
  if (dr.dist > 1500 && !st.kickoff && ip.t > 1.2) return;
  const dIp = st.dIp;
  const dx = ip.x - c.pos[0], dy = ip.y - c.pos[1];
  const vTow = Math.max(450, (c.vel[0] * dx + c.vel[1] * dy) / (dIp || 1));
  const tt = Math.max(0, dIp - 130) / vTow;
  const hb = st.kickoff ? b.pos[2] : ballAt(X, Math.min(tt, 3), _b)[2];
  const bb = st.kickoff ? b.pos : _b;
  const ang = Math.abs(Math.atan2(toLocal(c.o, [bb[0] - c.pos[0], bb[1] - c.pos[1], 0])[1], toLocal(c.o, [bb[0] - c.pos[0], bb[1] - c.pos[1], 0])[0]));
  const dBall = Math.hypot(bb[0] - c.pos[0], bb[1] - c.pos[1]);
  const t0 = game.tick;
  if (hb < 150) {
    if (level >= 1 && tt < 0.14 && ang < 0.6 && dBall < 520 && (!st.kickoff || dBall < 480)) ai.seq = { type: 'dodge', t0 };
  } else if (hb < 300) {
    if (tt < 0.2 && ang < 0.6 && dBall < 600) ai.seq = { type: 'jump', t0, hold: 0.2, dbl: false };
  } else if (hb < 450) {
    if (level >= 1 && tt < 0.36 && ang < 0.6 && dBall < 700) ai.seq = { type: 'jump', t0, hold: 0.2, dbl: true };
  } else if (level >= 1 && !ip.far && hb < AERIAL_MAX[level] && c.boost > 12 + hb / 40) {
    const tl = 0.35 + hb / 1000;
    if (ip.t <= tl + 0.05 && dIp <= vTow * tl + 450 && ang < 0.7) {
      ai.seq = { type: 'aerial', t0, hit: t0 + Math.round(ip.t * 120), tp: [ip.x, ip.y, ip.z], ax: st.aimx * 0.93, ay: st.aimy * 0.93, az: 0.2 };
    }
  }
  if (ai.seq) runSeq(game, X, c, level, ai, inp);
}
