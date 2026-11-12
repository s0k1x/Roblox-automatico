// Ambientaciones de mapa (solo decorado: el campo y la física son idénticos en todos).
// Todo es geometría procedural + texturas dibujadas en canvas, sin archivos externos.
// Regla: nada dentro del campo (octógono |x|≤4096, |y|≤5120, |x|+|y|≤8064) ni de las porterías.
export const MAPS = [
  { id: 'clasico', name: 'Estadio Clásico', thumb: 'linear-gradient(180deg,#0a1030,#2a3a6a 58%,#1f7a4a 59%,#17603a)' },
  { id: 'neon', name: 'Ciudad Neón', thumb: 'linear-gradient(180deg,#070a3a,#5a2a9a 52%,#18b8ff 53%,#2f8cff 60%,#0a1a40 61%)' },
  { id: 'templo', name: 'Templo del Dragón', thumb: 'linear-gradient(180deg,#4f9fe8,#cfe8f8 52%,#ee7fa6 53%,#3a8a5a 62%)' },
];

// Devuelve { group, update(dt), setQuality(low) } o null si el mapa no tiene decorado propio.
export function buildTheme(THREE, scene, id) {
  T = THREE;
  if (id === 'neon') return buildNeon(scene);
  if (id === 'templo') return buildTemplo(scene);
  return null;
}

// ---------------------------------------------------------------- utilidades
let T; // THREE
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const col = (hex) => new T.Color(hex);
function ctex(w, h, draw, rep) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (rep) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
function mat4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const q = new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'XYZ'));
  return new T.Matrix4().compose(new T.Vector3(x, y, z), q, new T.Vector3(sx, sy, sz));
}
function mixc(a, b, t) { return a.clone().lerp(b, t); }

// Contorno del decorado: octógono del campo ensanchado t uu (al fondo deja sitio a las porterías).
function ringP(t) {
  const hx = 4096 + t, hy = 6420 + t, S = 8064 + t * Math.SQRT2, a = S - hx, b = S - hy;
  return [[hx, -a], [hx, a], [b, hy], [-b, hy], [-hx, a], [-hx, -a], [-b, -hy], [b, -hy]];
}
function inRing(x, y, t) {
  const hx = 4096 + t, hy = 6420 + t, S = 8064 + t * Math.SQRT2;
  return Math.abs(x) < hx && Math.abs(y) < hy && Math.abs(x) + Math.abs(y) < S;
}

// Acumulador de geometría: todo el decorado estático de un material sale en una sola malla.
class Mesher {
  constructor(uv = false, light = null) { this.p = []; this.c = []; this.u = uv ? [] : null; this.light = light; }
  vert(x, y, z, c, u = 0, v = 0, k = 1) {
    this.p.push(x, y, z); this.c.push(c.r * k, c.g * k, c.b * k);
    if (this.u) this.u.push(u, v);
  }
  quad(p0, p1, p2, p3, c0, c1 = c0, c2 = c0, c3 = c0, uv = null) {
    const P = [p0, p1, p2, p3], C = [c0, c1, c2, c3];
    for (const i of [0, 1, 2, 0, 2, 3]) this.vert(P[i][0], P[i][1], P[i][2], C[i], uv ? uv[i][0] : 0, uv ? uv[i][1] : 0);
  }
  tri(p0, p1, p2, c0, c1 = c0, c2 = c0, uv = null) {
    const P = [p0, p1, p2], C = [c0, c1, c2];
    for (let i = 0; i < 3; i++) this.vert(P[i][0], P[i][1], P[i][2], C[i], uv ? uv[i][0] : 0, uv ? uv[i][1] : 0);
  }
  box(cx, cy, cz, sx, sy, sz, c, cTop = c) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const L = this.light || (() => [1, 1, 1]);
    const f = (n) => { const k = L(n[0], n[1], n[2]); return [k[0], k[1], k[2]]; };
    const face = (pts, n, cc) => {
      const k = f(n); const q = new T.Color(cc.r * k[0], cc.g * k[1], cc.b * k[2]);
      this.quad(pts[0], pts[1], pts[2], pts[3], q);
    };
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], cTop);
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], c);
    face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], c);
    face([[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], [0, 1, 0], c);
    face([[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], [-1, 0, 0], c);
  }
  // Añade una geometría con matriz; sombreado plano horneado si hay luz. colorFn(x,y,z) opcional.
  geo(g, m, base, colorFn) {
    g = g.index ? g.toNonIndexed() : g.clone();
    g.applyMatrix4(m);
    g.computeVertexNormals();
    const pa = g.attributes.position, na = g.attributes.normal, ca = g.attributes.color, ua = g.attributes.uv;
    const tmp = new T.Color();
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      let c = base;
      if (colorFn) c = colorFn(x, y, z);
      else if (ca) c = tmp.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i));
      let k = [1, 1, 1];
      if (this.light) k = this.light(na.getX(i), na.getY(i), na.getZ(i));
      this.p.push(x, y, z); this.c.push(c.r * k[0], c.g * k[1], c.b * k[2]);
      if (this.u) this.u.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
    }
  }
  rod(a, b, r, c, seg = 6) {
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
    const m = new T.Matrix4().compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new T.Vector3(r, len, r));
    this.geo(new T.CylinderGeometry(1, 1, 1, seg, 1, false), m, c);
  }
  // Tira entre dos contornos del octógono (t1,z1)-(t2,z2). cf(x,y) → color. uvs: escala de textura.
  ring(t1, z1, t2, z2, cf, uvs = 0, maxSeg = 450) {
    const A = ringP(t1), B = ringP(t2);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const len = Math.hypot(A[j][0] - A[i][0], A[j][1] - A[i][1]);
      const n = Math.max(1, Math.ceil(len / maxSeg));
      for (let s = 0; s < n; s++) {
        const f0 = s / n, f1 = (s + 1) / n;
        const lp = (P, Q, f) => [P[0] + (Q[0] - P[0]) * f, P[1] + (Q[1] - P[1]) * f];
        const a0 = lp(A[i], A[j], f0), a1 = lp(A[i], A[j], f1), b0 = lp(B[i], B[j], f0), b1 = lp(B[i], B[j], f1);
        const uv = uvs ? [[a0[0] / uvs, a0[1] / uvs], [a1[0] / uvs, a1[1] / uvs], [b1[0] / uvs, b1[1] / uvs], [b0[0] / uvs, b0[1] / uvs]] : null;
        this.quad([a0[0], a0[1], z1], [a1[0], a1[1], z1], [b1[0], b1[1], z2], [b0[0], b0[1], z2],
          cf(a0[0], a0[1]), cf(a1[0], a1[1]), cf(b1[0], b1[1]), cf(b0[0], b0[1]), uv);
      }
    }
  }
  // Relleno plano del contorno t a altura z (abanico desde el centro).
  fill(t, z, cf, uvs) {
    const A = ringP(t);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const P = [[0, 0, z], [A[i][0], A[i][1], z], [A[j][0], A[j][1], z]];
      const uv = uvs.map ? null : [[0, 0], [A[i][0] / uvs, A[i][1] / uvs], [A[j][0] / uvs, A[j][1] / uvs]];
      for (let k = 0; k < 3; k++) this.vert(P[k][0], P[k][1], P[k][2], cf(P[k][0], P[k][1]), uv ? uv[k][0] : 0, uv ? uv[k][1] : 0);
    }
  }
  build(material) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    if (this.u) g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2));
    g.computeBoundingSphere();
    const m = new T.Mesh(g, material);
    m.frustumCulled = false;
    return m;
  }
}
const vcMat = (o = {}) => new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, ...o });

