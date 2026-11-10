// Publica en GitHub Pages lo que está en main (tarea "Publicar en GitHub Pages", publicar.yml) y comprueba el sitio.
// Siempre con la 2.x institucional y la 3.0 institucional en /v3/ (la misma base que la 2.x). Solo hace eso:
//   1. revisa que main local esté igual a origin/main y sin cambios pendientes (publica lo que ya pasó por PR);
//   2. lanza la tarea y espera a que termine;
//   3. comprueba en el sitio en línea la versión (package.json), la caché del service worker (public/sw.js) y /v3/.
// La llave de GitHub se toma de Git Credential Manager en el momento; nunca se escribe ni se muestra.
//   node scripts/publicar-pages.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const REPO = 'seguimiento-control-entes-cali/control-entes';
const WORKFLOW = 'publicar.yml';
const SITIO = 'https://seguimiento-control-entes-cali.github.io/control-entes/';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const espera = ms => new Promise(r => setTimeout(r, ms));
const falla = m => {
  console.error('NO SE PUBLICÓ: ' + m);
  process.exit(1);
};

// 1. Lo que se publica es exactamente origin/main
git('fetch', '-q', 'origin', 'main');
if (git('status', '--porcelain')) falla('hay cambios sin guardar en el repositorio.');
const local = git('rev-parse', 'main');
const remoto = git('rev-parse', 'origin/main');
if (local !== remoto) falla(`main local (${local.slice(0, 7)}) no es igual a origin/main (${remoto.slice(0, 7)}).`);

const cred = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8' });
const token = (/^password=(.*)$/m.exec(cred) || [])[1];
if (!token) falla('no hay llave de GitHub en Git Credential Manager.');
const api = async (ruta, opciones = {}) => {
  const r = await fetch('https://api.github.com/repos/' + REPO + ruta, {
    ...opciones,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'control-entes-publicar' }
  });
  if (!r.ok && r.status !== 204) falla(`GitHub respondió ${r.status} en ${ruta}`);
  return r.status === 204 ? null : r.json();
};

// 2. Lanzar y esperar
const antes = (await api(`/actions/workflows/${WORKFLOW}/runs?per_page=1`)).workflow_runs[0]?.id ?? 0;
await api(`/actions/workflows/${WORKFLOW}/dispatches`, {
  method: 'POST',
  body: JSON.stringify({ ref: 'main', inputs: { incluir_v3: 'true', variante_v3: 'institucional' } })
});
console.log(`Publicación pedida (main ${remoto.slice(0, 7)}, 3.0 institucional). Esperando…`);
let corrida;
for (let i = 0; i < 120; i++) {
  await espera(10000);
  corrida = (await api(`/actions/workflows/${WORKFLOW}/runs?per_page=1`)).workflow_runs[0];
  if (corrida && corrida.id !== antes && corrida.status === 'completed') break;
}
if (!corrida || corrida.id === antes || corrida.status !== 'completed') falla('la tarea no terminó en 20 minutos.');
console.log(`Ejecución #${corrida.run_number}: ${corrida.conclusion} (${corrida.html_url})`);
if (corrida.conclusion !== 'success') falla('la tarea de publicación no terminó bien; el sitio sigue con la versión anterior.');

// 3. Comprobar el sitio en línea
const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const cache = (/const CACHE = '([^']+)'/.exec(fs.readFileSync('public/sw.js', 'utf8')) || [])[1];
let ok = false;
for (let i = 0; i < 18 && !ok; i++) {
  const t = Date.now();
  const [html, sw, v3] = await Promise.all([
    fetch(SITIO + 'index.html?t=' + t).then(r => r.text()),
    fetch(SITIO + 'sw.js?t=' + t).then(r => r.text()),
    fetch(SITIO + 'v3/?t=' + t).then(r => r.status)
  ]);
  ok = html.includes(version) && sw.includes(cache) && v3 === 200;
  if (!ok) await espera(10000);
  else console.log(`En línea: versión ${version} · caché ${cache} · /v3/ responde ${v3}`);
}
if (!ok) falla(`la tarea terminó bien, pero el sitio aún no muestra la versión ${version} con la caché ${cache}.`);
console.log('PUBLICADO Y VERIFICADO.');
