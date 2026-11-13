// Genera la web estática en dist/ (para GitHub Pages, itch.io, Netlify, Cloudflare Pages…).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });
fs.cpSync(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(out, 'vendor/three.module.js'));
fs.copyFileSync(path.join(root, 'node_modules/peerjs/dist/peerjs.min.js'), path.join(out, 'vendor/peerjs.min.js'));
// Módulos extra de three para cargar los modelos 3D de los coches (conservan su estructura relativa).
for (const rel of ['loaders/GLTFLoader.js', 'libs/meshopt_decoder.module.js', 'utils/BufferGeometryUtils.js']) {
  const dst = path.join(out, 'vendor/addons', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(root, 'node_modules/three/examples/jsm', rel), dst);
}
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// Marca de versión en todas las rutas para que el navegador no mezcle archivos viejos y nuevos.
const ver = (process.env.GITHUB_SHA || Date.now().toString(36)).slice(0, 10);
const tag = (u) => `${u}?v=${ver}`;
const html = path.join(out, 'index.html');
fs.writeFileSync(html, fs.readFileSync(html, 'utf8')
  .replace(/(href|src)="(\.\/[^"?]+\.(?:css|js))"/g, (m, attr, u) => `${attr}="${tag(u)}"`)
  .replace(/"three":"(\.\/vendor\/three\.module\.js)"/, (m, u) => `"three":"${tag(u)}"`));
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
  const f = path.join(dir, e.name);
  if (e.isDirectory()) return walk(f);
  if (!f.endsWith('.js') || f.includes(`${path.sep}vendor${path.sep}`)) return;
  const src = fs.readFileSync(f, 'utf8');
  const outSrc = src.replace(/(from\s+|import\s*\(\s*)(['"])(\.\.?\/[^'"?]+\.js)\2/g, (m, pre, q, u) => `${pre}${q}${tag(u)}${q}`);
  fs.writeFileSync(f, outSrc);
});
walk(out);
console.log('Versión', ver);
console.log('Web lista en dist/');
