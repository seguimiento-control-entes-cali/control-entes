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
const pedidas = opt('tablas') ? opt('tablas').split(',').map(s => s.trim()) : null;
const orden = copia.orden_restauracion.filter(t => copia.tablas[t] && (!pedidas || pedidas.includes(t)));
if (pedidas) {
  const faltan = pedidas.filter(t => !orden.includes(t));
  if (faltan.length) {
    console.error('Tablas que no están en la copia: ' + faltan.join(', '));
    process.exit(1);
  }
}
// Separador de texto que no aparezca dentro de los datos
const json = filas => JSON.stringify(filas);
const marca = texto => {
  let m = 'ce';
  while (texto.includes('$' + m + '$')) m += 'x';
  return '$' + m + '$';
};
const LOTE = 500;
let sql = `-- Restauración de la copia ${path.basename(archivo)} (creada ${copia.creado} por ${copia.creado_por})
-- Tablas: ${orden.join(', ')}
-- Todo ocurre en una sola transacción: si algo falla, la base queda como estaba.
begin;
set local session_replication_role = replica;  -- sin disparadores mientras se restaura (la auditoría se restaura tal cual)
`;
for (const t of [...orden].reverse()) sql += `delete from public.${t};\n`;
for (const t of orden) {
  const filas = copia.tablas[t];
  sql += `\n-- ${t}: ${filas.length} registros\n`;
  for (let i = 0; i < filas.length; i += LOTE) {
    const j = json(filas.slice(i, i + LOTE)),
      q = marca(j);
    sql += `insert into public.${t} overriding system value select * from json_populate_recordset(null::public.${t}, ${q}${j}${q});\n`;
  }
  // Los contadores de las llaves numéricas continúan desde el último valor restaurado
  if (filas.length && typeof filas[0].id === 'number') sql += `select setval(s, greatest(coalesce((select max(id) from public.${t}), 0), 1)) from (select pg_get_serial_sequence('public.${t}', 'id') as s) x where s is not null;\n`;
}
sql += `\n-- Verificación\n` + orden.map(t => `select '${t}' as tabla, count(*) as registros, ${copia.tablas[t].length} as en_la_copia from public.${t}`).join('\nunion all\n') + ';\ncommit;\n';
const salida = opt('salida') || 'restaurar.sql';
fs.writeFileSync(salida, sql);
console.log(`✓ ${salida}: ${orden.length} tablas, ${orden.reduce((a, t) => a + copia.tablas[t].length, 0)} registros (${(sql.length / 1024 / 1024).toFixed(1)} MB)`);
