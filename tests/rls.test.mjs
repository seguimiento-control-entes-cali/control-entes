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
// Por defecto la sesión trae el código de dos pasos (aal2), como entra el Super administrador (script 27).
async function como(quien, sql, params = [], aal = 'aal2') {
  await db.exec('begin');
  try {
    if (quien === 'anon') await db.exec(`set local role anon`);
    else {
      await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [U[quien][0]]);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ aal })]);
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
  // Script 27: el Super administrador sin código (aal1) no tiene rol, aunque nunca haya activado la verificación
  assert.strictEqual((await como('admin', `select public.current_rol() as r`, [], 'aal1')).filas[0].r, null, 'admin sin código: sin rol'); ok();
  assert.strictEqual((await como('admin', `update public.config set dias_rojo = 9 where id = 1`, [], 'aal1')).cambiadas, 0, 'admin sin código no cambia la configuración'); ok();
  assert.strictEqual((await como('admin', `select count(*)::int as n from public.profiles`, [], 'aal1')).filas[0].n, 1, 'admin sin código solo ve su propio perfil'); ok();
  assert.strictEqual((await como('admin', `select public.current_rol() as r`)).filas[0].r, 'admin', 'admin con código: rol admin'); ok();
  // Control Interno sin verificación activada sigue trabajando sin código (recomendada, no obligatoria)
  assert.strictEqual((await como('ci', `select public.current_rol() as r`, [], 'aal1')).filas[0].r, 'control_interno', 'CI sin verificación activada conserva su rol'); ok();
}

