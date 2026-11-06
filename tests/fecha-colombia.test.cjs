/* Pruebas del script supabase/22_fecha_colombia.sql (fecha de Colombia en lugar de current_date, que en el
   servidor es UTC). Sin base de datos: revisan el texto de los scripts. `node tests/fecha-colombia.test.cjs`.
   La prueba real de PostgreSQL es la consulta de verificación del 22; aquí se comprueba que sus valores esperados
   son correctos. */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = () => { n++; };

const DIR = path.join(__dirname, '..', 'supabase');
const leer = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const S22 = leer('22_fecha_colombia.sql');
const md5 = s => crypto.createHash('md5').update(s.replace(/\r/g, '')).digest('hex');

/* Todas las definiciones "create or replace function public.X" de un texto: { nombre: [{ cabecera, cuerpo }] } */
function funciones(texto) {
  const out = {};
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/gi;
  let m;
  while ((m = re.exec(texto))) {
    const resto = texto.slice(m.index);
    const a = resto.indexOf('$$'), b = resto.indexOf('$$', a + 2);
    (out[m[1]] = out[m[1]] || []).push({ cabecera: resto.slice(0, a), cuerpo: resto.slice(a + 2, b) });
    re.lastIndex = m.index + b + 2;
  }
  return out;
}
const F22 = funciones(S22);
const ORIGEN = {
  cerrar_requerimiento: '01_schema.sql',
  sembrar_desde_historico: '12_operativo_desde_historico.sql',
  pm_reportar_avance: '13_planes_mejoramiento.sql',
  pm_resolver_prorroga: '20_norma_cgsc_y_memoria.sql'
};
const aColombia = s => s.replace(/current_date/g, 'public.hoy_colombia()');

// --- 1. Cada función del 22 es la del repositorio cambiando solo current_date (cabecera y cuerpo)
for (const [fn, archivo] of Object.entries(ORIGEN)) {
  const antes = funciones(leer(archivo))[fn];
  assert.strictEqual(antes.length, 1, `${fn} debe definirse una sola vez en ${archivo}`); ok();
  assert.strictEqual(F22[fn].length, 1, `${fn} debe definirse una sola vez en el 22`); ok();
  assert.ok(/current_date/.test(antes[0].cuerpo + antes[0].cabecera), `${fn} tenía current_date`); ok();
  assert.strictEqual(F22[fn][0].cuerpo, aColombia(antes[0].cuerpo), `cuerpo de ${fn}`); ok();
  assert.strictEqual(F22[fn][0].cabecera.trim(), aColombia(antes[0].cabecera).trim(), `cabecera de ${fn}`); ok();
  assert.ok(/security definer set search_path = public as\s*$/.test(F22[fn][0].cabecera), `${fn} sigue siendo security definer`); ok();
}

// --- 2. La protección acepta la huella de producción (2-nov-2026), la de la versión nueva y la del repositorio
//        (instalación nueva con 00_instalar_todo.sql), siempre sin CR
const PRODUCCION = {
  cerrar_requerimiento: 'bdddb0081e6f671a41444cfce78e0613',
  sembrar_desde_historico: 'd9c8b62a695b77afc7c56caaf094a29e',
  pm_reportar_avance: '1f2fe7b806ef75231e90283777947492',
  pm_resolver_prorroga: 'c2e4461c895bdb6cb1bb5ec217309fb7'
};
for (const [fn, prod] of Object.entries(PRODUCCION)) {
  const fila = S22.match(new RegExp(`'${fn}',\\s*jsonb_build_array\\('([0-9a-f]{32})', '([0-9a-f]{32})', '([0-9a-f]{32})'\\)`));
  assert.ok(fila, `la protección incluye ${fn}`); ok();
  assert.strictEqual(fila[1], prod, `huella de producción de ${fn}`); ok();
  assert.strictEqual(fila[2], md5(F22[fn][0].cuerpo), `huella nueva de ${fn}`); ok();
  assert.strictEqual(fila[3], md5(funciones(leer(ORIGEN[fn]))[fn][0].cuerpo), `huella del repositorio de ${fn}`); ok();
}
assert.ok(S22.includes("md5(replace(p.prosrc, E'\\r', ''))")); ok(); // compara siempre sin CR

