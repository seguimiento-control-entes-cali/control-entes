-- =====================================================================
-- 09 · Origen de cada registro del histórico (hoja del Excel)
-- 2024 y 2025 tienen una hoja "NO RESPUESTA" con oficios que no exigen respuesta
-- (citaciones, fallos, informes preliminares). Desde esta versión se cargan como
-- "No requiere respuesta": no cambian el porcentaje de cumplimiento, pero quedan
-- en el histórico y en el cruce de información.
-- Después de ejecutar este script, recargar el histórico completo (ver docs/DESPLIEGUE.md).
-- =====================================================================
alter table public.historico_requerimientos add column if not exists hoja_excel text not null default 'CONTROL'
  check (hoja_excel in ('CONTROL','NO RESPUESTA'));
