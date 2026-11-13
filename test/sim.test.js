// Pruebas rápidas de la física (node test/sim.test.js)
import { Game, sanitizeInput } from '../shared/sim.js';
import { PHYS as P } from '../shared/constants.js';
import { wallDist } from '../shared/arena.js';
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FALLO') + ' ' + m); if (!c) fails++; };
const run = (g, s, f) => { for (let i = 0; i < s * 120; i++) { f && f(i); g.step(); } };

// Distancias del estadio
ok(Math.abs(wallDist(0, 0, 100) - 100) < 1e-6, 'suelo a 100');
ok(Math.abs(wallDist(0, 5000, 1500) - 120) < 1e-6, 'pared de fondo a 120');
ok(wallDist(0, 5500, 100) > 90, 'dentro de la portería hay espacio');

// Balón cayendo: rebote con restitución ~0.6
let g = new Game({ teamSize: 1 });
for (const c of g.cars) g.setHuman(c.id);
g.phase = 'play'; g.ball.pos = [0, 0, 1000]; g.ball.vel = [0, 0, 0];
let maxAfter = 0, bounced = false;
run(g, 4, () => { if (g.ball.vel[2] > 0) bounced = true; if (bounced) maxAfter = Math.max(maxAfter, g.ball.pos[2]); });
ok(bounced && maxAfter > 300 && maxAfter < 450, `rebote de 1000 → ${maxAfter.toFixed(0)} (esperado ~350)`);

// Coche: velocidad máxima sin turbo ~1410 y con turbo 2300
g = new Game({ teamSize: 1 }); for (const c of g.cars) g.setHuman(c.id);
g.phase = 'play'; g.ball.pos = [3000, 0, 93];
const car = g.cars[0]; g.placeCar(car, [-3000, -4000], Math.PI / 2);
run(g, 4, () => g.setInput(0, { throttle: 1 }));
const v1 = Math.hypot(...car.vel);
ok(Math.abs(v1 - 1410) < 15, `velocidad máx acelerador ${v1.toFixed(0)} (1410)`);
car.pos = [-3000, -4500, 17];
run(g, 2.6, () => g.setInput(0, { throttle: 1, boost: true }));
const v2 = Math.hypot(...car.vel);
ok(v2 > 2290, `velocidad máx con turbo ${v2.toFixed(0)} (2300)`);
ok(car.supersonic, 'supersónico');

// Salto: altura de salto completo (~230 uu de subida aprox.)
g = new Game({ teamSize: 1 }); for (const c of g.cars) g.setHuman(c.id);
g.phase = 'play'; g.ball.pos = [3000, 3000, 93];
const j = g.cars[0]; g.placeCar(j, [0, -2000], 0);
let maxZ = 0;
run(g, 1.5, (i) => { g.setInput(0, { jump: i < 30 }); maxZ = Math.max(maxZ, j.pos[2]); });
ok(maxZ - P.REST_HEIGHT > 200 && maxZ - P.REST_HEIGHT < 280, `altura salto ${(maxZ - 17).toFixed(0)}`);
run(g, 1.5);
ok(j.grounded, 'aterriza');

// Golpe al balón: coche a 1400 contra balón parado
g = new Game({ teamSize: 1 }); for (const c of g.cars) g.setHuman(c.id);
g.phase = 'play'; g.kickoffTouched = true;
const h = g.cars[0]; g.placeCar(h, [0, -1000], Math.PI / 2); h.vel = [0, 1400, 0];
g.ball.pos = [0, -800, 93];
run(g, 0.3, () => g.setInput(0, { throttle: 1 }));
const bv = Math.hypot(...g.ball.vel);
ok(bv > 1700 && bv < 3200, `velocidad del balón tras golpe a 1400: ${bv.toFixed(0)}`);