// ---- 4. Planes: quién hace qué (script 28). Varios pasos con distintas cuentas en UNA transacción que se deshace.
async function flujo(pasos) {
  const res = [];
  await db.exec('begin');
  try {
    for (const [quien, sql, params = []] of pasos) {
      await db.exec('savepoint paso');
      try {
        await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [U[quien][0]]);
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ aal: 'aal2' })]);
        await db.exec('set local role authenticated');
        const r = await db.query(sql, params);
        res.push({ filas: r.rows, cambiadas: r.affectedRows ?? 0 });
        await db.exec('reset role');
        await db.exec('release savepoint paso');
      } catch (e) {
        await db.exec('rollback to savepoint paso');
        await db.exec('reset role');
        res.push({ error: e.message });
      }
    }
  } finally {
    await db.exec('rollback');
  }
  return res;
}
{
  const P = '00000000-0000-4000-8000-0000000000e1', H = '00000000-0000-4000-8000-0000000000e2';
  const acc = (id) => [`insert into public.pm_acciones (id, plan_id, hallazgo_id, dependencia_id, accion, fecha_inicio, fecha_fin)
    values ($1, $2, $3, $4, 'PRUEBA · acción formulada', '2026-12-01', '2027-06-30')`, [id, P, H, DEP.A.id]];
  const est = ['select formulacion_estado as e from public.pm_hallazgos where id = $1', [H]];
  const r = await flujo([
    /* 0 */ ['secA', `insert into public.pm_planes (id, formato, contraloria, ejercicio, fecha_suscripcion, numero_informe, estado)
              values ($1, 'PM_01_CGSC', 'Contraloría ficticia', 'PRUEBA · plan cargado por A', '2026-11-01', 'INF-77', 'en_ejecucion')`, [P]],
    /* 1 */ ['secA', 'select estado from public.pm_planes where id = $1', [P]],
    /* 2 */ ['secA', `insert into public.pm_hallazgos (id, plan_id, numero, descripcion, dependencia_id) values ($1, $2, '1', 'PRUEBA · hallazgo de A', $3)`, [H, P, DEP.A.id]],
    /* 3 */ ['secA', `insert into public.pm_hallazgos (plan_id, numero, descripcion, dependencia_id) values ($1, '2', 'PRUEBA · hallazgo ajeno', $2)`, [P, DEP.B.id]],
    /* 4 */ ['secA', ...est],
    /* 5 */ ['ci', `update public.pm_hallazgos set causa_raiz = 'Control Interno no formula' where id = $1`, [H]],
    /* 6 */ ['ci', ...acc('00000000-0000-4000-8000-0000000000e3')],
    /* 7 */ ['secA', 'select public.pm_enviar_formulacion($1)', [H]],
    /* 8 */ ['secA', `update public.pm_hallazgos set causa_metodo = 'cinco_porques', causa_raiz = 'Falta de lista de chequeo en la supervisión',
              causa_detalle = '{"cinco_porques":[{"problema":"Publicación tardía","porques":["a","b","c","d","e"],"resultado":"Falta lista de chequeo"}]}' where id = $1`, [H]],
    /* 9 */ ['secA', ...acc('00000000-0000-4000-8000-0000000000e4')],
    /* 10 */ ['secA', `update public.pm_hallazgos set formulacion_estado = 'validado' where id = $1`, [H]],
    /* 11 */ ['secA', 'select public.pm_enviar_formulacion($1)', [H]],
    /* 12 */ ['secA', `update public.pm_hallazgos set causa_raiz = 'Cambio después de enviar' where id = $1`, [H]],
    /* 13 */ ['secB', `select public.pm_revisar_formulacion($1, 'validado')`, [H]],
    /* 14 */ ['ci', `select public.pm_revisar_formulacion($1, 'devuelto', '')`, [H]],
    /* 15 */ ['ci', `select public.pm_revisar_formulacion($1, 'devuelto', 'Ajustar la meta de la acción')`, [H]],
    /* 16 */ ['secA', `update public.pm_acciones set meta = 'Meta ajustada' where id = $1`, ['00000000-0000-4000-8000-0000000000e4']],
    /* 17 */ ['secA', 'select public.pm_enviar_formulacion($1)', [H]],
    /* 18 */ ['ci', `select public.pm_revisar_formulacion($1, 'validado', 'Bien formulado')`, [H]],
    /* 19 */ ['secA', ...acc('00000000-0000-4000-8000-0000000000e5')],
    /* 20 */ ['secA', `select public.pm_marcar_sia($1, '2026-11-10') as n`, [P]],
    /* 21 */ ['ci', `update public.pm_acciones set obs_ci = 'Revisar soporte' where id = $1`, ['00000000-0000-4000-8000-0000000000e4']],
    /* 22 */ ['ci', `update public.pm_acciones set accion = 'Reescrita por CI' where id = $1`, ['00000000-0000-4000-8000-0000000000e4']],
    /* 23 */ ['secB', `select * from public.pm_buscar_informe('contraloría ficticia', ' inf-77 ')`],
    /* 24 */ ['secB', 'select count(*)::int as n from public.pm_planes where id = $1', [P]],
    /* 25 */ ['ci', `update public.pm_hallazgos set eval_cgsc = 'efectiva', eval_cgsc_fecha = '2027-08-01' where id = $1`, [H]],
    /* 26 */ ['secA', `update public.pm_planes set puntaje_cgsc = 95 where id = $1`, [P]],
    /* 27 */ ['alcalde', ...acc('00000000-0000-4000-8000-0000000000e6')],
    /* 28 */ ['secA', ...est],
    /* 29 */ ['ci', `update public.pm_hallazgos set causa_detalle = '{}' where id = $1`, [H]],
    /* 30 */ ['ci', `select causa_detalle->'cinco_porques'->0->>'resultado' as r from public.pm_hallazgos where id = $1`, [H]]
  ]);
  const err = (i, re, msg) => { assert.ok(r[i].error && (!re || re.test(r[i].error)), `${msg} (paso ${i}: ${JSON.stringify(r[i])})`); ok(); };
  const bien = (i, msg) => { assert.ok(!r[i].error, `${msg} (paso ${i}: ${r[i].error})`); ok(); };
  bien(0, 'la dependencia carga el informe (crea el plan)');
  assert.strictEqual(r[1].filas[0].estado, 'formulacion', 'el plan creado por la dependencia queda en formulación'); ok();
  bien(2, 'la dependencia carga su hallazgo');
  err(3, null, 'la dependencia no carga hallazgos de otra dependencia');
  assert.strictEqual(r[4].filas[0].e, 'borrador', 'el hallazgo nuevo empieza en borrador'); ok();
  err(5, /análisis de causa lo formula la dependencia/, 'Control Interno no escribe el análisis de causa');
  err(6, /las formula la dependencia/, 'Control Interno no crea acciones');
  err(7, /Falta el análisis de causa/, 'no se envía sin análisis de causa');
  bien(8, 'la dependencia escribe el análisis de causa');
  bien(9, 'la dependencia formula la acción');
  err(10, /cambia al enviarla/, 'nadie se valida a sí mismo');
  bien(11, 'la dependencia envía a Control Interno');
  err(12, /ya fue enviado/, 'enviado: la dependencia ya no lo cambia');
  err(13, /Solo Control Interno/, 'otra dependencia no revisa');
  err(14, /escriba la observación/, 'devolver exige observación');
  bien(15, 'Control Interno devuelve con observación');
  bien(16, 'devuelto: la dependencia ajusta la acción');
  bien(17, 'la dependencia reenvía');
  bien(18, 'Control Interno valida');
  err(19, null, 'validado: la dependencia ya no agrega acciones');
  assert.strictEqual(r[20].filas?.[0]?.n, 1, `la dependencia registra el cargue en el SIA (${JSON.stringify(r[20])})`); ok();
  bien(21, 'Control Interno deja su observación en la acción');
  err(22, /no modifica la acción \(accion\)/, 'Control Interno no reescribe la acción');
  assert.strictEqual(r[23].filas?.length, 1, `otra dependencia sabe que el informe ya fue cargado (${JSON.stringify(r[23])})`); ok();
  assert.strictEqual(r[24].filas[0].n, 0, 'pero no ve el plan ajeno'); ok();
  bien(25, 'Control Interno registra la evaluación de la Contraloría');
  assert.ok(r[26].error || r[26].cambiadas === 0, `la dependencia no registra el puntaje de la Contraloría (${JSON.stringify(r[26])})`); ok();
  err(27, null, 'el Alcalde no formula');
  assert.strictEqual(r[28].filas[0].e, 'validado', 'al final queda validado'); ok();
  err(29, /análisis de causa lo formula la dependencia/, 'Control Interno no cambia el formato de análisis de causas');
  assert.strictEqual(r[30].filas[0].r, 'Falta lista de chequeo', 'Control Interno sí ve lo que diligenció la dependencia'); ok();
  // Los hallazgos que ya existían (plan en ejecución) quedaron validados
  const viejos = await db.query(`select count(*)::int as n from public.pm_hallazgos where formulacion_estado <> 'validado'`);
  assert.strictEqual(viejos.rows[0].n, 0, 'los hallazgos existentes quedan validados'); ok();
}

