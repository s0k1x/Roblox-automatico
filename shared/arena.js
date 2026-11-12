// Geometría del estadio como campo de distancias (SDF).
// wallDist(p) = distancia desde un punto del espacio libre a la superficie sólida más cercana.
import { norm } from './vec.js';

export const ARENA = {
  HX: 4096, // mitad del ancho (x)
  HY: 5120, // mitad del largo (y) hasta la pared de fondo
  H: 2044, // altura del techo
  PLAN_R: 1152, // radio de las esquinas vistas en planta
  EDGE_R: 300, // radio de las curvas suelo-pared y pared-techo
  GW: 892.755, // mitad del ancho de la portería
  GH: 642.775, // altura de la portería
  GD: 880, // profundidad de la portería
};

const { HX, HY, H, PLAN_R, EDGE_R, GW, GH, GD } = ARENA;

function sdRoundRect(x, y, hx, hy, r) {
  const qx = Math.abs(x) - hx + r;
  const qy = Math.abs(y) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Signo negativo dentro del volumen libre del estadio (caja con bordes redondeados).
function sdArena(x, y, z, hy) {
  const a = sdRoundRect(x, y, HX, hy, PLAN_R) + EDGE_R;
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
  [-2048, -2560],
  [2048, -2560],
  [-256, -3840],
  [256, -3840],
  [0, -4608],
];

export const RESPAWN_SPOTS = [
  [-2304, -4608],
  [-2688, -4608],
  [2304, -4608],
  [2688, -4608],
];
