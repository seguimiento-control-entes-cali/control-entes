-- =====================================================================
-- DATOS FICTICIOS para probar la copia de seguridad (bloqueo 4). SOLO para el proyecto de PRUEBA.
-- Nunca ejecutar en producción: si la base ya tiene requerimientos, histórico o planes, se detiene sin cambiar nada.
-- Crea un requerimiento, un plan con 3 hallazgos, 3 acciones y un avance, con decimales que terminan en cero
-- (100.00, 12.50, 3.10) y una cuantía de 18 cifras, que es donde la copia en formato 2 pierde exactitud.
-- La auditoría registra cada inserción y una actualización, con esos decimales dentro de su copia de la fila.
-- Todo es inventado: los textos dicen "PRUEBA".
-- =====================================================================
begin;

do $$
begin
  if exists (select 1 from public.requerimientos) or exists (select 1 from public.historico_requerimientos)
     or exists (select 1 from public.pm_planes) then
    raise exception 'La base no está vacía: estos datos ficticios son solo para un proyecto de prueba vacío. No se cambió nada.';
  end if;
end $$;

-- El avance de una acción solo lo cambian las funciones del módulo (pm.interno); aquí se simula para la prueba
select set_config('pm.interno', '1', true);

with d as (select min(id) as dep from public.dependencias), e as (select min(id) as ente from public.entes)
insert into public.requerimientos (radicado, vigencia, ente_id, dependencia_id, asunto, fecha_radicacion, fecha_limite)
select '2026EE00000001', 2026, e.ente, d.dep, 'PRUEBA · requerimiento ficticio para la copia de seguridad',
       date '2026-10-01', date '2026-10-22'
from d, e;

insert into public.pm_planes (id, formato, contraloria, ejercicio, fecha_suscripcion, observaciones)
values ('00000000-0000-4000-8000-000000000001', 'PM_01_CGSC', 'Contraloría General de Santiago de Cali',
        'PRUEBA · plan ficticio para la copia de seguridad', date '2026-01-15', 'Datos inventados');

insert into public.pm_hallazgos (id, plan_id, numero, descripcion, cuantia, orden) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', '1', 'PRUEBA · hallazgo con cuantía redonda', 100.00, 1),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', '2', 'PRUEBA · hallazgo con cuantía que termina en cero', 1234567.50, 2),
  ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000001', '3', 'PRUEBA · hallazgo con cuantía de 18 cifras', 9876543210987654.32, 3);

insert into public.pm_acciones (id, plan_id, hallazgo_id, accion, cantidad, avance, fecha_inicio, fecha_fin, orden) values
  ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011',
   'PRUEBA · acción con meta 100.00', 100.00, 12.50, date '2026-02-01', date '2026-12-31', 1),
  ('00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000012',
   'PRUEBA · acción con meta 12.50', 12.50, 3.10, date '2026-02-01', date '2026-12-31', 2),
  ('00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000013',
   'PRUEBA · acción con meta 3.10', 3.10, 0.00, date '2026-02-01', date '2026-12-31', 3);

insert into public.pm_avances (accion_id, plan_id, fecha_corte, cantidad, descripcion, estado)
values ('00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000001', date '2026-06-30', 12.50,
        'PRUEBA · avance ficticio con decimales', 'validado');

-- Una actualización: la auditoría guarda el antes y el después (cambios) con decimales
update public.pm_acciones set avance = 20.00, fecha_corte = date '2026-09-30'
 where id = '00000000-0000-4000-8000-000000000021';

commit;

-- Resultado: registros creados y registros de auditoría (se esperan 1, 1, 3, 3, 1 y al menos 10)
select (select count(*) from public.requerimientos) as requerimientos, (select count(*) from public.pm_planes) as planes,
       (select count(*) from public.pm_hallazgos) as hallazgos, (select count(*) from public.pm_acciones) as acciones,
       (select count(*) from public.pm_avances) as avances, (select count(*) from public.audit_log) as auditoria;
