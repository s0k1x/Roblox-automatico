// Simulación determinista del partido (120 Hz). Se ejecuta igual en el navegador (modo local)
// y en el servidor (modo online). No depende de Three.js.
import {
  add, sub, scale, addS, dot, cross, len, norm, clampLen, clamp, curve,
  integrateBasis, rotateBasis, toLocal, toWorld, basisFromYaw, orthonormalize,
} from './vec.js';
import { PHYS as P, HITBOXES, MATCH, DT } from './constants.js';
import { ARENA, wallQuery, BOOST_PADS, PAD, KICKOFF_SPOTS, RESPAWN_SPOTS } from './arena.js';
import { botInput } from './ai.js';

export const EMPTY_INPUT = Object.freeze({
  throttle: 0, steer: 0, pitch: 0, yaw: 0, roll: 0, jump: false, boost: false, handbrake: false,
});

export function sanitizeInput(i) {
  if (!i) return { ...EMPTY_INPUT };
  const n = (v) => (Number.isFinite(+v) ? clamp(+v, -1, 1) : 0);
  return {
    throttle: n(i.throttle), steer: n(i.steer), pitch: n(i.pitch), yaw: n(i.yaw), roll: n(i.roll),
    jump: !!i.jump, boost: !!i.boost, handbrake: !!i.handbrake,
  };
}

function makeCar(id, team, name, hitboxId, isBot) {
  const hb = HITBOXES.find((h) => h.id === hitboxId) || HITBOXES[0];
  return {
    id, team, name, isBot, hb,
    half: [hb.size[0] / 2, hb.size[1] / 2, hb.size[2] / 2],
    pos: [0, 0, P.REST_HEIGHT], vel: [0, 0, 0], ang: [0, 0, 0],
    o: basisFromYaw(0),
    boost: P.BOOST_START, boosting: false, supersonic: false,
    grounded: true, n: [0, 0, 1], noGround: 0,
    jumping: false, jumpTime: 0, hasJumped: false,
    canFlip: false, flipTimer: 0, flipReset: false,
    dodge: null, // { t, pitch, roll }
    prevJump: false,
    dead: false, respawn: 0,
    goals: 0, saves: 0, shots: 0, demos: 0, touches: 0,
  };
}

function hitboxCenter(c) {
  return add(c.pos, toWorld(c.o, c.hb.off));
}

export class Game {
  constructor(opts = {}) {
    this.freePlay = !!opts.freePlay;
    this.map = ['clasico', 'neon', 'templo'].includes(opts.map) ? opts.map : 'clasico';
    this.infiniteBoost = !!opts.infiniteBoost;
    this.botLevel = clamp(opts.botLevel ?? 1, 0, 2) | 0; // 0 novato, 1 profesional, 2 experto
    this.teamSize = this.freePlay ? 1 : clamp(opts.teamSize | 0 || 1, 1, 3);
    this.duration = opts.duration || MATCH.DURATION;
    this.cars = [];
    let id = 0;
    for (let team = 0; team < (this.freePlay ? 1 : 2); team++) {
      for (let k = 0; k < this.teamSize; k++) {
        const hb = HITBOXES[(id * 2 + team) % HITBOXES.length].id;
        this.cars.push(makeCar(id, team, `Bot ${id + 1}`, hb, true));
        id++;
      }
    }
    this.ball = { pos: [0, 0, P.BALL_REST_Z], vel: [0, 0, 0], ang: [0, 0, 0], o: basisFromYaw(0) };
    this.pads = BOOST_PADS.map((p) => ({ ...p, timer: 0 }));
    this.score = [0, 0];
    this.inputs = new Map();
    this.events = [];
    this.tick = 0;
    this.time = 0;
    this.clock = this.duration;
    this.overtime = false;
    this.lastTouch = null; // id del último coche que tocó el balón
    this.resetKickoff();
  }

  // ---------- Configuración ----------
  setHuman(carId, name, hitboxId, paint) {
    const c = this.cars[carId];
    if (!c) return;
    c.isBot = false;
    c.paint = sanitizePaint(paint);
    if (name) c.name = String(name).slice(0, 16);
    if (hitboxId) this.setHitbox(carId, hitboxId);
  }
  setBot(carId) {
    const c = this.cars[carId];
    if (!c) return;
    c.isBot = true;
    c.paint = null;
    c.name = `Bot ${carId + 1}`;
    this.inputs.delete(carId);
  }
  setHitbox(carId, hitboxId) {
    const c = this.cars[carId];
    const hb = HITBOXES.find((h) => h.id === hitboxId);
    if (!c || !hb) return;
    c.hb = hb;
    c.half = [hb.size[0] / 2, hb.size[1] / 2, hb.size[2] / 2];
  }
  setInput(carId, input) {
    this.inputs.set(carId, sanitizeInput(input));
  }

  restart() {
    this.score = [0, 0];
    this.clock = this.duration;
    this.overtime = false;
    for (const c of this.cars) Object.assign(c, { goals: 0, saves: 0, shots: 0, demos: 0, touches: 0 });
    this.resetKickoff();
  }