// ---- 5. Script 29: la dependencia importa el informe desde el archivo
{
  const carga = (numero, estado) => JSON.stringify({
    archivo: 'informe.xlsx',
    plan: { formato: 'PM_01_CGSC', contraloria: 'Contraloría ficticia', ejercicio: 'PRUEBA · informe importado',
            fecha_suscripcion: '2026-11-01', numero_informe: numero, estado },
    hallazgos: [
      { numero: '1', descripcion: 'PRUEBA · hallazgo de A importado', dependencia_id: DEP.A.id,
        acciones: [
          { accion: 'PRUEBA · acción de A', dependencia_id: DEP.A.id, fecha_inicio: '2026-12-01', fecha_fin: '2027-06-30',
            avance: 50, fecha_corte: '2026-12-15' },
          { accion: 'PRUEBA · acción de B', dependencia_id: DEP.B.id, fecha_inicio: '2026-12-01', fecha_fin: '2027-06-30' }
        ] },
      { numero: '2', descripcion: 'PRUEBA · hallazgo sin dependencia' }
    ]
  });
  const r = await flujo([
    /* 0 */ ['secA', `select public.pm_importar($1::jsonb) as id`, [carga('INF-IMP-1', 'en_ejecucion')]],
    /* 1 */ ['admin', `select p.estado, (select count(*)::int from public.pm_hallazgos h where h.plan_id = p.id) as h,
                      (select count(*)::int from public.pm_acciones a where a.plan_id = p.id) as a,
                      (select count(*)::int from public.pm_avances v where v.plan_id = p.id) as v,
                      (select string_agg(distinct a.dependencia_id::text, ',') from public.pm_acciones a where a.plan_id = p.id) as deps,
                      (select string_agg(h.formulacion_estado, ',' order by h.numero) from public.pm_hallazgos h where h.plan_id = p.id) as est
                 from public.pm_planes p where p.numero_informe = 'INF-IMP-1'`],
    /* 2 */ ['secA', `select count(*)::int as n from public.pm_planes where numero_informe = 'INF-IMP-1'`],
    /* 3 */ ['secB', `select public.pm_importar($1::jsonb)`, [carga('inf-imp-1 ', 'formulacion')]],
    /* 4 */ ['alcalde', `select public.pm_importar($1::jsonb)`, [carga('INF-IMP-2', 'formulacion')]],
    /* 5 */ ['ci', `select public.pm_importar($1::jsonb) as id`, [carga('INF-IMP-3', 'en_ejecucion')]],
    /* 6 */ ['admin', `select p.estado, (select count(*)::int from public.pm_acciones a where a.plan_id = p.id) as a,
                      (select count(*)::int from public.pm_avances v where v.plan_id = p.id) as v
                 from public.pm_planes p where p.numero_informe = 'INF-IMP-3'`],
    /* 7 */ ['enlA', `select public.pm_importar($1::jsonb)`, [carga('', 'formulacion')]],
    /* 8 */ ['secA', `insert into public.archivo_documentos (plan_id, tipo, nombre, path, sha256, subido_por)
       select p.id, 'informe_final', 'informe.pdf', p.id || '/2026/x-a.pdf', repeat('a', 64), auth.uid()
         from public.pm_planes p where p.numero_informe = 'INF-IMP-1'`],
    /* 9 */ ['secA', `select count(*)::int as n from public.archivo_documentos where nombre = 'informe.pdf'`],
    /* 10 */ ['secB', `insert into public.archivo_documentos (plan_id, tipo, nombre, path, sha256, subido_por)
       select id, 'otro', 'ajeno.pdf', id || '/2026/b.pdf', repeat('b', 64), auth.uid() from public.pm_planes where numero_informe = 'INF-IMP-1'`],
    /* 11 */ ['secB', `select count(*)::int as n from public.archivo_documentos`],
    /* 12 */ ['ci', `select count(*)::int as n from public.archivo_documentos where nombre = 'informe.pdf'`]
  ]);
  const det = (i) => JSON.stringify(r[i]);
  assert.ok(!r[0].error, 'la dependencia importa el informe: ' + det(0)); ok();
  assert.strictEqual(r[1].filas?.[0]?.estado, 'formulacion', 'el plan importado por la dependencia queda en formulación'); ok();
  assert.strictEqual(r[1].filas[0].h, 2, 'trae los 2 hallazgos'); ok();
  assert.strictEqual(r[1].filas[0].a, 1, 'solo la acción de su dependencia: ' + det(1)); ok();
  assert.strictEqual(String(r[1].filas[0].deps), String(DEP.A.id), 'la acción queda en su dependencia'); ok();
  assert.strictEqual(r[1].filas[0].v, 0, 'no importa avances'); ok();
  assert.strictEqual(r[1].filas[0].est, 'borrador,borrador', 'los hallazgos quedan en borrador para formular'); ok();
  assert.strictEqual(r[2].filas?.[0]?.n, 1, 'la dependencia ve el plan que cargó'); ok();
  assert.ok(r[3].error && /ya fue cargado/.test(r[3].error) && /secA/i.test(r[3].error), 'otra dependencia no lo carga dos veces y sabe quién lo cargó: ' + det(3)); ok();
  assert.ok(r[4].error && /no puede importar/.test(r[4].error), 'el Alcalde no importa: ' + det(4)); ok();
  assert.ok(!r[5].error, 'Control Interno importa igual que antes: ' + det(5)); ok();
  assert.deepStrictEqual([r[6].filas?.[0]?.estado, r[6].filas?.[0]?.a, r[6].filas?.[0]?.v], ['en_ejecucion', 2, 1],
    'para Control Interno trae todas las acciones y los avances: ' + det(6)); ok();
  assert.ok(r[7].error && /número del informe/.test(r[7].error), 'la dependencia debe escribir el número del informe: ' + det(7)); ok();
  assert.ok(!r[8].error && r[8].cambiadas === 1, 'la dependencia guarda el informe original en el archivo de su plan: ' + det(8)); ok();
  assert.strictEqual(r[9].filas?.[0]?.n, 1, 've el documento que ella subió'); ok();
  assert.ok(r[10].error || r[10].cambiadas === 0, 'otra dependencia no sube documentos a un plan que no ve: ' + det(10)); ok();
  assert.strictEqual(r[11].filas?.[0]?.n, 0, 'otra dependencia no ve los documentos ajenos'); ok();
  assert.strictEqual(r[12].filas?.[0]?.n, 1, 'Control Interno ve el documento'); ok();
}

