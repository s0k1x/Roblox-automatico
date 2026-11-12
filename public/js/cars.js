// Carrocerías de diseño propio por clase de hitbox.
// Cada función recibe (THREE, { size, off, mats, team, paint }) y devuelve
// { group, wheels?: { wf, wb, r } } en coordenadas locales del coche
// (x delante, y izquierda, z arriba; origen = centro de masas, 17 uu sobre el suelo).
export const CUSTOM_BODIES = {};

// ---------- utilidades de modelado ----------
// Caja de herramientas: piezas por material que luego se funden en una sola malla.
function kit(THREE) {
  const boxG = new THREE.BoxGeometry(1, 1, 1);
  const cylG = new THREE.CylinderGeometry(1, 1, 1, 10); // eje Y, radio 1, largo 1
  const parts = () => ({ paint: [], dark: [], wing: [], glass: [], team: [], head: [], tail: [], glow: [] });
  const Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), Pp = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), D = new THREE.Vector3();
  const box = (l, cx, cy, cz, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    E.set(rx, ry, rz); Q.setFromEuler(E);
    l.push({ g: boxG, m: new THREE.Matrix4().compose(Pp.set(cx, cy, cz), Q, S.set(sx, sy, sz)) });
  };
  // tubo cilíndrico entre dos puntos
  const tube = (l, a, b, r) => {
    D.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = D.length();
    Q.setFromUnitVectors(UP, D.normalize());
    l.push({ g: cylG, m: new THREE.Matrix4().compose(Pp.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), Q, S.set(r, len, r)) });
  };
  // polígono (x, z) extruido a lo ancho (eje y) con bisel; taper(x) estrecha la planta
  const prof = (l, pts, width, yc = 0, bev = 1, taper = null) => {
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    const depth = Math.max(0.6, width - 2 * bev);
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, curveSegments: 1 });
    g.rotateX(Math.PI / 2);
    g.translate(0, depth / 2 + yc, 0);
    if (taper) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * taper(p.getX(i)));
    }
    l.push({ g, m: new THREE.Matrix4() });
  };
  // contorno lateral con pasos de rueda: top va de atrás a delante (punto trasero alto, punto delantero bajo)
  const archPts = (top, zb, arches) => {
    const pts = [[top[0][0], zb]];
    for (const { x, R } of arches.slice().sort((a, b) => a.x - b.x)) {
      const a0 = Math.asin(Math.max(-0.95, Math.min(0.95, zb / R)));
      for (let i = 0; i <= 12; i++) {
        const a = (Math.PI - a0) + (a0 - (Math.PI - a0)) * (i / 12);
        pts.push([x + R * Math.cos(a), R * Math.sin(a)]);
      }
    }
    pts.push([top[top.length - 1][0], zb]);
    return pts.concat(top.slice().reverse());
  };
  // moldura curva alrededor de una rueda
  const lip = (l, wx, R, th, yc, w, bev = 0.4) => {
    const pts = [];
    const n = 12, a0 = Math.PI + 0.3, a1 = -0.3;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push([wx + (R + th) * Math.cos(a), (R + th) * Math.sin(a)]); }
    for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / n); pts.push([wx + R * Math.cos(a), R * Math.sin(a)]); }
    prof(l, pts, w, yc, bev);
  };
  // franja que sigue una línea superior
  const strip = (l, pts, thick, w, yc) => prof(l, pts.concat(pts.slice().reverse().map(([x, z]) => [x, z - thick])), w, yc, 0.25);
  const disc = (l, r, x, y, z) => {
    const g = new THREE.CircleGeometry(r, 10).rotateY(-Math.PI / 2);
    l.push({ g, m: new THREE.Matrix4().makeTranslation(x, y, z) });
  };
  const ring = (l, r, tube_, m4) => l.push({ g: new THREE.TorusGeometry(r, tube_, 6, 14), m: m4 });
  const merge = (list) => {
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
  };
  const build = (P, mats) => {
    const group = new THREE.Group();
    for (const key of Object.keys(P)) {
      if (!P[key].length) continue;
      const mesh = new THREE.Mesh(merge(P[key]), mats[key]);
      if (key === 'glass') mesh.renderOrder = 1;
      group.add(mesh);
    }
    return group;
  };
  return { THREE, parts, box, tube, prof, archPts, lip, strip, disc, ring, build };
}