// Partido entre bots: no explota y se mueve
g = new Game({ teamSize: 3 });
run(g, 60);
const finite = g.cars.every((c) => c.pos.every(Number.isFinite)) && g.ball.pos.every(Number.isFinite);
ok(finite, 'partido 3v3 de 60 s estable');
ok(g.cars.every((c) => wallDist(...c.pos) > -50), 'ningún coche atraviesa paredes');
console.log('Marcador tras 60 s de bots:', g.score, 'toques', g.cars.map((c) => c.touches));
// Choque entre coches con caja real: dos coches de frente se separan y no se atraviesan
g = new Game({ teamSize: 1 }); for (const c of g.cars) g.setHuman(c.id);
g.phase = 'play'; g.kickoffTouched = true; g.ball.pos = [3000, 3000, 93];
const ca = g.cars[0], cb = g.cars[1];
g.placeCar(ca, [0, -300], Math.PI / 2); g.placeCar(cb, [0, 300], -Math.PI / 2);
ca.vel = [0, 1200, 0]; cb.vel = [0, -1200, 0];
let minGap = 1e9;
run(g, 1, () => { g.setInput(0, { throttle: 1 }); g.setInput(1, { throttle: 1 }); minGap = Math.min(minGap, cb.pos[1] - ca.pos[1]); });
ok(minGap > 100 && !ca.dead && !cb.dead, `coches de frente no se atraviesan (separación mínima ${minGap.toFixed(0)})`);

// Entrenamiento libre: un solo coche, sin cuenta atrás, el gol recoloca el balón
g = new Game({ freePlay: true, infiniteBoost: true }); g.setHuman(0, 'Yo');
ok(g.cars.length === 1 && g.phase === 'play', 'entrenamiento libre: 1 coche y sin cuenta atrás');
g.ball.pos = [0, 4900, 93]; g.ball.vel = [0, 2000, 0];
g.cars[0].boost = 10; run(g, 2.5, () => g.setInput(0, {}));
ok(g.score[0] === 1 && g.phase === 'play' && Math.hypot(g.ball.pos[0], g.ball.pos[1]) < 50 && g.cars[0].boost === 100, 'entrenamiento: gol, balón al centro y turbo infinito');

// Dificultad: los bots novatos también juegan sin romperse
g = new Game({ teamSize: 2, botLevel: 0 }); run(g, 20);
ok(g.cars.every((c) => c.pos.every(Number.isFinite)), 'bots novatos estables');

// Flip delantero: +500 uu/s; flip trasero a velocidad: impulso mayor (escala hacia atrás)
const flipGain = (startSpeed, pitch) => {
  const gg = new Game({ teamSize: 1 }); for (const c of gg.cars) gg.setHuman(c.id);
  gg.phase = 'play'; gg.ball.pos = [3000, 3000, 93];
  const car = gg.cars[0]; gg.placeCar(car, [0, -3000], Math.PI / 2); car.vel = [0, startSpeed, 0];
  let before = 0;
  for (let i = 0; i < 40; i++) {
    gg.setInput(0, { jump: i < 3 || (i >= 10 && i < 12), pitch: i >= 9 ? pitch : 0, throttle: 0 });
    if (i === 9) before = car.vel[1];
    gg.step();
  }
  return car.vel[1] - before;
};
const gF = flipGain(0, -1), gB = flipGain(1000, 1);
ok(Math.abs(gF - 500) < 30, `flip delantero desde parado +${gF.toFixed(0)} (500)`);
ok(gB < -700, `flip trasero a 1000 uu/s: ${gB.toFixed(0)} (más que 533 por la escala)`);

// Empujón entre coches: el que golpea con el morro empuja al otro
g = new Game({ teamSize: 1 }); for (const c of g.cars) g.setHuman(c.id);
g.phase = 'play'; g.kickoffTouched = true; g.ball.pos = [3000, 3000, 93];
const at = g.cars[0], vi = g.cars[1];
g.placeCar(at, [0, -500], Math.PI / 2); at.vel = [0, 1400, 0];
g.placeCar(vi, [0, -300], 0);
let bumped = false;
run(g, 0.5, () => { g.setInput(0, { throttle: 1 }); if (g.events.find((e) => e.type === 'bump')) bumped = true; });
ok(bumped && vi.vel[1] > 300, `empujón: el coche golpeado sale a ${vi.vel[1].toFixed(0)} uu/s`);

