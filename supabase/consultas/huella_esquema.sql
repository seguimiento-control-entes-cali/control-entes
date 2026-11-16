-- Huella del esquema public (F4 · base de datos bajo control). SOLO LECTURA: no cambia nada.
-- La misma consulta se corre en producción (editor SQL de Supabase) y sobre los scripts del repositorio
-- (frontend/scripts/huella-bd.mjs, con PGlite); comparar las dos dice exactamente en qué difieren.
-- Incluye: tablas (RLS), columnas, restricciones, índices, vistas, funciones (con la huella md5 de su código),
-- disparadores, políticas RLS y permisos de anon, authenticated y service_role sobre tablas y funciones.
-- No incluye datos: ningún registro sale de la base.
select jsonb_pretty(jsonb_build_object(
  'tablas', (
    select coalesce(jsonb_agg(jsonb_build_object('tabla', c.relname, 'rls', c.relrowsecurity, 'rls_forzado', c.relforcerowsecurity) order by c.relname), '[]')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  'columnas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabla', c.relname, 'columna', a.attname, 'tipo', format_type(a.atttypid, a.atttypmod),
      'nula', not a.attnotnull, 'defecto', pg_get_expr(d.adbin, d.adrelid)
    ) order by c.relname, a.attname), '[]')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ),
  'restricciones', (
    select coalesce(jsonb_agg(jsonb_build_object('tabla', c.relname, 'nombre', k.conname, 'definicion', pg_get_constraintdef(k.oid)) order by c.relname, k.conname), '[]')
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and k.contype <> 'n' -- las NOT NULL ya están en «columnas» (PostgreSQL 18 también las guarda aquí)
  ),
  'indices', (
    select coalesce(jsonb_agg(jsonb_build_object('tabla', tablename, 'nombre', indexname, 'definicion', indexdef) order by tablename, indexname), '[]')
    from pg_indexes where schemaname = 'public'
  ),
  'vistas', (
    select coalesce(jsonb_agg(jsonb_build_object('vista', c.relname, 'tipo', c.relkind, 'columnas',
      (select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
      'opciones', coalesce(c.reloptions, '{}')) order by c.relname), '[]')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  ),
  'funciones', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'nombre', p.proname, 'argumentos', pg_get_function_identity_arguments(p.oid),
      'devuelve', pg_get_function_result(p.oid), 'seguridad_definidor', p.prosecdef,
      'configuracion', coalesce(p.proconfig, '{}'), 'md5', md5(p.prosrc)
    ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  ),
  'disparadores', (
    select coalesce(jsonb_agg(jsonb_build_object('tabla', c.relname, 'nombre', t.tgname, 'definicion', pg_get_triggerdef(t.oid)) order by c.relname, t.tgname), '[]')
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
  ),
  'politicas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabla', tablename, 'nombre', policyname, 'permisiva', permissive, 'roles', roles, 'orden', cmd,
      'usando', qual, 'verificando', with_check
    ) order by tablename, policyname), '[]')
    from pg_policies where schemaname = 'public'
  ),
  'permisos_tablas', (
    select coalesce(jsonb_agg(jsonb_build_object('tabla', table_name, 'rol', grantee, 'permiso', privilege_type) order by table_name, grantee, privilege_type), '[]')
    from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
  ),
  'permisos_funciones', (
    select coalesce(jsonb_agg(jsonb_build_object('funcion', p.proname, 'argumentos', pg_get_function_identity_arguments(p.oid), 'rol', r.rolname) order by p.proname, pg_get_function_identity_arguments(p.oid), r.rolname), '[]')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'public')) r
    where n.nspname = 'public' and p.prokind in ('f', 'p')
      and has_function_privilege(case when r.rolname = 'public' then 'anon' else r.rolname end, p.oid, 'execute')
      and r.rolname <> 'public'
  )
)) as huella;
