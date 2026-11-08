/* Pruebas de los permisos (RLS) rol por rol, en un PostgreSQL real (PGlite), sin Supabase y con datos inventados.
   Instala supabase/00_instalar_todo.sql, crea una cuenta por rol y comprueba qué ve y qué puede cambiar cada una.

   PGlite NO está en las dependencias del proyecto: se usa una copia instalada aparte, indicada con CE_PGLITE (la
   carpeta que contiene node_modules/@electric-sql/pglite). Si no está, la prueba se omite y lo dice.
     CE_PGLITE="C:/ruta/a/pglite-prueba" node tests/rls.test.mjs

   Lo que se simula de Supabase: los roles anon, authenticated y service_role; auth.users y auth.uid() (a partir del
   ajuste request.jwt.claim.sub); storage. Los permisos que Supabase agrega por defecto a cada tabla nueva (por
   ejemplo los de anon sobre v_requerimientos, ver "Pendientes de seguridad" en el CLAUDE.md) no se simulan: se
   prueba lo que dan los scripts del repositorio. */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CE_PGLITE ? path.join(process.env.CE_PGLITE, 'node_modules', '@electric-sql', 'pglite', 'dist') : '';
if (!BASE || !fs.existsSync(path.join(BASE, 'index.js'))) {
  console.log('OMITIDA: pruebas de permisos (RLS). Falta PGlite: indique su carpeta con CE_PGLITE.');
  process.exit(0);
}
const { PGlite } = await import(pathToFileURL(path.join(BASE, 'index.js')).href);
const { pgcrypto } = await import(pathToFileURL(path.join(BASE, 'contrib', 'pgcrypto.js')).href);
let n = 0; const ok = () => { n++; };

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
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
`);
await db.exec(fs.readFileSync(path.join(RAIZ, 'supabase', '00_instalar_todo.sql'), 'utf8'));

// ---- Cuentas inventadas, una por rol (el disparador de auth.users crea su perfil)
const U = {
  admin: ['00000000-0000-4000-8000-0000000000a1', 'admin', 'A'], alcalde: ['00000000-0000-4000-8000-0000000000a2', 'alcalde', null],
  ci: ['00000000-0000-4000-8000-0000000000a3', 'control_interno', null], secA: ['00000000-0000-4000-8000-0000000000a4', 'secretario', 'A'],
  enlA: ['00000000-0000-4000-8000-0000000000a5', 'enlace', 'A'], secB: ['00000000-0000-4000-8000-0000000000a6', 'secretario', 'B'],
  inactivo: ['00000000-0000-4000-8000-0000000000a7', 'secretario', 'A']
};
const deps = (await db.query('select id, nombre from public.dependencias order by id limit 2')).rows;
const DEP = { A: deps[0], B: deps[1] };
const ente = (await db.query('select min(id) as id from public.entes')).rows[0].id;
for (const [clave, [id, rol, dep]] of Object.entries(U)) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${clave.toLowerCase()}.ficticio@cali.gov.co`]);
  await db.query('update public.profiles set rol = $2, dependencia_id = $3, activo = $4 where id = $1',
    [id, rol, dep ? DEP[dep].id : null, clave !== 'inactivo']);
}

