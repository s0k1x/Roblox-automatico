// Pruebas rápidas de la física (node test/sim.test.js)
import { Game } from '../shared/sim.js';
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
process.exit(fails ? 1 : 0);
