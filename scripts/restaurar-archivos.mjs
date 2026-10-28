#!/usr/bin/env node
/**
 * Restaura los archivos (soportes PDF y documentos del archivo de cada plan) desde el respaldo de archivos
 * que se descarga en Configuración → Copias de seguridad → «Descargar archivos (ZIP)».
 *
 *   1. Descomprima el ZIP en una carpeta (trae MANIFIESTO.csv y las carpetas soportes/ y archivo/).
 *   2. node scripts/restaurar-archivos.mjs <carpeta> --url https://xxxx.supabase.co --clave <service_role>
 *        [--sobrescribir]   reemplaza archivos que ya existan (por defecto, los deja como están)
 *        [--prueba]         solo verifica las huellas y muestra lo que haría, sin subir nada
 *
 * Antes de subir cada archivo comprueba su huella SHA-256 contra la registrada en el manifiesto; si no
 * coincide, no lo sube. La clave service_role solo se usa aquí, en el computador de quien restaura: nunca
 * se pone en la aplicación ni en config.js. Funciona con Supabase en la nube o instalado en un servidor
 * de la Alcaldía (misma API de almacenamiento). No requiere paquetes adicionales (Node 18 o posterior).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const carpeta = args.find(
  a => !a.startsWith('--') && !['--url', '--clave'].includes(args[args.indexOf(a) - 1])
);
const opt = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : null;
};
const URL_BASE = (opt('url') || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const CLAVE = opt('clave') || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SOBRESCRIBIR = args.includes('--sobrescribir');
const PRUEBA = args.includes('--prueba');
if (!carpeta || !fs.existsSync(path.join(carpeta, 'MANIFIESTO.csv'))) {
  console.error(
    'Uso: node scripts/restaurar-archivos.mjs <carpeta con MANIFIESTO.csv> --url <https://…> --clave <service_role> [--sobrescribir] [--prueba]'
  );
  process.exit(2);
}
if (!PRUEBA && (!/^https:\/\//.test(URL_BASE) || !CLAVE)) {
  console.error('Indique --url (https://…) y --clave (service_role), o use --prueba para solo verificar.');
  process.exit(2);
}

/* CSV del manifiesto: comillas dobles, separador coma, primera fila de encabezados */
function leerCsv(txt) {
  const filas = [];
  let f = [],
    v = '',
    q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"' && txt[i + 1] === '"') {
        v += '"';
        i++;
      } else if (c === '"') q = false;
      else v += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      f.push(v);
      v = '';
    } else if (c === '\n') {
      f.push(v.replace(/\r$/, ''));
      filas.push(f);
      f = [];
      v = '';
    } else v += c;
  }
  if (v || f.length) {
    f.push(v);
    filas.push(f);
  }
  return filas;
}
const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv'
};

const filas = leerCsv(fs.readFileSync(path.join(carpeta, 'MANIFIESTO.csv'), 'utf8').replace(/^\uFEFF/, ''));
const cab = filas.shift();
const col = n => cab.indexOf(n);
let subidos = 0,
  existentes = 0,
  omitidos = 0,
  errores = 0;
for (const f of filas) {
  if (f.length < cab.length) continue;
  const deposito = f[col('deposito')],
    ruta = f[col('ruta')],
    shaReg = f[col('sha256_registrado')],
    estado = f[col('estado')];
  if (estado === 'FALTA') {
    console.log(`  · omitido (faltaba al hacer el respaldo): ${deposito}/${ruta}`);
    omitidos++;
    continue;
  }
  const local = path.join(carpeta, deposito, ruta);
  if (!fs.existsSync(local)) {
    console.log(`  ✗ no está en la carpeta: ${deposito}/${ruta}`);
    errores++;
    continue;
  }
  const buf = fs.readFileSync(local);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (shaReg && sha !== shaReg) {
    console.log(`  ✗ huella distinta, no se sube: ${deposito}/${ruta}`);
    errores++;
    continue;
  }
  if (PRUEBA) {
    console.log(`  ✓ verificado: ${deposito}/${ruta}`);
    subidos++;
    continue;
  }
  const ext = (ruta.split('.').pop() || '').toLowerCase();
  const r = await fetch(
    `${URL_BASE}/storage/v1/object/${encodeURIComponent(deposito)}/${ruta.split('/').map(encodeURIComponent).join('/')}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLAVE}`,
        apikey: CLAVE,
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'x-upsert': SOBRESCRIBIR ? 'true' : 'false'
      },
      body: buf
    }
  );
  if (r.ok) {
    console.log(`  ✓ restaurado: ${deposito}/${ruta}`);
    subidos++;
  } else {
    const t = await r.text();
    if (/already exists|Duplicate/i.test(t)) {
      existentes++;
    } else {
      console.log(`  ✗ ${deposito}/${ruta}: ${r.status} ${t.slice(0, 160)}`);
      errores++;
    }
  }
}
console.log(
  `\n${PRUEBA ? 'Verificados' : 'Restaurados'}: ${subidos} · ya existían: ${existentes} · omitidos: ${omitidos} · con error: ${errores}`
);
process.exit(errores ? 1 : 0);