// ---- 6. Script 30: plantillas de oficio (depósito «plantillas») y datos del titular del ente
{
  // Supabase da a authenticated estos permisos sobre storage.objects; la RLS decide qué filas
  await db.exec(`grant select, insert, update, delete on storage.objects to authenticated;
    insert into storage.objects (bucket_id, name) values ('plantillas', 'oficio/dep-${DEP.A.id}.docx');`);
  const sube = quien => como(quien, `insert into storage.objects (bucket_id, name) values ('plantillas', 'oficio/dep-999.docx')`);
  const ve = async quien => (await como(quien, `select count(*)::int as n from storage.objects where bucket_id = 'plantillas'`)).filas?.[0]?.n;
  for (const q of ['secA', 'enlA', 'secB', 'ci', 'alcalde']) { assert.strictEqual(await ve(q), 1, q + ' lee la plantilla (descarga su membrete)'); ok(); }
  assert.strictEqual(await ve('inactivo'), 0, 'una cuenta inactiva no lee plantillas'); ok();
  assert.ok(!(await ve('anon')), 'sin sesión no se leen plantillas (rechazo o cero filas)'); ok();
  for (const q of ['secA', 'enlA', 'ci', 'alcalde']) { assert.ok((await sube(q)).error, q + ' no sube plantillas'); ok(); }
  assert.ok(!(await sube('admin')).error, 'el Super administrador sube plantillas'); ok();
  assert.ok((await como('admin', `insert into storage.objects (bucket_id, name) values ('plantillas', 'x.docx')`, [], 'aal1')).error, 'el Super administrador sin código no sube'); ok();
  const borra = quien => como(quien, `delete from storage.objects where bucket_id = 'plantillas'`);
  assert.strictEqual((await borra('secA')).cambiadas, 0, 'el secretario no borra plantillas'); ok();
  assert.strictEqual((await borra('admin')).cambiadas, 1, 'el Super administrador borra (reemplaza) plantillas'); ok();
  const reemplaza = quien => como(quien, `update storage.objects set name = name where bucket_id = 'plantillas'`);
  assert.strictEqual((await reemplaza('enlA')).cambiadas, 0, 'el enlace no reemplaza plantillas'); ok();
  assert.strictEqual((await reemplaza('admin')).cambiadas, 1, 'el Super administrador reemplaza plantillas'); ok();
  // Titular del ente y cargo del remitente: los edita solo el Super administrador (mismas reglas del catálogo)
  assert.strictEqual((await como('secA', `update public.entes set titular_nombre = 'Persona inventada'`)).cambiadas, 0, 'el secretario no edita el titular'); ok();
  assert.ok((await como('admin', `update public.entes set titular_nombre = 'Persona inventada', titular_cargo = 'Cargo inventado' where id = $1`, [ente])).cambiadas === 1, 'el Super administrador edita el titular'); ok();
  assert.ok((await como('admin', `update public.dependencias set cargo_remitente = 'Secretario(a) inventado' where id = $1`, [DEP.A.id])).cambiadas === 1, 'el Super administrador edita el cargo del remitente'); ok();
  assert.strictEqual((await como('enlA', `select count(*)::int as n from public.entes where titular_cargo = ''`)).filas?.[0]?.n > 0, true, 'todas las cuentas leen el titular (para armar el oficio)'); ok();
}

