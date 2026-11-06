-- =====================================================================
-- Comprobación de una restauración (bloqueo 4). SOLO LECTURA: no cambia nada y no muestra datos, solo conteos y
-- huellas. Ejecutarla antes de crear la copia y después de restaurarla: las dos filas deben ser idénticas.
--  * cadena: la misma revisión que verificar_cadena_auditoria() (supabase/01_schema.sql), sin exigir sesión de la
--    app, para poder usarla en el SQL Editor. huellas_distintas y eslabones_rotos deben ser 0.
--  * huella_numeros: texto exacto de las columnas decimales (100.00 y 100 dan huellas distintas).
--  * huella_auditoria: texto exacto de la copia de cada fila guardada en la auditoría (payload y cambios).
-- =====================================================================
with c as (
  select id, hash, prev_hash,
         coalesce(lag(hash) over (order by id), repeat('0', 64)) as anterior,
         public.audit_hash(prev_hash, tabla, accion, registro_id, usuario, created_at, payload, cambios) as calculada
    from public.audit_log
)
select
  (select count(*) from c)                                                   as registros_auditoria,
  (select count(*) from c where calculada <> hash)                           as huellas_distintas,
  (select count(*) from c where prev_hash <> anterior)                       as eslabones_rotos,
  (select min(id) from c where calculada <> hash or prev_hash <> anterior)   as primer_id_roto,
  (select md5(coalesce(string_agg(x, '|' order by x), '')) from (
     select 'h:' || id || ':' || coalesce(cuantia::text, '') as x from public.pm_hallazgos
     union all select 'a:' || id || ':' || cantidad::text || ':' || avance::text from public.pm_acciones
     union all select 'v:' || id || ':' || cantidad::text from public.pm_avances) s) as huella_numeros,
  (select md5(coalesce(string_agg(payload::text || '#' || cambios::text, '|' order by id), ''))
     from public.audit_log)                                                  as huella_auditoria;
