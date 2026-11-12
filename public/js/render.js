// Render Three.js del estadio. Eje Z hacia arriba, unidades = uu.
import * as THREE from 'three';
import { ARENA, BOOST_PADS } from '/shared/arena.js';
import { HITBOXES, TEAM_COLORS, PHYS } from '/shared/constants.js';

const { HX, HY, H, PLAN_R, EDGE_R, GW, GH, GD } = ARENA;
const A = HX - EDGE_R;
const B = HY - EDGE_R;
const RC = PLAN_R - EDGE_R;
const BALL_R = PHYS.BALL_RADIUS;
const D2R = Math.PI / 180;

const DEFAULT_CAM = { fov: 110, dist: 270, height: 110, angle: -3, stiff: 0.45 };

// ---------- utilidades ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// Perímetro del rectángulo redondeado reducido, CCW, con normal exterior.
function buildPerimeter() {
  const pts = [];
  const push = (x, y, nx, ny) => pts.push({ x, y, nx, ny });
  const arc = (cx, cy, a0, a1, n = 14) => {
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (a1 - a0) * (i / n)) * D2R;
      push(cx + RC * Math.cos(a), cy + RC * Math.sin(a), Math.cos(a), Math.sin(a));
    }
  };
  const ex = A - RC;
  const ey = B - RC;
  // borde inferior (y=-B), de izquierda a derecha, con cortes exactos en +-GW
  push(-ex, -B, 0, -1); // se añadirá como parte del arco anterior; evitamos duplicado abajo
  pts.pop();
  const bottomExtra = [-GW, GW];
  // arco (+,-)
  const seq = [];
  seq.push(() => { for (const x of bottomExtra) push(x, -B, 0, -1); });
  seq.push(() => arc(ex, -ey, -90, 0));
  seq.push(() => { for (const y of [-ey / 2, 0, ey / 2]) push(A, y, 1, 0); });
  seq.push(() => arc(ex, ey, 0, 90));
  seq.push(() => { for (const x of [GW, -GW]) push(x, B, 0, 1); });
  seq.push(() => arc(-ex, ey, 90, 180));
  seq.push(() => { for (const y of [ey / 2, 0, -ey / 2]) push(-A, y, -1, 0); });
  seq.push(() => arc(-ex, -ey, 180, 270));
  seq.forEach((f) => f());
  return pts;
}

function teamHex(t) { return TEAM_COLORS[t]; }

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