// Subir por la pared lateral y por la diagonal de la esquina
for (const [name, start, yaw] of [['pared', [2500, 0], 0], ['diagonal', [2400, 3200], Math.PI / 4]]) {
  g = new Game({ teamSize: 1 }); for (const c of g.cars) g.setHuman(c.id);
  g.phase = 'play'; g.ball.pos = [-3000, -3000, 93];
  const w = g.cars[0]; g.placeCar(w, start, yaw); w.vel = [Math.cos(yaw) * 1400, Math.sin(yaw) * 1400, 0];
  let mz = 0, wallGround = false;
  run(g, 1.5, () => { g.setInput(0, { throttle: 1 }); mz = Math.max(mz, w.pos[2]); if (w.grounded && w.n[2] < 0.3) wallGround = true; });
  ok(mz > 300 && wallGround, `sube por la ${name} (altura ${mz.toFixed(0)})`);
}

// Predicción: exportar/importar el estado de un coche y repetir entradas da el mismo resultado
{
  const A = new Game({ teamSize: 1 }); for (const c of A.cars) A.setHuman(c.id);
  A.phase = 'play'; A.ball.pos = [3500, 4500, 93];
  A.placeCar(A.cars[0], [0, -2500], Math.PI / 2); A.placeCar(A.cars[1], [-3500, 4500], 0); // sin choques
  for (const pad of A.pads) pad.timer = 1e9; // sin recoger turbo (la predicción no simula los turbos del campo)
  const seq = (i) => ({ throttle: 1, steer: Math.sin(i / 20), jump: i % 70 < 8 || (i % 70 > 14 && i % 70 < 17), pitch: i % 70 > 13 ? -1 : 0, boost: i % 50 < 25 });
  for (let i = 0; i < 200; i++) { A.setInput(0, seq(i)); A.step(); }
  const snap = A.serialize(true).cars[0].x;
  const B = new Game({ teamSize: 1 }); for (const c of B.cars) B.setHuman(c.id);
  B.importCar(B.cars[0], snap);
  for (let i = 200; i < 320; i++) { A.setInput(0, seq(i)); A.step(); B.stepCar(B.cars[0], sanitizeInput(seq(i)), 1 / 120); }
  const dp = Math.hypot(...A.cars[0].pos.map((v, k) => v - B.cars[0].pos[k]));
  ok(dp < 5, `predicción del coche propio: desviación ${dp.toFixed(2)} uu tras 1 s`);
}

// Derrape: a 1400 uu/s gira más rápido que sin derrape y el coche patina (velocidad lateral)
{
  const turn = (hb) => {
    const G = new Game({ teamSize: 1 }); for (const c of G.cars) G.setHuman(c.id);
    G.phase = 'play'; G.ball.pos = [3000, 3000, 93];
    const c = G.cars[0]; G.placeCar(c, [0, -2000], Math.PI / 2); c.vel = [0, 1400, 0];
    let lat = 0;
    for (let i = 0; i < 60; i++) { G.setInput(0, { throttle: 1, steer: 1, handbrake: hb }); G.step(); lat = Math.max(lat, Math.abs(c.vel[0] * c.o.l[0] + c.vel[1] * c.o.l[1])); }
    return { yaw: Math.atan2(c.o.f[1], c.o.f[0]), lat };
  };
  const n = turn(false), d = turn(true);
  ok(Math.abs(Math.PI / 2 - d.yaw) > Math.abs(Math.PI / 2 - n.yaw) * 1.3 && d.lat > 300 && n.lat < 150,
    `derrape: gira más (${(Math.PI / 2 - d.yaw).toFixed(2)} rad frente a ${(Math.PI / 2 - n.yaw).toFixed(2)}) y patina (${d.lat.toFixed(0)} uu/s lateral)`);
}

