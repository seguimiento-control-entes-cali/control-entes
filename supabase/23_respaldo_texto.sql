-- =====================================================================
-- 23 · Copias de seguridad que conservan los decimales exactos (formato 3)
-- La función "respaldo" leía las tablas como números de JavaScript, que no guardan los ceros de la derecha:
-- 100.00 quedaba como 100. Los datos se restauraban bien (las columnas tienen 2 decimales fijos), pero la copia
-- de cada fila que guarda la auditoría (audit_log.payload) cambiaba de texto y la cadena de huellas SHA-256
-- dejaba de verificar después de restaurar.
-- respaldo_lote() entrega cada lote de una tabla como el texto JSON que genera PostgreSQL, con los números tal
-- como están guardados. Solo lee; la usa la función "respaldo" con la llave de servicio (service_role).
-- Requiere: scripts 01 a 20. Se puede ejecutar más de una vez. No cambia ningún dato.
-- =====================================================================

create or replace function public.respaldo_lote(p_tabla text, p_orden text, p_desde integer, p_cantidad integer)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  -- Solo las tablas de la copia (las mismas de supabase/functions/respaldo/index.ts)
  if p_tabla <> all (array['config', 'entes', 'dependencias', 'profiles', 'directorio', 'requerimientos', 'alertas_log',
      'notificaciones', 'informes', 'accesos', 'historico_requerimientos', 'historico_cargas', 'tema_manual',
      'cruce_revision', 'cuentas_eventos', 'pm_planes', 'pm_hallazgos', 'pm_acciones', 'pm_avances', 'pm_traslados',
      'pm_prorrogas', 'archivo_documentos', 'pm_informes_avance', 'eventos_sistema', 'audit_log', 'pm_restauraciones']) then
    raise exception 'La tabla % no hace parte de la copia de seguridad', p_tabla;
  end if;
  if to_regclass('public.' || quote_ident(p_tabla)) is null then
    return null; -- la tabla aún no existe (script pendiente): la copia sigue sin ella
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = p_tabla and column_name = p_orden) then
    raise exception 'La tabla % no tiene la columna %', p_tabla, p_orden;
  end if;
  if p_desde < 0 or p_cantidad not between 1 and 5000 then
    raise exception 'Lote no válido (desde %, cantidad %)', p_desde, p_cantidad;
  end if;
  execute format('select coalesce(json_agg(t order by t.%1$I), ''[]''::json)::text
                    from (select * from public.%2$I order by %1$I offset $1 limit $2) t', p_orden, p_tabla)
     into v using p_desde, p_cantidad;
  return v;
end $$;
revoke all on function public.respaldo_lote(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.respaldo_lote(text, text, integer, integer) to service_role;

-- Verificación: debe dar true en las tres columnas.
select
  (select prosecdef from pg_proc where oid = 'public.respaldo_lote(text, text, integer, integer)'::regprocedure) as security_definer,
  has_function_privilege('service_role', 'public.respaldo_lote(text, text, integer, integer)', 'execute')   as service_role_puede,
  not has_function_privilege('authenticated', 'public.respaldo_lote(text, text, integer, integer)', 'execute') as usuarios_no_pueden;