// Emblema propio (doble chevrón dentro de un hexágono): se usa en pantalla y estandartes.
function drawEmblem(c, cx, cy, s, c1, c2) {
  c.save();
  c.translate(cx, cy);
  c.lineJoin = 'miter'; c.lineCap = 'butt';
  c.strokeStyle = c1; c.lineWidth = s * 0.075;
  c.beginPath();
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * TAU) / 6; c.lineTo(Math.cos(a) * s, Math.sin(a) * s); }
  c.closePath(); c.stroke();
  c.strokeStyle = c2; c.lineWidth = s * 0.17;
  for (const dy of [-0.16, 0.2]) {
    c.beginPath(); c.moveTo(-s * 0.46, s * (dy + 0.3)); c.lineTo(0, s * (dy - 0.12)); c.lineTo(s * 0.46, s * (dy + 0.3)); c.stroke();
  }
  c.fillStyle = c1;
  c.beginPath(); c.arc(0, -s * 0.55, s * 0.1, 0, TAU); c.fill();
  c.restore();
}

// ================================================================= CIUDAD NEÓN
function buildNeon(scene) {
  const group = new T.Group();
  const rand = rng(2077);
  const BLUE = col(0x2f8cff), ORANGE = col(0xff8a1f), CYAN = col(0x35d8ff), VIOLET = col(0x8a5cff), PINK = col(0xff4fb0);
  const sideT = (y) => sstep(-500, 500, y);
  const sideC = (y, k = 1) => mixc(BLUE, ORANGE, sideT(y)).multiplyScalar(k);

  scene.background = new T.Color(0x0a0824);
  scene.fog = new T.Fog(0x1c1055, 12000, 36000);

  // --- cielo nocturno con estrellas
  const skyTex = ctex(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#03041a'); g.addColorStop(0.22, '#0a1040'); g.addColorStop(0.38, '#25196a');
    g.addColorStop(0.46, '#6a2c96'); g.addColorStop(0.5, '#c0489a'); g.addColorStop(0.505, '#150d30'); g.addColorStop(1, '#05060f');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const r = rng(5);
    for (let i = 0; i < 700; i++) {
      const y = Math.pow(r(), 1.4) * h * 0.46;
      c.fillStyle = `rgba(${200 + r() * 55 | 0},${210 + r() * 45 | 0},255,${0.25 + r() * 0.6})`;
      const s = r() < 0.07 ? 2 : 1;
      c.fillRect(r() * w, y, s, s);
    }
  });
  const skyGeo = new T.SphereGeometry(30000, 32, 16); skyGeo.rotateX(Math.PI / 2);
  const sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; group.add(sky);

  // --- suelo con rejilla tenue
  const gridTex = ctex(256, 256, (c, w, h) => {
    c.fillStyle = '#060818'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#17205a'; c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
  }, true);
  gridTex.repeat.set(12, 12);
  const ground = new T.Mesh(new T.CircleGeometry(30000, 48), new T.MeshBasicMaterial({ map: gridTex }));
  ground.position.z = -3; group.add(ground);

  // --- skyline: cientos de torres en una sola malla (ventanas con textura emisiva)
  const winTex = ctex(256, 256, (c, w, h) => {
    c.fillStyle = '#05071a'; c.fillRect(0, 0, w, h);
    const pal = ['#3aa0ff', '#5a6bff', '#8a5cff', '#ff4fb0', '#6fd2ff', '#2b7bff', '#b06cff', '#ffd08a'];
    const r = rng(11);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (r() < 0.52) {
        c.fillStyle = pal[(r() * (r() < 0.9 ? 7 : 8)) | 0];
        c.globalAlpha = 0.45 + r() * 0.55;
        c.fillRect(x * 16 + 3, y * 16 + 4, 10, 8);
      }
    }
    c.globalAlpha = 1;
  }, true);
  const towers = new Mesher(true), trims = new Mesher(), tops = new Mesher();
  const TILE = 3040;
  const nTow = 460;
  for (let i = 0; i < nTow; i++) {
    const a = rand() * TAU, r = 10600 + Math.pow(rand(), 1.25) * 13500;
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r * 1.0;
    const w = 480 + rand() * 900, d = 480 + rand() * 900;
    const h = 1300 + Math.pow(rand(), 2) * 5200 + (r - 10600) * 0.2;
    const k = 0.65 + rand() * 0.5;
    const tint = mixc(col(0x7aa8ff), col(0xc08aff), rand()).multiplyScalar(k);
    const u0 = rand(), x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
    const sides = [
      [[x0, y0], [x1, y0], w], [[x1, y0], [x1, y1], d], [[x1, y1], [x0, y1], w], [[x0, y1], [x0, y0], d],
    ];
    for (const [A, B, len] of sides) {
      const uA = u0, uB = u0 + len / TILE, vT = h / TILE;
      towers.quad([A[0], A[1], 0], [B[0], B[1], 0], [B[0], B[1], h], [A[0], A[1], h], tint, tint, tint, tint,
        [[uA, 0], [uB, 0], [uB, vT], [uA, vT]]);
    }
    tops.quad([x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h], col(0x0a0e2a));
    if (h > 2600 && rand() < 0.3) { // franja neón vertical en una esquina
      const c = [CYAN, PINK, VIOLET, BLUE][(rand() * 4) | 0];
      trims.box(x1 + 6, y0 - 6, h * 0.47, 36, 36, h * 0.94, c);
      trims.box(x0 - 6, y1 + 6, h * 0.47, 36, 36, h * 0.94, c);
    }
    if (rand() < 0.2) { // antena con baliza
      const ah = 450 + rand() * 1100;
      trims.box(cx, cy, h + ah / 2, 34, 34, ah, col(0x2a3366));
      trims.box(cx, cy, h + ah + 30, 90, 90, 90, rand() < 0.5 ? PINK : col(0xff3030));
    }
    if (rand() < 0.25) trims.box(cx, cy, h + 12, w * 1.02, d * 1.02, 26, [CYAN, VIOLET, PINK][(rand() * 3) | 0]);
  }
  const towerMesh = towers.build(new T.MeshBasicMaterial({ map: winTex, vertexColors: true, side: T.DoubleSide }));
  group.add(towerMesh, tops.build(vcMat()));

  // --- gradas y plataforma perimetral con neón (azul en y<0, naranja en y>0)
  const seatTex = ctex(64, 64, (c, w, h) => {
    c.fillStyle = '#7a7a86'; c.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`; c.fillRect((r() * 15 | 0) * 4 + 1, (r() * 15 | 0) * 4 + 1, 3, 3); }
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
  }, true);
  const seats = new Mesher(true), dark = new Mesher(), glow = new Mesher();
  const NAVY = col(0x0b1230), NAVY2 = col(0x060a1c);
  const TIERS = 6, T0 = 700, DTT = 330, RISE = 190;
  // suelo brillante junto al campo y zócalo con neón
  dark.ring(0, -1.2, 500, -1.2, (x, y) => sideC(y, 0.12));
  glow.ring(470, -0.8, 500, -0.8, (x, y) => sideC(y, 0.9));
  glow.ring(0, -0.8, 30, -0.8, (x, y) => sideC(y, 0.5));
  dark.ring(500, 0, 500, 650, () => NAVY);
  glow.ring(480, 650, 520, 650, (x, y) => sideC(y, 1));
  dark.ring(500, 650, 700, 0, () => NAVY2, 0);
  for (let i = 0; i < TIERS; i++) {
    const t1 = T0 + i * DTT, t2 = t1 + DTT, zb = i * RISE, zt = (i + 1) * RISE;
    seats.ring(t1, zt, t2, zt, (x, y) => sideC(y, 0.36), 320);
    dark.ring(t1, zb, t1, zt, (x, y) => sideC(y, 0.06));
    glow.ring(t1 - 4, zt - 75, t1 - 4, zt - 38, (x, y) => sideC(y, 1));
  }
  const tb = T0 + TIERS * DTT, zb = TIERS * RISE;
  dark.ring(tb, zb, tb, 2000, () => NAVY);
  dark.ring(tb, 2000, tb + 260, 2000, () => NAVY);
  glow.ring(tb - 4, zb + 160, tb - 4, zb + 200, (x, y) => sideC(y, 1));
  glow.ring(tb - 4, 1940, tb - 4, 1985, (x, y) => sideC(y, 0.9));
  glow.ring(tb - 4, 1500, tb - 4, 1520, (x, y) => sideC(y, 0.7));

  // chevrones «>>>» en los muros laterales apuntando a cada portería
  const chev = (xp, y0, d, zc, w, h, k, c) => {
    const A = [xp, y0, zc + h], B = [xp, y0 + d * w, zc], Cc = [xp, y0, zc - h];
    const A2 = [xp, y0 - d * k, zc + h], B2 = [xp, y0 + d * w - d * k, zc], C2 = [xp, y0 - d * k, zc - h];
    glow.quad(A, B, B2, A2, c); glow.quad(B, Cc, C2, B2, c);
  };
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const xp = sx * (4096 + 500 - 3);
    for (const yc of [650, 1800, 2950, 4050]) {
      const c = sideC(sy * 1000, 1.0);
      for (let n = 0; n < 3; n++) chev(xp, sy * (yc + n * 150), sy, 330, 80, 215, 52, c);
    }
  }

  // pantallas gigantes del fondo con emblema propio
  const screenTex = [BLUE, ORANGE].map((cc, idx) => ctex(1024, 448, (c, w, h) => {
    const hexs = '#' + cc.getHexString();
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#05081e'); g.addColorStop(0.5, idx ? '#2a1008' : '#081a3a'); g.addColorStop(1, '#05081e');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = hexs; c.globalAlpha = 0.22; c.lineWidth = 2;
    for (let i = 0; i < w; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); }
    for (let j = 0; j < h; j += 32) { c.beginPath(); c.moveTo(0, j); c.lineTo(w, j); c.stroke(); }
    c.globalAlpha = 1;
    for (let i = 0; i < 18; i++) { // ecualizador
      const bh = 30 + ((i * 53) % 90);
      c.fillStyle = hexs; c.globalAlpha = 0.7;
      c.fillRect(30 + i * 14, h - 30 - bh, 9, bh); c.fillRect(w - 30 - (i + 1) * 14, h - 30 - bh, 9, bh);
    }
    c.globalAlpha = 1;
    c.shadowColor = hexs; c.shadowBlur = 30;
    drawEmblem(c, w / 2, h / 2 - 20, 150, hexs, '#ffffff');
    c.font = 'bold 54px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffffff';
    c.fillText('BALÓN TURBO', w / 2, h - 28);
    c.shadowBlur = 0; c.strokeStyle = hexs; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10);
  }));
  const screenMats = screenTex.map((t) => new T.MeshBasicMaterial({ map: t, side: T.DoubleSide }));
  const SY = tb + 6420 + 780;
  [-1, 1].forEach((s, idx) => {
    const g = new T.PlaneGeometry(6600, 2886); g.rotateX(Math.PI / 2);
    const m = new T.Mesh(g, screenMats[idx]);
    m.position.set(0, s * SY, 3700); if (s < 0) m.rotation.z = Math.PI;
    group.add(m);
    const cc = idx ? ORANGE : BLUE;
    dark.box(0, s * (SY + 40), 3700, 6900, 60, 3180, NAVY2);
    for (const lx of [-2800, 2800]) dark.box(lx, s * (SY + 60), 1150, 200, 200, 2300, NAVY);
    glow.box(0, s * (SY - 20), 3700 + 1470, 6800, 24, 34, cc); glow.box(0, s * (SY - 20), 3700 - 1470, 6800, 24, 34, cc);
    glow.box(-3380, s * (SY - 20), 3700, 34, 24, 2960, cc); glow.box(3380, s * (SY - 20), 3700, 34, 24, 2960, cc);
  });

  // estandartes verticales con el emblema (azules en y<0, naranjas en y>0)
  const banTex = [BLUE, ORANGE].map((cc) => ctex(128, 320, (c, w, h) => {
    const hexs = '#' + cc.getHexString();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#' + cc.clone().multiplyScalar(0.5).getHexString()); g.addColorStop(1, '#05081e');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = hexs; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    c.shadowColor = hexs; c.shadowBlur = 14;
    drawEmblem(c, w / 2, h * 0.45, 42, hexs, '#ffffff');
    c.fillStyle = hexs; c.fillRect(w / 2 - 3, h * 0.72, 6, h * 0.2);
  }));
  const banM = [new Mesher(true), new Mesher(true)];
  const bx = 4096 + tb + 30;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const yc of [700, 1750, 2800, 3850]) {
    const yy = sy * yc, B = banM[sy < 0 ? 0 : 1], x = sx * (bx + 40);
    const W = c3(1);
    B.quad([x, yy - 260, 1650], [x, yy + 260, 1650], [x, yy + 260, 3550], [x, yy - 260, 3550], W, W, W, W, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    dark.box(x, yy, 3600, 40, 640, 50, NAVY);
    dark.box(x, yy - 270, 2400, 26, 26, 2400, NAVY); dark.box(x, yy + 270, 2400, 26, 26, 2400, NAVY);
    glow.box(x - sx * 8, yy, 3630, 20, 640, 14, sy < 0 ? BLUE : ORANGE);
  }
  function c3(v) { return new T.Color(v, v, v); }
  banM.forEach((m, i) => group.add(m.build(new T.MeshBasicMaterial({ map: banTex[i], vertexColors: true, side: T.DoubleSide }))));

  // grandes arcos y anillos estructurales con tubos de neón
  const archGlow = new Mesher();
  const arcs = [
    { y: 0, R: 9400, rz: 0, c: CYAN }, { y: -3800, R: 8300, rz: 0, c: BLUE }, { y: 3800, R: 8300, rz: 0, c: ORANGE },
    { x: 0, R: 12000, rz: Math.PI / 2, c: BLUE }, { y: 0, R: 10800, rz: 0.62, c: VIOLET }, { y: 0, R: 10800, rz: -0.62, c: PINK },
  ];
  const archTops = [];
  for (const a of arcs) {
    const m = new T.Matrix4().makeTranslation(0, a.y || 0, -200)
      .multiply(new T.Matrix4().makeRotationZ(a.rz)).multiply(new T.Matrix4().makeRotationX(Math.PI / 2));
    dark.geo(new T.TorusGeometry(a.R, 150, 6, 84, Math.PI), m, NAVY);
    archGlow.geo(new T.TorusGeometry(a.R - 190, 48, 5, 84, Math.PI), m, a.c);
    archGlow.geo(new T.TorusGeometry(a.R + 190, 26, 5, 84, Math.PI), m, mixc(a.c, col(0xffffff), 0.25));
    archTops.push(new T.Vector3(a.R * 0.7071, 0, a.R * 0.7071).applyMatrix4(m), new T.Vector3(0, 0, a.R).applyMatrix4(m));
  }
  // vigas que unen los arcos
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) {
    const a = archTops[k], b = archTops[2 + i * 2 + k];
    if (b && a) dark.rod([a.x, a.y, a.z], [b.x, b.y, b.z], 55, NAVY);
  }
  // anillos completos tras cada pantalla
  [-1, 1].forEach((s) => {
    const m = new T.Matrix4().makeTranslation(0, s * (SY + 2600), 4300).multiply(new T.Matrix4().makeRotationX(Math.PI / 2));
    dark.geo(new T.TorusGeometry(3500, 130, 6, 72), m, NAVY);
    archGlow.geo(new T.TorusGeometry(3300, 46, 5, 72), m, s < 0 ? BLUE : ORANGE);
    archGlow.geo(new T.TorusGeometry(2900, 22, 5, 72), m, s < 0 ? CYAN : PINK);
  });

  // decals de neón finos en el campo (z=0.6): círculo central y áreas
  const decals = new Mesher();
  const arcLine = (cx, cy, r, a0, a1, w, c) => {
    const n = 72;
    for (let i = 0; i < n; i++) {
      const t0 = a0 + (a1 - a0) * i / n, t1 = a0 + (a1 - a0) * (i + 1) / n;
      decals.quad([cx + Math.cos(t0) * (r - w), cy + Math.sin(t0) * (r - w), 0.6], [cx + Math.cos(t1) * (r - w), cy + Math.sin(t1) * (r - w), 0.6],
        [cx + Math.cos(t1) * (r + w), cy + Math.sin(t1) * (r + w), 0.6], [cx + Math.cos(t0) * (r + w), cy + Math.sin(t0) * (r + w), 0.6], c);
    }
  };
  const seg = (x0, y0, x1, y1, w, c) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * w, ny = dx / l * w;
    decals.quad([x0 + nx, y0 + ny, 0.6], [x1 + nx, y1 + ny, 0.6], [x1 - nx, y1 - ny, 0.6], [x0 - nx, y0 - ny, 0.6], c);
  };
  arcLine(0, 0, 1075, 0, TAU, 7, CYAN);
  arcLine(0, 0, 1150, 0, TAU, 3, VIOLET);
  for (const s of [-1, 1]) {
    const c = s < 0 ? BLUE.clone().lerp(CYAN, 0.4) : ORANGE.clone().lerp(PINK, 0.2);
    for (const [hx, d] of [[1870, 1700 + 70], [970, 700 + 70]]) {
      const y0 = s * 5035, y1 = s * (5035 - d);
      seg(-hx, y1, hx, y1, 6, c); seg(-hx, y1, -hx, y0, 6, c); seg(hx, y1, hx, y0, 6, c);
    }
    arcLine(0, s * (5035 - 1700), 670, s < 0 ? Math.PI : 0, s < 0 ? TAU : Math.PI, 5, c);
  }
  const decalMat = vcMat({ transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false });
  const decalMesh = decals.build(decalMat); decalMesh.renderOrder = 2;

  // materiales con pulso
  const matA = vcMat(), matB = vcMat(), matC = vcMat();
  const stands = seats.build(new T.MeshBasicMaterial({ map: seatTex, vertexColors: true, side: T.DoubleSide }));
  group.add(stands, dark.build(vcMat()), glow.build(matA), archGlow.build(matB), decalMesh);
  const trimMesh = trims.build(matC);
  group.add(trimMesh);
  const extras = [trimMesh, decalMesh, ...banM.map((m, i) => group.children.find((o) => o.material && o.material.map === banTex[i]))].filter(Boolean);

  let t = 0, flick = 0;
  return {
    group,
    update(dt) {
      t += dt;
      if (flick > 0) flick -= dt; else if (Math.random() < dt * 0.35) flick = 0.09;
      matA.color.setScalar(0.84 + 0.16 * Math.sin(t * 2.1));
      matB.color.setScalar((0.9 + 0.1 * Math.sin(t * 1.3 + 1)) * (flick > 0 ? 0.45 : 1));
      matC.color.setScalar(0.75 + 0.25 * Math.sin(t * 3.1));
      decalMat.opacity = 0.62 + 0.22 * Math.sin(t * 2.6);
      screenMats[0].color.setScalar(0.9 + 0.1 * Math.sin(t * 2.0)); screenMats[1].color.setScalar(0.9 + 0.1 * Math.sin(t * 2.0 + 2));
    },
    setQuality(low) { for (const o of extras) o.visible = !low; },
  };
}

// ================================================================= TEMPLO DEL DRAGÓN
const SUN = (() => { const l = Math.hypot(-0.35, 0.45, 0.82); return [-0.35 / l, 0.45 / l, 0.82 / l]; })();
function sunLight(nx, ny, nz) { // sombreado horneado: luz cálida de día
  const d = Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
  const f = 0.62 + 0.52 * d + 0.1 * nz;
  return [f * 1.02, f * 0.98, f * 0.9];
}

function buildTemplo(scene) {
  const group = new T.Group();
  const rand = rng(8801);
  const G = -60; // suelo exterior
  const RED = col(0xc23a30), DRED = col(0x8e1f20), GOLD = col(0xe3b24d), TEAL = col(0x2c9a8c), TEAL2 = col(0x62d4c0);
  const STONE = col(0xbab2a0), STONE2 = col(0x9a9484), BLUEL = col(0x4aa8ff), ORAL = col(0xff6a2a);
  const sideT = (y) => sstep(-600, 600, y);

  scene.background = new T.Color(0xbfdcf0);
  scene.fog = new T.Fog(0xc9e3f3, 12000, 34000);

  // --- cielo azul con nubes pintadas
  const skyTex = ctex(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2c6fc8'); g.addColorStop(0.3, '#5aa0e6'); g.addColorStop(0.46, '#a9d4f4');
    g.addColorStop(0.5, '#e3f1fa'); g.addColorStop(0.505, '#a8c4b8'); g.addColorStop(1, '#8fb0a0');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const sg = c.createRadialGradient(w * 0.18, h * 0.34, 0, w * 0.18, h * 0.34, 150);
    sg.addColorStop(0, 'rgba(255,244,200,.95)'); sg.addColorStop(1, 'rgba(255,244,200,0)');
    c.fillStyle = sg; c.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = h * (0.12 + r() * 0.3), n = 5 + (r() * 6 | 0);
      for (let k = 0; k < n; k++) {
        const rr = 14 + r() * 26, px = x + (k - n / 2) * 18, py = y + (r() - 0.5) * 10;
        const rg = c.createRadialGradient(px, py, 0, px, py, rr);
        rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = rg; c.fillRect(px - rr, py - rr, rr * 2, rr * 2);
      }
    }
  });
  const skyGeo = new T.SphereGeometry(30000, 32, 16); skyGeo.rotateX(Math.PI / 2);
  const sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ map: skyTex, side: T.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; group.add(sky);

  // --- suelo de hierba y explanada de piedra
  const grassTex = ctex(256, 256, (c, w, h) => {
    c.fillStyle = '#5c9a52'; c.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 1400; i++) { c.fillStyle = r() < 0.5 ? 'rgba(130,190,90,.35)' : 'rgba(40,100,60,.3)'; c.fillRect(r() * w, r() * h, 3, 6); }
  }, true);
  grassTex.repeat.set(70, 70);
  const ground = new T.Mesh(new T.CircleGeometry(30000, 48), new T.MeshBasicMaterial({ map: grassTex, color: 0xf2f0e2 }));
  ground.position.z = G; group.add(ground);

  const stoneTex = ctex(128, 128, (c, w, h) => {
    c.fillStyle = '#bdb5a3'; c.fillRect(0, 0, w, h);
    const r = rng(31);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,80,60'},${0.06 + r() * 0.1})`; c.fillRect(i * 32, j * 32, 32, 32); }
    c.strokeStyle = 'rgba(90,80,60,.55)'; c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, h); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); }
  }, true);
  const plaza = new Mesher(true, sunLight);
  const white = col(0xffffff);
  const lightFlat = (x, y) => white.clone().multiplyScalar(1.08);
  plaza.fill(1700, -1.5, lightFlat, 700);
  plaza.ring(1700, -1.5, 1700, G, () => col(0xa49c8a));
  group.add(plaza.build(new T.MeshBasicMaterial({ map: stoneTex, vertexColors: true, side: T.DoubleSide })));

  // --- construcciones estáticas (todas sombreadas al hornear)
  const M = new Mesher(false, sunLight);
  const gloss = new Mesher(); // sin sombreado (farolillos, ojos...)

  // balaustrada roja con farolillos (azules en y<0, rojo-naranja en y>0)
  M.ring(1700, 0, 1700, 230, () => STONE2);
  M.ring(1680, 380, 1720, 380, () => RED); M.ring(1680, 300, 1720, 300, () => DRED);
  const lanternPts = [], lanternCols = [];
  const P1 = ringP(1700);
  for (let i = 0; i < 8; i++) {
    const A = P1[i], B = P1[(i + 1) % 8], len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.round(len / 640));
    for (let s = 0; s < n; s++) {
      const f = s / n, x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f;
      M.box(x, y, 280, 60, 60, 560, DRED, GOLD);
      const lc = mixc(BLUEL, ORAL, sideT(y));
      gloss.box(x, y, 640, 70, 70, 90, lc.clone().lerp(white, 0.35));
      lanternPts.push(x, y, 640); lanternCols.push(lc.r, lc.g, lc.b);
    }
  }
  // farolas altas de piedra con luz
  for (const sx of [-1, 1]) for (const yy of [-4200, -2100, 0, 2100, 4200]) {
    const x = sx * (4096 + 2050), lc = mixc(BLUEL, ORAL, sideT(yy));
    M.box(x, yy, G + 600, 90, 90, 1260, STONE2, STONE);
    M.box(x, yy, 1080, 150, 150, 40, DRED);
    gloss.box(x, yy, 1180, 130, 130, 190, lc.clone().lerp(white, 0.3));
    M.box(x, yy, 1310, 210, 210, 36, TEAL);
    lanternPts.push(x, yy, 1180); lanternCols.push(lc.r, lc.g, lc.b);
  }
  for (const sy of [-1, 1]) for (const xx of [-2200, 0, 2200]) {
    const y = sy * (6420 + 2050), lc = sy < 0 ? BLUEL : ORAL;
    M.box(xx, y, G + 600, 90, 90, 1260, STONE2, STONE);
    gloss.box(xx, y, 1180, 130, 130, 190, lc.clone().lerp(white, 0.3));
    M.box(xx, y, 1310, 210, 210, 36, TEAL);
    lanternPts.push(xx, y, 1180); lanternCols.push(lc.r, lc.g, lc.b);
  }

  // pagodas: cajas + cilindros + tejados curvos (Lathe de 4 caras con esquinas hacia arriba)
  function pagoda(cx, cy, w0, n, sc, yaw = 0) {
    M.box(cx, cy, G + 120 * sc, w0 * 1.75, w0 * 1.75, 240 * sc, STONE2, STONE);
    M.box(cx, cy, G + 330 * sc, w0 * 1.4, w0 * 1.4, 180 * sc, STONE, STONE);
    let z = G + 420 * sc;
    for (let i = 0; i < n; i++) {
      const w = w0 * (1 - 0.12 * i), wh = w * 0.5, rc = w * 0.5 * Math.SQRT2 * 1.5, rh = w * 0.36;
      M.box(cx, cy, z + wh / 2, w, w, wh, RED);
      M.box(cx, cy, z + wh * 0.94, w * 1.04, w * 1.04, wh * 0.1, GOLD);
      for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) M.box(cx + dx * w / 2, cy + dy * w / 2, z + wh / 2, w * 0.08, w * 0.08, wh, DRED);
      M.box(cx, cy - w / 2 - 4, z + wh * 0.36, w * 0.22, 10, wh * 0.64, col(0x2a0d0a));
      M.box(cx, cy + w / 2 + 4, z + wh * 0.36, w * 0.22, 10, wh * 0.64, col(0x2a0d0a));
      gloss.box(cx - w / 2 - 4, cy, z + wh * 0.5, 8, w * 0.2, wh * 0.28, col(0xf2d27a));
      gloss.box(cx + w / 2 + 4, cy, z + wh * 0.5, 8, w * 0.2, wh * 0.28, col(0xf2d27a));
      const pts = [];
      for (let s = 0; s <= 10; s++) { const f = s / 10; pts.push(new T.Vector2(rc * (1 - f) + 1, rh * (Math.pow(f, 1.7) + 0.38 * Math.pow(1 - f, 7)))); }
      const lg = new T.LatheGeometry(pts, 4); lg.rotateX(Math.PI / 2); lg.rotateZ(Math.PI / 4 + yaw);
      M.geo(lg, mat4(cx, cy, z + wh), null, (x, y, zz) => {
        const d = Math.hypot(x - cx, y - cy) / rc;
        return mixc(TEAL, TEAL2, clamp(d * 1.1, 0, 1));
      });
      for (let k = 0; k < 4; k++) { // puntas doradas de los aleros
        const a = Math.PI / 4 + yaw + k * Math.PI / 2;
        M.geo(new T.IcosahedronGeometry(w * 0.035, 0), mat4(cx + Math.cos(a) * rc * 0.97, cy + Math.sin(a) * rc * 0.97, z + wh + rh * 0.4), GOLD);
      }
      z += wh + rh * 0.55;
    }
    M.geo(new T.CylinderGeometry(8 * sc, 14 * sc, 700 * sc, 6), mat4(cx, cy, z + 330 * sc, Math.PI / 2), GOLD);
    for (let k = 0; k < 5; k++) M.geo(new T.CylinderGeometry(70 * sc * (1 - k * 0.14), 70 * sc * (1 - k * 0.14), 24 * sc, 10), mat4(cx, cy, z + (120 + k * 90) * sc, Math.PI / 2), GOLD);
    M.geo(new T.IcosahedronGeometry(60 * sc, 0), mat4(cx, cy, z + 730 * sc), GOLD);
  }
  const placed = []; // zonas ocupadas {x,y,r}
  const addP = (x, y, r) => placed.push({ x, y, r });
  const pagodas = [[0, 16800, 2300, 6, 1], [0, -16800, 2300, 6, 1], [15500, 5500, 1500, 4, 1], [-15500, 5500, 1500, 4, 1], [15500, -5500, 1500, 4, 1], [-15500, -5500, 1500, 4, 1]];
  for (const [x, y, w, n, sc] of pagodas) { pagoda(x, y, w, n, sc * w / 1500 * 1.0 + 0, 0); addP(x, y, w * 1.9); }

  // salones con tejado curvo de ExtrudeGeometry
  function hall(cx, cy, W, Ln, Hh, rot) {
    const hw = W / 2 * 1.35, hr = W * 0.34, thick = hr * 0.14, top = [];
    for (let s = 0; s <= 24; s++) { const f = s / 24, x = -hw + 2 * hw * f, e = Math.abs(x) / hw; top.push([x, hr * (1 - Math.pow(e, 0.55) * 0.82) + hr * 0.28 * Math.pow(e, 6)]); }
    const sh = new T.Shape();
    top.forEach((p, i) => (i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])));
    for (let i = top.length - 1; i >= 0; i--) sh.lineTo(top[i][0] * 0.97, top[i][1] - thick);
    const eg = new T.ExtrudeGeometry(sh, { depth: Ln * 1.18, bevelEnabled: false });
    eg.translate(0, 0, -Ln * 0.59); eg.rotateX(Math.PI / 2);
    const mR = mat4(cx, cy, G + 300 + Hh, 0, 0, rot);
    M.geo(eg, mR, null, (x, y, z) => mixc(TEAL, TEAL2, clamp((Math.abs(z - (G + 300 + Hh)) / hr) * 0.9, 0, 1)));
    const c = Math.cos(rot), s = Math.sin(rot);
    // cuerpo del salón (caja rotada)
    const bg = new T.BoxGeometry(W, Ln, Hh);
    M.geo(bg, mat4(cx, cy, G + 300 + Hh / 2, 0, 0, rot), RED);
    for (let k = -3; k <= 3; k++) {
      const lx = k * W * 0.15, ly = Ln / 2 + 6;
      for (const sgn of [-1, 1]) M.geo(new T.BoxGeometry(W * 0.06, 16, Hh), mat4(cx + c * lx - s * ly * sgn, cy + s * lx + c * ly * sgn, G + 300 + Hh / 2, 0, 0, rot), DRED);
    }
    M.box(cx, cy, G + 150, W * 1.4, W * 1.4, 300, STONE2, STONE);
  }
  hall(-7000, 12500, 2400, 3600, 1000, 0.35); addP(-7000, 12500, 2600);
  hall(7000, -12500, 2400, 3600, 1000, -0.35); addP(7000, -12500, 2600);

  // río con puentes de piedra con arcos (los puentes son Extrude con huecos)
  const RIVX = 10500, RW = 1700, RL = 12800;
  const water = new Mesher(true);
  const wc = col(0xffffff);
  for (const sx of [-1, 1]) {
    const x0 = sx * RIVX - RW / 2, x1 = sx * RIVX + RW / 2;
    water.quad([x0, -RL, G + 14], [x1, -RL, G + 14], [x1, RL, G + 14], [x0, RL, G + 14], wc, wc, wc, wc, [[0, 0], [1, 0], [1, RL * 2 / 1200], [0, RL * 2 / 1200]]);
    M.box(x0 - 60, 0, G + 20, 120, RL * 2, 70, STONE2, STONE); M.box(x1 + 60, 0, G + 20, 120, RL * 2, 70, STONE2, STONE);
    addP(sx * RIVX, 0, 1400);
  }
  function bridge(cx, cy) {
    const L = 3800, y = (x) => 380 + 520 * (1 - Math.pow(2 * x / L, 2));
    const sh = new T.Shape();
    sh.moveTo(-L / 2, 0);
    const N = 24;
    for (let i = 0; i <= N; i++) { const x = -L / 2 + L * i / N; sh.lineTo(x, y(x)); }
    sh.lineTo(L / 2, 0); sh.lineTo(-L / 2, 0);
    for (const [hx, hr] of [[0, 640], [-1250, 360], [1250, 360]]) {
      const p = new T.Path(); p.moveTo(hx - hr, 70); p.absarc(hx, 70, hr, Math.PI, 0, true); p.lineTo(hx - hr, 70);
      sh.holes.push(p);
    }
    const dep = 640;
    const eg = new T.ExtrudeGeometry(sh, { depth: dep, bevelEnabled: false, curveSegments: 14 });
    eg.translate(0, 0, -dep / 2); eg.rotateX(Math.PI / 2);
    M.geo(eg, mat4(cx, cy, G), STONE);
    for (const sg of [-1, 1]) { // pretiles
      const ps = new T.Shape();
      for (let i = 0; i <= N; i++) { const x = -L / 2 + L * i / N; (i ? ps.lineTo(x, y(x) + 190) : ps.moveTo(x, y(x) + 190)); }
      for (let i = N; i >= 0; i--) { const x = -L / 2 + L * i / N; ps.lineTo(x, y(x)); }
      const pg = new T.ExtrudeGeometry(ps, { depth: 70, bevelEnabled: false });
      pg.translate(0, 0, -35); pg.rotateX(Math.PI / 2);
      M.geo(pg, mat4(cx, cy + sg * 300, G), STONE2);
    }
    for (const sg of [-1, 1]) for (const px of [-1900, 1900]) { // columnas con cúpula roja
      M.box(cx + px, cy + sg * 300, G + 590, 130, 130, 520, RED, GOLD);
      gloss.box(cx + px, cy + sg * 300, G + 920, 100, 100, 130, sg < 0 ? BLUEL : ORAL);
      lanternPts.push(cx + px, cy + sg * 300, G + 920); const lc = sg < 0 ? BLUEL : ORAL; lanternCols.push(lc.r, lc.g, lc.b);
    }
  }
  bridge(RIVX, 3000); bridge(-RIVX, -3000); addP(RIVX, 3000, 2200); addP(-RIVX, -3000, 2200);

  // montañas kársticas (conos deformados con gradiente verde-azulado)
  const ph = () => rand() * TAU;
  function profile(R, t, ang, p1, p2) {
    return R * (0.26 + 0.74 * Math.pow(1 - t, 1.5)) * (1 + 0.2 * Math.sin(3 * ang + p1 + 3 * t) + 0.12 * Math.sin(5 * ang + p2 - 2 * t));
  }
  const mountains = [];
  const peaks = [[10500, 15200, 2900, 9500], [-10500, 15200, 2900, 9500], [10500, -15200, 2900, 9500], [-10500, -15200, 2900, 9500]];
  const falls = [];
  peaks.forEach(([x, y, R, H2]) => { const p1 = ph(), p2 = ph(); mountains.push({ x, y, R, H: H2, p1, p2 }); falls.push(mountains[mountains.length - 1]); addP(x, y, R * 1.2); });
  for (let tries = 0; mountains.length < 44 && tries < 600; tries++) {
    const a = rand() * TAU, r = 17500 + rand() * 9000, x = Math.cos(a) * r, y = Math.sin(a) * r;
    const R = 1700 + rand() * 1700, H2 = 5000 + rand() * 7000 + (r - 17500) * 0.25;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + R)) continue;
    if (mountains.some((m2) => Math.hypot(m2.x - x, m2.y - y) < (m2.R + R) * 0.85)) continue;
    mountains.push({ x, y, R, H: H2, p1: ph(), p2: ph() });
  }
  const MM = new Mesher(false, sunLight);
  const cyl = new T.CylinderGeometry(1, 1, 1, 10, 14, false);
  for (const m of mountains) {
    const g = cyl.clone(); const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const ox = pa.getX(i), oy = pa.getY(i), oz = pa.getZ(i), t = oy + 0.5, ang = Math.atan2(oz, ox), rr = Math.hypot(ox, oz);
      const r = rr * profile(m.R, t, ang, m.p1, m.p2), lean = Math.sin(m.p1) * 0.12 * m.H * t * t;
      pa.setXYZ(i, Math.cos(ang) * r + lean, Math.sin(ang) * r, G + t * m.H);
    }
    MM.geo(g, mat4(m.x, m.y, 0), null, (x, y, z) => {
      const t = clamp((z - G) / m.H, 0, 1);
      let c = t < 0.28 ? mixc(col(0x3b7a4c), col(0x5a8f78), t / 0.28) : mixc(col(0x5a8f78), col(0x93b9b0), sstep(0.28, 0.85, t));
      if (t > 0.9) c = mixc(c, col(0x4b9a55), 0.7);
      return c.multiplyScalar(0.93 + 0.07 * Math.sin(t * 46 + m.p2));
    });
  }
  group.add(MM.build(vcMat()));

  // cascadas (textura animada) + estanques
  const fallTex = ctex(64, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const r = rng(41);
    for (let i = 0; i < 26; i++) {
      const x = r() * w, len = 60 + r() * 120, y = r() * h, wd = 3 + r() * 6;
      const g = c.createLinearGradient(0, y, 0, y + len);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(235,248,255,${0.6 + r() * 0.4})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x, y, wd, len); c.fillRect(x, y - h, wd, len); c.fillRect(x, y + h, wd, len);
    }
    c.fillStyle = 'rgba(200,230,255,.25)'; c.fillRect(0, 0, w, h);
  }, true);
  const FM = new Mesher(true);
  const poolM = new Mesher(true);
  for (const m of falls) {
    const toC = m.y > 0 ? -Math.PI / 2 : Math.PI / 2, seg2 = 10, wid = 0.2;
    const ptsA = [], ptsB = [];
    for (let s = 0; s <= seg2; s++) {
      const t = 0.82 - 0.8 * s / seg2;
      for (const [arr, da] of [[ptsA, -wid], [ptsB, wid]]) {
        const ang = toC + da, r = profile(m.R, t, ang, m.p1, m.p2) * 1.07 + 45, lean = Math.sin(m.p1) * 0.12 * m.H * t * t;
        arr.push([m.x + Math.cos(ang) * r + lean, m.y + Math.sin(ang) * r, G + t * m.H]);
      }
    }
    for (let s = 0; s < seg2; s++) {
      FM.quad(ptsA[s], ptsB[s], ptsB[s + 1], ptsA[s + 1], wc, wc, wc, wc, [[0, s * 0.55], [1, s * 0.55], [1, (s + 1) * 0.55], [0, (s + 1) * 0.55]]);
    }
    const bx2 = (ptsA[seg2][0] + ptsB[seg2][0]) / 2, by2 = (ptsA[seg2][1] + ptsB[seg2][1]) / 2;
    const nn = 18;
    for (let i = 0; i < nn; i++) {
      const a0 = i / nn * TAU, a1 = (i + 1) / nn * TAU, R2 = 1000;
      poolM.tri([bx2, by2, G + 16], [bx2 + Math.cos(a0) * R2, by2 + Math.sin(a0) * R2, G + 16], [bx2 + Math.cos(a1) * R2, by2 + Math.sin(a1) * R2, G + 16], wc, wc, wc,
        [[0.5, 0.5], [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5], [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5]]);
    }
    // el río nace en el estanque
  }
  void poolM;
  const fallMat = new T.MeshBasicMaterial({ map: fallTex, vertexColors: true, transparent: true, side: T.DoubleSide, depthWrite: false });
  const waterTex = ctex(128, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2f95c9'); g.addColorStop(1, '#4fb3dc');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2;
    const r = rng(51);
    for (let i = 0; i < 14; i++) { const y = r() * h, x = r() * w; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 20, y - 6, x + 40, y + 6, x + 62, y); c.stroke(); c.beginPath(); c.moveTo(x - w, y); c.bezierCurveTo(x - w + 20, y - 6, x - w + 40, y + 6, x - w + 62, y); c.stroke(); }
  }, true);
  const waterMat = new T.MeshBasicMaterial({ map: waterTex, vertexColors: true, side: T.DoubleSide });
  const fallMesh = FM.build(fallMat), waterMesh = water.build(waterMat);
  const poolMesh = poolM.build(waterMat);
  group.add(fallMesh, waterMesh, poolMesh);

  // el dragón de jade enroscado en una columna de piedra
  const DX = 7800, DY = 8600;
  addP(DX, DY, 1700);
  {
    const rockG = new T.IcosahedronGeometry(1, 0);
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, sc = 400 + rand() * 260;
      M.geo(rockG, mat4(DX + Math.cos(a) * 560, DY + Math.sin(a) * 560, G + 120, rand(), rand(), rand(), sc, sc * (0.8 + rand() * 0.4), sc * 0.7), STONE2);
    }
    M.geo(new T.CylinderGeometry(430, 560, 3400, 9), mat4(DX, DY, G + 1700, Math.PI / 2), STONE);
    M.geo(new T.CylinderGeometry(520, 470, 160, 9), mat4(DX, DY, G + 3480, Math.PI / 2), STONE2);
    const toC = Math.atan2(-DY, -DX), loops = 3.1, N = 46, pts = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N, ang = toC + (u - 1) * loops * TAU, rad = 700 + 70 * Math.sin(u * 14);
      pts.push(new T.Vector3(DX + Math.cos(ang) * rad, DY + Math.sin(ang) * rad, G + 380 + u * 2950 + 130 * Math.sin(u * 19)));
    }
    const pe = pts[pts.length - 1], rad2 = new T.Vector3(Math.cos(toC), Math.sin(toC), 0), tan2 = new T.Vector3(-Math.sin(toC), Math.cos(toC), 0);
    const ext = (r2, t2, zz) => pts.push(pe.clone().addScaledVector(rad2, r2).addScaledVector(tan2, t2).add(new T.Vector3(0, 0, zz)));
    ext(260, 330, 90); ext(800, 520, 260); ext(1450, 380, 420); ext(2050, 140, 380);
    const curve = new T.CatmullRomCurve3(pts, false, 'centripetal');
    const TS = 300, RS = 10;
    const tg = new T.TubeGeometry(curve, TS, 1, RS, false);
    const pa = tg.attributes.position, colA = new Float32Array(pa.count * 3);
    const radAt = (u) => 70 + 230 * sstep(0, 0.55, u) - 55 * sstep(0.9, 1, u);
    const jadeT = col(0x1f7f6a), jadeB = col(0x3fd0a2), belly = col(0xe6dca8), cc = new T.Color();
    for (let i = 0; i < pa.count; i++) {
      const ti = Math.floor(i / (RS + 1)), j = i % (RS + 1), u = ti / TS, c0 = curve.getPointAt(u);
      const dx = pa.getX(i) - c0.x, dy = pa.getY(i) - c0.y, dz = pa.getZ(i) - c0.z, rr = radAt(u);
      pa.setXYZ(i, c0.x + dx * rr, c0.y + dy * rr, c0.z + dz * rr);
      const band = (((ti >> 1) + (j >> 1)) & 1) ? 1 : 0.8;
      cc.copy(dz / (Math.hypot(dx, dy, dz) || 1) < -0.4 ? belly : mixc(jadeT, jadeB, sstep(0, 0.6, u))).multiplyScalar(band);
      colA[i * 3] = cc.r; colA[i * 3 + 1] = cc.g; colA[i * 3 + 2] = cc.b;
    }
    tg.setAttribute('color', new T.BufferAttribute(colA, 3));
    M.geo(tg, new T.Matrix4(), null);
    // espinas dorsales
    const up = new T.Vector3(0, 0, 1);
    for (let u = 0.08; u < 0.97; u += 0.014) {
      const p = curve.getPointAt(u), r = radAt(u);
      const out = u < 0.82 ? new T.Vector3(p.x - DX, p.y - DY, 0.35 * r).normalize() : up.clone();
      const h = 90 + r * 0.8;
      const cg = new T.ConeGeometry(r * 0.2, h, 5); cg.translate(0, h / 2, 0);
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), out);
      const pos = p.clone().addScaledVector(out, r * 0.92);
      M.geo(cg, new T.Matrix4().compose(pos, q, new T.Vector3(1, 1, 1)), mixc(GOLD, col(0xffd27a), u));
    }
    // cabeza: base local (x adelante, y izquierda, z arriba)
    const hp = pts[pts.length - 1], hf = curve.getTangentAt(1).normalize();
    const hz = up.clone().sub(hf.clone().multiplyScalar(up.dot(hf))).normalize(), hy = hz.clone().cross(hf).normalize();
    const hm = new T.Matrix4().makeBasis(hf, hy, hz).setPosition(hp);
    const part = (g, lm, c) => M.geo(g, hm.clone().multiply(lm), c);
    const lm = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => mat4(x, y, z, rx, ry, rz, sx, sy, sz);
    const jade = col(0x35bf94), jade2 = col(0x28957a), bone = col(0xf1e3b4);
    part(new T.IcosahedronGeometry(300, 1), lm(0, 0, 0, 0, 0, 0, 1.3, 1, 0.9), jade);
    part(new T.BoxGeometry(760, 360, 250), lm(640, 0, -30, 0, 0.06, 0), jade);
    part(new T.BoxGeometry(260, 330, 160), lm(1040, 0, -20, 0, 0.1, 0), jade2);
    part(new T.BoxGeometry(700, 300, 110), lm(560, 0, -200, 0, -0.16, 0), jade2);
    part(new T.IcosahedronGeometry(70, 0), lm(1160, 90, 50), col(0x123b32));
    part(new T.IcosahedronGeometry(70, 0), lm(1160, -90, 50), col(0x123b32));
    for (const sg of [-1, 1]) {
      for (let k = 0; k < 4; k++) { const tg2 = new T.ConeGeometry(26, 90, 4); part(tg2, lm(560 + k * 150, sg * 120, -105, Math.PI, 0, 0), bone); }
      const hg = new T.ConeGeometry(70, 720, 6); hg.translate(0, 360, 0);
      const hq = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-0.8, sg * 0.35, 0.6).normalize());
      part(hg, new T.Matrix4().compose(new T.Vector3(-60, sg * 170, 230), hq, new T.Vector3(1, 1, 1)), bone);
      gloss.geo(new T.IcosahedronGeometry(52, 1), hm.clone().multiply(lm(300, sg * 215, 120)), col(0xffb030));
      part(new T.BoxGeometry(260, 90, 70), lm(300, sg * 205, 190, 0, 0, sg * 0.3), jade2);
      const wp = [];
      for (let k = 0; k <= 8; k++) { const f = k / 8; wp.push(new T.Vector3(1000 - f * 1800, sg * (110 + f * 450 + 90 * Math.sin(f * 5)), -40 - f * 450 + 120 * Math.sin(f * 7))); }
      const wg = new T.TubeGeometry(new T.CatmullRomCurve3(wp), 24, 16, 4, false);
      part(wg, lm(0, 0, 0), GOLD);
    }
    for (let k = 0; k < 6; k++) { // crines
      const cg = new T.ConeGeometry(50, 240 - k * 15, 4); cg.translate(0, (240 - k * 15) / 2, 0);
      const cq = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-0.5, 0, 1).normalize());
      part(cg, new T.Matrix4().compose(new T.Vector3(-200 - k * 150, 0, 220 - k * 14), cq, new T.Vector3(1, 1, 1)), GOLD);
    }
  }

  // estandartes rojos con el emblema propio
  const banTex = ctex(128, 320, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d24437'); g.addColorStop(1, '#8e1f20');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#e3b24d'; c.lineWidth = 7; c.strokeRect(5, 5, w - 10, h - 10);
    drawEmblem(c, w / 2, h * 0.42, 42, '#e3b24d', '#ffe9a8');
    c.fillStyle = '#e3b24d'; c.beginPath(); c.moveTo(w * 0.25, h - 6); c.lineTo(w * 0.5, h - 56); c.lineTo(w * 0.75, h - 6); c.closePath(); c.fill();
  });
  const BM = new Mesher(true);
  const bw = new T.Color(1, 1, 1);
  for (const sx of [-1, 1]) for (const yy of [-3600, -1200, 1200, 3600]) {
    const x = sx * (4096 + 1950);
    BM.quad([x, yy - 260, 360], [x, yy + 260, 360], [x, yy + 260, 2260], [x, yy - 260, 2260], bw, bw, bw, bw, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    M.box(x, yy, 2330, 50, 640, 60, DRED, GOLD);
    for (const dy of [-280, 280]) M.box(x, yy + dy, G + 1200, 36, 36, 2500, DRED, GOLD);
    M.geo(new T.IcosahedronGeometry(50, 0), mat4(x, yy, 2420), GOLD);
  }
  group.add(BM.build(new T.MeshBasicMaterial({ map: banTex, vertexColors: true, side: T.DoubleSide })));

  // cerezos en flor
  const trees = new Mesher(false, sunLight);
  const pinks = [0xf7a8c4, 0xf48fb1, 0xfbc4d8, 0xee82ab, 0xffd1e0, 0xf9b6cf].map(col);
  const ico = new T.IcosahedronGeometry(1, 1), trunkG = new T.CylinderGeometry(0.62, 1, 1, 6, 1).rotateX(Math.PI / 2);
  const tree = (x, y, sc) => {
    const h = (620 + rand() * 360) * sc, tl = (rand() - 0.5) * 0.25, tr = rand() * TAU;
    trees.geo(trunkG, mat4(x + Math.sin(tl) * h * 0.2, y, G + h / 2, Math.sin(tr) * tl, Math.cos(tr) * tl, 0, 36 * sc, 36 * sc, h), col(0x4a3226));
    const n = 6 + (rand() * 4 | 0);
    for (let k = 0; k < n; k++) {
      const a = rand() * TAU, d = rand() * 330 * sc, r = (190 + rand() * 190) * sc;
      trees.geo(ico, mat4(x + Math.cos(a) * d, y + Math.sin(a) * d, G + h + (rand() * 260 - 40) * sc, rand() * 3, rand() * 3, rand() * 3, r, r, r * 0.85), pinks[(rand() * pinks.length) | 0]);
    }
  };
  let nTrees = 0;
  const treeOk = (x, y) => !inRing(x, y, 2250) && !placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 350) && !(Math.abs(Math.abs(x) - RIVX) < 1500 && Math.abs(y) < RL + 800);
  for (const sx of [-1, 1]) for (const yy of [-3300, -1100, 1100, 3300]) { tree(sx * (4096 + 2750), yy, 1.15); nTrees++; }
  for (const sy of [-1, 1]) for (const xx of [-1800, 1800]) { tree(xx, sy * (6420 + 2800), 1.15); nTrees++; }
  for (let tries = 0; nTrees < 56 && tries < 800; tries++) {
    const a = rand() * TAU, r = 6800 + rand() * 7500, x = Math.cos(a) * r, y = Math.sin(a) * r * 1.1;
    if (!treeOk(x, y)) continue;
    tree(x, y, 1.1 + rand() * 0.8); nTrees++;
  }
  group.add(trees.build(vcMat()));

  group.add(M.build(vcMat()));
  group.add(gloss.build(vcMat()));

  // nubes (planos con textura) que giran muy despacio
  const cloudTex = ctex(256, 128, (c, w, h) => {
    const r = rng(61);
    for (let k = 0; k < 16; k++) {
      const x = w * (0.18 + r() * 0.64), y = h * (0.5 + (r() - 0.5) * 0.25), rr = 18 + r() * 26;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.6, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  });
  const CM = new Mesher(true), cloudGroup = new T.Group();
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * TAU + rand() * 0.2, r = 14000 + rand() * 12000, z = 4200 + rand() * 6500, w = 5000 + rand() * 4500, h = w * 0.42;
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r, tx = -Math.sin(a) * w / 2, ty = Math.cos(a) * w / 2;
    const cw = new T.Color(1, 0.99, 0.96);
    CM.quad([cx - tx, cy - ty, z - h / 2], [cx + tx, cy + ty, z - h / 2], [cx + tx, cy + ty, z + h / 2], [cx - tx, cy - ty, z + h / 2], cw, cw, cw, cw, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  const clouds = CM.build(new T.MeshBasicMaterial({ map: cloudTex, vertexColors: true, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false }));
  cloudGroup.add(clouds); group.add(cloudGroup);

  // brillo de los farolillos (un solo Points con halos)
  const glowTex = ctex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const lg = new T.BufferGeometry();
  lg.setAttribute('position', new T.Float32BufferAttribute(lanternPts, 3));
  lg.setAttribute('color', new T.Float32BufferAttribute(lanternCols, 3));
  const lanternGlow = new T.Points(lg, new T.PointsMaterial({ size: 330, map: glowTex, vertexColors: true, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false }));
  lanternGlow.frustumCulled = false; group.add(lanternGlow);

  // pétalos cayendo
  const NP = 360, pp = new Float32Array(NP * 3), pv = new Float32Array(NP * 3);
  const spawn = (i, anyZ) => {
    for (let k = 0; k < 20; k++) {
      const x = (rand() - 0.5) * 24000, y = (rand() - 0.5) * 28000;
      if (inRing(x, y, 600)) continue;
      pp[i * 3] = x; pp[i * 3 + 1] = y; break;
    }
    pp[i * 3 + 2] = anyZ ? rand() * 2600 : 2400 + rand() * 300;
    pv[i * 3] = 30 + rand() * 60; pv[i * 3 + 1] = (rand() - 0.5) * 50; pv[i * 3 + 2] = 70 + rand() * 80;
  };
  for (let i = 0; i < NP; i++) { spawn(i, true); pp[i * 3] += 0; }
  const petalTex = ctex(32, 32, (c, w, h) => {
    c.fillStyle = '#ffb7d0'; c.beginPath(); c.ellipse(16, 16, 7, 12, 0.6, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.ellipse(14, 12, 3, 6, 0.6, 0, TAU); c.fill();
  });
  const petalGeo = new T.BufferGeometry();
  petalGeo.setAttribute('position', new T.BufferAttribute(pp, 3));
  const petals = new T.Points(petalGeo, new T.PointsMaterial({ size: 38, map: petalTex, transparent: true, alphaTest: 0.25, depthWrite: false, sizeAttenuation: true }));
  petals.frustumCulled = false; group.add(petals);

  let t = 0, low = false;
  return {
    group,
    update(dt) {
      t += dt;
      waterTex.offset.y -= dt * 0.12; // el río fluye hacia el campo
      fallTex.offset.y -= dt * 0.9;
      lanternGlow.material.opacity = 0.7 + 0.12 * Math.sin(t * 2.2);
      cloudGroup.rotation.z += dt * 0.0025;
      if (low) return;
      const n = NP;
      for (let i = 0; i < n; i++) {
        pp[i * 3] += (pv[i * 3] + Math.sin(t * 0.8 + i) * 40) * dt;
        pp[i * 3 + 1] += (pv[i * 3 + 1] + Math.cos(t * 0.6 + i * 1.7) * 30) * dt;
        pp[i * 3 + 2] -= pv[i * 3 + 2] * dt;
        if (pp[i * 3 + 2] < G + 20) spawn(i, false);
      }
      petalGeo.attributes.position.needsUpdate = true;
    },
    setQuality(l) { low = !!l; petals.visible = !low; clouds.visible = !low; lanternGlow.visible = !low; },
  };
}
