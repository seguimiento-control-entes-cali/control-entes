/* Script 26 (permisos sobrantes) en un PostgreSQL real (PGlite), sin Supabase.
   1. Instala supabase/00_instalar_todo.sql (que ya incluye el 26) y comprueba la verificación del 26.
   2. Simula el estado de PRODUCCIÓN del 2-nov-2026 (anon con los 7 permisos en la vista y PUBLIC con ejecución de
      cerrar_requerimiento), ejecuta el 26 dos veces y comprueba que todo queda en true.
   Como rls.test.mjs, se omite si no se indica CE_PGLITE (carpeta con node_modules/@electric-sql/pglite). */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CE_PGLITE ? path.join(process.env.CE_PGLITE, 'node_modules', '@electric-sql', 'pglite', 'dist') : '';
if (!BASE || !fs.existsSync(path.join(BASE, 'index.js'))) {
  console.log('OMITIDA: script 26 (permisos sobrantes). Falta PGlite: indique su carpeta con CE_PGLITE.');
  process.exit(0);
}
const { PGlite } = await import(pathToFileURL(path.join(BASE, 'index.js')).href);
const { pgcrypto } = await import(pathToFileURL(path.join(BASE, 'contrib', 'pgcrypto.js')).href);
let n = 0;
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
`);
const instalador = fs.readFileSync(path.join(RAIZ, 'supabase', '00_instalar_todo.sql'), 'utf8');
assert.ok(instalador.includes('26_permisos_sobrantes.sql'), 'el 00 incluye el 26'); n++;
await db.exec(instalador);
const s26 = fs.readFileSync(path.join(RAIZ, 'supabase', '26_permisos_sobrantes.sql'), 'utf8');
const verificar = async etapa => {
  const r = await db.exec(s26);
  const fila = r[r.length - 1].rows[0];
  for (const [k, v] of Object.entries(fila)) { assert.strictEqual(v, true, `${etapa}: ${k}`); n++; }
};
await verificar('instalación nueva');

// Estado de producción del 2-nov-2026
await db.exec(`
  grant all on public.v_requerimientos to anon, authenticated, service_role;
  grant execute on function public.cerrar_requerimiento(uuid, text, date, text, text) to public;`);
const antes = (await db.query(`select has_table_privilege('anon', 'public.v_requerimientos', 'insert') as a,
  has_function_privilege('anon', 'public.cerrar_requerimiento(uuid, text, date, text, text)', 'execute') as b`)).rows[0];
assert.deepStrictEqual(antes, { a: true, b: true }, 'la simulación reproduce el problema'); n++;
await verificar('producción, primera vez');
await verificar('producción, segunda vez (se puede repetir)');
// service_role no se toca y authenticated sigue leyendo la vista
const despues = (await db.query(`select has_table_privilege('service_role', 'public.v_requerimientos', 'select') as s,
  has_table_privilege('authenticated', 'public.v_requerimientos', 'select') as a`)).rows[0];
assert.deepStrictEqual(despues, { s: true, a: true }); n++;
await db.close();
console.log(`permisos-sobrantes.test.mjs: ${n} verificaciones OK`);
