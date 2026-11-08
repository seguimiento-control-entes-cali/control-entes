/* Pruebas de la copia de seguridad en formato 3 (supabase/23 y supabase/functions/respaldo) y de su restauración
   (scripts/restaurar-respaldo.mjs). Sin base de datos: `node tests/respaldo.test.cjs`.
   Comprueban que los decimales (100.00, 12.50, 18 cifras) pasan al SQL de restauración con su texto exacto, que el
   formato 2 sigue funcionando con su aviso, y que las tres listas de tablas coinciden. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
let n = 0; const ok = () => { n++; };

const RAIZ = path.join(__dirname, '..');
const RESTAURAR = path.join(RAIZ, 'scripts', 'restaurar-respaldo.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ce-respaldo-'));
function restaurar(copia, ...args) {
  const archivo = path.join(tmp, `copia-${n}.json`), salida = path.join(tmp, `restaurar-${n}.sql`);
  fs.writeFileSync(archivo, typeof copia === 'string' ? copia : JSON.stringify(copia));
  const r = spawnSync(process.execPath, [RESTAURAR, archivo, '--salida', salida, ...args], { encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, sql: r.status === 0 ? fs.readFileSync(salida, 'utf8') : '' };
}

// Texto JSON tal como lo entrega PostgreSQL (json_agg): decimales con sus ceros, una cuantía de 18 cifras y una
// cadena con comas, llaves y comillas escapadas para probar la división en filas
const HALLAZGOS = '[{"id":"h1","numero":"1","cuantia":100.00}, \n {"id":"h2","numero":"2","cuantia":9876543210987654.32}, \n ' +
  '{"id":"h3","numero":"3","cuantia":null,"descripcion":"texto con }, ] y \\"comillas\\""}]';
const AUDITORIA = '[{"id":1,"tabla":"pm_acciones","payload":{"cantidad":100.00,"avance":12.50},"cambios":{}}, \n ' +
  '{"id":2,"tabla":"pm_acciones","payload":{"cantidad":100.00,"avance":20.00},"cambios":{"avance":{"a":20.00,"de":12.50}}}]';
const V3 = {
  formato: 'control-entes-respaldo', version: 3, creado: '2026-11-02T22:00:00Z', creado_por: 'prueba',
  orden_restauracion: ['config', 'pm_hallazgos', 'pm_traslados', 'audit_log'],
  conteo: { config: 0, pm_hallazgos: 3, audit_log: 2 },
  tablas_texto: { config: '[]', pm_hallazgos: HALLAZGOS, audit_log: AUDITORIA }, archivos: []
};

// --- 1. Formato 3: el texto exacto de los números llega al SQL
{
  const r = restaurar(V3);
  assert.strictEqual(r.status, 0, r.stderr); ok();
  assert.ok(!/formato 2/.test(r.stderr), 'sin aviso de formato 2'); ok();
  for (const t of ['"cuantia":100.00', '"cuantia":9876543210987654.32', '"cantidad":100.00', '"avance":12.50',
    '"avance":20.00', '"a":20.00', '"de":12.50', 'texto con }, ] y \\"comillas\\"'])
    assert.ok(r.sql.includes(t), `el SQL conserva ${t}`), ok();
  assert.ok(r.sql.includes('(formato 3,')); ok();
  // Cada fila completa, sin cortarse en la coma de la cadena
  assert.ok(/select 'pm_hallazgos' as tabla, count\(\*\) as registros, 3 as en_la_copia/.test(r.sql)); ok();
  assert.ok(/select 'audit_log' as tabla, count\(\*\) as registros, 2 as en_la_copia/.test(r.sql)); ok();
  // La tabla que no vino en la copia (pm_traslados) no se borra ni se restaura
  assert.ok(!r.sql.includes('public.pm_traslados')); ok();
  // El contador de audit_log (id numérico) continúa desde el último valor; el de pm_hallazgos (uuid) no se toca
  assert.ok(r.sql.includes("pg_get_serial_sequence('public.audit_log', 'id')")); ok();
  assert.ok(!r.sql.includes("pg_get_serial_sequence('public.pm_hallazgos', 'id')")); ok();
  assert.ok(/^begin;$/m.test(r.sql) && /^commit;$/m.test(r.sql)); ok();
}

// --- 2. Restaurar solo algunas tablas
{
  const r = restaurar(V3, '--tablas', 'audit_log');
  assert.strictEqual(r.status, 0, r.stderr); ok();
  assert.ok(r.sql.includes('delete from public.audit_log;') && !r.sql.includes('delete from public.pm_hallazgos;')); ok();
}

// --- 3. Formato 2 (copias anteriores): se restaura, pero con aviso, y ahí los ceros ya se habían perdido
{
  const v2 = { ...V3, version: 2, tablas: { config: [], pm_hallazgos: JSON.parse(HALLAZGOS), audit_log: JSON.parse(AUDITORIA) } };
  delete v2.tablas_texto;
  const r = restaurar(v2);
  assert.strictEqual(r.status, 0, r.stderr); ok();
  assert.ok(/formato 2/.test(r.stderr), 'avisa que es formato 2'); ok();
  assert.ok(r.sql.includes('"cuantia":100}') && !r.sql.includes('"cuantia":100.00')); ok(); // así fallaba la auditoría
  assert.ok(r.sql.includes('"cantidad":100,') && !r.sql.includes('"cantidad":100.00')); ok();
  assert.ok(!r.sql.includes('9876543210987654.32')); ok(); // JavaScript no guarda 18 cifras exactas
}

// --- 4. Errores claros
{
  const r = restaurar({ ...V3, tablas_texto: undefined });
  assert.notStrictEqual(r.status, 0); ok();
  const r2 = restaurar({ ...V3, tablas_texto: { ...V3.tablas_texto, pm_hallazgos: '[{"id":"h1"' } });
  assert.notStrictEqual(r2.status, 0, 'un arreglo incompleto no se restaura'); ok();
  const r3 = restaurar({ formato: 'otro' });
  assert.notStrictEqual(r3.status, 0); ok();
}

// --- 5. Las tablas de la copia son las mismas en la función, en respaldo_lote (23) y en el instalador
{
  const funcion = fs.readFileSync(path.join(RAIZ, 'supabase', 'functions', 'respaldo', 'index.ts'), 'utf8');
  const bloque = funcion.slice(funcion.indexOf('const TABLAS'), funcion.indexOf('];', funcion.indexOf('const TABLAS')));
  const enFuncion = [...bloque.matchAll(/\['(\w+)', '\w+'\]/g)].map(m => m[1]);
  const s23 = fs.readFileSync(path.join(RAIZ, 'supabase', '23_respaldo_texto.sql'), 'utf8');
  const en23 = [...s23.slice(s23.indexOf('array['), s23.indexOf(']) then')).matchAll(/'(\w+)'/g)].map(m => m[1]);
  const gen = fs.readFileSync(path.join(RAIZ, 'scripts', 'generar-instalador.mjs'), 'utf8');
  const enGen = [...gen.slice(gen.indexOf('const TABLAS'), gen.indexOf('];', gen.indexOf('const TABLAS'))).matchAll(/'(\w+)'/g)].map(m => m[1]);
  assert.strictEqual(enFuncion.length, 27); ok(); // 26 de la app + pm_avisos (script 24)
  assert.ok(enFuncion.indexOf('pm_avisos') > enFuncion.indexOf('pm_acciones')); ok(); // se restaura después de su acción
  assert.deepStrictEqual(en23, enFuncion); ok();
  assert.deepStrictEqual(enGen, enFuncion); ok();
  // respaldo_lote: solo lectura, solo service_role, y la función cae al formato 2 si falta el 23
  assert.ok(/stable security definer set search_path = ''/.test(s23)); ok();
  assert.ok(/revoke all on function public\.respaldo_lote\(text, text, integer, integer\) from public, anon, authenticated;/.test(s23)); ok();
  assert.ok(/grant execute on function public\.respaldo_lote\(text, text, integer, integer\) to service_role;/.test(s23)); ok();
  assert.ok(!/^\s*(insert|update|delete|truncate|drop|alter)\b/im.test(s23.slice(s23.indexOf('as $$'), s23.indexOf('end $$')))); ok();
  assert.ok(funcion.includes("const version = prueba.error ? 2 : 3;") && funcion.includes('tablas_texto: tablasTexto')); ok();
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`OK: ${n} verificaciones de la copia de seguridad y su restauración`);
