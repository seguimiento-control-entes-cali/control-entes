#!/usr/bin/env node
/* =====================================================================
   Construcción de Control de Entes
   Une src/index.html + src/css/*.css + src/js/*.js en un único index.html
   listo para publicar (funciona sin servidor y como app instalable).

   Uso:
     node scripts/build.mjs                         → institucional (Supabase)
     node scripts/build.mjs --variante demo         → demostración con datos ficticios
     node scripts/build.mjs --variante demo --offline
     node scripts/build.mjs --variante privada      → datos reales locales (NO publicar)
   Opciones:
     --offline   incrusta íconos y fuentes (archivo único que abre sin internet)
     --pruebas   expone el gancho window.__CE_TEST (solo para pruebas automáticas)
     --salida X  ruta del archivo a generar

   No tiene dependencias: solo Node.js 18 o superior.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = (...p) => path.join(RAIZ, ...p);

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const VARIANTE = opt('variante', 'institucional');
const OFFLINE = opt('offline', false) === true || VARIANTE === 'privada';
const PRUEBAS = opt('pruebas', false) === true;
if (!['institucional', 'demo', 'privada'].includes(VARIANTE)) fallar(`Variante desconocida: ${VARIANTE}. Usa institucional, demo o privada.`);

function fallar(msg) { console.error('\n  ERROR: ' + msg + '\n'); process.exit(1); }
const leer = p => { if (!fs.existsSync(p)) fallar('No existe el archivo ' + path.relative(RAIZ, p)); return fs.readFileSync(p, 'utf8'); };
const ordenados = dir => fs.readdirSync(dir).filter(f => /^\d{2}-.+\.(js|css)$/.test(f)).sort();

/* ---------- configuración ---------- */
const conf = JSON.parse(leer(r('configuracion.json')));
const pkg = JSON.parse(leer(r('package.json')));
const CE_BUILD = {
  variante: VARIANTE,
  version: pkg.version,
  construido: new Date().toISOString().slice(0, 10),
  // La demo y la versión privada nunca se conectan a Supabase: corren en memoria.
  supabaseUrl: VARIANTE === 'institucional' ? (conf.supabaseUrl || '') : '',
  supabaseAnonKey: VARIANTE === 'institucional' ? (conf.supabaseAnonKey || '') : '',
  remitente: conf.remitente || '',
  pruebas: PRUEBAS
};
if (/service_role/i.test(CE_BUILD.supabaseAnonKey) || /"role"\s*:\s*"service_role"/.test(Buffer.from((CE_BUILD.supabaseAnonKey.split('.')[1] || ''), 'base64').toString()))
  fallar('configuracion.json contiene una service_role key. Usa la anon (publishable) key.');
/* Supabase en la nube (https://xxxx.supabase.co) o instalado en un servidor de la Alcaldía (https://servidor/…) */
if (CE_BUILD.supabaseUrl && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(CE_BUILD.supabaseUrl))
  fallar('supabaseUrl debe ser una dirección https, por ejemplo https://xxxx.supabase.co o https://servidor.cali.gov.co');

/* ---------- fuentes ---------- */
const css = ordenados(r('src/css')).map(f => `/* ===== src/css/${f} ===== */\n` + leer(r('src/css', f))).join('\n');
const jsPartes = ordenados(r('src/js')).map(f => `/* ===== src/js/${f} ===== */\n` + leer(r('src/js', f))).join('\n');
const js = "\n(function(){\n'use strict';\n\n/* Generado por scripts/build.mjs: no editar el archivo publicado, editar src/js/ */\nconst CE_BUILD = " +
  JSON.stringify(CE_BUILD) + ";\n\n" + jsPartes + "\n})();\n";
const escudo = 'data:image/png;base64,' + fs.readFileSync(r('src/assets/escudo.png')).toString('base64');

