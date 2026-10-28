-- =====================================================================
-- 15 · Programar el resumen semanal (lunes 7:00 a. m., hora de Colombia)
-- Ejecutar DESPUÉS de: (1) el script 14, (2) desplegar la función resumen-semanal sin
-- verificación JWT y (3) crear sus secretos SMTP_USER, SMTP_PASS y RESUMEN_CLAVE.
-- Antes de ejecutar, reemplace CLAVE_DEL_RESUMEN por el mismo texto del secreto RESUMEN_CLAVE.
-- Se puede ejecutar más de una vez: reemplaza la programación anterior.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'resumen-semanal';

select cron.schedule(
  'resumen-semanal',
  '0 12 * * 1', -- 12:00 UTC = 7:00 a. m. en Colombia, todos los lunes
  $$ select net.http_post(
       url     := 'https://qwpburivxydbetceumyd.supabase.co/functions/v1/resumen-semanal',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-clave', 'CLAVE_DEL_RESUMEN'),
       body    := '{}'::jsonb
     ) $$
);

select jobname, schedule, active from cron.job where jobname = 'resumen-semanal';
