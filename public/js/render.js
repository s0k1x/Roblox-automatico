// Render Three.js del estadio «Balón Turbo». Eje Z hacia arriba, unidades = uu (cm).
// Todo el arte (estadio, coches, carteles) es de diseño propio y se genera por código.
import * as THREE from 'three';
import { buildTheme } from './maps.js';
import { CUSTOM_BODIES, preloadCarModels, hasCarModel, glbBody } from './cars.js';
import { ARENA, BOOST_PADS, shrunkPlan, wallDist, wallNormal } from '../shared/arena.js';
import { HITBOXES, TEAM_COLORS, PHYS } from '../shared/constants.js';

const { HX, HY, H, EDGE_R, GW, GH, GD, CORNER } = ARENA;
const BALL_R = PHYS.BALL_RADIUS;
const D2R = Math.PI / 180;
const SQ2 = Math.SQRT2;

const DEFAULT_CAM = { fov: 110, dist: 270, height: 110, angle: -3, stiff: 0.45, swivel: 4.7, transition: 1.2, shake: false };

// ---------- utilidades ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function teamHex(t) { return TEAM_COLORS[t]; }

// Octógono (planta del estadio) con las esquinas cortadas a 45°, en sentido antihorario.
function octVerts(hx, hy, c) {
  return [[hx, -(hy - c)], [hx, hy - c], [hx - c, hy], [-(hx - c), hy], [-hx, hy - c], [-hx, -(hy - c)], [-(hx - c), -hy], [hx - c, -hy]];
}
// Octógono de la pared real desplazado d hacia fuera.
function octTrue(d) { return octVerts(HX + d, HY + d, CORNER + d * (2 - SQ2)); }

// ---------- malla de paredes (datos puros, sin DOM: se comprueba contra wallDist) ----------
// Muestras del perímetro del octógono reducido: en los vértices el punto queda fijo y la normal
// barre en arco de la normal de un lado a la del siguiente (arista vertical redondeada, radio EDGE_R).
export function wallSamples() {
  const s = shrunkPlan(HY);
  const V = octVerts(s.hx, s.hy, s.c);
  const N = V.map((a, i) => {
    const b = V[(i + 1) % 8];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    return [dy / l, -dx / l]; // normal exterior
  });
  const out = [];
  const K = 6;
  for (let i = 0; i < 8; i++) {
    const na = N[(i + 7) % 8], nb = N[i];
    const a0 = Math.atan2(na[1], na[0]);
    const da = Math.atan2(na[0] * nb[1] - na[1] * nb[0], na[0] * nb[0] + na[1] * nb[1]);
    for (let k = 0; k <= K; k++) {
      const a = a0 + da * (k / K);
      out.push({ x: V[i][0], y: V[i][1], nx: Math.cos(a), ny: Math.sin(a), arc: true, vi: i });
    }
    // puntos extra sobre el lado recto (cambio de color de mitad y bordes de la boca de portería)
    const ex = [];
    if (i === 0) for (const y of [-120, 120]) ex.push([s.hx, y]);
    if (i === 4) for (const y of [120, -120]) ex.push([-s.hx, y]);
    if (i === 2) for (const x of [GW, -GW]) ex.push([x, s.hy]);
    if (i === 6) for (const x of [-GW, GW]) ex.push([x, -s.hy]);
    for (const [x, y] of ex) out.push({ x, y, nx: nb[0], ny: nb[1], arc: false, vi: -1 });
  }
  out.push({ ...out[0] }); // cierre del lazo sin saltos de uv
  return out;
}

// Perfil vertical de la pared: [desplazamiento sobre la normal, altura].
function wallProfile() {
  const prof = [];
  for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI / 2; prof.push([EDGE_R * Math.sin(t), EDGE_R * (1 - Math.cos(t))]); }
  prof.push([EDGE_R, GH]);
  prof.push([EDGE_R, H - EDGE_R]);
  for (let i = 1; i <= 8; i++) { const t = (i / 8) * Math.PI / 2; prof.push([EDGE_R * Math.cos(t), H - EDGE_R + EDGE_R * Math.sin(t)]); }
  return prof;
}

const COL_BLUE = [0.18, 0.55, 1.0], COL_ORANGE = [1.0, 0.54, 0.12];
function halfColor(y, mixWhite = 0) {
  const t = smooth((y + 140) / 280);
  const c = [0, 1, 2].map((k) => COL_BLUE[k] + (COL_ORANGE[k] - COL_BLUE[k]) * t);
  return c.map((v) => v + (1 - v) * mixWhite);
}

export function buildWallData() {
  const smp = wallSamples();
  const prof = wallProfile();
  const M = smp.length, P = prof.length;
  const pos = [], uv = [], col = [], idx = [];
  let arcLen = 0;
  for (let i = 0; i < M; i++) {
    const p = smp[i];
    if (i) {
      const q = smp[i - 1];
      arcLen += Math.hypot(p.x + p.nx * EDGE_R - q.x - q.nx * EDGE_R, p.y + p.ny * EDGE_R - q.y - q.ny * EDGE_R);
    }
    const c = halfColor(p.y, 0.35);
    for (let j = 0; j < P; j++) {
      pos.push(p.x + p.nx * prof[j][0], p.y + p.ny * prof[j][0], prof[j][1]);
      uv.push(arcLen / 512, prof[j][1] / 512);
      col.push(c[0], c[1], c[2]);
    }
  }
  const sh = shrunkPlan(HY);
  for (let i = 0; i < M - 1; i++) {
    const a = smp[i], b = smp[i + 1];
    // boca de la portería: en la pared de fondo no hay pared por debajo del larguero
    const inMouth = Math.abs(a.y) > sh.hy - 1 && Math.abs(b.y) > sh.hy - 1 && a.y * b.y > 0 && Math.abs(a.x) <= GW + 0.01 && Math.abs(b.x) <= GW + 0.01;
    for (let j = 0; j < P - 1; j++) {
      if (inMouth && prof[j + 1][1] <= GH + 0.01) continue;
      const v00 = i * P + j, v01 = i * P + j + 1, v10 = (i + 1) * P + j, v11 = (i + 1) * P + j + 1;
      idx.push(v00, v10, v11, v00, v11, v01);
    }
  }
  return { pos, uv, col, idx, P, M, smp, prof };
}

// Banda luminosa pegada a la pared entre alturas zA..zB (con vértices del color de la mitad).
function wallBand(smp, zA, zB, only, off = EDGE_R - 2) {
  const pos = [], col = [], idx = [];
  const n = smp.length;
  for (const p of smp) {
    const c = halfColor(p.y, 0.1);
    pos.push(p.x + p.nx * off, p.y + p.ny * off, zA, p.x + p.nx * off, p.y + p.ny * off, zB);
    col.push(c[0], c[1], c[2], c[0], c[1], c[2]);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = smp[i], b = smp[i + 1];
    if (only === 'post' && !(a.arc && b.arc && a.vi === b.vi)) continue;
    const a0 = i * 2, a1 = a0 + 1, b0 = a0 + 2, b1 = a0 + 3;
    idx.push(a0, b0, b1, a0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// ---------- partículas ----------
function createParticles(scene) {
  const N = 2500;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 4);
  const siz = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const age = new Float32Array(N).fill(1e9);
  const size0 = new Float32Array(N);
  const rgb = new Float32Array(N * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 500 } },
    vertexShader: `attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
      void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=aSize*uScale/max(1.0,-mv.z); }`,
    fragmentShader: `varying vec4 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.05,d); gl_FragColor=vec4(vC.rgb, a*vC.a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  scene.add(pts);
  let next = 0;
  return {
    mat,
    emit(p, v, lf, sz, r, gg, b) {
      const i = next; next = (next + 1) % N;
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
      vel[i * 3] = v[0]; vel[i * 3 + 1] = v[1]; vel[i * 3 + 2] = v[2];
      life[i] = lf; age[i] = 0; size0[i] = sz;
      rgb[i * 3] = r; rgb[i * 3 + 1] = gg; rgb[i * 3 + 2] = b;
    },
    update(dt) {
      const drag = Math.exp(-1.6 * dt);
      for (let i = 0; i < N; i++) {
        if (age[i] >= life[i]) { siz[i] = 0; col[i * 4 + 3] = 0; continue; }
        age[i] += dt;
        const k = age[i] / life[i];
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        vel[i * 3] *= drag; vel[i * 3 + 1] *= drag; vel[i * 3 + 2] *= drag;
        const f = Math.max(0, 1 - k);
        col[i * 4] = rgb[i * 3]; col[i * 4 + 1] = rgb[i * 3 + 1]; col[i * 4 + 2] = rgb[i * 3 + 2];
        col[i * 4 + 3] = f * f;
        siz[i] = size0[i] * (0.6 + 0.8 * k);
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.aColor.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    },
  };
}

// ---------- ambientación exterior ----------
function radialTex(inner, outer) {
  return canvasTex(64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner); g.addColorStop(1, outer);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
}

function buildSky(scene) {
  const tex = canvasTex(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04061a'); g.addColorStop(0.32, '#10194a'); g.addColorStop(0.46, '#3a2a63');
    g.addColorStop(0.5, '#c4577a'); g.addColorStop(0.52, '#1a1738'); g.addColorStop(1, '#090c1c');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * h * 0.42;
      c.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.45})`;
      const s = 1;
      c.fillRect(Math.random() * w, y, s, s);
    }
  });
  const geo = new THREE.SphereGeometry(30000, 32, 16);
  geo.rotateX(Math.PI / 2);
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