// ---------- estadio ----------
function buildStadium(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const per = buildPerimeter();
  const M = per.length;

  // Suelo
  const shape = new THREE.Shape();
  per.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
  shape.closePath();
  const fg = new THREE.ShapeGeometry(shape);
  const fp = fg.attributes.position;
  const fuv = fg.attributes.uv;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) / (2 * A) + 0.5, fp.getY(i) / (2 * B) + 0.5);
  const floorTex = canvasTex(1024, 1300, (c, w, h) => {
    const sx = w / (2 * A), sy = h / (2 * B);
    const X = (x) => (x + A) * sx, Y = (y) => (B - y) * sy;
    c.fillStyle = '#1f4f86'; c.fillRect(0, Y(0) , w, h - Y(0)); // y<0 azul
    c.fillStyle = '#6a4128'; c.fillRect(0, 0, w, Y(0));
    for (let k = 0; k < 12; k++) { // franjas de césped sutiles
      c.fillStyle = k % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      c.fillRect(0, Y(B - k * (2 * B / 12)), w, 2 * B / 12 * sy);
    }
    c.strokeStyle = 'rgba(210,235,255,0.75)'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(X(-A), Y(0)); c.lineTo(X(A), Y(0)); c.stroke();
    c.beginPath(); c.arc(X(0), Y(0), 1000 * sx, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(X(0), Y(0), 60 * sx, 0, Math.PI * 2); c.fillStyle = 'rgba(210,235,255,0.75)'; c.fill();
    for (const s of [-1, 1]) {
      c.strokeStyle = s < 0 ? 'rgba(47,140,255,0.8)' : 'rgba(255,138,31,0.8)'; c.lineWidth = 2.6;
      c.strokeRect(X(-1800), Y(s < 0 ? -B + 1500 : B), 3600 * sx, 1500 * sy);
    }
  });
  const floor = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ map: floorTex }));
  root.add(floor);

  // Techo tenue
  const ceil = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0x1b3a66, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  ceil.position.z = H;
  root.add(ceil);

  // Paredes
  const prof = [];
  for (let i = 0; i <= 8; i++) { const t = (i / 8) * Math.PI / 2; prof.push([EDGE_R * Math.sin(t), EDGE_R * (1 - Math.cos(t))]); }
  prof.push([EDGE_R, GH]);
  prof.push([EDGE_R, H - EDGE_R]);
  for (let i = 1; i <= 8; i++) { const t = (i / 8) * Math.PI / 2; prof.push([EDGE_R * Math.cos(t), H - EDGE_R + EDGE_R * Math.sin(t)]); }
  const P = prof.length;
  const wpos = [], wuv = [], wcol = [], widx = [];
  let arcLen = 0;
  const cb = new THREE.Color(0.45, 0.7, 1), co = new THREE.Color(1, 0.62, 0.3), tmp = new THREE.Color();
  for (let i = 0; i < M; i++) {
    const p = per[i];
    if (i) arcLen += Math.hypot(p.x - per[i - 1].x, p.y - per[i - 1].y);
    tmp.copy(cb).lerp(co, Math.max(0, Math.min(1, p.y / B * 0.5 + 0.5)));
    for (let j = 0; j < P; j++) {
      wpos.push(p.x + p.nx * prof[j][0], p.y + p.ny * prof[j][0], prof[j][1]);
      wuv.push(arcLen / 256, prof[j][1] / 256);
      wcol.push(tmp.r, tmp.g, tmp.b);
    }
  }
  // cierre del lazo: última->primera
  for (let i = 0; i < M; i++) {
    const i2 = (i + 1) % M;
    const a = per[i], b = per[i2];
    const inMouth = Math.abs(a.y) > B - 1 && Math.abs(b.y) > B - 1 && a.y * b.y > 0 && Math.abs(a.x) <= GW + 0.01 && Math.abs(b.x) <= GW + 0.01;
    for (let j = 0; j < P - 1; j++) {
      if (inMouth && prof[j + 1][1] <= GH + 0.01) continue;
      const v00 = i * P + j, v01 = i * P + j + 1, v10 = i2 * P + j, v11 = i2 * P + j + 1;
      widx.push(v00, v10, v11, v00, v11, v01);
    }
  }
  // para el vértice de cierre (i2=0) el uv de u sería 0: duplicamos con uv correcto no hace falta (rejilla)
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(wcol, 3));
  wg.setIndex(widx);
  const gridTex = canvasTex(64, 64, (c, w, h) => {
    c.fillStyle = 'rgba(120,170,255,0.10)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(190,225,255,0.85)'; c.lineWidth = 3;
    c.strokeRect(0, 0, w, h);
  }, true);
  const walls = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ map: gridTex, vertexColors: true, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false }));
  walls.renderOrder = 2;
  root.add(walls);

  // Porterías
  const netTex = canvasTex(32, 32, (c, w, h) => {
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
    c.strokeRect(0, 0, w, h);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.stroke();
  }, true);
  function quad(p0, p1, p2, p3, cell, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p3], 3));
    const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / cell;
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, d(p0, p1), 0, d(p0, p1), d(p1, p2), 0, d(p1, p2)], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return new THREE.Mesh(g, mat);
  }
  for (const [team, s] of [[0, -1], [1, 1]]) {
    const hex = teamHex(team);
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, color: hex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const yi = s * HY, yo = s * (HY + GD);
    const gg = new THREE.Group();
    gg.add(quad([-GW, yo, 0], [GW, yo, 0], [GW, yo, GH], [-GW, yo, GH], 70, netMat));
    gg.add(quad([-GW, yi, GH], [-GW, yo, GH], [GW, yo, GH], [GW, yi, GH], 70, netMat));
    for (const x of [-GW, GW]) gg.add(quad([x, yi, 0], [x, yo, 0], [x, yo, GH], [x, yi, GH], 70, netMat));
    // suelo de la boca (y de la portería)
    const dark = new THREE.Color(hex).multiplyScalar(0.28);
    const fm = new THREE.MeshBasicMaterial({ color: dark });
    const fl = quad([-GW, s * B, 0.5], [GW, s * B, 0.5], [GW, yo, 0.5], [-GW, yo, 0.5], 100, fm);
    fl.material.side = THREE.DoubleSide;
    gg.add(fl);
    const pm = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), 0.55) });
    const post = new THREE.CylinderGeometry(14, 14, GH, 10);
    for (const x of [-GW, GW]) {
      const m = new THREE.Mesh(post, pm);
      m.rotation.x = Math.PI / 2; m.position.set(x, yi, GH / 2); gg.add(m);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 2 * GW, 10), pm);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, yi, GH); gg.add(bar);
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