// ---------- PLANO: deportivo musculoso de los 70 modernizado ----------
CUSTOM_BODIES.plano = (THREE, { size, off, mats }) => {
  const k = kit(THREE), P = k.parts(), { box, prof, tube, lip, strip, disc, archPts } = k;
  const L = size[0], wf = 0.32, wb = 0.344, r = 16.5;
  const WF = off[0] + L * wf, WB = off[0] - L * wb, R = r + 4;
  const zb = -8;
  const nose = (x) => (x > 58 ? 1 - 0.06 * Math.min(1, (x - 58) / 15) : 1);
  // contorno de las aletas (de atrás a delante) y capó central algo más bajo
  const top = [[-55, 16], [-54, 22], [-46, 25], [-20, 25.5], [10, 24.5], [34, 25.5], [60, 24], [70, 20], [73, 13], [73, -2]];
  const mid = top.map(([x, z]) => [x, z - 1.5]);
  for (const sg of [-1, 1]) prof(P.paint, archPts(top, zb, [{ x: WB, R }, { x: WF, R }]), 14, sg * 34.5, 1, nose);
  prof(P.paint, archPts(mid, zb, []), 56, 0, 1, nose);
  // cabina fastback: luna, techo y montantes
  prof(P.glass, [[-42, 22], [-42, 24], [-22, 31], [2, 31], [24, 24], [24, 22]], 47, 0, 1.2);
  prof(P.paint, [[-22.5, 30.2], [-20, 32.6], [1.5, 32.6], [4, 30.2]], 48, 0, 0.8);
  for (const sg of [-1, 1]) {
    box(P.paint, -32, sg * 24.2, 27.7, 21.2, 2.2, 1.8, 0, -0.337, 0);
    box(P.paint, 14, sg * 24.2, 27.7, 21.2, 2.2, 1.8, 0, 0.337, 0);
    box(P.paint, -8, sg * 24.2, 27.4, 4, 2.2, 7);
  }
  // doble franja central
  for (const sg of [-1, 1]) {
    const y = sg * 5.5;
    strip(P.wing, [[24, 24.0], [34, 24.4], [60, 22.9], [69, 19.3]], 1.2, 5, y);
    strip(P.wing, [[-22, 32.8], [-20, 32.9], [1.5, 32.9], [3.5, 32.7]], 1, 5, y);
    strip(P.wing, [[-53, 21.4], [-46, 24.0], [-38, 24.1]], 1.2, 5, y);
    // tomas de aire del capó
    box(P.dark, 44, sg * 15, 23.7, 13, 8, 1.2, 0, 0.06, 0);
    box(P.wing, 44, sg * 15, 24.4, 11, 0.8, 0.5, 0, 0.06, 0);
  }
  // frontal ancho y plano: barra de faros fina, parrilla oscura y spoiler delantero
  box(P.head, 74.4, 0, 12.5, 1.4, 60, 2, 0);
  box(P.dark, 74.2, 0, 5, 1.6, 44, 7);
  for (const sg of [-1, 1]) box(P.dark, 74, sg * 30, 3, 1.6, 12, 11);
  box(P.dark, 72, 0, -5, 7, 76, 3);
  box(P.team, 74.6, 0, -1.8, 1.2, 66, 1);
  // zaga: pilotos en barra completa, difusor, escapes
  box(P.tail, -56.4, 0, 14, 1.4, 68, 3.4);
  box(P.team, -56.4, 0, 9.5, 1.2, 46, 1.1);
  box(P.dark, -54, 0, -5, 6, 62, 3.4);
  for (const sg of [-1, 1]) {
    tube(P.dark, [-52, sg * 20, -3], [-58.5, sg * 20, -3], 2.6);
    disc(P.glow, 1.9, -58.7, sg * 20, -3);
  }
  // alerón trasero ancho sobre soportes
  box(P.wing, -50, 0, 28.5, 13, 80, 1.8, 0, -0.12, 0);
  for (const sg of [-1, 1]) {
    box(P.dark, -48, sg * 18, 26.4, 3, 2.4, 4.6);
    box(P.team, -50, sg * 40.5, 29.5, 15, 1.4, 7);
  }
  // espejos, faldones, molduras de rueda ensanchadas y línea de equipo
  for (const sg of [-1, 1]) {
    box(P.paint, 18, sg * 26, 26, 5, 4, 2.4);
    box(P.dark, 7.5, sg * 41.6, -5.5, 44, 2.2, 3.5);
    box(P.team, 7.5, sg * 41.9, 10, 46, 0.8, 1);
    lip(P.dark, WF, R, 1.6, sg * 41.9, 2);
    lip(P.dark, WB, R, 1.6, sg * 41.9, 2);
  }
  return { group: k.build(P, mats), wheels: { wf, wb, r } };
};