// ---- Datos inventados en las dos dependencias
await db.exec(`
  select set_config('pm.interno', '1', false);
  insert into public.requerimientos (radicado, vigencia, ente_id, dependencia_id, asunto, fecha_radicacion, fecha_limite) values
    ('2026EE00000101', 2026, ${ente}, ${DEP.A.id}, 'PRUEBA · requerimiento de A', '2026-10-01', '2026-10-22'),
    ('2026EE00000102', 2026, ${ente}, ${DEP.B.id}, 'PRUEBA · requerimiento de B', '2026-10-01', '2026-10-22');
  insert into public.historico_requerimientos (vigencia, organismo, ente, oportunidad)
    select 2026, nombre, 'Ente ficticio', 'A tiempo' from public.dependencias where id in (${DEP.A.id}, ${DEP.B.id});
  insert into public.directorio (organismo, cargo, nombre) select nombre, 'Secretario(a)', 'Persona inventada' from public.dependencias where id in (${DEP.A.id}, ${DEP.B.id});
  insert into public.pm_planes (id, formato, contraloria, ejercicio, fecha_suscripcion) values
    ('00000000-0000-4000-8000-0000000000b1', 'PM_01_CGSC', 'Contraloría ficticia', 'PRUEBA · plan', '2026-01-15');
  insert into public.pm_hallazgos (id, plan_id, numero, descripcion) values
    ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', '1', 'PRUEBA · hallazgo de A'),
    ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', '2', 'PRUEBA · hallazgo de B');
  insert into public.pm_acciones (id, plan_id, hallazgo_id, dependencia_id, accion, fecha_inicio, fecha_fin) values
    ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', ${DEP.A.id}, 'PRUEBA · acción de A', '2026-02-01', '2026-12-31'),
    ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c2', ${DEP.B.id}, 'PRUEBA · acción de B', '2026-02-01', '2026-12-31');
  insert into public.pm_avances (accion_id, plan_id, dependencia_id, fecha_corte, cantidad, descripcion) values
    ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000b1', ${DEP.A.id}, '2026-06-30', 10, 'PRUEBA · avance de A'),
    ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000b1', ${DEP.B.id}, '2026-06-30', 10, 'PRUEBA · avance de B');
  insert into public.pm_avisos (accion_id, tipo, fecha_fin, dependencia_id) values ('00000000-0000-4000-8000-0000000000d1', 'previo', '2026-12-31', ${DEP.A.id});
  select set_config('pm.interno', '', false);
`);

// ---- Actuar como una cuenta: rol authenticated y auth.uid() de la cuenta, en una transacción que se deshace
async function como(quien, sql, params = []) {
  await db.exec('begin');
  try {
    if (quien === 'anon') await db.exec(`set local role anon`);
    else {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [U[quien][0]]);
      await db.exec(`set local role authenticated`);
    }
    const r = await db.query(sql, params);
    return { filas: r.rows, cambiadas: r.affectedRows ?? 0 };
  } catch (e) {
    return { error: e.message };
  } finally {
    await db.exec('rollback');
  }
}
const cuenta = async (quien, tabla) => {
  const r = await como(quien, `select count(*)::int as n from public.${tabla}`);
  return r.error ? 'sin permiso' : r.filas[0].n;
};
const matriz = async (tabla, esperado) => {
  for (const [quien, n0] of Object.entries(esperado)) {
    const real = await cuenta(quien, tabla);
    assert.strictEqual(real, n0, `${tabla}: ${quien} debería ver ${n0} y ve ${real}`); ok();
  }
};

// ---- 1. Qué ve cada rol
const TODOS2 = { admin: 2, alcalde: 2, ci: 2, secA: 1, enlA: 1, secB: 1, inactivo: 0 };
await matriz('requerimientos', TODOS2);
await matriz('v_requerimientos', TODOS2); // la vista respeta los permisos de quien consulta (security_invoker)
await matriz('historico_requerimientos', TODOS2);
await matriz('directorio', TODOS2);
await matriz('pm_acciones', TODOS2);
await matriz('pm_avances', TODOS2);
await matriz('pm_hallazgos', TODOS2);
await matriz('pm_planes', { admin: 1, alcalde: 1, ci: 1, secA: 1, secB: 1, inactivo: 0 });
await matriz('profiles', { admin: 7, alcalde: 7, ci: 7, secA: 1, enlA: 1, inactivo: 1 }); // cada quien ve el suyo
await matriz('pm_avisos', { admin: 1, ci: 1, alcalde: 0, secA: 0, inactivo: 0 });
{
  const a = await cuenta('admin', 'audit_log'), s = await cuenta('secA', 'audit_log'), i = await cuenta('inactivo', 'audit_log');
  assert.ok(a > 0 && s === 0 && i === 0, `audit_log: admin ${a}, secretario ${s}, inactivo ${i}`); ok();
}
for (const t of ['requerimientos', 'audit_log', 'profiles', 'pm_acciones', 'config']) {
  const r = await como('anon', `select count(*)::int as n from public.${t}`);
  assert.ok(r.error || r.filas[0].n === 0, `anon no debe ver ${t}`); ok();
}