  // Entrenamiento libre: devuelve el balón al centro (o delante del coche) sin tocar el marcador.
  resetBall(inFront) {
    const b = this.ball;
    const c = this.cars[0];
    if (inFront && c) {
      const f = [c.o.f[0], c.o.f[1], 0];
      const l = Math.hypot(f[0], f[1]) || 1;
      b.pos = [c.pos[0] + (f[0] / l) * 600, c.pos[1] + (f[1] / l) * 600, P.BALL_REST_Z + 200];
      b.pos[0] = clamp(b.pos[0], -ARENA.HX + 300, ARENA.HX - 300);
      b.pos[1] = clamp(b.pos[1], -ARENA.HY + 300, ARENA.HY - 300);
    } else b.pos = [0, 0, P.BALL_REST_Z];
    b.vel = [0, 0, 0];
    b.ang = [0, 0, 0];
  }

  resetKickoff() {
    if (this.freePlay && this.cars[0] && this.tick > 0) {
      this.phase = 'play';
      this.resetBall(false);
      return;
    }
    this.phase = this.freePlay ? 'play' : 'countdown';
    this.phaseTime = MATCH.COUNTDOWN;
    this.kickoffTouched = false;
    this.lastTouch = null;
    const b = this.ball;
    b.pos = [0, 0, P.BALL_REST_Z];
    b.vel = [0, 0, 0];
    b.ang = [0, 0, 0];
    b.o = basisFromYaw(0);
    for (const p of this.pads) p.timer = 0;
    // Sorteo de posiciones de saque, reflejadas para el equipo naranja.
    const idx = [0, 1, 2, 3, 4];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    // Orden de prioridad típico: diagonales primero, luego laterales traseras y la central.
    const chosen = idx.slice(0, this.teamSize).sort((a, b2) => a - b2);
    for (const team of [0, 1]) {
      const mates = this.cars.filter((c) => c.team === team);
      mates.forEach((c, k) => {
        const s = KICKOFF_SPOTS[chosen[k]];
        const sign = team === 0 ? 1 : -1;
        this.placeCar(c, [s[0] * sign, s[1] * sign], s[2] + (team === 0 ? 0 : Math.PI));
        c.boost = P.BOOST_START;
        c.dead = false;
      });
    }
  }

  placeCar(c, xy, yaw) {
    c.pos = [xy[0], xy[1], P.REST_HEIGHT];
    c.vel = [0, 0, 0];
    c.ang = [0, 0, 0];
    const y = yaw ?? Math.atan2(-xy[1], -xy[0]);
    c.o = basisFromYaw(y);
    c.grounded = true;
    c.n = [0, 0, 1];
    c.jumping = false;
    c.hasJumped = false;
    c.canFlip = false;
    c.flipReset = false;
    c.dodge = null;
    c.noGround = 0;
  }