// Cartel plano vertical que mira hacia el centro del campo (dir = ángulo hacia el que mira).
function signMesh(w, h, tex, x, y, z, faceAngle, opaque = true) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(Math.PI / 2); // normal -y
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: !opaque, fog: false }));
  m.position.set(x, y, z);
  m.rotation.z = faceAngle + Math.PI / 2;
  return m;
}

function buildSurroundings(scene) {
  const root = new THREE.Group();
  scene.add(root);
  // suelo exterior
  const gtex = canvasTex(256, 256, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, '#2b3350'); g.addColorStop(0.28, '#1b2036'); g.addColorStop(0.5, '#10142a'); g.addColorStop(1, '#0a0d1d');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(29000, 48), new THREE.MeshBasicMaterial({ map: gtex }));
  ground.position.z = -3;
  root.add(ground);
  // anillo de explanada con vallas luminosas
  const ring = [];
  const o1 = octTrue(0), o2 = octTrue(1150);
  for (let i = 0; i < 8; i++) {
    const a = o1[i], b = o1[(i + 1) % 8], c2 = o2[(i + 1) % 8], d = o2[i];
    ring.push(a[0], a[1], -1.5, b[0], b[1], -1.5, c2[0], c2[1], -1.5, a[0], a[1], -1.5, c2[0], c2[1], -1.5, d[0], d[1], -1.5);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
  rg.computeVertexNormals();
  root.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: 0x232a47, side: THREE.DoubleSide })));

  // vallas publicitarias (con hueco ante las porterías)
  const boardTex = canvasTex(1024, 64, (c, w, h) => {
    c.fillStyle = '#0a0e22'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#39b4ff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#ff9a3c');
    c.fillStyle = g; c.font = 'bold 40px "Trebuchet MS", sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillText('BALÓN TURBO', w * 0.3, h / 2 + 2);
    c.fillText('BALÓN TURBO', w * 0.8, h / 2 + 2);
    c.fillStyle = '#39f3c8'; c.fillRect(0, 0, w, 4); c.fillRect(0, h - 4, w, 4);
    c.fillStyle = '#ff9a3c'; c.fillRect(w * 0.53, 8, 10, h - 16);
    c.fillStyle = '#39b4ff'; c.fillRect(w * 0.03, 8, 10, h - 16);
  }, true);
  const ob = octTrue(340);
  const segs = [];
  for (let i = 0; i < 8; i++) {
    const a = ob[i], b = ob[(i + 1) % 8];
    if (i === 2 || i === 6) { // lados de las porterías: dos tramos con hueco central
      const s = i === 2 ? 1 : -1;
      segs.push([a[0], a[1], s * 1300, a[1]], [-s * 1300, a[1], b[0], b[1]]);
    } else segs.push([a[0], a[1], b[0], b[1]]);
  }
  const bp = [], bu = [];
  for (const [ax, ay, bx, by] of segs) {
    const u = Math.hypot(bx - ax, by - ay) / 1500;
    bp.push(ax, ay, 0, bx, by, 0, bx, by, 150, ax, ay, 0, bx, by, 150, ax, ay, 150);
    bu.push(0, 0, u, 0, u, 1, 0, 0, u, 1, 0, 1);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2));
  root.add(new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: boardTex, side: THREE.DoubleSide })));

  // gradas escalonadas
  const STEPS = 12, D0 = 1150, TREAD = 270, RISE = 190;
  const tre = [], ris = [];
  const dOf = (k) => D0 + k * TREAD;
  for (let k = 0; k < STEPS; k++) {
    const zk = (k + 1) * RISE, zp = k * RISE;
    const oi = octTrue(dOf(k)), oo = octTrue(dOf(k + 1));
    for (let i = 0; i < 8; i++) {
      const a = oi[i], b = oi[(i + 1) % 8], c = oo[(i + 1) % 8], d = oo[i];
      tre.push(a[0], a[1], zk, b[0], b[1], zk, c[0], c[1], zk, a[0], a[1], zk, c[0], c[1], zk, d[0], d[1], zk);
      ris.push(a[0], a[1], zp, b[0], b[1], zp, b[0], b[1], zk, a[0], a[1], zp, b[0], b[1], zk, a[0], a[1], zk);
    }
  }
  const mk = (arr, color) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  };
  root.add(mk(tre, 0x3a4468), mk(ris, 0x1a2038));
  // muro trasero de la grada
  const back = [];
  const ot = octTrue(dOf(STEPS)), top = STEPS * RISE;
  for (let i = 0; i < 8; i++) {
    const a = ot[i], b = ot[(i + 1) % 8];
    back.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], top + 700, a[0], a[1], 0, b[0], b[1], top + 700, a[0], a[1], top + 700);
  }
  root.add(mk(back, 0x10142a));

  // público: una sola malla instanciada (≤ 6000)
  const MAXC = 5800;
  let totalLen = 0;
  const rings = [];
  for (let k = 0; k < STEPS; k++) {
    const v = octTrue(dOf(k) + TREAD * 0.5);
    rings.push(v);
    for (let i = 0; i < 8; i++) totalLen += Math.hypot(v[(i + 1) % 8][0] - v[i][0], v[(i + 1) % 8][1] - v[i][1]);
  }
  const spacing = Math.max(105, totalLen / MAXC);
  const capGeo = new THREE.CapsuleGeometry(15, 30, 1, 5);
  capGeo.rotateX(Math.PI / 2);
  const crowd = new THREE.InstancedMesh(capGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 6000);
  const pal = [0xe8edf7, 0xb7c0d6, 0xf6d56a, 0x62d6a5, 0xb58cff, 0xff7088, 0x8896b3];
  const tmpC = new THREE.Color();
  const mtx = new THREE.Matrix4();
  let cnt = 0;
  for (let k = 0; k < STEPS && cnt < MAXC; k++) {
    const v = rings[k], zk = (k + 1) * RISE;
    for (let i = 0; i < 8; i++) {
      const a = v[i], b = v[(i + 1) % 8];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.floor(len / spacing);
      for (let s = 0; s < n && cnt < MAXC; s++) {
        const t = (s + 0.5 + (Math.random() - 0.5) * 0.4) / n;
        const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        const sc = 0.85 + Math.random() * 0.3;
        mtx.makeScale(sc, sc, sc);
        mtx.setPosition(x, y, zk + 33 * sc);
        crowd.setMatrixAt(cnt, mtx);
        const pTeam = 0.62;
        if (Math.random() < pTeam) tmpC.set(y < 0 ? 0x2f8cff : 0xff8a1f).multiplyScalar(0.55 + Math.random() * 0.6);
        else tmpC.set(pal[(Math.random() * pal.length) | 0]).multiplyScalar(0.7 + Math.random() * 0.3);
        crowd.setColorAt(cnt, tmpC);
        cnt++;
      }
    }
  }
  crowd.count = cnt;
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  crowd.frustumCulled = false;
  root.add(crowd);

  // carteles «BALÓN TURBO» sobre las gradas
  const signTex = canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = '#080c1e'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#2f8cff'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#ff8a1f');
    c.lineWidth = 10; c.strokeStyle = g; c.strokeRect(10, 10, w - 20, h - 20);
    c.font = 'italic bold 128px "Trebuchet MS", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = '#7fd0ff'; c.shadowBlur = 24;
    c.fillStyle = g; c.fillText('BALÓN TURBO', w / 2, h / 2 + 6);
  });
  const sz0 = top + 1200;
  const signs = [];
  for (const [dx, dy, dist, w] of [[0, 1, HY + dOf(STEPS) - 200, 5600], [0, -1, HY + dOf(STEPS) - 200, 5600], [1, 0, HX + dOf(STEPS) - 200, 5600], [-1, 0, HX + dOf(STEPS) - 200, 5600]]) {
    const s = signMesh(w, w / 4, signTex, dx * dist, dy * dist, sz0, Math.atan2(-dy, -dx));
    root.add(s); signs.push(s);
  }

  // torres de focos
  const lampTex = canvasTex(128, 96, (c, w, h) => {
    c.fillStyle = '#20263a'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) {
      const g = c.createRadialGradient(x * 21 + 12, y * 24 + 12, 1, x * 21 + 12, y * 24 + 12, 11);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#fff3c8'); g.addColorStop(1, '#6a6450');
      c.fillStyle = g; c.fillRect(x * 21 + 1, y * 24 + 1, 20, 22);
    }
  });
  const haloTex = radialTex('rgba(255,244,210,0.95)', 'rgba(255,244,210,0)');
  const halos = [];
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x30384f });
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const px = sx * 9600, py = sy * 10800, ph = 5200;
    const g = new THREE.Group();
    g.position.set(px, py, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(90, 190, ph, 8), poleMat);
    pole.rotation.x = Math.PI / 2; pole.position.z = ph / 2;
    g.add(pole);
    const head = new THREE.Group();
    head.position.z = ph + 400;
    head.rotation.z = Math.atan2(-py, -px);
    head.rotation.y = 0.0;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(180, 2300, 1500), poleMat);
    head.add(frame);
    const pg = new THREE.PlaneGeometry(2200, 1400);
    pg.rotateY(Math.PI / 2); // normal +x (hacia el campo)
    const panel = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: lampTex, fog: false }));
    panel.position.x = 95;
    head.add(panel);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    halo.scale.set(6200, 6200, 1); halo.position.x = 400;
    head.add(halo);
    halos.push(halo);
    g.add(head);
    root.add(g);
  }
  return {
    root,
    setQuality(low) { crowd.visible = !low; halos.forEach((h) => { h.visible = !low; }); },
    setJump(a, t) { crowd.position.z = a > 0.5 ? Math.abs(Math.sin(t * 9)) * a : 0; },
  };
}

