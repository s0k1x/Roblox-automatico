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
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Web lista en dist/');
