-- =====================================================================
-- 25 · Programar el aviso diario de planes (lunes a viernes, 7:00 a. m. hora de Colombia = 12:00 UTC)
-- La tarea queda SIEMPRE DESACTIVADA: se activa aparte, cuando DATIC autorice el piloto y estén los secretos SMTP:
--   select cron.alter_job(jobid, active := true) from cron.job where jobname = 'avisos-planes';
-- Además la función solo envía si la casilla "Aviso diario" está activa en Configuración y si hoy es día hábil
-- (los festivos no envía nada).
-- Igual que el 21: lee la dirección y la clave de la bóveda (ce_proyecto_url y ce_resumen_clave, ver
-- docs/RESPALDOS.md) y no contiene ningún valor. Requiere pg_cron, pg_net, el script 24 y la función avisos-planes.
-- Se puede ejecutar más de una vez: actualiza la tarea existente (conserva su jobid y su historial), no la duplica.
-- No va en 00_instalar_todo.sql: se ejecuta aparte, solo donde haya que programar tareas.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_faltan text;
  v_id     bigint;
  v_cmd text := $c$ select net.http_post(
       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'ce_proyecto_url') || '/functions/v1/avisos-planes',
       headers := jsonb_build_object('Content-Type', 'application/json',
                    'x-cron-clave', (select decrypted_secret from vault.decrypted_secrets where name = 'ce_resumen_clave')),
       body    := '{}'::jsonb
     ) $c$;
begin
  select string_agg(n, ', ') into v_faltan
    from unnest(array['ce_proyecto_url', 'ce_resumen_clave']) as n
   where not exists (select 1 from vault.secrets s where s.name = n);
  if v_faltan is not null then
    raise exception 'Faltan en la bóveda los secretos: %. No se cambió ninguna tarea.', v_faltan;
  end if;
  if to_regclass('public.pm_avisos') is null then
    raise exception 'Falta ejecutar supabase/24_avisos_planes.sql. No se cambió ninguna tarea.';
  end if;
  if (select count(*) from cron.job where jobname = 'avisos-planes') > 1 then
    raise exception 'Hay tareas repetidas llamadas avisos-planes. Revisar cron.job antes de seguir. No se cambió ninguna tarea.';
  end if;

  select jobid into v_id from cron.job where jobname = 'avisos-planes';
  if v_id is null then
    v_id := cron.schedule('avisos-planes', '0 12 * * 1-5', v_cmd);
  end if;
  -- Se crea y se desactiva en el mismo bloque: en ningún momento queda activa
  perform cron.alter_job(v_id, schedule := '0 12 * * 1-5', command := v_cmd, active := false);
end $$;

-- Verificación: una fila, active = false, lee de la bóveda y sin dirección escrita.
select jobid, jobname, schedule, active,
       command like '%vault.decrypted_secrets%' as lee_boveda,
       command !~ 'https?://'                 as sin_direccion_escrita
from cron.job
where jobname = 'avisos-planes';