// ---------- marcador flotante ----------
function buildScoreboard(scene) {
  const W = 640, Hh = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = Hh;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  let lastKey = '';
  function draw(blue, orange, label) {
    ctx.fillStyle = '#080c1e'; ctx.fillRect(0, 0, W, Hh);
    ctx.fillStyle = '#2f8cff'; ctx.fillRect(0, 0, W * 0.32, 10);
    ctx.fillStyle = '#ff8a1f'; ctx.fillRect(W * 0.68, 0, W * 0.32, 10);
    ctx.fillStyle = '#39f3c8'; ctx.fillRect(W * 0.32, 0, W * 0.36, 10);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 150px "Trebuchet MS", sans-serif';
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#2f8cff'; ctx.fillStyle = '#9ccaff'; ctx.fillText(String(blue), W * 0.14, Hh * 0.52);
    ctx.shadowColor = '#ff8a1f'; ctx.fillStyle = '#ffc890'; ctx.fillText(String(orange), W * 0.86, Hh * 0.52);
    ctx.shadowBlur = 0;
    ctx.font = 'bold 82px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, W / 2, Hh * 0.46);
    ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
    ctx.fillStyle = '#7e8bb0'; ctx.fillText('BALÓN TURBO', W / 2, Hh * 0.82);
    tex.needsUpdate = true;
  }
  draw(0, 0, '5:00');
  const grp = new THREE.Group();
  grp.position.set(0, 0, 1640);
  const body = new THREE.Mesh(new THREE.BoxGeometry(690, 690, 300), new THREE.MeshLambertMaterial({ color: 0x151a30 }));
  grp.add(body);
  const panelMat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    const g = new THREE.PlaneGeometry(680, 272);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, panelMat);
    m.position.set(Math.sin(a) * 346, -Math.cos(a) * 346, 0);
    m.rotation.z = a;
    grp.add(m);
  }
  const cable = new THREE.CylinderGeometry(8, 8, 200, 6);
  cable.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const c = new THREE.Mesh(cable, new THREE.MeshBasicMaterial({ color: 0x4d5778 }));
    c.position.set(sx * 280, sy * 280, 240);
    grp.add(c);
  }
  scene.add(grp);
  return {
    update(state) {
      let label;
      if (state.freePlay) label = 'LIBRE';
      else {
        const t = Math.max(0, Math.ceil(state.clock || 0));
        label = (state.overtime ? '+' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
      }
      const key = state.score[0] + '|' + state.score[1] + '|' + label;
      if (key === lastKey) return;
      lastKey = key;
      draw(state.score[0], state.score[1], label);
    },
  };
}

// ---------- estadio ----------
function buildStadium(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const s = shrunkPlan(HY);
  const plan = octVerts(s.hx, s.hy, s.c);

  // Suelo: octógono reducido
  const shape = new THREE.Shape();
  plan.forEach((p, i) => (i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1])));
  shape.closePath();
  const fg = new THREE.ShapeGeometry(shape);
  const fp = fg.attributes.position;
  const fuv = fg.attributes.uv;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, (fp.getX(i) + HX) / (2 * HX), (fp.getY(i) + HY) / (2 * HY));
  const floorTex = canvasTex(1536, 1920, (c, w, h) => {
    const sx = w / (2 * HX), sy = h / (2 * HY);
    const X = (x) => (x + HX) * sx, Y = (y) => (HY - y) * sy;
    c.fillStyle = '#2f7a43'; c.fillRect(0, 0, w, h);
    // franjas de corte alternas
    const bands = 14, bh = h / bands;
    for (let k = 0; k < bands; k++) {
      c.fillStyle = k % 2 ? 'rgba(255,255,255,0.075)' : 'rgba(0,25,0,0.10)';
      c.fillRect(0, k * bh, w, bh);
    }
    // grano de césped
    for (let i = 0; i < 26000; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,30,0,0.06)';
      c.fillRect(Math.random() * w, Math.random() * h, 2, 5);
    }
    // tinte suave de cada mitad
    c.fillStyle = 'rgba(40,110,255,0.13)'; c.fillRect(0, Y(0), w, h - Y(0));
    c.fillStyle = 'rgba(255,140,40,0.13)'; c.fillRect(0, 0, w, Y(0));
    // líneas blancas
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = 'rgba(245,250,255,0.9)'; c.lineWidth = 7;
    c.beginPath(); plan.forEach((p, i) => (i ? c.lineTo(X(p[0] * 0.985), Y(p[1] * 0.985)) : c.moveTo(X(p[0] * 0.985), Y(p[1] * 0.985)))); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(X(-s.hx), Y(0)); c.lineTo(X(s.hx), Y(0)); c.stroke();
    c.beginPath(); c.arc(X(0), Y(0), 1000 * sx, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(X(0), Y(0), 70 * sx, 0, Math.PI * 2); c.fillStyle = 'rgba(245,250,255,0.9)'; c.fill();
    for (const sg of [-1, 1]) {
      c.strokeStyle = sg < 0 ? 'rgba(120,185,255,0.95)' : 'rgba(255,190,120,0.95)';
      const yEnd = sg * s.hy * 0.985;
      c.strokeRect(X(-1800), Y(sg < 0 ? yEnd + 1700 : yEnd), 3600 * sx, 1700 * sy);
      c.strokeRect(X(-900), Y(sg < 0 ? yEnd + 700 : yEnd), 1800 * sx, 700 * sy);
      c.beginPath(); c.arc(X(0), Y(yEnd - sg * 1700), 600 * sx, sg < 0 ? 0 : Math.PI, sg < 0 ? Math.PI : Math.PI * 2, sg > 0); c.stroke();
      c.fillStyle = c.strokeStyle; c.beginPath(); c.arc(X(0), Y(yEnd - sg * 1100), 28 * sx, 0, Math.PI * 2); c.fill();
    }
  });
  const floor = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ map: floorTex }));
  root.add(floor);

  // Techo tenue
  const ceil = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x1b3a66, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  ceil.position.z = H;
  root.add(ceil);

  // Paredes de cristal
  const wd = buildWallData();
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wd.pos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wd.uv, 2));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wd.col, 3));
  wg.setIndex(wd.idx);
  const gridTex = canvasTex(128, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(170,215,255,0.20)'); g.addColorStop(0.5, 'rgba(170,215,255,0.06)'); g.addColorStop(1, 'rgba(170,215,255,0.20)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(210,235,255,0.55)'; c.lineWidth = 2;
    c.strokeRect(1, 1, w - 2, h - 2);
  }, true);
  const walls = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: gridTex, vertexColors: true, transparent: true, opacity: 0.36, side: THREE.DoubleSide, depthWrite: false }));
  walls.renderOrder = 2;
  root.add(walls);

  // Marco luminoso: bandas a ras de suelo y de techo, y postes en las aristas redondeadas
  const frameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const frames = [
    wallBand(wd.smp, 300, 372, 'all'),
    wallBand(wd.smp, H - 372, H - 300, 'all'),
    wallBand(wd.smp, 300, H - 300, 'post'),
    wallBand(wd.smp, GH, GH + 26, 'all'),
  ];
  const postMat = frameMat.clone(); postMat.opacity = 0.4;
  frames.forEach((g, i) => { const m = new THREE.Mesh(g, i === 2 ? postMat : frameMat); m.renderOrder = 3; root.add(m); });

  // Porterías
  const netTex = canvasTex(64, 64, (c, w, h) => {
    c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
  }, true);
  function quad(p0, p1, p2, p3, cell, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p3], 3));
    const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / cell;
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, d(p0, p1), 0, d(p0, p1), d(p1, p2), 0, d(p1, p2)], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(g, mat);
  }
  for (const [team, sg] of [[0, -1], [1, 1]]) {
    const hex = teamHex(team);
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, color: new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), 0.45), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const yi = sg * HY, yo = sg * (HY + GD);
    const gg = new THREE.Group();
    gg.add(quad([-GW, yo, 0], [GW, yo, 0], [GW, yo, GH], [-GW, yo, GH], 60, netMat));
    gg.add(quad([-GW, yi, GH], [-GW, yo, GH], [GW, yo, GH], [GW, yi, GH], 60, netMat));
    for (const x of [-GW, GW]) gg.add(quad([x, yi, 0], [x, yo, 0], [x, yo, GH], [x, yi, GH], 60, netMat));
    // suelo de la boca hasta el fondo de la red
    const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(0.3), side: THREE.DoubleSide });
    gg.add(quad([-GW, sg * s.hy, 0.5], [GW, sg * s.hy, 0.5], [GW, yo, 0.5], [-GW, yo, 0.5], 100, fm));
    // marco del color del equipo (brillante)
    const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), 0.2) });
    const post = new THREE.CylinderGeometry(15, 15, GH, 10);
    for (const x of [-GW, GW]) {
      const m = new THREE.Mesh(post, pm);
      m.rotation.x = Math.PI / 2; m.position.set(x, yi, GH / 2); gg.add(m);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, GD, 8), pm); // varillas traseras
      b.position.set(x, (yi + yo) / 2, GH); gg.add(b);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, GH, 8), pm);
      b2.rotation.x = Math.PI / 2; b2.position.set(x, yo, GH / 2); gg.add(b2);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 2 * GW, 10), pm);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, yi, GH); gg.add(bar);
    const bar2 = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 2 * GW, 8), pm);
    bar2.rotation.z = Math.PI / 2; bar2.position.set(0, yo, GH); gg.add(bar2);
    // halo de gol bajo el larguero
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW, GH), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = Math.PI / 2; halo.position.set(0, yo - sg * 2, GH / 2);
    gg.add(halo);
    root.add(gg);
  }
  return root;
}