// ---- 2. Qué puede cambiar cada rol
{
  // Configuración: solo el Super administrador
  const s = await como('secA', `update public.config set dias_rojo = 9 where id = 1`);
  assert.strictEqual(s.cambiadas, 0, 'un secretario no cambia la configuración'); ok();
  const a = await como('admin', `update public.config set dias_rojo = 9 where id = 1`);
  assert.strictEqual(a.cambiadas, 1); ok();
  // Perfiles: solo el Super administrador cambia roles (un secretario no puede volverse admin)
  const p = await como('secA', `update public.profiles set rol = 'admin' where id = $1`, [U.secA[0]]);
  assert.strictEqual(p.cambiadas, 0, 'un secretario no se cambia el rol'); ok();
  // Requerimientos: el enlace crea solo en su dependencia; el secretario no crea; nadie borra
  const r = id => `insert into public.requerimientos (radicado, vigencia, ente_id, dependencia_id, asunto, fecha_radicacion, fecha_limite)
    values ('2026EE0000020${id}', 2026, ${ente}, $1, 'PRUEBA · nuevo', '2026-10-01', '2026-10-22')`;
  assert.ok(!(await como('enlA', r(1), [DEP.A.id])).error, 'el enlace crea en su dependencia'); ok();
  assert.ok((await como('enlA', r(2), [DEP.B.id])).error, 'el enlace no crea en otra dependencia'); ok();
  assert.ok((await como('secA', r(3), [DEP.A.id])).error, 'el secretario no crea requerimientos'); ok();
  assert.strictEqual((await como('secA', `update public.requerimientos set asunto = 'cambiado' where dependencia_id = $1`, [DEP.A.id])).cambiadas, 0); ok();
  assert.ok((await como('admin', `delete from public.requerimientos`)).error, 'nadie borra requerimientos'); ok();
  // Planes: solo Super administrador y Control Interno los escriben
  assert.strictEqual((await como('secA', `update public.pm_planes set observaciones = 'x'`)).cambiadas, 0); ok();
  assert.strictEqual((await como('ci', `update public.pm_planes set observaciones = 'x'`)).cambiadas, 1); ok();
  // Auditoría y avisos: nadie los cambia desde la app
  assert.ok((await como('admin', `delete from public.audit_log`)).error, 'nadie borra la auditoría'); ok();
  assert.ok((await como('admin', `insert into public.pm_avisos (accion_id, tipo, fecha_fin) values ('00000000-0000-4000-8000-0000000000d2', 'previo', '2026-12-31')`)).error,
    'solo la función del servidor registra avisos'); ok();
}

// ---- 3. Funciones
{
  // respaldo_lote: solo la función del servidor (service_role)
  assert.ok((await como('admin', `select public.respaldo_lote('config', 'id', 0, 1)`)).error, 'la app no puede leer la copia completa'); ok();
  // cerrar_requerimiento: un secretario no cierra el de otra dependencia
  const idA = (await db.query(`select id from public.requerimientos where dependencia_id = $1 limit 1`, [DEP.A.id])).rows[0].id;
  const c = await como('secB', `select public.cerrar_requerimiento($1, '2026111000000001', '2026-10-05')`, [idA]);
  assert.ok(c.error && /otra dependencia/.test(c.error), 'un secretario no cierra requerimientos de otra dependencia'); ok();
  const c2 = await como('secA', `select public.cerrar_requerimiento($1, '2026111000000001', '2026-10-05')`, [idA]);
  assert.ok(!c2.error, 'el secretario sí cierra los de su dependencia: ' + (c2.error || '')); ok();
  // verificar_cadena_auditoria: exige una cuenta activa
  assert.ok((await como('inactivo', `select * from public.verificar_cadena_auditoria()`)).error); ok();
  assert.strictEqual((await como('admin', `select ok from public.verificar_cadena_auditoria()`)).filas[0].ok, true); ok();
}

await db.close();
console.log(`OK: ${n} verificaciones de permisos (RLS) rol por rol en PostgreSQL`);
