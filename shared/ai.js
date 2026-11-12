// IA de los bots: ataca el que está más cerca del balón, los demás defienden y rotan.
import { sub, dot, len, norm, clamp, toLocal, add, scale } from './vec.js';
import { ARENA } from './arena.js';
import { PHYS as P } from './constants.js';

function predictBall(b, t) {
  // Predicción simple con gravedad y suelo (sin paredes).
  let z = b.pos[2] + b.vel[2] * t + 0.5 * P.GRAVITY * t * t;
  if (z < P.BALL_RADIUS) z = P.BALL_RADIUS;
  const lim = (v, m) => clamp(v, -m, m);
  return [lim(b.pos[0] + b.vel[0] * t, ARENA.HX - 150), lim(b.pos[1] + b.vel[1] * t, ARENA.HY + 200), z];
}

export function botInput(game, c) {
  const inp = { throttle: 1, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false };
  const b = game.ball;
  const ownY = c.team === 0 ? -ARENA.HY : ARENA.HY;
  const oppGoal = [0, -ownY, 300];
  c.ai = c.ai || { jumpT: 0, state: 'drive', seed: Math.random() };
  const ai = c.ai;

  // Recuperación en el aire: mantener el techo hacia arriba y el morro horizontal.
  if (!c.grounded) {
    ai.jumpT += 1 / 120;
    const lu = toLocal(c.o, [0, 0, 1]);
    inp.roll = clamp(-lu[1] * 3, -1, 1);
    inp.pitch = clamp(lu[0] * 3, -1, 1);
    // Secuencia salto -> dodge hacia el balón
    if (ai.state === 'jump1') {
      inp.jump = ai.jumpT < 0.12;
      inp.pitch = 0; inp.roll = 0;
      if (ai.jumpT > 0.16) ai.state = 'dodge';
    } else if (ai.state === 'dodge') {
      const toBall = toLocal(c.o, sub(b.pos, c.pos));
      const a = Math.atan2(toBall[1], toBall[0]);
      inp.pitch = -Math.cos(a);
      inp.yaw = -Math.sin(a);
      inp.roll = 0;
      inp.jump = true;
      ai.state = 'air';
    } else if (ai.state === 'aerial') {
      inp.jump = ai.jumpT < 0.2;
      const toBall = toLocal(c.o, sub(b.pos, c.pos));
      inp.pitch = clamp(-Math.atan2(toBall[2], toBall[0]) * 2.5, -1, 1);
      inp.yaw = clamp(-Math.atan2(toBall[1], toBall[0]) * 2.5, -1, 1);
      inp.boost = toBall[0] > 0 && c.boost > 0;
      if (ai.jumpT > 2.5) ai.state = 'air';
    }
    return inp;
  }
  ai.state = 'drive';
  ai.jumpT = 0;

  // ¿Quién ataca? El compañero más cercano al balón (con preferencia a estar detrás).
  const mates = game.cars.filter((m) => m.team === c.team && !m.dead);
  const score = (m) => len(sub(b.pos, m.pos)) + (Math.sign(m.pos[1] - b.pos[1]) === Math.sign(ownY) ? 0 : 1200);
  mates.sort((x, y) => score(x) - score(y));
  const role = mates.indexOf(c);

  let target;
  let wantBoost = false;
  const dBall = len(sub(b.pos, c.pos));
  const speed = Math.max(500, len(c.vel));

  if (role === 0 || game.phase === 'countdown') {
    const t = clamp(dBall / (speed + 500), 0, 2);
    const pb = predictBall(b, t);
    const shotDir = norm(sub(oppGoal, pb));
    // Si el balón está entre el coche y su portería, volver a defender por un lado.
    const wrongSide = (c.pos[1] - pb[1]) * Math.sign(ownY) < -100;
    if (wrongSide) {
      target = [pb[0], ownY * 0.85, 0];
      target[0] = pb[0] > 0 ? pb[0] - 600 : pb[0] + 600;
      if (Math.abs(c.pos[1] - ownY) < 1500) target = pb;
    } else {
      const offset = clamp(dBall / 3, 80, 900);
      target = sub(pb, scale(shotDir, offset));
      if (dBall < 900) target = sub(pb, scale(shotDir, 60));
    }
    wantBoost = dBall > 900 || game.phase !== 'play' || !game.kickoffTouched;
    // Saltar a por balones altos cercanos / dodge para golpear
    const local = toLocal(c.o, sub(b.pos, c.pos));
    const horiz = Math.hypot(local[0], local[1]);
    if (game.phase === 'play' && local[0] > 0 && Math.abs(Math.atan2(local[1], local[0])) < 0.35) {
      if (horiz < 420 && b.pos[2] < 220 && len(c.vel) > 700) {
        inp.jump = true; ai.state = 'jump1';
      } else if (horiz < 350 && b.pos[2] > 220 && b.pos[2] < 480) {
        inp.jump = true; ai.state = 'jump1';
      } else if (horiz < 900 && b.pos[2] > 600 && b.pos[2] < 1600 && c.boost > 40 && Math.abs(b.vel[2]) < 400) {
        inp.jump = true; ai.state = 'aerial';
      }
    }
    if (!game.kickoffTouched && dBall < 700) { inp.jump = true; ai.state = 'jump1'; }
  } else {
    // Defensa: entre el balón y la propia portería
    const depth = role === 1 ? 0.55 : 0.85;
    target = [b.pos[0] * 0.4, ownY * depth + b.pos[1] * (1 - depth) * 0.3, 0];
    if (c.boost < 40) {
      // Ir a por turbo grande del lado más cercano
      let best = null;
      for (const p of game.pads) if (p.big && p.timer === 0) {
        const d = Math.hypot(p.x - c.pos[0], p.y - c.pos[1]);
        if (!best || d < best.d) best = { d, p };
      }
      if (best && best.d < 3000) target = [best.p.x, best.p.y, 0];
    }
    wantBoost = len(sub(target, c.pos)) > 2500;
  }

  // Dirigir hacia el objetivo
  const local = toLocal(c.o, sub(target, c.pos));
  const angle = Math.atan2(local[1], local[0]);
  inp.steer = clamp(-angle * 3.2, -1, 1);
  const dist = Math.hypot(local[0], local[1]);
  if (Math.abs(angle) > 1.6 && len(c.vel) > 600) inp.handbrake = true;
  if (dist < 150 && role !== 0) inp.throttle = 0;
  if (Math.abs(angle) > 2.6 && dist < 500) inp.throttle = -1;
  inp.boost = wantBoost && Math.abs(angle) < 0.35 && c.boost > 0 && len(c.vel) < 2250;
  // En paredes: volver al suelo
  if (c.n[2] < 0.7) inp.steer = clamp(-toLocal(c.o, [0, 0, -1])[1] * 2, -1, 1);
  return inp;
}