// ---------- balón ----------
function buildBall() {
  const g = new THREE.IcosahedronGeometry(BALL_R, 2);
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3);
  const c1 = new THREE.Color('#f4f8ff'), c2 = new THREE.Color('#1c2a44'), c3 = new THREE.Color('#39f3c8');
  for (let f = 0; f < n / 3; f++) {
    const h = ((f * 2654435761) >>> 0) % 100;
    const c = h < 14 ? c2 : h < 24 ? c3 : c1;
    for (let k = 0; k < 3; k++) { cols[(f * 3 + k) * 3] = c.r; cols[(f * 3 + k) * 3 + 1] = c.g; cols[(f * 3 + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 60, emissive: 0x222a38 }));
  const grp = new THREE.Group();
  grp.add(mesh);
  grp.matrixAutoUpdate = false;
  return grp;
}

// ---------- coches (6 modelos originales, uno por clase de hitbox) ----------
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const hitEdges = new THREE.EdgesGeometry(boxGeo);
const cylXGeo = new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2); // eje a lo largo de x
const matCache = {};
const HEXRE = /^#[0-9a-fA-F]{6}$/;
function hexOr(v, fallback) { return typeof v === 'string' && HEXRE.test(v) ? v : fallback; }
// Colores efectivos de un coche: la pintura elegida o, si no hay, los del equipo.
function resolvePaint(team, paint) {
  const th = teamHex(team);
  const a = hexOr(paint && paint.a, th);
  return {
    a,
    b: hexOr(paint && paint.b, '#' + new THREE.Color(th).multiplyScalar(0.55).getHexString()),
    w: hexOr(paint && paint.w, '#8d97ab'),
    t: hexOr(paint && paint.t, '#ff8a1f'),
    custom: !!paint,
  };
}
function carMats(team, paint) {
  const pc = resolvePaint(team, paint);
  const key = team + '|' + pc.a + pc.b + pc.w + pc.t;
  if (matCache[key]) return matCache[key];
  const bCol = new THREE.Color(pc.b);
  return (matCache[key] = {
    paint: new THREE.MeshPhongMaterial({ color: new THREE.Color(pc.a), shininess: 80, specular: 0x99bbdd, flatShading: true }),
    dark: new THREE.MeshPhongMaterial({ color: pc.custom ? bCol.clone().multiplyScalar(0.3) : new THREE.Color(pc.a).multiplyScalar(0.22), shininess: 100, specular: 0xaaccff, flatShading: true }),
    wing: new THREE.MeshPhongMaterial({ color: bCol, flatShading: true, shininess: 60 }),
    rim: new THREE.MeshPhongMaterial({ color: new THREE.Color(pc.w), shininess: 90, specular: 0xffffff, flatShading: true }),
    team: new THREE.MeshBasicMaterial({ color: new THREE.Color(teamHex(team)) }),
    glass: new THREE.MeshPhongMaterial({ color: 0x16263d, shininess: 150, specular: 0xaaccff, transparent: true, opacity: 0.84, flatShading: true }),
    head: new THREE.MeshBasicMaterial({ color: 0xfff4cf }),
    tail: new THREE.MeshBasicMaterial({ color: 0xff3347 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(pc.t).lerp(new THREE.Color(1, 1, 1), 0.3), side: THREE.DoubleSide }),
  });
}
// Color de la estela de turbo [frío, caliente] en rgb 0..1.
function trailColors(team, paint) {
  const c = new THREE.Color(resolvePaint(team, paint).t);
  const h = c.clone().lerp(new THREE.Color(1, 1, 1), 0.5);
  return [[c.r, c.g, c.b], [h.r, h.g, h.b]];
}
const tireMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
const tireGeo = new THREE.CylinderGeometry(17, 17, 14, 18);

// Fusiona piezas [{g, m}] en una sola geometría (menos llamadas de dibujo por coche).
const IDM = new THREE.Matrix4();
function mergeParts(list) {
  const cache = new Map();
  const conv = (g) => { let r = cache.get(g); if (!r) { r = g.index ? g.toNonIndexed() : g; cache.set(g, r); } return r; };
  let n = 0;
  for (const { g } of list) n += conv(g).attributes.position.count;
  const pos = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  let o = 0;
  for (const { g, m } of list) {
    const p = conv(g).attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); pos[o++] = v.x; pos[o++] = v.y; pos[o++] = v.z; }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function bx(list, cx, cy, cz, sx, sy, sz, rx = 0, ry = 0, rz = 0, geo = boxGeo) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  list.push({ g: geo, m: new THREE.Matrix4().compose(_p.set(cx, cy, cz), _q, _s.set(sx, sy, sz)) });
}
// Llanta: aro + radios + buje (los radios se ven girar).
let rimGeoCache = null;
function rimGeo() {
  if (rimGeoCache) return rimGeoCache;
  const list = [];
  for (let k = 0; k < 5; k++) bx(list, 0, 0, 0, 21, 16, 3.4, 0, k * Math.PI / 5, 0);
  const torus = new THREE.TorusGeometry(10.4, 1.7, 4, 16).rotateX(Math.PI / 2);
  for (const y of [-7.3, 7.3]) list.push({ g: torus, m: new THREE.Matrix4().makeTranslation(0, y, 0) });
  list.push({ g: new THREE.CylinderGeometry(3.6, 3.6, 17, 8), m: IDM });
  return (rimGeoCache = mergeParts(list));
}

// Cuerpo extruido a partir de un perfil lateral (x, z) con ancho y estrechamiento en planta.
function profileGeo(pts, width, taper, tumble, bev) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const depth = Math.max(1, width - 2 * bev);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, depth / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = taper(p.getX(i)) * (tumble ? tumble(p.getZ(i)) : 1);
    p.setY(i, p.getY(i) * k);
  }
  return g;
}

// Especificaciones por clase: perfil de carrocería y de cabina en (u: 0 atrás..1 delante, v: 0 panza..1 techo).
const CAR_SPECS = {
  estandar: { // cupé equilibrado con capó en cuña y cola de pato
    body: [[0, 0.1], [0.04, 0], [0.94, 0], [1, 0.12], [1, 0.34], [0.86, 0.46], [0.62, 0.52], [0.22, 0.54], [0.02, 0.5], [0, 0.35]],
    cab: [[0.64, 0.42], [0.47, 0.98], [0.2, 1.0], [0.06, 0.5], [0.06, 0.42]],
    nose: 0.84, tail: 0.93, r: 17, wf: 0.3, wb: 0.3, lights: 'pair',
    wing: { u: 0.05, v: 1.0, span: 0.9, chord: 15, thick: 2.2, endH: 9, deckV: 0.52, tilt: -0.1 },
  },
  plano: { // cuña baja con cabina adelantada y aleta ancha
    body: [[0, 0.12], [0.03, 0], [0.96, 0], [1, 0.1], [1, 0.22], [0.9, 0.32], [0.55, 0.5], [0.25, 0.58], [0.02, 0.56], [0, 0.4]],
    cab: [[0.7, 0.4], [0.58, 0.93], [0.28, 1.0], [0.1, 0.62], [0.08, 0.4]],
    nose: 0.66, tail: 0.9, r: 16.5, wf: 0.31, wb: 0.3, lights: 'bar',
    wing: { u: 0.03, v: 0.88, span: 1.04, chord: 20, thick: 2, endH: 11, deckV: 0.57, tilt: -0.12 },
  },
  tabla: { // gran turismo largo y rasante con doble deriva
    body: [[0, 0.1], [0.03, 0], [0.95, 0], [1, 0.1], [1, 0.3], [0.8, 0.46], [0.45, 0.55], [0.12, 0.6], [0, 0.5]],
    cab: [[0.5, 0.45], [0.4, 0.95], [0.2, 1.0], [0.08, 0.6], [0.08, 0.5]],
    nose: 0.78, tail: 0.88, r: 16, wf: 0.31, wb: 0.3, lights: 'slit',
    wing: { u: 0.03, v: 1.04, span: 1.0, chord: 18, thick: 1.8, endH: 8, deckV: 0.6, tilt: 0 },
  },
  largo: { // flecha estrecha con morro afilado y aleta vertical
    body: [[0, 0.15], [0.03, 0], [0.97, 0], [1, 0.08], [1, 0.2], [0.8, 0.36], [0.5, 0.5], [0.18, 0.62], [0.04, 0.7], [0, 0.6]],
    cab: [[0.55, 0.4], [0.44, 0.9], [0.3, 1.0], [0.14, 0.82], [0.1, 0.55]],
    nose: 0.6, tail: 0.85, r: 16.5, wf: 0.34, wb: 0.3, lights: 'round',
    wing: { u: 0.02, v: 0.86, span: 0.7, chord: 11, thick: 1.8, endH: 6, deckV: 0.68, tilt: -0.08 },
  },
  hibrido: { // compacto de portón cortado (cola «kamm») con barras de techo
    body: [[0, 0.05], [0.04, 0], [0.94, 0], [1, 0.12], [1, 0.36], [0.82, 0.5], [0.56, 0.55], [0.1, 0.56], [0, 0.5]],
    cab: [[0.66, 0.45], [0.52, 0.98], [0.1, 1.0], [0.02, 0.9], [0.02, 0.45]],
    nose: 0.86, tail: 0.96, r: 17.5, wf: 0.3, wb: 0.29, lights: 'dual', wing: null,
  },
  alto: { // furgoneta-burbuja alta con parachoques recio y barra de luz en el techo
    body: [[0, 0.08], [0.05, 0], [0.93, 0], [1, 0.1], [1, 0.3], [0.9, 0.4], [0.7, 0.42], [0.05, 0.42], [0, 0.34]],
    cab: [[0.8, 0.36], [0.64, 0.97], [0.3, 1.0], [0.1, 0.85], [0.04, 0.5], [0.04, 0.36]],
    nose: 0.9, tail: 0.96, r: 18, wf: 0.28, wb: 0.27, lights: 'round',
    wing: { u: 0.02, v: 0.5, span: 0.8, chord: 9, thick: 1.6, endH: 5, deckV: 0.4, tilt: 0 },
  },
};