// ---- 7. Script 31: seguimiento del DACI a las metas cumplidas (solo Control Interno y Super administrador)
{
  const acc = '00000000-0000-4000-8000-0000000000d1';
  const verifica = q => como(q, `update public.pm_acciones set daci_verificacion = 'verificada', daci_fecha = '2026-11-24', daci_por = 'x' where id = '${acc}'`);
  assert.strictEqual((await verifica('ci')).cambiadas, 1, 'Control Interno registra la verificación del DACI: ' + JSON.stringify(await verifica('ci'))); ok();
  assert.strictEqual((await verifica('admin')).cambiadas, 1, 'el Super administrador también'); ok();
  const dep = await verifica('enlA');
  assert.ok((dep.error && /Control Interno/.test(dep.error)) || dep.cambiadas === 0, 'el enlace de la dependencia NO la registra: ' + JSON.stringify(dep)); ok();  const sec = await verifica('secA');
  assert.ok(sec.error || sec.cambiadas === 0, 'el secretario NO la registra'); ok();
  assert.ok((await como('ci', `update public.pm_acciones set daci_verificacion = 'aprobada' where id = '${acc}'`)).error, 'solo verificada o no_verificada'); ok();
  assert.ok((await como('ci', `update public.pm_acciones set accion = 'otra' where id = '${acc}'`)).error, 'Control Interno sigue sin poder reescribir la acción'); ok();
  assert.ok((await como('enlA', `insert into public.pm_acciones (plan_id, hallazgo_id, dependencia_id, accion, fecha_fin, daci_verificacion)
    values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000c1', ${DEP.A.id}, 'x', '2026-12-31', 'verificada')`)).error, 'la dependencia no crea una acción ya verificada'); ok();
}

await db.close();
console.log(`OK: ${n} verificaciones de permisos (RLS) rol por rol en PostgreSQL`);
