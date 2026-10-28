#!/usr/bin/env node
/* Extrae el JavaScript principal de un index.html construido, para revisarlo con ESLint.
   Uso: node scripts/extraer-js.mjs <index.html> <salida.js> */
import fs from 'node:fs';
import path from 'node:path';
const [, , entrada, salida] = process.argv;
if (!entrada || !salida) { console.error('Uso: node scripts/extraer-js.mjs <index.html> <salida.js>'); process.exit(1); }
const html = fs.readFileSync(entrada, 'utf8');
const ini = html.lastIndexOf('<script>'), fin = html.lastIndexOf('</script>');
const js = html.slice(ini + 8, fin);
if (!js.includes('const CE_BUILD')) { console.error('No se encontró el script principal en ' + entrada); process.exit(1); }
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, js);
console.log('  ✓ JavaScript extraído en ' + salida);