  // ---------- Bucle ----------
  step() {
    const dt = DT;
    this.tick++;
    this.time += dt;
    this.events.length = 0;

    if (this.phase === 'countdown') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        this.phase = 'play';
        this.events.push({ type: 'go' });
      }
    } else if (this.phase === 'goal') {
      this.phaseTime -= dt;
      if (this.phaseTime <= 0) {
        if (this.pendingEnd) {
          this.phase = 'ended';
          this.pendingEnd = false;
          this.events.push({ type: 'end', score: this.score.slice() });
        } else this.resetKickoff();
      }
    } else if (this.phase === 'play') {
      if (this.kickoffTouched && !this.freePlay) {
        if (this.overtime) this.clock += dt;
        else this.clock = Math.max(0, this.clock - dt);
      }
    }

    const frozen = this.phase === 'countdown' || this.phase === 'ended';

    for (const c of this.cars) {
      let inp;
      if (frozen) inp = EMPTY_INPUT;
      else if (c.isBot) inp = botInput(this, c);
      else inp = this.inputs.get(c.id) || EMPTY_INPUT;
      if (frozen) {
        c.prevJump = false;
        continue;
      }
      this.stepCar(c, inp, dt);
    }

    if (this.phase !== 'countdown') {
      if (this.phase !== 'goal') this.stepBall(dt);
      this.collideCars();
      if (this.phase !== 'goal') for (const c of this.cars) if (!c.dead) this.collideCarBall(c);
      this.stepPads(dt);
    }

    if (this.phase === 'play') this.checkGoal();

    // Fin del tiempo: termina cuando el balón toca el suelo.
    if (this.infiniteBoost) for (const c of this.cars) if (!c.isBot) c.boost = 100;

    if (this.phase === 'play' && !this.freePlay && !this.overtime && this.clock <= 0) {
      if (this.ball.pos[2] <= P.BALL_RADIUS + 5) {
        if (this.score[0] === this.score[1]) {
          this.overtime = true;
          this.clock = 0;
          this.events.push({ type: 'overtime' });
          this.resetKickoff();
        } else {
          this.phase = 'ended';
          this.events.push({ type: 'end', score: this.score.slice() });
        }
      }
    }
  }

  // ---------- Coche ----------
  stepCar(c, inp, dt) {
    if (c.dead) {
      c.respawn -= dt;
      if (c.respawn <= 0) {
        c.dead = false;
        const s = RESPAWN_SPOTS[c.id % RESPAWN_SPOTS.length];
        const sign = c.team === 0 ? 1 : -1;
        this.placeCar(c, [s[0] * sign, s[1] * sign], c.team === 0 ? Math.PI / 2 : -Math.PI / 2);
        c.pos[2] = P.CAR_RESPAWN_Z; // reaparece cayendo desde un poco más alto
        c.grounded = false;
        c.boost = P.BOOST_START;
      }
      return;
    }

    const jumpPressed = inp.jump && !c.prevJump;
    c.prevJump = inp.jump;
    c.noGround = Math.max(0, c.noGround - dt);

    // Turbo
    if (inp.boost && c.boost > 0) c.boostHold = Math.max(c.boostHold || 0, P.BOOST_MIN_TIME);
    const boosting = (inp.boost || c.boostHold > 0) && c.boost > 0;
    c.boostHold = Math.max(0, (c.boostHold || 0) - dt);
    if (boosting) c.boost = Math.max(0, c.boost - P.BOOST_USE * dt);
    c.boosting = boosting;

    let acc = [0, 0, P.GRAVITY];
    const o = c.o;

    if (c.grounded) {
      const n = c.n;
      if (jumpPressed) {
        if (dot(o.u, n) > 0.6) {
          // Salto: impulso instantáneo + fuerza extra mientras se mantiene (máx 0.2 s)
          c.vel = addS(c.vel, o.u, P.JUMP_IMPULSE);
          c.jumping = true;
          c.jumpTime = 0;
          c.hasJumped = true;
          c.grounded = false;
          c.canFlip = true;
          c.flipTimer = 0;
          c.flipReset = false;
          c.noGround = 0.1;
        }
      }
      if (c.grounded) {
        // Conducción
        let vf = dot(c.vel, o.f);
        let vl = dot(c.vel, o.l);
        const vn = dot(c.vel, n);
        const thr = boosting ? 1 : inp.throttle;
        let dv = 0;
        if (Math.abs(thr) > 0.01) {
          if (vf * thr < 0 && Math.abs(vf) > 1) {
            dv = -Math.sign(vf) * P.BRAKE_ACCEL * dt;
            if (Math.abs(dv) > Math.abs(vf)) dv = -vf;
          } else {
            dv = thr * curve(P.THROTTLE_CURVE, Math.abs(vf)) * dt;
          }
        } else {
          dv = Math.abs(vf) < P.STOPPING_FORWARD_VEL ? -vf : -Math.sign(vf) * Math.min(Math.abs(vf), P.COAST_ACCEL * dt);
        }
        if (boosting) dv += P.BOOST_ACCEL * dt;
        // Freno de mano progresivo (sube en 0.2 s, baja en 0.5 s)
        c.hbVal = clamp((c.hbVal || 0) + (inp.handbrake ? P.POWERSLIDE_RISE : -P.POWERSLIDE_FALL) * dt, 0, 1);
        const hbv = c.hbVal;
        if (hbv > 0 && Math.abs(thr) < 0.01) dv = -Math.sign(vf) * Math.min(Math.abs(vf), P.COAST_ACCEL * (1 - 0.5 * hbv) * dt);
        vf += dv;

        const grip = P.LATERAL_GRIP * (1 - (1 - P.POWERSLIDE_LAT_FACTOR) * hbv);
        vl -= Math.sign(vl) * Math.min(Math.abs(vl), grip * dt);
        c.vel = add(add(scale(o.f, vf), scale(o.l, vl)), scale(n, vn));

        // Giro: velocidad angular = curvatura(v) * v * dirección
        const curv = curve(P.STEER_CURVE, Math.abs(vf));
        let yawRate = -inp.steer * curv * vf;
        if (hbv > 0) {
          // En derrape las ruedas giran más: escala el giro por la razón entre ambos ángulos
          const sp = Math.abs(vf);
          const ratio = curve(P.POWERSLIDE_STEER_ANGLE_CURVE, sp) / curve(P.STEER_ANGLE_CURVE, sp);
          yawRate *= 1 + (ratio - 1) * hbv;
        }
        c.ang = scale(n, yawRate);

        // Fuerza que pega el coche a la superficie: 0.5 g en suelo, hasta 1.5 g en paredes
        const sticky = P.STICKY_GROUND + (n[2] < Math.SQRT1_2 ? 1 - Math.abs(n[2]) : 0);
        acc = addS(acc, n, sticky * P.GRAVITY);

        // En paredes/techo, a poca velocidad, el coche se despega.
        if (n[2] < 0.3 && len(c.vel) < 450 && Math.abs(inp.throttle) < 0.1 && !boosting) {
          c.grounded = false;
          c.noGround = 0.35;
          c.vel = addS(c.vel, n, 60);
          c.canFlip = true;
          c.flipTimer = 0;
        }
      }
    } else {
      // ---------- En el aire ----------
      // La ventana de 1.25 s para el segundo salto o flip empieza al terminar el salto
      if (!c.jumping) c.flipTimer += dt;
      if (c.jumping) {
        c.jumpTime += dt;
        if ((inp.jump || c.jumpTime < P.JUMP_MIN_TIME) && c.jumpTime < P.JUMP_HOLD_MAX) acc = addS(acc, o.u, P.JUMP_HOLD_ACCEL);
        else c.jumping = false;
      }

      // Segundo salto o dodge
      if (jumpPressed && !c.jumping && c.canFlip && (c.flipReset || c.flipTimer < P.FLIP_WINDOW)) {
        const mag = Math.abs(inp.pitch) + Math.abs(inp.yaw) + Math.abs(inp.roll);
        if (mag >= P.DODGE_DEADZONE) {
          let fwd = -inp.pitch;
          let side = inp.yaw + inp.roll;
          const m = Math.hypot(fwd, side);
          if (m > 1) { fwd /= m; side /= m; }
          const fh = norm([o.f[0], o.f[1], 0], [1, 0, 0]);
          const rh = [fh[1], -fh[0], 0];
          // Impulso del flip según la velocidad hacia delante (hacia atrás y de lado se escalan)
          const fwdSpeed = dot(c.vel, fh);
          const ratio = Math.min(1, Math.abs(fwdSpeed) / P.CAR_MAX_SPEED);
          const backwards = Math.abs(fwdSpeed) < 100 ? fwd < 0 : (fwd >= 0) !== (fwdSpeed > 0);
          let fi = P.DODGE_FORWARD * fwd;
          let si = P.DODGE_SIDE * side;
          fi *= ((backwards ? P.FLIP_BACKWARD_MAX_SPEED_SCALE : 1) - 1) * ratio + 1;
          si *= (P.FLIP_SIDE_MAX_SPEED_SCALE - 1) * ratio + 1;
          if (backwards) fi *= P.FLIP_BACKWARD_SCALE_X;
          c.vel = add(c.vel, add(scale(fh, fi), scale(rh, si)));
          c.dodge = { t: 0, pitch: fwd, roll: side };
        } else {
          c.vel = addS(c.vel, o.u, P.DOUBLE_JUMP_IMPULSE);
        }
        c.canFlip = false;
        c.flipReset = false;
      }

      // Control aéreo (en coordenadas locales: x=delante/roll, y=izquierda/pitch, z=arriba/yaw)
      let pitchIn = inp.pitch, yawIn = inp.yaw, rollIn = inp.roll;
      if (inp.handbrake) { rollIn = clamp(rollIn + inp.steer, -1, 1); yawIn = 0; }
      const wl = toLocal(o, c.ang);
      const alpha = [0, 0, 0];
      if (c.dodge && c.dodge.t >= P.DODGE_TIME) {
        // Pasado el giro del flip, el cabeceo sigue bloqueado hasta FLIP_PITCHLOCK_TIME
        c.dodge.t += dt;
        pitchIn = 0;
        if (c.dodge.t >= P.FLIP_PITCHLOCK_TIME) c.dodge = null;
      }
      if (c.dodge && c.dodge.t < P.DODGE_TIME) {
        c.dodge.t += dt;
        // Durante el flip se frena la velocidad vertical (cae menos y sube menos)
        if (c.dodge.t >= P.FLIP_Z_DAMP_START && (c.vel[2] < 0 || c.dodge.t < P.FLIP_Z_DAMP_END)) {
          c.vel[2] *= Math.pow(1 - P.FLIP_Z_DAMP_120, dt * 120);
        }
        const d = c.dodge;
        // Cancelación del flip: tirar del stick en sentido contrario anula el giro de cabeceo.
        // Proporcional: cuanto más se tira en sentido contrario al flip, más se anula su giro.
        const cancelAmt = d.pitch !== 0 && Math.sign(pitchIn) === Math.sign(d.pitch) ? Math.abs(pitchIn) : 0;
        const targetPitchW = P.CAR_MAX_ANG * d.pitch * (1 - cancelAmt);
        const k = Math.min(1, 20 * dt);
        wl[1] += (targetPitchW - wl[1]) * k;
        // Durante el flip solo se bloquea el cabeceo: el roll sigue respondiendo (medio flip, etc.)
        if (d.roll !== 0) wl[0] += (P.CAR_MAX_ANG * d.roll - wl[0]) * k;
        else alpha[0] = P.AIR_TORQUE_ROLL * rollIn - P.AIR_DAMP_ROLL * wl[0];
        alpha[2] = -P.AIR_TORQUE_YAW * yawIn - P.AIR_DAMP_YAW * wl[2] * (1 - Math.abs(yawIn));
      } else {
        alpha[0] = P.AIR_TORQUE_ROLL * rollIn - P.AIR_DAMP_ROLL * wl[0];
        alpha[1] = -P.AIR_TORQUE_PITCH * pitchIn - P.AIR_DAMP_PITCH * wl[1] * (1 - Math.abs(pitchIn));
        alpha[2] = -P.AIR_TORQUE_YAW * yawIn - P.AIR_DAMP_YAW * wl[2] * (1 - Math.abs(yawIn));
      }
      const wNew = add(wl, scale(alpha, dt));
      c.ang = clampLen(toWorld(o, wNew), P.CAR_MAX_ANG);

      // Acelerador en el aire y turbo
      acc = addS(acc, o.f, P.AIR_THROTTLE_ACCEL * (boosting ? 1 : inp.throttle));
    }
    if (boosting && !c.grounded) acc = addS(acc, o.f, P.BOOST_ACCEL);

    // Volcado: apoyado de lado o boca abajo, el salto da un impulso y gira el coche 0.4 s hasta las ruedas
    if (jumpPressed && c.touching && !c.grounded && !c.hasJumpedRecently && dot(o.u, c.touchN) < 0.6) {
      c.vel = addS(c.vel, c.touchN, P.AUTOFLIP_IMPULSE);
      c.autoflip = { t: P.AUTOFLIP_TIME, n: c.touchN.slice() };
    }
    if (c.autoflip) {
      c.autoflip.t -= dt;
      const axis = norm(cross(o.u, c.autoflip.n), o.f);
      if (c.autoflip.t <= 0 || dot(o.u, c.autoflip.n) > 0.9) c.autoflip = null;
      else c.ang = scale(axis, P.CAR_MAX_ANG);
    }

    // Integración
    c.vel = clampLen(addS(c.vel, acc, dt), P.CAR_MAX_SPEED);
    c.pos = addS(c.pos, c.vel, dt);
    c.o = integrateBasis(c.o, c.ang, dt);

    const sp = len(c.vel);
    if (sp >= P.SUPERSONIC) { c.supersonic = true; c.ssTime = 0; }
    else if (c.supersonic && sp >= P.SUPERSONIC_KEEP && (c.ssTime = (c.ssTime || 0) + dt) < P.SUPERSONIC_MAINTAIN_MAX) c.supersonic = true;
    else c.supersonic = false;

    this.collideCarArena(c, dt);
  }

  collideCarArena(c, dt) {
    const wasGrounded = c.grounded;
    c.grounded = false;
    c.touching = false;
    const q = wallQuery(c.pos);
    const up = dot(c.o.u, q.n);
    const vn = dot(c.vel, q.n);
    const reach = wasGrounded ? P.REST_HEIGHT + 10 : P.REST_HEIGHT + 2;
    if (c.noGround <= 0 && up > 0.55 && q.d < reach && !(vn > 120 && !wasGrounded)) {
      // Ruedas apoyadas
      c.grounded = true;
      c.n = q.n;
      c.pos = addS(c.pos, q.n, P.REST_HEIGHT - q.d);
      if (vn < 0) c.vel = addS(c.vel, q.n, -vn);
      else if (wasGrounded) c.vel = addS(c.vel, q.n, -vn);
      // Alinear el techo del coche con la normal de la superficie
      const axis = cross(c.o.u, q.n);
      const s = len(axis);
      if (s > 1e-5) {
        const angle = Math.atan2(s, dot(c.o.u, q.n));
        const k = wasGrounded ? Math.min(1, 25 * dt) : 0.35;
        c.o = orthonormalize(rotateBasis(c.o, scale(axis, 1 / s), angle * k));
      }
      if (!wasGrounded) {
        // Aterrizaje: recupera el salto
        c.hasJumped = false;
        c.canFlip = false;
        c.flipReset = false;
        c.dodge = null;
        c.jumping = false;
        c.ang = [0, 0, 0];
      }
    } else if (wasGrounded && !c.jumping) {
      // Ha salido de la superficie sin saltar (rampa, borde): puede hacer un flip.
      c.canFlip = true;
      c.flipTimer = 0;
    }

    // Colisión de la caja (hitbox) con el estadio: 8 esquinas + centros de caras.
    for (let iter = 0; iter < 2; iter++) {
      const hc = hitboxCenter(c);
      const [hx, hy, hz] = c.half;
      let worst = null;
      for (const sx of [-1, 0, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const pt = add(hc, toWorld(c.o, [sx * hx, sy * hy * (sx === 0 ? 0 : 1), sz * hz]));
        const qq = wallQuery(pt);
        if (qq.d < 0 && (!worst || qq.d < worst.d)) worst = { d: qq.d, n: qq.n, pt };
      }
      for (const [lx, ly] of [[hx, 0], [-hx, 0], [0, hy], [0, -hy]]) {
        const pt = add(hc, toWorld(c.o, [lx, ly, 0]));
        const qq = wallQuery(pt);
        if (qq.d < 0 && (!worst || qq.d < worst.d)) worst = { d: qq.d, n: qq.n, pt };
      }
      if (!worst) break;
      if (c.grounded && dot(worst.n, c.n) > 0.7) break; // el suelo lo gestiona la suspensión
      c.touching = true;
      c.touchN = worst.n;
      c.pos = addS(c.pos, worst.n, -worst.d + 0.01);
      const r = sub(worst.pt, c.pos);
      const vp = add(c.vel, cross(c.ang, r));
      const vnn = dot(vp, worst.n);
      if (vnn < 0) {
        const e = 0.2;
        const I = P.CAR_MASS * 55 * 55;
        const rxn = cross(r, worst.n);
        const j = (-(1 + e) * vnn) / (1 / P.CAR_MASS + dot(rxn, rxn) / I);
        c.vel = addS(c.vel, worst.n, j / P.CAR_MASS);
        c.ang = clampLen(addS(c.ang, rxn, j / I), P.CAR_MAX_ANG);
        // Rozamiento tangencial
        const vt = sub(c.vel, scale(worst.n, dot(c.vel, worst.n)));
        c.vel = addS(c.vel, vt, -Math.min(1, 2.5 * dt));
      }
    }
    c.hasJumpedRecently = c.noGround > 0;
  }

  // ---------- Balón ----------
  stepBall(dt) {
    const b = this.ball;
    b.vel = addS(b.vel, [0, 0, P.GRAVITY], dt);
    b.vel = scale(b.vel, 1 - P.BALL_DRAG * dt);
    b.vel = clampLen(b.vel, P.BALL_MAX_SPEED);
    b.pos = addS(b.pos, b.vel, dt);
    b.o = integrateBasis(b.o, b.ang, dt);

    const R = P.BALL_RADIUS;
    for (let iter = 0; iter < 2; iter++) {
      const q = wallQuery(b.pos);
      if (q.d >= R) break;
      const n = q.n;
      b.pos = addS(b.pos, n, R - q.d);
      const vn = dot(b.vel, n);
      if (vn < 0) {
        const m = P.BALL_MASS;
        const e = vn > -40 ? 0 : P.BALL_RESTITUTION;
        const jn = -(1 + e) * vn * m;
        // Velocidad del punto de contacto
        const r = scale(n, -R);
        const vc = add(b.vel, cross(b.ang, r));
        const vt = sub(vc, scale(n, dot(vc, n)));
        const vtl = len(vt);
        let jt = [0, 0, 0];
        if (vtl > 1e-3) {
          const need = (vtl * m) / 3.5; // esfera maciza: 1 + 5/2
          const mag = Math.min(need, P.BALL_FRICTION * jn * 2);
          jt = scale(vt, -mag / vtl);
        }
        b.vel = add(b.vel, scale(add(scale(n, jn), jt), 1 / m));
        const I = 0.4 * m * R * R;
        b.ang = addS(b.ang, cross(r, jt), 1 / I);
      }
    }
    b.ang = clampLen(b.ang, P.BALL_MAX_ANG);
  }

  collideCarBall(c) {
    const b = this.ball;
    const R = P.BALL_RADIUS;
    const hc = hitboxCenter(c);
    const local = toLocal(c.o, sub(b.pos, hc));
    const cl = [
      clamp(local[0], -c.half[0], c.half[0]),
      clamp(local[1], -c.half[1], c.half[1]),
      clamp(local[2], -c.half[2], c.half[2]),
    ];
    const qp = add(hc, toWorld(c.o, cl));
    let diff = sub(b.pos, qp);
    let dist = len(diff);
    let n;
    if (dist < 1e-6) {
      n = norm(sub(b.pos, hc));
      dist = 0;
    } else n = scale(diff, 1 / dist);
    if (dist >= R) return;

    // Separación (reparto por masa inversa)
    const pen = R - dist;
    const wb = 1 / P.BALL_MASS, wc = 1 / P.CAR_MASS, ws = wb + wc;
    b.pos = addS(b.pos, n, (pen * wb) / ws);
    c.pos = addS(c.pos, n, (-pen * wc) / ws);

    const rc = sub(qp, c.pos);
    const vCarPt = add(c.vel, cross(c.ang, rc));
    const vBallPt = add(b.vel, cross(b.ang, scale(n, -R)));
    const vrel = sub(vBallPt, vCarPt);
    const vn = dot(vrel, n);
    if (vn >= 0) return;

    const preDv = Math.min(len(sub(b.vel, c.vel)), P.HIT_MAX_DV);
    // Impulso físico (sin rebote) + rozamiento que da efecto al balón
    const j = -vn / ws;
    b.vel = addS(b.vel, n, j * wb);
    c.vel = addS(c.vel, n, -j * wc);
    const vt = sub(vrel, scale(n, vn));
    const vtl = len(vt);
    if (vtl > 1) {
      const I = 0.4 * P.BALL_MASS * R * R;
      const jt = Math.min((vtl * P.BALL_MASS) / 3.5, 2.0 * j);
      const jtv = scale(vt, -jt / vtl);
      b.vel = addS(b.vel, jtv, wb);
      b.ang = clampLen(addS(b.ang, cross(scale(n, -R), jtv), 1 / I), P.BALL_MAX_ANG);
    }

    // Impulso extra del juego: dirección desde el centro del coche, con Z aplastada
    // y menos componente hacia delante; escala según la velocidad relativa.
    let dir = sub(b.pos, c.pos);
    dir[2] *= P.HIT_Z_SCALE;
    dir = norm(dir);
    dir = norm(sub(dir, scale(c.o.f, P.HIT_FORWARD_SCALE * dot(dir, c.o.f))));
    const dv = preDv;
    const s = curve(P.HIT_SCALE_CURVE, dv);
    b.vel = clampLen(addS(b.vel, dir, dv * s), P.BALL_MAX_SPEED);

    // Reinicio de flip: los bajos del coche contra el balón
    if (!c.grounded && dot(c.o.u, n) < -0.75) {
      c.canFlip = true;
      c.flipReset = true;
    }

    c.touches++;
    const prevTouch = this.lastTouch;
    this.lastTouch = c.id;
    if (!this.kickoffTouched) this.kickoffTouched = true;
    this.events.push({ type: 'touch', car: c.id, speed: Math.round(len(b.vel)) });

    // Tiro / parada (aproximación): balón dirigido a portería
    const oppGoalY = c.team === 0 ? ARENA.HY : -ARENA.HY;
    if (Math.sign(b.vel[1]) === Math.sign(oppGoalY) && Math.abs(b.pos[1]) > 2500 && Math.sign(b.pos[1]) === Math.sign(oppGoalY)) {
      const t = (oppGoalY - b.pos[1]) / b.vel[1];
      if (t > 0 && t < 2) {
        const x = b.pos[0] + b.vel[0] * t;
        if (Math.abs(x) < ARENA.GW + 100) c.shots++;
      }
    }
    if (prevTouch !== null && this.cars[prevTouch] && this.cars[prevTouch].team !== c.team) {
      const ownY = c.team === 0 ? -ARENA.HY : ARENA.HY;
      if (Math.abs(b.pos[1] - ownY) < 1800) {
        c.saves++;
        this.events.push({ type: 'save', car: c.id });
      }
    }
  }

  // ---------- Coche contra coche (dos esferas por coche) ----------
  collideCars() {
    const cars = this.cars.filter((c) => !c.dead);
    for (let i = 0; i < cars.length; i++) {
      for (let k = i + 1; k < cars.length; k++) {
        const a = cars[i], b = cars[k];
        if (Math.abs(a.pos[0] - b.pos[0]) > 300 || Math.abs(a.pos[1] - b.pos[1]) > 300 || Math.abs(a.pos[2] - b.pos[2]) > 300) continue;
        const best = obbContact(a, b);
        if (!best) continue;
        const n = best.n;
        a.pos = addS(a.pos, n, -best.pen / 2);
        b.pos = addS(b.pos, n, best.pen / 2);
        const rv = dot(sub(b.vel, a.vel), n);
        if (rv >= 0) continue;
        // Demolición
        const tryDemo = (att, vic, dirToVic) => {
          if (att.team === vic.team || !att.supersonic) return false;
          if (dot(att.vel, dirToVic) < 1000 || dot(att.o.f, dirToVic) < 0.3) return false;
          vic.dead = true;
          vic.respawn = P.DEMO_RESPAWN;
          vic.vel = [0, 0, 0];
          att.demos++;
          this.events.push({ type: 'demo', attacker: att.id, victim: vic.id, pos: vic.pos.slice() });
          return true;
        };
        if (tryDemo(a, b, n) || tryDemo(b, a, scale(n, -1))) continue;
        // Choque físico (poco rebote)
        const j = (-(1 + 0.1) * rv) / 2;
        a.vel = addS(a.vel, n, -j);
        b.vel = addS(b.vel, n, j);
        // Empujón: lo da quien golpea con el morro; depende de su velocidad hacia el otro coche
        const key = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
        this.bumpCd = this.bumpCd || new Map();
        if ((this.bumpCd.get(key) || 0) > this.time) continue;
        const tryBump = (att, vic, dir) => {
          const sp = dot(att.vel, dir);
          if (sp < 100 || dot(att.o.f, dir) < 0.5) return false;
          const dh = norm([dir[0], dir[1], 0], dir);
          const amount = curve(vic.grounded ? P.BUMP_VEL_GROUND : P.BUMP_VEL_AIR, sp);
          vic.vel = clampLen(add(vic.vel, add(scale(dh, amount), [0, 0, curve(P.BUMP_VEL_UP, sp)])), P.CAR_MAX_SPEED);
          vic.grounded = false;
          vic.noGround = 0.1;
          return true;
        };
        if (tryBump(a, b, n) || tryBump(b, a, scale(n, -1))) {
          this.bumpCd.set(key, this.time + P.BUMP_COOLDOWN);
          this.events.push({ type: 'bump', a: a.id, b: b.id });
        }
      }
    }
  }

  // ---------- Turbo ----------
  stepPads(dt) {
    for (const p of this.pads) {
      if (p.timer > 0) { p.timer = Math.max(0, p.timer - dt); continue; }
      const r = p.big ? PAD.BIG_RADIUS : PAD.SMALL_RADIUS;
      for (const c of this.cars) {
        if (c.dead || c.boost >= 100) continue;
        const dx = c.pos[0] - p.x, dy = c.pos[1] - p.y;
        if (dx * dx + dy * dy < r * r && c.pos[2] < PAD.HEIGHT) {
          c.boost = Math.min(100, c.boost + (p.big ? PAD.BIG_AMOUNT : PAD.SMALL_AMOUNT));
          p.timer = p.big ? PAD.BIG_RESPAWN : PAD.SMALL_RESPAWN;
          break;
        }
      }
    }
  }

  checkGoal() {
    const b = this.ball;
    if (Math.abs(b.pos[1]) < ARENA.HY + P.BALL_RADIUS) return;
    const scoringTeam = b.pos[1] > 0 ? 0 : 1; // balón en la portería +Y => marca el azul
    this.score[scoringTeam]++;
    let scorer = this.lastTouch !== null ? this.cars[this.lastTouch] : null;
    if (scorer && scorer.team === scoringTeam) scorer.goals++;
    this.events.push({
      type: 'goal', team: scoringTeam, scorer: scorer ? scorer.id : null,
      own: scorer ? scorer.team !== scoringTeam : false,
      speed: Math.round(len(b.vel) * 0.036), pos: b.pos.slice(),
    });
    this.phase = 'goal';
    this.phaseTime = this.freePlay ? 1.5 : MATCH.GOAL_PAUSE;
    if (this.overtime || (this.clock <= 0)) this.pendingEnd = true;
  }

  // ---------- Serialización (para render y red) ----------
  // Estado físico completo de un coche (para que el invitado prediga su propio coche).
  exportCar(c) {
    const r = (v) => Math.round(v * 1000) / 1000;
    const v3 = (a) => [r(a[0]), r(a[1]), r(a[2])];
    return {
      p: v3(c.pos), v: v3(c.vel), w: v3(c.ang), f: v3(c.o.f), l: v3(c.o.l), u: v3(c.o.u), n: v3(c.n),
      b: r(c.boost), bh: r(c.boostHold || 0), g: c.grounded ? 1 : 0, ng: r(c.noGround),
      j: c.jumping ? 1 : 0, jt: r(c.jumpTime), hj: c.hasJumped ? 1 : 0, cf: c.canFlip ? 1 : 0, ft: r(c.flipTimer),
      fr: c.flipReset ? 1 : 0, pj: c.prevJump ? 1 : 0, ss: c.supersonic ? 1 : 0, sst: r(c.ssTime || 0),
      d: c.dodge ? [r(c.dodge.t), r(c.dodge.pitch), r(c.dodge.roll)] : null,
      dead: c.dead ? 1 : 0,
      hb: r(c.hbVal || 0), af: c.autoflip ? [r(c.autoflip.t), ...v3(c.autoflip.n)] : null,
    };
  }

  importCar(c, x) {
    if (!x) return;
    c.pos = x.p.slice(); c.vel = x.v.slice(); c.ang = x.w.slice();
    c.o = orthonormalize({ f: x.f, l: x.l, u: x.u });
    c.n = x.n.slice();
    c.boost = x.b; c.boostHold = x.bh; c.grounded = !!x.g; c.noGround = x.ng;
    c.jumping = !!x.j; c.jumpTime = x.jt; c.hasJumped = !!x.hj; c.canFlip = !!x.cf; c.flipTimer = x.ft;
    c.flipReset = !!x.fr; c.prevJump = !!x.pj; c.supersonic = !!x.ss; c.ssTime = x.sst;
    c.dodge = x.d ? { t: x.d[0], pitch: x.d[1], roll: x.d[2] } : null;
    c.dead = !!x.dead;
    c.hbVal = x.hb || 0;
    c.autoflip = x.af ? { t: x.af[0], n: x.af.slice(1, 4) } : null;
  }

  serialize(full = false) {
    const r = (v) => Math.round(v * 10) / 10;
    const r3 = (v) => Math.round(v * 1000) / 1000;
    const vec = (a) => [r(a[0]), r(a[1]), r(a[2])];
    const dir = (a) => [r3(a[0]), r3(a[1]), r3(a[2])];
    return {
      t: r3(this.time),
      tick: this.tick,
      phase: this.phase,
      phaseTime: r3(this.phaseTime),
      clock: r(this.clock),
      overtime: this.overtime,
      score: this.score.slice(),
      teamSize: this.teamSize,
      freePlay: this.freePlay,
      map: this.map,
      lastTouch: this.lastTouch,
      ball: { p: vec(this.ball.pos), v: vec(this.ball.vel), f: dir(this.ball.o.f), u: dir(this.ball.o.u) },
      cars: this.cars.map((c) => ({
        id: c.id, team: c.team, name: c.name, bot: c.isBot, hb: c.hb.id, paint: c.paint || null,
        p: vec(c.pos), v: vec(c.vel), f: dir(c.o.f), u: dir(c.o.u),
        boost: Math.round(c.boost), boosting: c.boosting, ss: c.supersonic,
        g: c.grounded, dead: c.dead, respawn: r(c.respawn),
        st: [c.goals, c.saves, c.shots, c.demos],
        ...(full && !c.isBot ? { x: this.exportCar(c) } : {}),
      })),
      pads: this.pads.map((p) => (p.timer > 0 ? 0 : 1)).join(''),
      events: this.events.slice(),
    };
  }
}