let carModelsReady = false; // true cuando han cargado los modelos 3D; hasta entonces se usan las carrocerías de respaldo
function buildCar(hb, team, paint) {
  const m = carMats(team, paint);
  let sp = CAR_SPECS[hb.id] || CAR_SPECS.estandar;
  const custom = CUSTOM_BODIES[hb.id];
  const grp = new THREE.Group();
  grp.matrixAutoUpdate = false;
  const [sx, sy, sz] = hb.size;
  const [ox, oy, oz] = hb.off;
  const L = sx, x0 = ox - L / 2, x1 = ox + L / 2;
  const zb = oz - sz / 2 - 4, zt = oz + sz / 2 - 1.5, Hh = zt - zb;
  const Wb = sy - 10;
  const X = (u) => x0 + u * L, Z = (v) => zb + v * Hh;
  const taper = (x) => {
    const u = (x - x0) / L;
    if (u < 0.25) return sp.tail + (1 - sp.tail) * smooth(u / 0.25);
    if (u > 0.7) return 1 + (sp.nose - 1) * smooth((u - 0.7) / 0.3);
    return 1;
  };
  const P = { paint: [], dark: [], wing: [], glass: [], team: [], head: [], tail: [], glow: [] };
  const toPts = (a) => a.map(([u, v]) => [X(u), Z(v)]);

  if (carModelsReady && hasCarModel(hb.id)) {
    // Modelo 3D de Kenney ajustado al hitbox (cars.js); las ruedas son las nuestras, en sus posiciones
    const res = glbBody({ id: hb.id, size: hb.size, off: hb.off, mats: m, team, colors: resolvePaint(team, paint) });
    grp.add(res.group);
    sp = { ...sp, ...res.wheels };
  } else if (custom) {
    // Carrocería de diseño propio (cars.js): mismo hitbox, otra forma
    const res = custom(THREE, { size: hb.size, off: hb.off, mats: m, team, paint });
    grp.add(res.group);
    if (res.wheels) sp = { ...sp, ...res.wheels };
  } else {
    // carrocería, cabina de cristal y techo pintado
    P.paint.push({ g: profileGeo(toPts(sp.body), Wb, taper, null, 2.5), m: IDM });
    const Wc = Wb * 0.8, zc0 = Z(0.4);
    const tumble = (z) => 1 - 0.2 * clamp((z - zc0) / (zt - zc0), 0, 1);
    P.glass.push({ g: profileGeo(toPts(sp.cab), Wc, taper, tumble, 1.4), m: IDM });
    const top = [...sp.cab].sort((a, b) => b[1] - a[1]).slice(0, 2).sort((a, b) => a[0] - b[0]);
    const roofPts = [[top[0][0], top[0][1] + 0.01], [top[0][0], top[0][1] - 0.13], [top[1][0], top[1][1] - 0.13], [top[1][0], top[1][1] + 0.01]];
    P.paint.push({ g: profileGeo(toPts(roofPts.slice().reverse()), Wc * 0.9, taper, tumble, 1.0), m: IDM });

    // bajos, parachoques y difusor
    bx(P.dark, ox, 0, zb + 1, L * 0.82, Wb * 0.78, 4);
    bx(P.dark, x1 + 0.5, 0, zb + 3.5, 9, Wb * sp.nose * 0.98, 2.6);
    bx(P.dark, x0 + 5, 0, zb + 4.5, 14, Wb * sp.tail * 0.82, 4, 0, -0.25, 0);
    for (const f of [-0.22, 0, 0.22]) bx(P.dark, x0 + 3, f * Wb, zb + 6, 11, 1.3, 7);
    // franjas laterales: luz del equipo y acento de pintura
    for (const sg of [-1, 1]) {
      bx(P.team, X(0.5), sg * (Wb / 2 + 0.9), Z(0.2), L * 0.5, 1.6, 2.2);
      bx(P.wing, X(0.5), sg * (Wb / 2 + 0.6), Z(0.32), L * 0.46, 1.2, 2.6);
    }
    // faros delanteros
    const hz = Z(0.2), hx = x1 + 0.8;
    const nw = Wb * sp.nose;
    switch (sp.lights) {
      case 'bar': bx(P.head, hx, 0, hz, 2, nw * 0.78, 2.8); break;
      case 'slit': for (const sg of [-1, 1]) bx(P.head, hx - 1, sg * nw * 0.28, Z(0.22), 2, nw * 0.26, 2, 0, 0, sg * 0.18); break;
      case 'round': for (const sg of [-1, 1]) bx(P.head, hx - 1, sg * nw * 0.3, hz, 3, 5, 5, 0, 0, 0, cylXGeo); break;
      case 'dual': for (const sg of [-1, 1]) for (const k of [0.2, 0.37]) bx(P.head, hx, sg * nw * k, hz, 2, nw * 0.12, 3.4); break;
      default: for (const sg of [-1, 1]) bx(P.head, hx, sg * nw * 0.3, hz, 2.4, nw * 0.22, 3.4);
    }
    // pilotos traseros y franja trasera del color del equipo
    bx(P.tail, x0 - 0.6, 0, Z(0.27), 2, Wb * sp.tail * 0.74, 2.6);
    bx(P.team, x0 - 0.8, 0, Z(0.15), 1.6, Wb * sp.tail * 0.5, 1.8);
    // tubo de turbo trasero con boca brillante
    bx(P.dark, x0 - 2.5, 0, Z(0.0) + 5.5, 9, 6, 6, 0, 0, 0, cylXGeo);
    {
      const g = new THREE.CircleGeometry(4.6, 10).rotateY(-Math.PI / 2);
      P.glow.push({ g, m: new THREE.Matrix4().makeTranslation(x0 - 7.1, 0, Z(0.0) + 5.5) });
    }
    // alerón con soportes y placas laterales del equipo
    if (sp.wing) {
      const w = sp.wing, wx = X(w.u), wz = Z(w.v), span = Wb * w.span;
      bx(P.wing, wx, 0, wz, w.chord, span, w.thick, 0, w.tilt, 0);
      for (const sg of [-1, 1]) {
        bx(P.team, wx, sg * span / 2, wz + 0.5, w.chord + 2, 1.6, w.endH);
        bx(P.dark, wx + 1, sg * Wb * 0.22, (Z(w.deckV) + wz) / 2, 3, 2.4, Math.max(1, wz - Z(w.deckV)));
      }
    }
    // piezas propias de cada modelo
    const finPoly = (pts, w, yc, bucket, bev = 0.8) => bucket.push({ g: profileGeo(pts, w, () => 1, null, bev).translate(0, yc, 0), m: IDM });
    switch (hb.id) {
      case 'estandar':
        bx(P.dark, X(0.7), 0, Z(0.52) + 1, 14, Wb * 0.28, 3, 0, 0.12, 0); // toma de aire del capó
        break;
      case 'plano':
        for (const sg of [-1, 1]) bx(P.wing, X(0.9), sg * (Wb * 0.38), Z(0.2), 14, 14, 1.6, 0.0, 0, sg * 0.0); // aletas delanteras
        break;
      case 'tabla':
        for (const sg of [-1, 1]) finPoly([[X(0.0), Z(0.55)], [X(0.12), Z(0.6)], [X(0.04), Z(1.22)], [X(0.0), Z(1.22)]], 3, sg * Wb * 0.34, P.wing);
        break;
      case 'largo':
        finPoly([[X(0.0), Z(0.58)], [X(0.2), Z(0.66)], [X(0.07), Z(1.38)], [X(0.01), Z(1.38)]], 3.4, 0, P.wing);
        break;
      case 'hibrido':
        for (const sg of [-1, 1]) bx(P.dark, X(0.36), sg * Wc * 0.32, zt + 1.4, L * 0.4, 2, 2.2); // barras de techo
        bx(P.wing, X(0.07), 0, zt + 1.5, 10, Wc * 0.9, 1.8, 0, -0.18, 0); // alerón de portón
        break;
      case 'alto':
        bx(P.team, X(0.5), 0, zt + 2.6, 5, Wc * 0.8, 3.2); // barra de luz de techo
        for (const sg of [-1, 1]) bx(P.dark, x1 + 1, sg * nw * 0.38, Z(0.17), 3, 3, Z(0.32) - Z(0.05)); // defensa
        break;
      default: break;
    }
    for (const key of Object.keys(P)) {
      if (!P[key].length) continue;
      const mesh = new THREE.Mesh(mergeParts(P[key]), m[key]);
      if (key === 'glass') mesh.renderOrder = 1;
      grp.add(mesh);
    }
  }

  // ruedas: pivote de dirección > giro > neumático + llanta
  const wheels = [];
  const rg = rimGeo();
  for (const [wxp, front] of [[ox + sx * sp.wf, true], [ox - sx * sp.wb, false]]) {
    for (const wy of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(wxp, wy * (sp.track != null ? sp.track : sy / 2 - 6.5), sp.wz || 0);
      const spin = new THREE.Group();
      spin.scale.set(sp.r / 17, sp.ww ? sp.ww / 14 : 1, sp.r / 17);
      spin.add(new THREE.Mesh(tireGeo, tireMat), new THREE.Mesh(rg, m.rim));
      pivot.add(spin);
      grp.add(pivot);
      wheels.push({ pivot, spin, front, r: sp.r });
    }
  }
  grp.userData.wheels = wheels;
  const wire = new THREE.LineSegments(hitEdges, new THREE.LineBasicMaterial({ color: 0x39f3c8, depthTest: false }));
  wire.scale.set(sx, sy, sz); wire.position.set(ox, oy, oz);
  wire.visible = false; wire.renderOrder = 20;
  wire.name = 'wire';
  grp.add(wire);
  return grp;
}
function animWheels(grp, dist, steer) {
  for (const w of grp.userData.wheels) {
    w.spin.rotation.y += dist / w.r;
    if (w.front) w.pivot.rotation.z = steer;
  }
}

