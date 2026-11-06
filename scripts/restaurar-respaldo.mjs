#!/usr/bin/env node
/**
 * Convierte una copia de seguridad (respaldo_AAAA-MM-DD_HHMM.json.gz, creada por la función "respaldo")
 * en un archivo SQL que restaura las tablas de la app tal como estaban en ese momento.
 *
 *   node scripts/restaurar-respaldo.mjs respaldo_2026-10-25_2300.json.gz            → restaurar.sql (todas las tablas)
 *   node scripts/restaurar-respaldo.mjs respaldo.json.gz --tablas requerimientos,pm_acciones
 *
 * El SQL se ejecuta como una sola transacción: si algo falla, no cambia nada.
 *   psql "postgresql://postgres:<clave>@<servidor>:5432/postgres" -f restaurar.sql
 * Ver docs/RESPALDOS.md. Los usuarios de acceso (auth.users) no se tocan: la restauración es para el mismo proyecto.
 *
 * Formato 3 (supabase/23): cada tabla viene como el texto JSON de PostgreSQL y se pasa tal cual, sin convertir los
 * números a JavaScript, para que los decimales (100.00) y las huellas de la auditoría queden idénticos.
 * Formato 2 (copias anteriores): se restaura igual, pero los decimales terminados en cero ya vienen sin sus ceros y
 * la verificación de la cadena de auditoría puede fallar después de restaurar.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';

const args = process.argv.slice(2);
const archivo = args.find(a => !a.startsWith('--'));
if (!archivo) {
  console.error('Uso: node scripts/restaurar-respaldo.mjs <respaldo.json.gz> [--tablas t1,t2] [--salida restaurar.sql]');
  process.exit(2);
}
const opt = n => {
  const i = args.indexOf('--' + n);
  return i >= 0 ? args[i + 1] : null;
};
let datos = fs.readFileSync(archivo);
if (datos[0] === 0x1f && datos[1] === 0x8b) datos = zlib.gunzipSync(datos);
const copia = JSON.parse(datos.toString('utf8'));
if (copia.formato !== 'control-entes-respaldo') {
  console.error('El archivo no es una copia de seguridad de Control de Entes.');
  process.exit(1);
}
/* Divide el texto de un arreglo JSON en el texto de cada elemento, sin interpretar números ni cadenas */
const elementos = texto => {
  const out = [];
  let prof = 0, enCadena = false, escape = false, inicio = -1;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === '[' || c === '{') {
      if (prof === 1 && inicio < 0) inicio = i;
      prof++;
    } else if (c === ']' || c === '}') {
      prof--;
      if (prof === 1 && inicio >= 0) { out.push(texto.slice(inicio, i + 1)); inicio = -1; }
    }
  }
  if (prof !== 0 || enCadena) throw new Error('El texto de una tabla no es un arreglo JSON completo');
  return out;
};
const v3 = copia.version >= 3;
if (v3 && !copia.tablas_texto) {
  console.error('La copia dice ser formato 3 pero no trae tablas_texto.');
  process.exit(1);
}
// Filas de cada tabla como texto JSON (formato 3: el de PostgreSQL; formato 2: el de JavaScript)
const filasTexto = t => (v3 ? elementos(copia.tablas_texto[t]) : copia.tablas[t].map(f => JSON.stringify(f)));
const fuente = v3 ? copia.tablas_texto : copia.tablas;
if (!v3)
  console.warn('Aviso: copia en formato 2. Los decimales terminados en cero (100.00) vienen sin sus ceros y la\n' +
    'verificación de la cadena de auditoría puede fallar después de restaurar. Use una copia en formato 3.');
const pedidas = opt('tablas') ? opt('tablas').split(',').map(s => s.trim()) : null;
const orden = copia.orden_restauracion.filter(t => fuente[t] && (!pedidas || pedidas.includes(t)));
if (pedidas) {
  const faltan = pedidas.filter(t => !orden.includes(t));
  if (faltan.length) {
    console.error('Tablas que no están en la copia: ' + faltan.join(', '));
    process.exit(1);
  }
}
// Separador de texto que no aparezca dentro de los datos
const marca = texto => {
  let m = 'ce';
  while (texto.includes('$' + m + '$')) m += 'x';
  return '$' + m + '$';
};
const LOTE = 500;
let sql = `-- Restauración de la copia ${path.basename(archivo)} (formato ${copia.version}, creada ${copia.creado} por ${copia.creado_por})
-- Tablas: ${orden.join(', ')}
-- Todo ocurre en una sola transacción: si algo falla, la base queda como estaba.
begin;
set local session_replication_role = replica;  -- sin disparadores mientras se restaura (la auditoría se restaura tal cual)
`;
for (const t of [...orden].reverse()) sql += `delete from public.${t};\n`;
const enLaCopia = {};
for (const t of orden) {
  const filas = filasTexto(t);
  enLaCopia[t] = filas.length;
  sql += `\n-- ${t}: ${filas.length} registros\n`;
  for (let i = 0; i < filas.length; i += LOTE) {
    const j = '[' + filas.slice(i, i + LOTE).join(',') + ']',
      q = marca(j);
    sql += `insert into public.${t} overriding system value select * from json_populate_recordset(null::public.${t}, ${q}${j}${q});\n`;
  }
  // Los contadores de las llaves numéricas continúan desde el último valor restaurado
  if (filas.length && typeof JSON.parse(filas[0]).id === 'number') sql += `select setval(s, greatest(coalesce((select max(id) from public.${t}), 0), 1)) from (select pg_get_serial_sequence('public.${t}', 'id') as s) x where s is not null;\n`;
}
sql += `\n-- Verificación\n` + orden.map(t => `select '${t}' as tabla, count(*) as registros, ${enLaCopia[t]} as en_la_copia from public.${t}`).join('\nunion all\n') + ';\ncommit;\n';
const salida = opt('salida') || 'restaurar.sql';
fs.writeFileSync(salida, sql);
console.log(`✓ ${salida}: ${orden.length} tablas, ${orden.reduce((a, t) => a + enLaCopia[t], 0)} registros (${(sql.length / 1024 / 1024).toFixed(1)} MB)`);