/* ---------- datos incrustados ---------- */
const scriptJson = (id, obj) => `<script id="${id}" type="application/json">` + JSON.stringify(obj).replace(/<\//g, '<\\/') + '</script>\n';
let datos = '';
if (VARIANTE === 'demo') {
  datos = scriptJson('histData', JSON.parse(leer(r('datos/demo/historico.json')))) + scriptJson('dirData', JSON.parse(leer(r('datos/demo/directorio.json'))));
} else if (VARIANTE === 'privada') {
  const { hist, dir } = cargarPrivados();
  datos = scriptJson('histData', hist) + scriptJson('dirData', dir);
}

/* ---------- ensamblado ---------- */
const TITULO = { institucional: 'Control de Entes · Alcaldía de Cali', demo: 'Control de Entes · Demostración', privada: '[PRIVADO] Control de Entes · Alcaldía de Cali' }[VARIANTE];
/* Librerías, íconos y fuentes: se sirven desde la carpeta vendor/ publicada junto a index.html (sin internet).
   La variante offline (un solo archivo) los lleva incrustados. */
const iconos = OFFLINE ? '<style>' + leer(r('vendor/iconos-y-fuentes-offline.css')) + '</style>'
  : '<link rel="stylesheet" href="vendor/fontawesome/css/all.min.css">';
const fuentes = OFFLINE ? '' : '<link rel="stylesheet" href="vendor/fuentes.css">';
/* config.js: dirección del servidor y clave pública. DATIC solo edita ese archivo para cambiar de servidor. */
const supa = OFFLINE ? '' : (VARIANTE === 'institucional' ? '<script src="config.js"></script>' : '') + '<script src="vendor/supabase.min.js"></script>';
const reemplazos = { '{{TITULO}}': TITULO, '{{ICONOS}}': iconos, '{{FUENTES}}': fuentes, '{{CSS}}': css, '{{ESCUDO}}': escudo, '{{DATOS}}': datos, '{{SUPABASE}}': supa, '{{JS}}': js };
let html = leer(r('src/index.html'));
for (const [k, v] of Object.entries(reemplazos)) {
  if (html.split(k).length !== 2) fallar(`La plantilla src/index.html debe contener ${k} exactamente una vez.`);
  html = html.split(k).join(v);   // split/join: el contenido no se interpreta como patrón
}

/* ---------- salida ---------- */
const DEF = { institucional: 'dist/institucional/index.html', demo: OFFLINE ? 'dist/Control_de_Entes_DEMO.html' : 'dist/demo/index.html', privada: 'datos_privados/salida/Control_de_Entes_PRIVADO_datos_reales.html' }[VARIANTE];
const salida = path.resolve(RAIZ, typeof opt('salida') === 'string' ? opt('salida') : DEF);
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, html);
// Carpeta publicable: copia el service worker, el manifiesto y los íconos
if (!OFFLINE && path.basename(salida) === 'index.html') {
  fs.cpSync(r('public'), path.dirname(salida), { recursive: true });
  fs.cpSync(r('vendor/web'), path.join(path.dirname(salida), 'vendor'), { recursive: true });
  if (VARIANTE === 'institucional')
    fs.writeFileSync(path.join(path.dirname(salida), 'config.js'),
      `/* Configuración de Control de Entes. Para usar otro servidor (por ejemplo, el de la Alcaldía),\n` +
      `   cambie estos valores; no hace falta modificar index.html. Nunca ponga aquí una clave service_role. */\n` +
      `window.CE_CONFIG = ${JSON.stringify({ supabaseUrl: CE_BUILD.supabaseUrl, supabaseAnonKey: CE_BUILD.supabaseAnonKey, remitente: CE_BUILD.remitente }, null, 2)};\n`);
}
const sha = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
console.log(`  ✓ ${VARIANTE}${OFFLINE ? ' (offline)' : ''}${PRUEBAS ? ' [pruebas]' : ''} → ${path.relative(RAIZ, salida)}  ${(html.length / 1024).toFixed(0)} KB  sha256:${sha}`);
if (VARIANTE === 'institucional' && !CE_BUILD.supabaseUrl) console.log('  ! configuracion.json no tiene supabaseUrl: la app abrirá en modo demostración.');

/* =====================================================================
   Datos privados (variante privada). Se leen de datos_privados/, carpeta
   excluida de git. Nunca se suben al repositorio.
   ===================================================================== */
function csv(texto) {
  // Lector CSV RFC 4180: comillas, comillas dobles escapadas, saltos de línea dentro de campos, BOM.
  texto = texto.replace(/^\uFEFF/, '');
  const filas = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (q) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  const [cab, ...resto] = filas.filter(f => f.length > 1 || f[0] !== '');
  return resto.map(f => Object.fromEntries(cab.map((h, i) => [h, f[i] ?? ''])));
}
function cargarPrivados() {
  const OPO = ['A tiempo', 'Tardía', 'Sin respuesta (vencida)', 'Pendiente en término', 'Respondida (sin fecha para medir)', 'No requiere respuesta'];
  const filas = csv(leer(r('datos_privados/historico_requerimientos.csv')));
  const entes = [...new Set(filas.map(x => x.ente || '—'))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const orgs = [], oidx = {};
  filas.forEach(x => { if (!(x.organismo in oidx)) { oidx[x.organismo] = orgs.length; orgs.push([x.organismo, x.tipo_organismo || '']); } });
  const N = v => (v === '' || v == null ? null : v);
  const I = v => (v === '' || v == null ? null : Math.trunc(parseFloat(v)));
  const rows = filas.map(x => {
    const o = OPO.indexOf(x.oportunidad);
    if (o < 0) fallar(`Oportunidad desconocida en histórico: "${x.oportunidad}" (fila Excel ${x.fila_excel || '?'})`);
    return [parseInt(x.vigencia, 10), N(x.radicacion_ente), entes.indexOf(x.ente || '—'), N(x.orfeo_entrada), N(x.fecha_recibo), oidx[x.organismo], N(x.asunto),
      I(x.termino_dias_habiles), N(x.fecha_maxima), N(x.orfeo_respuesta), N(x.fecha_respuesta), { 'Sí': 1, 'No': 0 }[x.respondio] ?? 2, o, I(x.retraso_dias_habiles), I(x.dias_habiles_responder)];
  });
  const corte = rows.reduce((m, x) => { const v = [x[10] || '', x[4] || ''].sort().pop(); return v > m ? v : m; }, '').slice(0, 10);
  const dir = csv(leer(r('datos_privados/directorio_gabinete.csv'))).map(x => ({ organismo: x.organismo, cargo: x.cargo, nombre: x.nombre, telefono: x.telefono, correo: x.correo || '' }));
  console.log(`  · datos privados: ${rows.length} requerimientos, corte ${corte}, ${dir.length} responsables en el directorio`);
  return { hist: { corte, opo: OPO, orgs, entes, rows }, dir };
}