// ---------- ALTO: compacto deportivo tipo crossover ----------
CUSTOM_BODIES.alto = (THREE, { size, off, mats }) => {
  const k = kit(THREE), P = k.parts(), { box, prof, tube, lip, archPts } = k;
  const L = size[0], wf = 0.3198, wb = 0.3256, r = 18;
  const WF = off[0] + L * wf, WB = off[0] - L * wb, R = r + 3;
  const zb = -8;
  const top = [[-49, 24], [-48, 27], [-10, 27.2], [20, 28], [32, 29.2], [60, 28.2], [70, 25], [72.5, 18], [72.5, -1]];
  for (const sg of [-1, 1]) prof(P.paint, archPts(top, zb, [{ x: WB, R }, { x: WF, R }]), 15.5, sg * 31.75, 1);
  prof(P.paint, archPts(top.map(([x, z]) => [x, z - 1.2]), zb, []), 50, 0, 1);
  // resalte del capó
  prof(P.paint, [[24, 28.5], [32, 31.8], [56, 31.8], [62, 28.5]], 30, 0, 1);
  // cabina alta y cuadrada con lunas grandes
  prof(P.glass, [[-46, 26], [-46, 41.5], [2, 41.5], [22, 27]], 58, 0, 1.2);
  prof(P.paint, [[-47.5, 40.2], [-47.5, 42.8], [3, 42.8], [5, 40.2]], 62, 0, 1);
  for (const sg of [-1, 1]) {
    box(P.paint, -14, sg * 29.3, 33.5, 5, 2.4, 15);
    box(P.paint, -45.5, sg * 29.3, 33.5, 5, 2.4, 15);
    box(P.paint, 12.5, sg * 29.3, 33.5, 23.6, 2.4, 2, 0, 0.635, 0);
    box(P.dark, -21, sg * 24, 43.5, 50, 1.6, 1.4); // barras de techo
    box(P.dark, 20, sg * 32, 31, 6, 5, 4); // espejos
  }
  // portón vertical con alerón de techo
  box(P.wing, -49, 0, 44, 10, 60, 1.4, 0, -0.1, 0);
  for (const sg of [-1, 1]) {
    box(P.dark, -47, sg * 22, 43.2, 3, 2.4, 1.4);
    box(P.team, -49.5, sg * 30.5, 44.2, 9, 1, 3);
  }
  // morro corto y alto: dos faros redondos grandes, parrilla ancha, parachoques negro
  for (const sg of [-1, 1]) {
    tube(P.dark, [73, sg * 23, 15], [75, sg * 23, 15], 8.2);
    tube(P.head, [74, sg * 23, 15], [76, sg * 23, 15], 6.2);
  }
  box(P.dark, 73.8, 0, 15, 1.6, 24, 12);
  for (const z of [11.5, 15, 18.5]) box(P.wing, 74.8, 0, z, 0.8, 22, 1.3);
  box(P.dark, 72, 0, 0, 4, 76, 8);
  box(P.team, 74.2, 0, 8.3, 1.2, 56, 1.2);
  // zaga: pilotos verticales, placa, parachoques
  for (const sg of [-1, 1]) box(P.tail, -50.8, sg * 32, 14, 1.6, 5.5, 18);
  box(P.team, -50.8, 0, 22, 1.2, 44, 1.4);
  box(P.dark, -50.6, 0, 12, 1, 20, 8);
  box(P.dark, -49, 0, -3, 4, 70, 5);
  tube(P.dark, [-50, 14, -3], [-54, 14, -3], 2.2);
  P.glow.push({ g: new THREE.CircleGeometry(1.6, 10).rotateY(-Math.PI / 2), m: new THREE.Matrix4().makeTranslation(-54.2, 14, -3) });
  // faldones negros, molduras de rueda muy ensanchadas y línea de equipo
  for (const sg of [-1, 1]) {
    box(P.dark, 11, sg * 39.3, -5.5, 38, 3, 4.5);
    box(P.team, 11, sg * 39.9, 12, 36, 0.7, 1.2);
    lip(P.dark, WF, R, 3, sg * 38.6, 3, 0.5);
    lip(P.dark, WB, R, 3, sg * 38.6, 3, 0.5);
  }
  return { group: k.build(P, mats), wheels: { wf, wb, r } };
};