// Saque: las posiciones centrales miran recto (90°), las diagonales a 45°/135°
{
  const G = new Game({ teamSize: 3 });
  const yawOk = G.cars.every((c) => {
    const yaw = Math.atan2(c.o.f[1], c.o.f[0]);
    const exp = Math.abs(c.pos[0]) < 300 ? (c.team === 0 ? Math.PI / 2 : -Math.PI / 2) : null;
    return exp === null || Math.abs(yaw - exp) < 1e-6;
  });
  ok(yawOk, 'saque: coches centrales mirando recto a la portería contraria');
}
// Doble salto: la ventana de 1.25 s cuenta desde que termina el salto (manteniendo 0.2 s → disponible a 1.4 s)
{
  const G = new Game({ teamSize: 1 }); for (const c of G.cars) G.setHuman(c.id);
  G.phase = 'play'; G.ball.pos = [3000, 3000, 93];
  const c = G.cars[0]; G.placeCar(c, [0, -2000], Math.PI / 2);
  // salta manteniendo 0.2 s, suelta, y vuelve a pulsar a 1.38 s
  let vz0 = 0, vz1 = 0;
  for (let i = 0; i < 170; i++) {
    const t = i / 120;
    if (i === 165) vz0 = c.vel[2];
    G.setInput(0, { jump: t < 0.2 || (t >= 1.38 && t < 1.42) });
    G.step();
  }
  vz1 = c.vel[2];
  ok(vz1 - vz0 > 200, `doble salto a 1.38 s todavía disponible (Δvz ${(vz1 - vz0).toFixed(0)})`);
}
// Volcado boca abajo: al pulsar salto se endereza en menos de 1.5 s
{
  const G = new Game({ teamSize: 1 }); for (const c of G.cars) G.setHuman(c.id);
  G.phase = 'play'; G.ball.pos = [3000, 3000, 93];
  const c = G.cars[0]; G.placeCar(c, [0, -2000], Math.PI / 2);
  c.o = { f: [0, 1, 0], l: [-1, 0, 0], u: [0, 0, -1] }; c.o.l = [1, 0, 0]; c.pos[2] = 60; c.grounded = false;
  for (let i = 0; i < 120; i++) { G.setInput(0, {}); G.step(); }
  for (let i = 0; i < 180; i++) { G.setInput(0, { jump: i < 4 }); G.step(); }
  ok(c.o.u[2] > 0.9 && c.grounded, `volcado: se endereza y vuelve a ruedas (arriba z=${c.o.u[2].toFixed(2)})`);
}
// Sin acelerador, por debajo de 25 uu/s el coche se para del todo
{
  const G = new Game({ teamSize: 1 }); for (const c of G.cars) G.setHuman(c.id);
  G.phase = 'play'; G.ball.pos = [3000, 3000, 93];
  const c = G.cars[0]; G.placeCar(c, [0, -2000], Math.PI / 2); c.vel = [0, 20, 0];
  G.setInput(0, {}); G.step();
  ok(Math.abs(c.vel[1]) < 1e-6, 'frenada total por debajo de 25 uu/s sin acelerador');
}

// ---------- Mecánicas avanzadas ----------
const mkM = () => { const G = new Game({ teamSize: 1 }); for (const c of G.cars) G.setHuman(c.id); G.phase = 'play'; G.kickoffTouched = true; G.ball.pos = [3500, 4000, 93]; return G; };
// Roll libre: derrape (Mayús) + girar en el aire → giro sobre el eje del coche al máximo (5.5 rad/s)
{ const G = mkM(), c = G.cars[0]; G.placeCar(c, [0, -2000], Math.PI / 2);
  for (let i = 0; i < 60; i++) { G.setInput(0, { jump: i < 24, handbrake: i > 6, steer: i > 6 ? 1 : 0 }); G.step(); }
  const r = c.ang[0] * c.o.f[0] + c.ang[1] * c.o.f[1] + c.ang[2] * c.o.f[2];
  ok(r > 5, `roll libre con derrape + girar: ${r.toFixed(2)} rad/s`); }
// Reinicio de flip: con el flip gastado, tocar el balón con las ruedas lo devuelve
{ const G = mkM(), c = G.cars[0]; G.placeCar(c, [0, -2000], Math.PI / 2);
  c.pos = [0, -2000, 800]; c.grounded = false; c.canFlip = false; c.hasJumped = true; c.flipTimer = 5;
  c.o = { f: [0, 1, 0], l: [1, 0, 0], u: [0, 0, -1] };
  G.ball.pos = [0, -1990, 878]; G.ball.vel = [0, 0, -200];
  for (let i = 0; i < 6; i++) { G.setInput(0, {}); G.step(); }
  ok(c.canFlip && c.flipReset, 'reinicio de flip al tocar el balón con las ruedas'); }
