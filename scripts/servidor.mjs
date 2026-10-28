#!/usr/bin/env node
/* =====================================================================
   Servidor de desarrollo: construye la app y la sirve en http://localhost:5173
   Cada vez que guardas un archivo en src/, datos/ o configuracion.json, la
   reconstruye y el navegador se recarga solo.
   Uso: npm run dev                    (variante demo, datos ficticios)
        npm run dev -- --variante institucional
   ===================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--variante');
const VARIANTE = i > 0 ? process.argv[i + 1] : 'demo';
const PUERTO = Number(process.env.PUERTO || 5173);
const SALIDA = path.join(RAIZ, 'build', 'dev');
const clientes = new Set();

function construir() {
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/build.mjs'), '--variante', VARIANTE, '--salida', path.join(SALIDA, 'index.html')], { encoding: 'utf8' });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.status === 0) fs.cpSync(path.join(RAIZ, 'public'), SALIDA, { recursive: true });
  clientes.forEach(res => res.write('data: recargar\n\n'));
}
construir();

let espera = null;
for (const d of ['src', 'datos', 'public', 'configuracion.json']) {
  const p = path.join(RAIZ, d);
  if (fs.existsSync(p)) fs.watch(p, { recursive: true }, () => { clearTimeout(espera); espera = setTimeout(construir, 150); });
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.css': 'text/css' };
// Script mínimo de recarga automática (solo en desarrollo, no va en la app publicada)
const RECARGA = '<script>new EventSource("/__recarga").onmessage=()=>location.reload()</script>';
http.createServer((req, res) => {
  if (req.url === '/__recarga') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clientes.add(res); req.on('close', () => clientes.delete(res)); return;
  }
  const url = decodeURIComponent(req.url.split('?')[0]);
  const archivo = path.join(SALIDA, url === '/' ? 'index.html' : url);
  if (!archivo.startsWith(SALIDA) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) { res.writeHead(404); res.end('No encontrado'); return; }
  let cuerpo = fs.readFileSync(archivo);
  if (archivo.endsWith('index.html')) cuerpo = cuerpo.toString().replace('</body>', RECARGA + '</body>');
  // El service worker no se registra en desarrollo para que siempre veas la última versión
  if (archivo.endsWith('sw.js')) cuerpo = 'self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",()=>self.registration.unregister());';
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(cuerpo);
}).listen(PUERTO, () => console.log(`\n  Control de Entes (${VARIANTE}) en http://localhost:${PUERTO}\n  Guarda cualquier archivo de src/ y el navegador se recarga solo. Ctrl+C para salir.\n`));
