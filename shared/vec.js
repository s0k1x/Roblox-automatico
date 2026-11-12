// Mini librería de vectores 3D (arrays [x, y, z]). Se usa igual en el servidor y en el navegador.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addS = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a, fallback = [0, 0, 1]) => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : fallback.slice();
};
export const clampLen = (a, max) => {
  const l = len(a);
  return l > max ? scale(a, max / l) : a;
};
export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;

// Rotación de Rodrigues: rota v alrededor del eje unitario k un ángulo th.
export function rotate(v, k, th) {
  const c = Math.cos(th), s = Math.sin(th);
  const kxv = cross(k, v);
  const kdv = dot(k, v);
  return [
    v[0] * c + kxv[0] * s + k[0] * kdv * (1 - c),
    v[1] * c + kxv[1] * s + k[1] * kdv * (1 - c),
    v[2] * c + kxv[2] * s + k[2] * kdv * (1 - c),
  ];
}

// Interpolación lineal por tramos sobre una tabla [[x, y], ...].
export function curve(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

// Orientación = base ortonormal {f (delante), l (izquierda), u (arriba)}, con f × l = u.
export function orthonormalize(o) {
  const f = norm(o.f);
  let l = sub(o.l, scale(f, dot(o.l, f)));
  l = norm(l, [0, 1, 0]);
  const u = cross(f, l);
  return { f, l, u };
}

export function rotateBasis(o, axis, angle) {
  return { f: rotate(o.f, axis, angle), l: rotate(o.l, axis, angle), u: rotate(o.u, axis, angle) };
}

// Integra una velocidad angular w (mundo) durante dt.
export function integrateBasis(o, w, dt) {
  const wl = len(w);
  if (wl < 1e-9) return o;
  return orthonormalize(rotateBasis(o, scale(w, 1 / wl), wl * dt));
}

export const toLocal = (o, v) => [dot(v, o.f), dot(v, o.l), dot(v, o.u)];
export const toWorld = (o, v) => [
  o.f[0] * v[0] + o.l[0] * v[1] + o.u[0] * v[2],
  o.f[1] * v[0] + o.l[1] * v[1] + o.u[1] * v[2],
  o.f[2] * v[0] + o.l[2] * v[1] + o.u[2] * v[2],
];

export function basisFromYaw(yaw) {
  const f = [Math.cos(yaw), Math.sin(yaw), 0];
  const l = [-Math.sin(yaw), Math.cos(yaw), 0];
  return { f, l, u: [0, 0, 1] };
}
