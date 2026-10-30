-- =====================================================================
-- 21 · Programar las tareas leyendo la dirección y la clave de la bóveda (Vault)
-- Reemplaza la programación de los scripts 15 y 17, que tenían la dirección fija y la clave a mano.
--  * respaldo-semanal: domingos 11:00 p. m. hora de Colombia (04:00 UTC del lunes), ACTIVA.
--  * resumen-semanal:  lunes 7:00 a. m. hora de Colombia (12:00 UTC), SIEMPRE DESACTIVADA. Se activa aparte,
--    cuando DATIC autorice el piloto: select cron.alter_job(jobid, active := true)
--    from cron.job where jobname = 'resumen-semanal';
-- Requiere: extensiones pg_cron y pg_net; las funciones respaldo y resumen-semanal desplegadas; y en la bóveda
-- los secretos ce_proyecto_url (https://<proyecto>.supabase.co, sin barra final) y ce_resumen_clave (el mismo
-- texto del secreto RESUMEN_CLAVE de las funciones). Ver docs/RESPALDOS.md. Este script no contiene ningún valor:
-- la dirección y la clave se leen de la bóveda cada vez que corre la tarea.
-- Se puede ejecutar más de una vez: actualiza las tareas existentes (conservan su jobid y su historial) y no
-- las duplica. Si falta un secreto o hay tareas repetidas, se detiene sin cambiar nada.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_faltan text;
  v_id     bigint;
  v_cmd_resumen text := $c$ select net.http_post(
       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'ce_proyecto_url') || '/functions/v1/resumen-semanal',
       headers := jsonb_build_object('Content-Type', 'application/json',
                    'x-cron-clave', (select decrypted_secret from vault.decrypted_secrets where name = 'ce_resumen_clave')),
       body    := '{}'::jsonb
     ) $c$;
  v_cmd_respaldo text := $c$ select net.http_post(
       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'ce_proyecto_url') || '/functions/v1/respaldo',
       headers := jsonb_build_object('Content-Type', 'application/json',
                    'x-cron-clave', (select decrypted_secret from vault.decrypted_secrets where name = 'ce_resumen_clave')),
       body    := '{}'::jsonb,
       timeout_milliseconds := 120000
     ) $c$;
begin
  -- 1. Los secretos deben existir (se revisa el nombre, nunca se muestra el valor)
  select string_agg(n, ', ') into v_faltan
    from unnest(array['ce_proyecto_url', 'ce_resumen_clave']) as n
   where not exists (select 1 from vault.secrets s where s.name = n);
  if v_faltan is not null then
    raise exception 'Faltan en la bóveda los secretos: %. No se cambió ninguna tarea.', v_faltan;
  end if;
  if exists (select 1 from vault.decrypted_secrets
              where name = 'ce_proyecto_url' and decrypted_secret !~ '^https://[^/[:space:]]+$') then
    raise exception 'ce_proyecto_url debe ser https://<proyecto>.supabase.co, sin barra final. No se cambió ninguna tarea.';
  end if;
  if (select count(*) from cron.job where jobname in ('resumen-semanal', 'respaldo-semanal'))
     > (select count(distinct jobname) from cron.job where jobname in ('resumen-semanal', 'respaldo-semanal')) then
    raise exception 'Hay tareas repetidas con el mismo nombre. Revisar cron.job antes de seguir. No se cambió ninguna tarea.';
  end if;

  -- 2. Respaldo semanal: domingos 11:00 p. m. en Colombia (04:00 UTC del lunes), activo
  select jobid into v_id from cron.job where jobname = 'respaldo-semanal';
  if v_id is null then
    perform cron.schedule('respaldo-semanal', '0 4 * * 1', v_cmd_respaldo);
  else
    perform cron.alter_job(v_id, schedule := '0 4 * * 1', command := v_cmd_respaldo, active := true);
  end if;

  -- 3. Resumen semanal: lunes 7:00 a. m. en Colombia (12:00 UTC), DESACTIVADO hasta que DATIC autorice el piloto.
  --    Se crea y se desactiva dentro del mismo bloque: en ningún momento queda activo.
  select jobid into v_id from cron.job where jobname = 'resumen-semanal';
  if v_id is null then
    v_id := cron.schedule('resumen-semanal', '0 12 * * 1', v_cmd_resumen);
  end if;
  perform cron.alter_job(v_id, schedule := '0 12 * * 1', command := v_cmd_resumen, active := false);
end $$;

-- Verificación: debe dar 2 filas; resumen-semanal con active = false y respaldo-semanal con active = true;
-- lee_boveda = true y sin_direccion_escrita = true en las dos.
select jobid, jobname, schedule, active,
       command like '%vault.decrypted_secrets%' as lee_boveda,
       command !~ 'https?://'                 as sin_direccion_escrita
from cron.job
where jobname in ('resumen-semanal', 'respaldo-semanal')
order by jobname;