function nameSprite(name, team) {
  const t = canvasTex(256, 64, (c, w, h) => {
    c.font = 'bold 34px "Trebuchet MS", sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.85)'; c.strokeText(name, w / 2, h / 2);
    c.fillStyle = teamHex(team); c.fillText(name, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(240, 60, 1); s.renderOrder = 15;
  return s;
}

// ---------- renderer ----------
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x050810);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050810);
  scene.fog = new THREE.Fog(0x15183a, 22000, 33000);
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 10, 40000);
  camera.up.set(0, 0, 1);

  scene.add(new THREE.HemisphereLight(0xe6efff, 0x6a7aa0, 2.6));
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(-1500, 2000, 4000);
  scene.add(sun);

  // Carga asíncrona de los modelos de coche: al terminar, los coches ya creados y la vitrina se regeneran.
  preloadCarModels().then((ok) => { if (ok) carModelsReady = true; });

  const nBefore = scene.children.length;
  buildSky(scene);
  const surroundings = buildSurroundings(scene);
  const classicObjs = scene.children.slice(nBefore);
  const classicBg = scene.background, classicFog = scene.fog;
  let mapId = 'clasico', theme = null;
  function setMap(id) {
    if (id === mapId) return;
    if (theme) { scene.remove(theme.group); theme = null; }
    mapId = id;
    const isClassic = id === 'clasico';
    for (const o of classicObjs) o.visible = isClassic;
    scene.background = classicBg; scene.fog = classicFog;
    if (!isClassic) {
      theme = buildTheme(THREE, scene, id);
      if (theme) { scene.add(theme.group); if (theme.setQuality) theme.setQuality(quality === 'baja'); }
      else { for (const o of classicObjs) o.visible = true; mapId = 'clasico'; }
    }
  }
  buildStadium(scene);
  const board = buildScoreboard(scene);
  const particles = createParticles(scene);

  // turbos: grandes = orbe dorado flotante con base; pequeños = disco con aro
  const pads = [];
  const orbGeo = new THREE.IcosahedronGeometry(52, 1);
  const discGeo = new THREE.CylinderGeometry(70, 70, 6, 24).rotateX(Math.PI / 2);
  const haloTex = radialTex('rgba(255,200,90,0.9)', 'rgba(255,170,40,0)');
  for (const p of BOOST_PADS) {
    const m = new THREE.Group();
    if (p.big) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(120, 140, 14, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2c2518 }));
      base.position.z = 7;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffa530 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(112, 6, 6, 28), ringMat);
      ring.position.z = 16;
      const orbMat = new THREE.MeshPhongMaterial({ color: 0xffc247, emissive: 0xc77a10, flatShading: true, shininess: 90 });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.z = 120;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.set(300, 300, 1); glow.position.z = 120;
      m.add(base, ring, orb, glow);
      pads.push({ obj: m, big: true, orb, orbMat, ringMat, glow });
    } else {
      const discMat = new THREE.MeshBasicMaterial({ color: 0xffc766 });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.z = 3;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff9a2e });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(80, 4, 5, 24), ringMat);
      ring.position.z = 4;
      m.add(disc, ring);
      pads.push({ obj: m, big: false, discMat, ringMat });
    }
    m.position.set(p.x, p.y, 0);
    scene.add(m);
  }

  // balón y sombras falsas (calcomanías, sin mapas de sombra)
  const ball = buildBall();
  scene.add(ball);
  const shadowTex = radialTex('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  const newShadowMat = (op) => new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: op, depthWrite: false });
  const ballShadow = new THREE.Mesh(shadowGeo, newShadowMat(0.7));
  ballShadow.position.z = 1.5;
  ballShadow.scale.set(BALL_R * 2.3, BALL_R * 2.3, 1);
  scene.add(ballShadow);

  const cars = new Map();
  let quality = 'alta';
  let qf = 1; // factor de partículas
  let showcase = null; // coche de vitrina del menú
  let lastPreview = null;
  let menuFov = false;
  let showAng = 0.6;
  const showShadow = new THREE.Mesh(shadowGeo, newShadowMat(0.7));
  showShadow.visible = false; showShadow.position.z = 1.2;
  scene.add(showShadow);
  let camSettings = { ...DEFAULT_CAM };
  let ballCam = false;
  let showHitbox = false;
  let showNames = true;
  const look = { x: 0, y: 0 };
  const cam = { dir: new THREE.Vector2(0, 1), blend: 0, pos: new THREE.Vector3(0, -3000, 800), init: false, orbit: 0, lx: 0, ly: 0, shake: 0 };
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3(), tf = new THREE.Vector3(), tu = new THREE.Vector3(), tl = new THREE.Vector3();
  let size = { w: 0, h: 0 };
  let crowdAmp = 0, crowdT = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
    if (w !== size.w || h !== size.h) {
      size = { w, h };
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      updateFov();
    }
  }
  function updateFov() {
    const hf = Math.max(60, Math.min(130, camSettings.fov)) * D2R;
    const vf = 2 * Math.atan(Math.tan(hf / 2) / camera.aspect);
    camera.fov = Math.min(130, vf / D2R);
    camera.updateProjectionMatrix();
    const bh = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    particles.mat.uniforms.uScale.value = bh / (2 * Math.tan(camera.fov * D2R / 2));
  }

  function setBasis(obj, f, u, p) {
    tf.set(f[0], f[1], f[2]).normalize();
    tu.set(u[0], u[1], u[2]).normalize();
    tl.crossVectors(tu, tf);
    obj.matrix.makeBasis(tf, tl, tu);
    obj.matrix.setPosition(p[0], p[1], p[2]);
    obj.matrixWorldNeedsUpdate = true;
  }

  const rnd = () => Math.random() * 2 - 1;
  function burst(p, n, colors, vmin, vmax, lmin, lmax, smin, smax) {
    n = Math.max(1, Math.round(n * qf));
    for (let i = 0; i < n; i++) {
      tv.set(rnd(), rnd(), rnd()).normalize();
      const v = vmin + Math.random() * (vmax - vmin);
      const c = colors[(Math.random() * colors.length) | 0];
      particles.emit(p, [tv.x * v, tv.y * v, tv.z * v], lmin + Math.random() * (lmax - lmin), smin + Math.random() * (smax - smin), c[0], c[1], c[2]);
    }
  }

  // Mantiene la cámara dentro de la planta octogonal.
  const PLAN_SUM = HX + HY - CORNER - 60;
  function clampPlan(v) {
    v.x = clamp(v.x, -HX + 40, HX - 40);
    v.y = clamp(v.y, -HY + 40, HY - 40);
    const ex = Math.abs(v.x) + Math.abs(v.y) - PLAN_SUM;
    if (ex > 0) { v.x -= Math.sign(v.x) * ex / 2; v.y -= Math.sign(v.y) * ex / 2; }
  }

  // Rumbo del coche independiente de flips y vuelcos: combina el morro y el techo proyectados.
  // (normal: morro; morro abajo: techo; boca abajo: morro invertido; en pared: hacia la pared)
  function heading(f, u, prev) {
    let hx = f[0] * u[2] - u[0] * f[2], hy = f[1] * u[2] - u[1] * f[2];
    let l = Math.hypot(hx, hy);
    if (l < 0.3) { hx = f[0]; hy = f[1]; l = Math.hypot(hx, hy); } // de lado: el morro sirve
    return l > 0.2 ? cam.tmpH.set(hx / l, hy / l) : cam.tmpH.copy(prev);
  }
  // Mantiene un punto dentro del estadio usando la misma geometría que la física
  function keepInside(v, margin) {
    for (let i = 0; i < 3; i++) {
      const d = wallDist(v.x, v.y, v.z);
      if (d >= margin) return;
      const n = wallNormal(v.x, v.y, v.z);
      v.x += n[0] * (margin - d); v.y += n[1] * (margin - d); v.z += n[2] * (margin - d);
    }
  }

  function updateCamera(state, me, dt) {
    const set = camSettings;
    const target = me && !me.dead ? me : null;
    const b = state.ball.p;
    if (!cam.tmpH) { cam.tmpH = new THREE.Vector2(); cam.h = new THREE.Vector2(0, 1); cam.bh = new THREE.Vector2(0, 1); cam.p = new THREE.Vector3(); cam.look = new THREE.Vector3(0, 1, 0); }
    const stiff = clamp(set.stiff ?? 0.45, 0, 1);
    const trans = clamp(set.transition ?? 1.2, 0.3, 4);
    const sw = clamp(set.swivel ?? 4.7, 0.5, 12);

    // Modo: coche, balón (con transición) o espectador si el coche está destruido
    const useBall = ballCam && target ? 1 : 0;
    cam.blend += (useBall - cam.blend) * (1 - Math.exp(-dt * 4 * trans));

    // Rumbo del coche (suavizado: la rigidez decide cuánto se retrasa la cámara al girar)
    if (target) {
      const h = heading(target.f, target.u, cam.h);
      if (!cam.init) { cam.h.copy(h); cam.bh.copy(h); }
      cam.h.lerp(h, 1 - Math.exp(-dt * (5 + 20 * stiff))).normalize();
    }
    // Dirección horizontal hacia el balón (se congela si el balón está justo encima)
    const anchor = target ? target.p : b;
    const bx = b[0] - anchor[0], by = b[1] - anchor[1], bz = b[2] - anchor[2];
    const bl = Math.hypot(bx, by);
    if (bl > 150) cam.bh.lerp(cam.tmpH.set(bx / bl, by / bl), 1 - Math.exp(-dt * 14)).normalize();
    const dir = new THREE.Vector2().copy(cam.h).multiplyScalar(1 - cam.blend).addScaledVector(cam.bh, cam.blend);
    if (dir.lengthSq() < 1e-4) dir.copy(cam.bh); dir.normalize();

    // Mirar alrededor (stick derecho / ratón con botón central): gira hasta 180° y vuelve al soltar
    const lk = 1 - Math.exp(-dt * sw * 1.5);
    cam.lx += (look.x - cam.lx) * lk;
    cam.ly += (look.y - cam.ly) * lk;
    const lm = Math.min(1, Math.hypot(cam.lx, cam.ly));
    const ang = -cam.lx * Math.PI;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const dx = dir.x * ca - dir.y * sa, dy = dir.x * sa + dir.y * ca;

    // Posición deseada: detrás y encima (en coche: distancia/altura; espectador: más lejos)
    const dist = target ? set.dist : set.dist * 2.2;
    const hgt = target ? set.height : set.height * 2.5;
    tv.set(anchor[0] - dx * dist, anchor[1] - dy * dist, anchor[2] + hgt - cam.ly * dist * 0.5);
    // Con la rigidez < 1, la cámara se retrasa un poco a gran velocidad (como un muelle)
    if (!cam.init) { cam.p.copy(tv); cam.init = true; }
    const follow = 1 - Math.exp(-dt * (6 + 60 * stiff * stiff));
    cam.p.lerp(tv, follow);
    // nunca más lejos de 1.6× la distancia ni dentro del coche
    tv3.subVectors(cam.p, tv);
    if (tv3.length() > dist * 0.6) cam.p.copy(tv).addScaledVector(tv3.normalize(), dist * 0.6);
    keepInside(cam.p, 40);

    // Dirección de mirada: coche → hacia delante con el ángulo elegido; balón → hacia el balón (inclinación limitada)
    const a = (set.angle ?? -3) * D2R;
    tv2.set(dx * Math.cos(a), dy * Math.cos(a), Math.sin(a) + cam.ly * 0.4);
    tv3.set(b[0] - cam.p.x, b[1] - cam.p.y, b[2] - cam.p.z).normalize();
    const elev = clamp(Math.asin(clamp(tv3.z, -1, 1)), -0.45, 0.75);
    const hl2 = Math.hypot(tv3.x, tv3.y) || 1;
    tv3.set(tv3.x / hl2 * Math.cos(elev), tv3.y / hl2 * Math.cos(elev), Math.sin(elev));
    const ballWeight = target ? cam.blend * (1 - lm) : 1 - lm;
    tv2.lerp(tv3, ballWeight).normalize();
    cam.look.lerp(tv2, 1 - Math.exp(-dt * 18)).normalize();

    // Temblor (opcional)
    let jx = 0, jy = 0, jz = 0;
    tv.copy(cam.p);
    if (set.shake) {
      if (me && me.ss) cam.shake = Math.max(cam.shake, 1.5);
      if (cam.shake > 0.05) {
        const sh = cam.shake;
        tv.x += rnd() * sh; tv.y += rnd() * sh; tv.z += rnd() * sh * 0.6;
        jx = rnd() * sh * 4; jy = rnd() * sh * 4; jz = rnd() * sh * 3;
      }
    }
    cam.shake *= Math.exp(-dt * 5);
    camera.position.copy(tv);
    camera.lookAt(tv.x + cam.look.x * 1000 + jx, tv.y + cam.look.y * 1000 + jy, tv.z + cam.look.z * 1000 + jz);
  }

  function setMenuFov() {
    camera.fov = 48; camera.updateProjectionMatrix();
    const bh = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    particles.mat.uniforms.uScale.value = bh / (2 * Math.tan(camera.fov * D2R / 2));
    menuFov = true;
  }

  function ensureShowcase(pv) {
    const hb = HITBOXES.find((h) => h.id === pv.hb) || HITBOXES[0];
    const p = pv.paint || null;
    const team = pv.team || 0;
    const key = hb.id + '|' + team + '|' + (p ? [p.a, p.b, p.w, p.t].join() : '') + '|' + carModelsReady;
    if (showcase && showcase.key === key) return;
    if (showcase) scene.remove(showcase.grp);
    const grp = buildCar(hb, team, p);
    scene.add(grp);
    showcase = { key, grp, hb, team, paint: p, acc: 0 };
  }

  function placeShadow(mesh, p, f, hb, op) {
    const yaw = Math.atan2(f[1], f[0]);
    const fl = Math.hypot(f[0], f[1]) || 1;
    mesh.position.set(p[0] + f[0] / fl * hb.off[0], p[1] + f[1] / fl * hb.off[0], 1.2);
    mesh.rotation.z = yaw;
    mesh.scale.set(hb.size[0] * 1.5, hb.size[1] * 1.45, 1);
    mesh.material.opacity = op;
  }

  // Menú: cámara orbitando despacio el estadio con el coche del jugador girando en vitrina.
  function renderMenuFrame(dt, pv) {
    resize();
    if (!pv) pv = { hb: 'estandar', paint: null, team: 0 };
    lastPreview = pv;
    ensureShowcase(pv);
    setMenuFov();
    const garage = pv.view === 'garage';
    const title = pv.view === 'title', home = pv.view === 'home';
    showAng += dt * (garage ? 0.55 : 0.32);
    cam.orbit += dt * 0.07;
    const C = [0, -700, 17];
    const r0 = garage ? 340 : title ? 580 : home ? 470 : 380;
    const r = camera.aspect < 1 ? r0 * Math.min(1.9, 0.95 / Math.max(0.3, camera.aspect)) : r0;
    const a = cam.orbit + 0.9;
    const h = garage ? 95 : 120;
    camera.position.set(C[0] + Math.sin(a) * r, C[1] - Math.cos(a) * r, C[2] + h);
    // desplazar el punto de mira para que el coche quede a la derecha (o arriba en vertical)
    const dx = C[0] - camera.position.x, dy = C[1] - camera.position.y;
    const dl = Math.hypot(dx, dy) || 1;
    const rx = dy / dl, ry = -dx / dl;
    const vh = r * Math.tan(camera.fov * D2R / 2);
    const aspect = camera.aspect;
    let tx = C[0], ty = C[1], tz = C[2] + 12;
    if (title) { tz += vh * (aspect >= 1 ? 0.5 : 0.35); } // coche centrado abajo, logo arriba
    else if (home) { const sh = vh * aspect * 0.2; tx -= rx * sh; ty -= ry * sh; tz += vh * 0.04; } // centrado entre el menú y el panel de desafíos
    else if (aspect >= 1) { const sh = vh * aspect * 0.3; tx -= rx * sh; ty -= ry * sh; }
    else { tz -= vh * 0.5; }
    camera.lookAt(tx, ty, tz);

    const g = showcase.grp;
    const f = [Math.cos(showAng), Math.sin(showAng), 0];
    setBasis(g, f, [0, 0, 1], C);
    animWheels(g, dt * 70, 0.12 * Math.sin(showAng * 2));
    g.getObjectByName('wire').visible = false;
    g.visible = true;
    showShadow.visible = true;
    placeShadow(showShadow, C, f, showcase.hb, 0.6);
    ball.matrix.makeTranslation(0, 0, BALL_R + 2); ball.matrixWorldNeedsUpdate = true;
    ballShadow.position.set(0, 0, 1.5);
    for (const c of cars.values()) c.grp.visible = c.label.visible = c.shadow.visible = false;
    for (const p of pads) p.obj.visible = true;
    board.update({ score: [0, 0], clock: 300, freePlay: false });
    if (garage) { // estela de turbo de muestra
      const tc = trailColors(showcase.team, showcase.paint);
      showcase.acc = Math.min(6, showcase.acc + dt * 55 * qf);
      while (showcase.acc >= 1) {
        showcase.acc -= 1;
        const back = showcase.hb.off[0] - showcase.hb.size[0] / 2 - 4 - Math.random() * 12;
        const q = [C[0] + f[0] * back, C[1] + f[1] * back, C[2] + showcase.hb.off[2] - 6];
        const hot = Math.random() < 0.4;
        const c = tc[hot ? 1 : 0];
        particles.emit(q, [-f[0] * 260 + rnd() * 50, -f[1] * 260 + rnd() * 50, rnd() * 50], 0.4 + Math.random() * 0.2, hot ? 20 : 28, c[0], c[1], c[2]);
      }
    }
    surroundings.setJump(0, 0);
    particles.update(dt);
    renderer.render(scene, camera);
  }

  const quatYaw = (f) => Math.atan2(f[1], f[0]);
  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

  return {
    domElement: canvas,
    setCameraSettings(o) { camSettings = { ...camSettings, ...o }; size = { w: 0, h: 0 }; },
    setLook(x, y) {
      look.x = clamp(+x || 0, -1, 1);
      look.y = clamp(+y || 0, -1, 1);
    },
    setBallCam(v) { ballCam = !!v; },
    setShowNames(v) { showNames = !!v; },
    setShowHitbox(v) { showHitbox = !!v; },
    setMap,
    getMap: () => mapId,
    setQuality(q) {
      quality = q === 'baja' ? 'baja' : 'alta';
      qf = quality === 'baja' ? 0.4 : 1;
      surroundings.setQuality(quality === 'baja');
      if (theme && theme.setQuality) theme.setQuality(quality === 'baja');
      renderer.setPixelRatio(quality === 'baja' ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      size = { w: 0, h: 0 };
    },
    renderMenu(dtFrame, carPreview) {
      renderMenuFrame(Math.min(0.1, Math.max(0.0001, dtFrame || 0.016)), carPreview);
    },
    handleEvents(events, state) {
      if (!events) return;
      for (const e of events) {
        if (e.type === 'goal' && e.pos) {
          const c = new THREE.Color(teamHex(e.team));
          burst(e.pos, 240, [[c.r, c.g, c.b], [1, 1, 1], [c.r * 0.6 + 0.4, c.g * 0.6 + 0.4, c.b * 0.6 + 0.4]], 500, 2000, 0.8, 1.8, 45, 110);
          burst(e.pos, 60, [[1, 0.9, 0.5]], 100, 700, 0.4, 0.9, 120, 220);
          crowdAmp = 22; crowdT = 0;
          if (camSettings.shake) cam.shake = Math.max(cam.shake, 14);
        } else if (e.type === 'demo' && e.pos) {
          particles.emit(e.pos, [0, 0, 0], 0.25, 500, 1, 0.8, 0.5);
          burst(e.pos, 90, [[1, 0.6, 0.2], [1, 1, 0.9], [1, 0.3, 0.1]], 300, 1300, 0.5, 1.1, 50, 100);
          if (camSettings.shake) {
            const d = Math.hypot(e.pos[0] - camera.position.x, e.pos[1] - camera.position.y, e.pos[2] - camera.position.z);
            cam.shake = Math.max(cam.shake, 12 * clamp(1 - d / 5000, 0.2, 1));
          }
        } else if (e.type === 'touch' && camSettings.shake && e.speed > 2500 && state && state.ball) {
          const bp = state.ball.p;
          const d = Math.hypot(bp[0] - camera.position.x, bp[1] - camera.position.y, bp[2] - camera.position.z);
          cam.shake = Math.max(cam.shake, Math.min(14, 4 + (e.speed - 2500) / 250) * clamp(1 - d / 6000, 0.25, 1));
        }
      }
    },
    render(state, myCarId, dtFrame) {
      if (state && state.map && state.map !== mapId) setMap(state.map);
      if (theme && theme.update) theme.update(dtFrame || 0);
      const dt = Math.min(0.1, Math.max(0.0001, dtFrame || 0.016));
      resize();
      if (!state) { renderMenuFrame(dt, lastPreview); return; }
      if (menuFov) { menuFov = false; updateFov(); }
      if (showcase) showcase.grp.visible = false;
      showShadow.visible = false;
      board.update(state);
      // público: salta al marcar
      crowdT += dt; crowdAmp = Math.max(0, crowdAmp - dt * 7);
      surroundings.setJump(crowdAmp, crowdT);
      // balón
      setBasis(ball, state.ball.f, state.ball.u, state.ball.p);
      const bz = state.ball.p[2];
      ballShadow.position.set(state.ball.p[0], state.ball.p[1], 1.5);
      const sc = Math.max(0.35, 1 - bz / 1800);
      ballShadow.scale.set(BALL_R * 2.3 * sc, BALL_R * 2.3 * sc, 1);
      ballShadow.material.opacity = 0.75 * sc;
      // turbos
      const now = performance.now() / 1000;
      for (let i = 0; i < pads.length; i++) {
        const on = state.pads ? state.pads[i] !== '0' : true;
        const p = pads[i];
        p.obj.visible = true;
        if (p.big) {
          p.orb.position.z = (on ? 120 : 80) + Math.sin(now * 2.4 + i) * (on ? 9 : 2);
          p.orb.rotation.z = now * 1.6; p.orb.rotation.x = now * 0.9;
          p.orb.scale.setScalar(on ? 1 : 0.5);
          p.orbMat.color.setHex(on ? 0xffc247 : 0x3b3224);
          p.orbMat.emissive.setHex(on ? 0xc77a10 : 0x000000);
          p.ringMat.color.setHex(on ? 0xffa530 : 0x2a2418);
          p.glow.visible = on; p.glow.position.z = p.orb.position.z;
        } else {
          p.discMat.color.setHex(on ? 0xffc766 : 0x2d281d);
          p.ringMat.color.setHex(on ? 0xff9a2e : 0x201c14);
        }
      }
      // coches
      const seen = new Set();
      let me = null;
      for (const c of state.cars) {
        if (c.id === myCarId) me = c;
        seen.add(c.id);
        let o = cars.get(c.id);
        const pkey = c.paint ? [c.paint.a, c.paint.b, c.paint.w, c.paint.t].join() : '';
        if (!o || o.hb !== c.hb || o.team !== c.team || o.pkey !== pkey || o.gv !== carModelsReady) {
          if (o) { scene.remove(o.grp, o.label, o.shadow); }
          const hb = HITBOXES.find((h) => h.id === c.hb) || HITBOXES[0];
          const grp = buildCar(hb, c.team, c.paint);
          scene.add(grp);
          const label = nameSprite(c.name, c.team);
          scene.add(label);
          const shadow = new THREE.Mesh(shadowGeo, newShadowMat(0.55));
          scene.add(shadow);
          o = { grp, label, shadow, gv: carModelsReady, hb: c.hb, team: c.team, pkey, tcol: trailColors(c.team, c.paint), name: c.name, hbObj: hb, acc: 0, acc2: 0, yaw: quatYaw(c.f), yr: 0, steer: 0 };
          cars.set(c.id, o);
        }
        if (o.name !== c.name) { scene.remove(o.label); o.label = nameSprite(c.name, c.team); scene.add(o.label); o.name = c.name; }
        const vis = !c.dead;
        o.grp.visible = vis;
        o.label.visible = vis && showNames && c.id !== myCarId;
        o.shadow.visible = vis;
        o.grp.getObjectByName('wire').visible = showHitbox;
        if (!vis) continue;
        setBasis(o.grp, c.f, c.u, c.p);
        o.label.position.set(c.p[0], c.p[1], c.p[2] + 85);
        placeShadow(o.shadow, c.p, c.f, o.hbObj, 0.55 * Math.max(0.15, 1 - c.p[2] / 1500));
        // ruedas: giran según la velocidad hacia delante; las delanteras viran con el giro estimado
        const fwd = c.v[0] * c.f[0] + c.v[1] * c.f[1] + c.v[2] * c.f[2];
        if (dt > 0.002) {
          const yaw = quatYaw(c.f);
          const yr = wrapPi(yaw - o.yaw) / dt;
          o.yaw = yaw;
          o.yr += (clamp(yr, -8, 8) - o.yr) * (1 - Math.exp(-dt * 14));
        }
        const sgn = fwd < 0 ? -1 : 1;
        const tgt = c.g === false ? 0 : clamp(Math.atan2(80 * o.yr, sgn * Math.max(300, Math.abs(fwd))) * 1.7, -0.5, 0.5);
        o.steer += (tgt - o.steer) * (1 - Math.exp(-dt * 16));
        animWheels(o.grp, fwd * (dt > 0.002 ? dt : 0), o.steer);
        // estelas
        const hb = o.hbObj;
        tf.set(c.f[0], c.f[1], c.f[2]);
        tu.set(c.u[0], c.u[1], c.u[2]);
        tl.crossVectors(tu, tf);
        if (c.boosting) {
          o.acc = Math.min(8, o.acc + dt * 110 * qf);
          while (o.acc >= 1) {
            o.acc -= 1;
            const back = hb.off[0] - hb.size[0] / 2 - 6 - Math.random() * 14;
            const q = [c.p[0] + tf.x * back + tu.x * (hb.off[2] - 8), c.p[1] + tf.y * back + tu.y * (hb.off[2] - 8), c.p[2] + tf.z * back + tu.z * (hb.off[2] - 8)];
            const hot = Math.random() < 0.4;
            const tc = o.tcol[hot ? 1 : 0];
            particles.emit(q, [c.v[0] * 0.9 - tf.x * 380 + rnd() * 70, c.v[1] * 0.9 - tf.y * 380 + rnd() * 70, c.v[2] * 0.9 - tf.z * 380 + rnd() * 70],
              0.3 + Math.random() * 0.15, (hot ? 34 : 46) * (qf < 1 ? 1.5 : 1), tc[0], tc[1], tc[2]);
          }
        } else o.acc = 0;
        if (c.ss) {
          o.acc2 = Math.min(6, o.acc2 + dt * 70 * qf);
          while (o.acc2 >= 1) {
            o.acc2 -= 1;
            for (const s of [-1, 1]) {
              const back = hb.off[0] - hb.size[0] / 2;
              const side = s * hb.size[1] / 2;
              const q = [c.p[0] + tf.x * back + tl.x * side, c.p[1] + tf.y * back + tl.y * side, c.p[2] + tf.z * back + tl.z * side + hb.off[2] * 0.5];
              particles.emit(q, [c.v[0] * 0.5 + rnd() * 30, c.v[1] * 0.5 + rnd() * 30, c.v[2] * 0.5 + rnd() * 30], 0.55, 30, 0.45, 0.8, 1);
            }
          }
        } else o.acc2 = 0;
      }
      for (const [id, o] of cars) {
        if (!seen.has(id)) { scene.remove(o.grp, o.label, o.shadow); cars.delete(id); }
      }
      updateCamera(state, me, dt);
      particles.update(dt);
      renderer.render(scene, camera);
    },
  };
}