// ---------- ESTANDAR: buggy de dunas en cuña con jaula tubular ----------
CUSTOM_BODIES.estandar = (THREE, { size, off, mats }) => {
  const k = kit(THREE), P = k.parts(), { box, prof, tube, strip, disc } = k;
  const L = size[0], wf = 0.306, wb = 0.4227, r = 18;
  const WF = off[0] + L * wf, WB = off[0] - L * wb;
  const hw = (x) => 20 * (x > 35 ? 1 - 0.55 * (x - 35) / 38 : 1); // medio ancho del chasis
  const nose = (x) => hw(x) / 20;
  // chasis en cuña de paneles planos
  prof(P.paint, [[-44, -6], [58, -6], [72, -2], [73, 2], [40, 12], [16, 16.5], [10, 14], [-10, 14], [-14, 17], [-32, 23], [-44, 21]], 40, 0, 1.5, nose);
  strip(P.wing, [[16, 17.4], [40, 13.1], [70, 3.7]], 1, 8, 0);
  box(P.dark, 8, 0, -7, 100, 30, 2); // protector inferior
  box(P.dark, 66, 0, -5.5, 16, 30, 1.4, 0, 0.08, 0); // splitter delantero
  box(P.dark, 14, 0, 17.5, 4, 34, 3); // salpicadero
  for (const sg of [-1, 1]) {
    box(P.paint, 4, sg * 24, 11, 32, 8, 1.6, sg * -0.3, 0, 0); // paneles laterales
    // asiento y volante
    box(P.dark, -2, sg * 8.5, 16.5, 9, 10, 3);
    box(P.dark, -6.5, sg * 8.5, 23, 3, 10, 12, 0, -0.2, 0);
  }
  tube(P.dark, [13, 8.5, 17], [9, 8.5, 22], 0.8);
  P.dark.push({ g: new THREE.TorusGeometry(4, 0.7, 5, 12), m: new THREE.Matrix4().compose(new THREE.Vector3(9, 8.5, 22), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.85, 0)), new THREE.Vector3(1, 1, 1)) });
  // jaula tubular
  const A = [20, 18, 15.5], B = [2, 16, 35.5], C = [-12, 19, 15], Dd = [-14, 16, 35.5], F = [34, 12, 11], Rr = [-38, 16, 21];
  const m = (p, sg) => [p[0], p[1] * sg, p[2]];
  for (const sg of [-1, 1]) {
    for (const [a, b] of [[A, B], [C, Dd], [B, Dd], [C, B], [B, F], [Dd, Rr]]) tube(P.wing, m(a, sg), m(b, sg), 1.4);
  }
  tube(P.wing, m(B, -1), m(B, 1), 1.4);
  tube(P.wing, m(Dd, -1), m(Dd, 1), 1.4);
  // barra de focos LED sobre la jaula y dos focos cuadrados bajos
  box(P.dark, 1, 0, 37.4, 4.2, 35, 3.8);
  box(P.head, 3.5, 0, 37.4, 1, 32, 2.6);
  for (const sg of [-1, 1]) {
    box(P.dark, 72, sg * 7, 0, 2.5, 7.5, 7.5);
    box(P.head, 73.4, sg * 7, 0, 1.2, 5, 5);
  }
  // guardabarros planos tipo aleta, con soportes, y suspensión con brazos y amortiguadores
  for (const [wx, ry, front] of [[WF, 0.18, true], [WB, -0.08, false]]) {
    const hy = hw(wx) - 1.5;
    for (const sg of [-1, 1]) {
      box(P.paint, wx, sg * 35.5, 21.5, 30, 14, 1.6, 0, ry, 0);
      box(P.team, wx, sg * 42.5, 21.5, 30, 0.6, 0.8, 0, ry, 0);
      tube(P.dark, [wx, sg * 19, 13], [wx, sg * 33, 20.8], 0.9);
      tube(P.wing, [wx + 7, sg * hy, -4], [wx, sg * 29, -3], 1.2);
      tube(P.wing, [wx - 7, sg * hy, 6], [wx, sg * 29, 4], 1.2);
      tube(P.team, [wx, sg * (hy - 1), front ? 9 : 20], [wx, sg * 30, 2], 1.5);
    }
  }
  // zaga: pilotos, escapes, toma de aire con rejilla
  box(P.tail, -46.2, 0, 14, 1.4, 30, 3);
  box(P.team, -46.2, 0, 10, 1.2, 24, 1.2);
  for (const sg of [-1, 1]) {
    tube(P.dark, [-44, sg * 8, 3], [-51, sg * 8, 3], 2.2);
    disc(P.glow, 1.7, -51.2, sg * 8, 3);
  }
  box(P.dark, -26, 0, 25, 14, 18, 6);
  for (let i = 0; i < 5; i++) box(P.wing, -31 + i * 2.5, 0, 28.4, 1.2, 16, 1);
  // alerón alto y fino sobre dos soportes inclinados con placas del equipo
  box(P.wing, -46, 0, 33, 12, 62, 1.4, 0, -0.15, 0);
  for (const sg of [-1, 1]) {
    tube(P.dark, [-34, sg * 12, 21.5], [-44, sg * 12, 32], 1.3);
    box(P.team, -46, sg * 31.5, 33.5, 14, 1.4, 9);
  }
  return { group: k.build(P, mats), wheels: { wf, wb, r } };
};