// ---------- coche ----------
const geoCache = {};
function unitBody() {
  if (geoCache.body) return geoCache.body;
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  // cuña: parte superior delantera más baja
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    if (z > 0.4) p.setZ(i, x > 0 ? 0.5 - 0.45 * (x / 0.5) : 0.5);
  }
  g.computeVertexNormals();
  return (geoCache.body = g);
}
function unitCabin() {
  if (geoCache.cabin) return geoCache.cabin;
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z > 0) { p.setY(i, y * 0.7); if (x > 0) p.setX(i, x * 0.55); }
  }
  g.computeVertexNormals();
  return (geoCache.cabin = g);
}
const wheelGeo = new THREE.CylinderGeometry(17, 17, 14, 14);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const hitEdges = new THREE.EdgesGeometry(boxGeo);
const matCache = {};
function carMats(team) {
  if (matCache[team]) return matCache[team];
  const col = new THREE.Color(teamHex(team));
  return (matCache[team] = {
    paint: new THREE.MeshPhongMaterial({ color: col, shininess: 70, specular: 0x88aacc, flatShading: true }),
    dark: new THREE.MeshPhongMaterial({ color: new THREE.Color(teamHex(team)).multiplyScalar(0.22), shininess: 100, specular: 0xaaccff, flatShading: true }),
    wing: new THREE.MeshPhongMaterial({ color: new THREE.Color(teamHex(team)).multiplyScalar(0.55), flatShading: true }),
  });
}
const tireMat = new THREE.MeshLambertMaterial({ color: 0x14161c });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });

function buildCar(hb, team) {
  const m = carMats(team);
  const grp = new THREE.Group();
  grp.matrixAutoUpdate = false;
  const [sx, sy, sz] = hb.size;
  const [ox, oy, oz] = hb.off;
  const box = new THREE.Group();
  box.position.set(ox, oy, oz);
  box.scale.set(sx, sy, sz);
  grp.add(box);
  const body = new THREE.Mesh(unitBody(), m.paint);
  body.scale.set(1, 1, 0.62); body.position.z = -0.19;
  box.add(body);
  const cabin = new THREE.Mesh(unitCabin(), m.dark);
  cabin.scale.set(0.5, 0.85, 0.42); cabin.position.set(-0.08, 0, 0.29);
  box.add(cabin);
  const wing = new THREE.Mesh(boxGeo, m.wing);
  wing.scale.set(0.13, 0.95, 0.05); wing.position.set(-0.46, 0, 0.45);
  box.add(wing);
  for (const y of [-0.3, 0.3]) {
    const st = new THREE.Mesh(boxGeo, m.dark);
    st.scale.set(0.05, 0.05, 0.25); st.position.set(-0.45, y, 0.32);
    box.add(st);
  }
  for (const y of [-0.3, 0.3]) {
    const l = new THREE.Mesh(boxGeo, lightMat);
    l.scale.set(0.03, 0.18, 0.08); l.position.set(0.5, y, -0.12);
    box.add(l);
  }
  for (const wx of [0.3, -0.3]) for (const wy of [-1, 1]) {
    const w = new THREE.Mesh(wheelGeo, tireMat);
    w.position.set(ox + sx * wx, wy * (sy / 2 - 6), 0);
    grp.add(w);
  }
  const wire = new THREE.LineSegments(hitEdges, new THREE.LineBasicMaterial({ color: 0x39f3c8, depthTest: false }));
  wire.scale.set(sx, sy, sz); wire.position.set(ox, oy, oz);
  wire.visible = false; wire.renderOrder = 20;
  wire.name = 'wire';
  grp.add(wire);
  return grp;
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
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 10, 40000);
  camera.up.set(0, 0, 1);

  scene.add(new THREE.HemisphereLight(0xdbe8ff, 0x4a5a80, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(-1500, 2000, 4000);
  scene.add(sun);

  buildStadium(scene);
  const particles = createParticles(scene);

  // turbos
  const pads = [];
  const orbGeo = new THREE.SphereGeometry(55, 14, 10);
  const discGeo = new THREE.CylinderGeometry(70, 70, 6, 20);
  for (const p of BOOST_PADS) {
    let m;
    if (p.big) {
      m = new THREE.Group();
      const orb = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: 0xffb347 }));
      orb.position.z = 70;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(105, 105, 6, 24), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.55 }));
      ring.rotation.x = Math.PI / 2; ring.position.z = 3;
      ring.rotation.x = Math.PI / 2;
      m.add(orb, ring);
    } else {
      m = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: 0xffc766 }));
      m.rotation.x = Math.PI / 2; m.position.z = 3;
      const grp = new THREE.Group(); grp.add(m); m = grp;
    }
    m.position.set(p.x, p.y, 0);
    scene.add(m);
    pads.push({ obj: m, big: p.big });
  }

  // balón
  const ball = buildBall();
  scene.add(ball);
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false });
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(BALL_R * 0.95, 20), shadowMat);
  ballShadow.position.z = 1.5;
  scene.add(ballShadow);
  const shadowGeo = new THREE.CircleGeometry(60, 18);

  const cars = new Map();
  let camSettings = { ...DEFAULT_CAM };
  let ballCam = false;
  let showHitbox = false;
  const cam = { dir: new THREE.Vector2(0, 1), blend: 0, pos: new THREE.Vector3(0, -3000, 800), init: false, orbit: 0 };
  const tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3(), tf = new THREE.Vector3(), tu = new THREE.Vector3(), tl = new THREE.Vector3();
  const mat4 = new THREE.Matrix4();
  let size = { w: 0, h: 0 };

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
    for (let i = 0; i < n; i++) {
      tv.set(rnd(), rnd(), rnd()).normalize();
      const v = vmin + Math.random() * (vmax - vmin);
      const c = colors[(Math.random() * colors.length) | 0];
      particles.emit(p, [tv.x * v, tv.y * v, tv.z * v], lmin + Math.random() * (lmax - lmin), smin + Math.random() * (smax - smin), c[0], c[1], c[2]);
    }
  }

  function updateCamera(state, me, dt) {
    const set = camSettings;
    const target = me && !me.dead ? me : null;
    const b = state.ball.p;
    let anchor, f;
    if (target) { anchor = target.p; f = target.f; } else { anchor = b; f = [cam.dir.x, cam.dir.y, 0]; }
    const k = 1 - Math.exp(-dt * (4 + 26 * set.stiff));
    // dirección de coche (horizontal)
    let hx = f[0], hy = f[1];
    let hl = Math.hypot(hx, hy);
    const carDir = hl > 0.25 ? new THREE.Vector2(hx / hl, hy / hl) : cam.dir.clone();
    if (!cam.init) { cam.dir.copy(carDir); cam.init = true; }
    const useBall = (ballCam && target) ? 1 : 0;
    cam.blend += (useBall - cam.blend) * (1 - Math.exp(-dt * 6));
    // dirección hacia el balón
    let bx = b[0] - anchor[0], by = b[1] - anchor[1];
    const bl = Math.hypot(bx, by);
    const ballDir = bl > 60 ? new THREE.Vector2(bx / bl, by / bl) : carDir;
    const wantDir = target
      ? new THREE.Vector2().copy(carDir).multiplyScalar(1 - cam.blend).addScaledVector(ballDir, cam.blend)
      : carDir;
    if (wantDir.lengthSq() < 1e-4) wantDir.copy(carDir);
    wantDir.normalize();
    cam.dir.lerp(wantDir, target && cam.blend > 0.5 ? 1 - Math.exp(-dt * 12) : k).normalize();

    const dist = target ? set.dist : set.dist * 1.6;
    const hgt = target ? set.height : set.height * 1.8;
    tv.set(anchor[0] - cam.dir.x * dist, anchor[1] - cam.dir.y * dist, anchor[2] + hgt);
    // límites del estadio
    tv.x = Math.max(-HX + 40, Math.min(HX - 40, tv.x));
    tv.y = Math.max(-HY + 40, Math.min(HY - 40, tv.y));
    tv.z = Math.max(30, Math.min(H - 40, tv.z));
    camera.position.copy(tv);
    // dirección de mirada
    const a = set.angle * D2R;
    tv2.set(cam.dir.x * Math.cos(a), cam.dir.y * Math.cos(a), Math.sin(a));
    if (target || true) {
      // hacia el balón con inclinación limitada
      tv3.set(b[0] - tv.x, b[1] - tv.y, b[2] - tv.z).normalize();
      const elev = Math.max(-0.35, Math.min(0.8, Math.asin(tv3.z)));
      const hl2 = Math.hypot(tv3.x, tv3.y) || 1;
      tv3.set(tv3.x / hl2 * Math.cos(elev), tv3.y / hl2 * Math.cos(elev), Math.sin(elev));
      if (target) tv2.lerp(tv3, cam.blend).normalize();
      else tv2.copy(tv3);
    }
    camera.position.copy(tv);
    camera.lookAt(tv.x + tv2.x * 1000, tv.y + tv2.y * 1000, tv.z + tv2.z * 1000);
  }

  function menuCamera(dt) {
    cam.orbit += dt * 0.12;
    const r = 5200, a = cam.orbit;
    camera.position.set(Math.sin(a) * r * 0.55, -Math.cos(a) * r, 1900);
    camera.lookAt(0, 0, 250);
  }

  return {
    domElement: canvas,
    setCameraSettings(o) { camSettings = { ...camSettings, ...o }; size = { w: 0, h: 0 }; },
    setBallCam(v) { ballCam = !!v; },
    setShowHitbox(v) { showHitbox = !!v; },
    handleEvents(events, state) {
      if (!events) return;
      for (const e of events) {
        if (e.type === 'goal' && e.pos) {
          const c = new THREE.Color(teamHex(e.team));
          burst(e.pos, 240, [[c.r, c.g, c.b], [1, 1, 1], [c.r * 0.6 + 0.4, c.g * 0.6 + 0.4, c.b * 0.6 + 0.4]], 500, 2000, 0.8, 1.8, 45, 110);
          burst(e.pos, 60, [[1, 0.9, 0.5]], 100, 700, 0.4, 0.9, 120, 220);
        } else if (e.type === 'demo' && e.pos) {
          particles.emit(e.pos, [0, 0, 0], 0.25, 500, 1, 0.8, 0.5);
          burst(e.pos, 90, [[1, 0.6, 0.2], [1, 1, 0.9], [1, 0.3, 0.1]], 300, 1300, 0.5, 1.1, 50, 100);
        }
      }
    },
    render(state, myCarId, dtFrame) {
      const dt = Math.min(0.1, Math.max(0.0001, dtFrame || 0.016));
      resize();
      if (!state) {
        ball.matrix.makeTranslation(0, 0, BALL_R + 2); ball.matrixWorldNeedsUpdate = true;
        ballShadow.position.set(0, 0, 1.5);
        for (const c of cars.values()) c.grp.visible = c.label.visible = c.shadow.visible = false;
        for (const p of pads) p.obj.visible = true;
        menuCamera(dt);
        particles.update(dt);
        renderer.render(scene, camera);
        return;
      }
      // balón
      setBasis(ball, state.ball.f, state.ball.u, state.ball.p);
      const bz = state.ball.p[2];
      ballShadow.position.set(state.ball.p[0], state.ball.p[1], 1.5);
      const sc = Math.max(0.35, 1 - bz / 1800);
      ballShadow.scale.set(sc, sc, 1);
      shadowMat.opacity = 0.45 * sc;
      // turbos
      for (let i = 0; i < pads.length; i++) {
        const on = state.pads ? state.pads[i] !== '0' : true;
        const p = pads[i];
        p.obj.visible = p.big ? on : true;
        if (!p.big) p.obj.children[0].material.color.setHex(on ? 0xffc766 : 0x3a3326);
        else if (on) p.obj.children[0].position.z = 70 + Math.sin(performance.now() / 300 + i) * 8;
      }
      // coches
      const seen = new Set();
      let me = null;
      for (const c of state.cars) {
        if (c.id === myCarId) me = c;
        seen.add(c.id);
        let o = cars.get(c.id);
        if (!o || o.hb !== c.hb || o.team !== c.team) {
          if (o) { scene.remove(o.grp, o.label, o.shadow); }
          const hb = HITBOXES.find((h) => h.id === c.hb) || HITBOXES[0];
          const grp = buildCar(hb, c.team);
          scene.add(grp);
          const label = nameSprite(c.name, c.team);
          scene.add(label);
          const shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
          shadow.material.opacity = 0.35;
          scene.add(shadow);
          o = { grp, label, shadow, hb: c.hb, team: c.team, name: c.name, hbObj: hb, acc: 0, acc2: 0 };
          cars.set(c.id, o);
        }
        if (o.name !== c.name) { scene.remove(o.label); o.label = nameSprite(c.name, c.team); scene.add(o.label); o.name = c.name; }
        const vis = !c.dead;
        o.grp.visible = vis;
        o.label.visible = vis && c.id !== myCarId;
        o.shadow.visible = vis;
        o.grp.getObjectByName('wire').visible = showHitbox;
        if (!vis) continue;
        setBasis(o.grp, c.f, c.u, c.p);
        o.label.position.set(c.p[0], c.p[1], c.p[2] + 85);
        o.shadow.position.set(c.p[0], c.p[1], 1.2);
        o.shadow.scale.set(o.hbObj.size[0] / 150, o.hbObj.size[1] / 110, 1);
        o.shadow.material.opacity = 0.35 * Math.max(0.2, 1 - c.p[2] / 1500);
        // estelas
        const hb = o.hbObj;
        tf.set(c.f[0], c.f[1], c.f[2]);
        tu.set(c.u[0], c.u[1], c.u[2]);
        tl.crossVectors(tu, tf);
        if (c.boosting) {
          o.acc = Math.min(8, o.acc + dt * 110);
          while (o.acc >= 1) {
            o.acc -= 1;
            const back = hb.off[0] - hb.size[0] / 2 - 4 - Math.random() * 14;
            const q = [c.p[0] + tf.x * back + tu.x * (hb.off[2] - 6), c.p[1] + tf.y * back + tu.y * (hb.off[2] - 6), c.p[2] + tf.z * back + tu.z * (hb.off[2] - 6)];
            const hot = Math.random() < 0.4;
            particles.emit(q, [c.v[0] * 0.9 - tf.x * 380 + rnd() * 70, c.v[1] * 0.9 - tf.y * 380 + rnd() * 70, c.v[2] * 0.9 - tf.z * 380 + rnd() * 70],
              0.3 + Math.random() * 0.15, hot ? 34 : 46, 1, hot ? 0.85 : 0.5, hot ? 0.45 : 0.1);
          }
        } else o.acc = 0;
        if (c.ss) {
          o.acc2 = Math.min(6, o.acc2 + dt * 70);
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