// --- 3. Ninguna definición vigente usa current_date (la última de cada función en los scripts 01 en adelante)
{
  const scripts = fs.readdirSync(DIR).filter(f => /^(0[1-9]|[1-9][0-9])_.*\.sql$/.test(f)).sort();
  const vigente = {};
  for (const f of scripts) for (const [fn, defs] of Object.entries(funciones(leer(f)))) vigente[fn] = { f, ...defs.at(-1) };
  const conCurrentDate = Object.entries(vigente)
    .filter(([, d]) => /current_date/i.test(d.cabecera + d.cuerpo)).map(([fn, d]) => `${fn} (${d.f})`);
  assert.deepStrictEqual(conCurrentDate, [], 'funciones vigentes con current_date'); ok();
  // La vista: su última definición es la del 22
  const conVista = scripts.filter(f => /create\s+(or\s+replace\s+)?view\s+public\.v_requerimientos/i.test(leer(f)));
  assert.strictEqual(conVista.at(-1), '22_fecha_colombia.sql'); ok();
}

// --- 4. Vista: create or replace (sin drop), security_invoker y las 21 columnas de producción, sin hist_key
{
  assert.ok(!/drop\s+view/i.test(S22)); ok();
  const v = S22.match(/create or replace view public\.v_requerimientos with \(security_invoker = true\) as([\s\S]*?);/);
  assert.ok(v, 'vista con security_invoker'); ok();
  const def = v[1];
  assert.ok(!/current_date/i.test(def) && !/hist_key/.test(def) && !/r\.\*/.test(def)); ok();
  const columnas = def.slice(def.indexOf('select') + 6, def.search(/\bfrom public\.requerimientos/)).replace(/\([\s\S]*?\)/g, '')
    .replace(/case[\s\S]*?end/g, 'X').split(',').map(c => c.trim().split(/\s+/).at(-1).replace(/^r\./, ''));
  assert.deepStrictEqual(columnas, ['id', 'radicado', 'vigencia', 'ente_id', 'dependencia_id', 'asunto', 'fecha_radicacion',
    'fecha_limite', 'estado', 'orfeo_salida', 'fecha_cierre', 'soporte_path', 'soporte_hash', 'escalado_at', 'created_by',
    'created_at', 'ente', 'ente_sigla', 'dependencia', 'dias_restantes', 'semaforo']); ok();
}

// --- 5. Permisos: las 4 funciones no se tocan (create or replace conserva dueño y permisos); las nuevas, a los 3 roles
{
  for (const fn of Object.keys(ORIGEN)) assert.ok(!new RegExp(`^\\s*(grant|revoke)\\b[^;]*${fn}`, 'im').test(S22), `sin grant ni revoke de ${fn}`), ok();
  assert.ok(/grant execute on function public\.fecha_colombia\(timestamptz\), public\.hoy_colombia\(\) to anon, authenticated, service_role;/.test(S22)); ok();
  assert.ok(/alter table public\.requerimientos alter column fecha_radicacion set default public\.hoy_colombia\(\);/.test(S22)); ok();
  assert.ok(/^begin;$/m.test(S22) && /^commit;$/m.test(S22)); ok(); // una sola transacción
}

// --- 6. Los valores esperados de la verificación son correctos (incluido el caso de las 11:00 p. m. en Cali)
{
  const fechaColombia = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso));
  const casos = [...S22.matchAll(/fecha_colombia\('([0-9-]+ [0-9:]+)\+00'\) = date '([0-9-]+)'/g)];
  assert.strictEqual(casos.length, 3); ok();
  for (const [, ts, esperado] of casos) assert.strictEqual(fechaColombia(ts.replace(' ', 'T') + 'Z'), esperado, ts), ok();
  // 30-oct-2026 11:00 p. m. en Cali = 31-oct 04:00 UTC: el servidor (UTC) ya dice 31; Colombia sigue en 30
  assert.strictEqual(new Date('2026-10-31T04:00:00Z').toISOString().slice(0, 10), '2026-10-31'); ok();
  assert.strictEqual(fechaColombia('2026-10-31T04:00:00Z'), '2026-10-30'); ok();
}

console.log(`OK: ${n} verificaciones del script 22 (fecha de Colombia en la base de datos)`);
