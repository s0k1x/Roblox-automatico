// Geometría del estadio como campo de distancias (SDF).
// wallDist(p) = distancia desde un punto del espacio libre a la superficie sólida más cercana.
import { norm } from './vec.js';

export const ARENA = {
  HX: 4096, // mitad del ancho (x)
  HY: 5120, // mitad del largo (y) hasta la pared de fondo
  H: 2044, // altura del techo
  CORNER: 1152, // catetos del corte diagonal (45°) de cada esquina vista en planta
  EDGE_R: 300, // radio de las curvas suelo-pared y pared-techo
  GW: 892.755, // mitad del ancho de la portería
  GH: 642.775, // altura de la portería
  GD: 880, // profundidad de la portería
};

const { HX, HY, H, CORNER, EDGE_R, GW, GH, GD } = ARENA;

// Octógono del suelo: rectángulo de medias (hx, hy) con las esquinas cortadas a 45° (catetos c).
// Devuelve la distancia con signo en planta (negativa dentro).
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
export function sdOctagon(x, y, hx, hy, c) {
  const ax = Math.abs(x), ay = Math.abs(y);
  const d = Math.min(
    segDist(ax, ay, hx, -1e-6, hx, hy - c),
    segDist(ax, ay, hx, hy - c, hx - c, hy),
    segDist(ax, ay, hx - c, hy, -1e-6, hy),
  );
  const inside = ax <= hx && ay <= hy && ax + ay <= hx + hy - c;
  return inside ? -d : d;
}

// Octógono reducido EDGE_R hacia dentro: su contorno, desplazado EDGE_R, es la superficie real
// (paredes, diagonales y curvas suelo-pared / pared-techo de radio EDGE_R).
export function shrunkPlan(hy = HY) {
  return { hx: HX - EDGE_R, hy: hy - EDGE_R, c: CORNER - EDGE_R * (2 - Math.SQRT2) };
}

// Signo negativo dentro del volumen libre del estadio.
function sdArena(x, y, z, hy) {
  const s = shrunkPlan(hy);
  const a = sdOctagon(x, y, s.hx, s.hy, s.c);
  const b = Math.abs(z - H / 2) - (H / 2 - EDGE_R);
  return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) - EDGE_R;
}

export function wallDist(x, y, z) {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  if (ax < GW && z < GH) {
    // Columna de la boca de la portería: la pared de fondo se retrasa hasta el fondo de la red.
    let d = -sdArena(x, y, z, HY + GD);
    if (ay > HY) d = Math.min(d, GW - ax, GH - z, HY + GD - ay);
    // Postes y larguero (aristas convexas)
    const dy = ay - HY;
    d = Math.min(d, Math.hypot(GW - ax, dy), Math.hypot(GH - z, dy));
    return d;
  }
  return -sdArena(x, y, z, HY);
}

const E = 1.0;
// Normal de la superficie (apunta hacia el espacio libre).
export function wallNormal(x, y, z) {
  const nx = wallDist(x + E, y, z) - wallDist(x - E, y, z);
  const ny = wallDist(x, y + E, z) - wallDist(x, y - E, z);
  const nz = wallDist(x, y, z + E) - wallDist(x, y, z - E);
  return norm([nx, ny, nz]);
}

export function wallQuery(p) {
  return { d: wallDist(p[0], p[1], p[2]), n: wallNormal(p[0], p[1], p[2]) };
}

// Plataformas de turbo (posiciones del campo estándar).
export const BOOST_PADS = [
  // grandes (100)
  ...[
    [-3584, 0], [3584, 0], [-3072, -4096], [3072, -4096], [-3072, 4096], [3072, 4096],
  ].map(([x, y]) => ({ x, y, big: true })),
  // pequeñas (12)
  ...[
    [0, -4240], [-1792, -4184], [1792, -4184], [-940, -3308], [940, -3308], [0, -2816],
    [-3584, -2484], [3584, -2484], [-1788, -2300], [1788, -2300], [-2048, -1036], [0, -1024],
    [2048, -1036], [-1024, 0], [1024, 0], [-2048, 1036], [0, 1024], [2048, 1036],
    [-1788, 2300], [1788, 2300], [-3584, 2484], [3584, 2484], [0, 2816], [-940, 3308],
    [940, 3308], [-1792, 4184], [1792, 4184], [0, 4240],
  ].map(([x, y]) => ({ x, y, big: false })),
];

export const PAD = {
  BIG_AMOUNT: 100,
  SMALL_AMOUNT: 12,
  BIG_RESPAWN: 10,
  SMALL_RESPAWN: 4,
  BIG_RADIUS: 208,
  SMALL_RADIUS: 144,
  HEIGHT: 165,
};

// Posiciones de saque (equipo azul; el naranja es el reflejo punto a punto).
export const KICKOFF_SPOTS = [
  // [x, y, orientación] del equipo azul (el naranja es el reflejo punto a punto, girado 180°)
  [-2048, -2560, Math.PI / 4],
  [2048, -2560, (3 * Math.PI) / 4],
  [-256, -3840, Math.PI / 2],
  [256, -3840, Math.PI / 2],
  [0, -4608, Math.PI / 2],
];

export const RESPAWN_SPOTS = [
  [-2304, -4608],
  [-2688, -4608],
  [2304, -4608],
  [2688, -4608],
];