// Techo: apoyar las ruedas en el techo devuelve el salto
{ const G = mkM(), c = G.cars[0]; G.placeCar(c, [0, -2000], Math.PI / 2);
  c.pos = [0, -2000, 2019]; c.vel = [0, 800, 300]; c.grounded = false; c.hasJumped = true; c.canFlip = false;
  c.o = { f: [0, 1, 0], l: [1, 0, 0], u: [0, 0, -1] };
  let got = false; for (let i = 0; i < 20; i++) { G.setInput(0, {}); G.step(); if (c.grounded && !c.hasJumped) got = true; }
  ok(got, 'techo: con las ruedas en el techo se recupera el salto'); }
// Wavedash: flip hacia delante justo antes de tocar el suelo → más velocidad
{ const G = mkM(), c = G.cars[0]; G.placeCar(c, [0, -3000], Math.PI / 2); c.vel = [0, 1000, 0];
  let flipped = -1;
  for (let i = 0; i < 160; i++) {
    const doFlip = flipped < 0 && !c.grounded && c.vel[2] < 0 && c.pos[2] < 35;
    if (doFlip) flipped = i;
    G.setInput(0, { jump: i < 3 || doFlip || (flipped >= 0 && i - flipped < 3), pitch: i > 3 && i < 14 ? 1 : flipped >= 0 ? -1 : 0 });
    G.step();
  }
  ok(c.grounded && c.vel[1] > 1150, `wavedash: de 1000 a ${c.vel[1].toFixed(0)} uu/s y en el suelo`); }
// Medio flip: flip atrás + cancelar + medio roll → mirando al revés y sobre las ruedas
{ const G = mkM(), c = G.cars[0]; G.placeCar(c, [0, 0], Math.PI / 2); c.vel = [0, -500, 0];
  for (let i = 0; i < 200; i++) {
    const t = i / 120; const inp = { throttle: 1 };
    if (t < 0.05) inp.jump = true;
    else if (t >= 0.1 && t < 0.12) { inp.jump = true; inp.pitch = 1; }
    else if (t >= 0.12 && t < 1.2 && (c.hfCancel || c.o.f[1] < -0.5)) { c.hfCancel = true; inp.pitch = -1; if (c.o.u[2] < 0.6) inp.roll = 1; }
    G.setInput(0, inp); G.step();
  }
  const yaw = Math.atan2(c.o.f[1], c.o.f[0]) * 180 / Math.PI;
  ok(Math.abs(yaw + 90) < 25 && c.o.u[2] > 0.8, `medio flip: orientación ${yaw.toFixed(0)}° (de 90° a -90°) y ruedas abajo (${c.o.u[2].toFixed(2)})`); }

// Speed flip: salto, flip diagonal, cancelación y roll contrario → llega antes que solo con turbo y cae plano
{
  const runSF = (sf) => {
    const G = mkM(); G.placeCar(G.cars[1], [-3500, 4500], 0); for (const pad of G.pads) pad.timer = 1e9;
    const c = G.cars[0]; G.placeCar(c, [0, -4000], Math.PI / 2); c.boost = 100;
    let hit = 9, up = 0, gr = false;
    for (let i = 0; i < 360; i++) {
      const t = i / 120; const inp = { throttle: 1, boost: true };
      if (sf) {
        if (t >= 0.7 && t < 0.73) inp.jump = true;
        if (t >= 0.78 && t < 0.805) { inp.jump = true; inp.pitch = -1; inp.yaw = -0.7; }
        if (t >= 0.805 && t < 1.13) inp.pitch = 1;
        if (t >= 0.805 && !c.grounded) { inp.handbrake = true; inp.steer = 0.7; }
      }
      G.setInput(0, inp); G.step();
      if (hit === 9 && c.pos[1] + 4000 >= 3500) { hit = t; up = c.o.u[2]; gr = c.grounded; }
    }
    return { hit, up, gr };
  };
  const nb = runSF(false), sf = runSF(true);
  ok(sf.hit < nb.hit - 0.05 && sf.gr && sf.up > 0.95, `speed flip: 3500 uu en ${sf.hit.toFixed(3)} s frente a ${nb.hit.toFixed(3)} s solo turbo, cae plano (${sf.up.toFixed(2)})`);
}

process.exit(fails ? 1 : 0);