// Choque caja contra caja (hitboxes orientados) por ejes separadores (SAT).
// Devuelve la normal (de a hacia b) y la penetración mínima, o null si no se tocan.
function obbContact(a, b) {
  const ca = hitboxCenter(a), cb = hitboxCenter(b);
  const A = [a.o.f, a.o.l, a.o.u], B = [b.o.f, b.o.l, b.o.u];
  const ha = a.half, hb = b.half;
  const d = sub(cb, ca);
  const axes = [...A, ...B];
  for (const x of A) for (const y of B) {
    const c = cross(x, y);
    if (len(c) > 1e-4) axes.push(norm(c));
  }
  let best = null;
  for (const ax of axes) {
    const ra = ha[0] * Math.abs(dot(A[0], ax)) + ha[1] * Math.abs(dot(A[1], ax)) + ha[2] * Math.abs(dot(A[2], ax));
    const rb = hb[0] * Math.abs(dot(B[0], ax)) + hb[1] * Math.abs(dot(B[1], ax)) + hb[2] * Math.abs(dot(B[2], ax));
    const dist = dot(d, ax);
    const pen = ra + rb - Math.abs(dist);
    if (pen <= 0) return null;
    if (!best || pen < best.pen) best = { pen, n: dist >= 0 ? ax : scale(ax, -1) };
  }
  return best;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function sanitizePaint(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const k of ['a', 'b', 'w', 't']) if (typeof p[k] === 'string' && HEX.test(p[k])) out[k] = p[k].toLowerCase();
  return Object.keys(out).length ? out : null;
}
