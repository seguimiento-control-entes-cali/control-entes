-- =====================================================================
-- 26 · Quita permisos sobrantes (pendientes de seguridad detectados en producción el 2-nov-2026)
-- 1. La vista v_requerimientos daba a anon (sin sesión) los 7 permisos y a authenticated también los de escritura.
--    El repositorio solo le da SELECT a authenticated (01_schema.sql). Supabase agrega los demás por defecto.
--    Hoy no se podía abusar (la vista usa security_invoker y las tablas tienen RLS sin políticas para anon),
--    pero un permiso que no se usa no debe existir.
-- 2. cerrar_requerimiento tenía permiso de ejecución para PUBLIC (cualquier rol). La función revisa el rol por
--    dentro y rechaza a quien no tiene sesión, pero el permiso debe ser solo de authenticated (01_schema.sql).
-- service_role (la llave del servidor, nunca en el navegador) no se toca.
-- Requiere: scripts 01 a 22. Se puede ejecutar más de una vez. No cambia ningún dato.
-- =====================================================================

revoke all on public.v_requerimientos from anon;
revoke insert, update, delete, truncate, references, trigger on public.v_requerimientos from authenticated;
grant select on public.v_requerimientos to authenticated;

revoke execute on function public.cerrar_requerimiento(uuid, text, date, text, text) from public, anon;
grant execute on function public.cerrar_requerimiento(uuid, text, date, text, text) to authenticated;

-- Verificación: todo debe salir en true.
select
  not exists (select 1 from information_schema.role_table_grants
              where table_schema = 'public' and table_name = 'v_requerimientos' and grantee = 'anon')
                                                                          as vista_sin_anon,
  (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'v_requerimientos' and grantee = 'authenticated')
    = 'SELECT'                                                            as vista_authenticated_solo_lectura,
  not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = 'public.cerrar_requerimiento(uuid, text, date, text, text)'::regprocedure
                and a.grantee = 0 and a.privilege_type = 'EXECUTE')       as cerrar_sin_public,
  not has_function_privilege('anon', 'public.cerrar_requerimiento(uuid, text, date, text, text)', 'execute')
                                                                          as cerrar_sin_anon,
  has_function_privilege('authenticated', 'public.cerrar_requerimiento(uuid, text, date, text, text)', 'execute')
                                                                          as cerrar_con_authenticated;
