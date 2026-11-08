/* Pruebas del instalador completo supabase/00_instalar_todo.sql (bloqueo 5). Sin base de datos:
   `node tests/instalador.test.cjs`. Comprueban que esté al día con los scripts (lo genera
   scripts/generar-instalador.mjs), qué incluye y qué no, y que no traiga direcciones, claves ni tareas programadas. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
let n = 0; const ok = () => { n++; };

const RAIZ = path.join(__dirname, '..');
const DIR = path.join(RAIZ, 'supabase');
const S00 = fs.readFileSync(path.join(DIR, '00_instalar_todo.sql'), 'utf8');

// --- 1. Está al día: es exactamente lo que genera el script a partir de los scripts actuales
{
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'generar-instalador.mjs'), '--revisar'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout); ok();
}

// --- 2. Incluye todos los scripts numerados, en orden, salvo 11, 15, 21 y 25; cada uno completo
{
  const secciones = [...S00.matchAll(/^-- >{20} (\d{2}_[^ ]+\.sql) <{20}$/gm)].map(m => m[1]);
  const esperados = fs.readdirSync(DIR).filter(f => /^\d{2}_.+\.sql$/.test(f) && !f.startsWith('00_')).sort()
    .filter(f => !['11', '15', '21', '25'].includes(f.slice(0, 2)));
  assert.deepStrictEqual(secciones, esperados); ok();
  assert.ok(esperados.includes('22_fecha_colombia.sql') && esperados.includes('23_respaldo_texto.sql')); ok();
  for (const f of ['11', '15', '21', '25']) assert.ok(!secciones.some(s => s.startsWith(f)), `no incluye el ${f}`), ok();
  for (const f of esperados) {
    const original = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n').split('\n')
      .filter(l => !/^(begin|commit);\s*$/i.test(l)).join('\n').replace(/\n+$/, '');
    assert.ok(S00.includes(original), `${f} está completo en el 00`); ok();
  }
}

// --- 3. Una sola transacción, sin tareas programadas, sin datos reales, sin direcciones ni claves
{
  assert.strictEqual((S00.match(/^begin;$/gm) || []).length, 1); ok();
  assert.strictEqual((S00.match(/^commit;$/gm) || []).length, 1); ok();
  assert.ok(S00.indexOf('begin;') < S00.indexOf('01_schema.sql <') && S00.lastIndexOf('commit;') > S00.indexOf('23_respaldo_texto.sql <')); ok();
  assert.ok(!/cron\.(schedule|alter_job)\s*\(/.test(S00) && !/vault\./.test(S00)); ok();
  assert.ok(!/[a-z]{20}\.supabase\.co/.test(S00) && !/sb_(publishable|secret)_/.test(S00) && !/eyJ[A-Za-z0-9_-]{20,}/.test(S00)); ok();
  assert.ok(!/@cali\.gov\.co'/.test(S00.replace(/like '%@cali\.gov\.co'/g, '')), 'sin correos reales'); ok();
}

// --- 4. Termina con la verificación de las 27 tablas y de las funciones clave
{
  assert.ok(/tablas_faltantes/.test(S00) && /funciones_ok/.test(S00)); ok();
  const inicio = S00.lastIndexOf('unnest(array[');
  const tablas = (S00.slice(inicio, S00.indexOf(']', inicio)).match(/'\w+'/g) || []).length;
  assert.strictEqual(tablas, 27); ok();
}

console.log(`OK: ${n} verificaciones del instalador completo (00_instalar_todo.sql)`);
