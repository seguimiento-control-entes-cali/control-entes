-- =====================================================================
-- 12 · Módulo operativo conectado al histórico
-- "Cargar respuesta ORFEO", "Requerimientos", "Tablero y métricas" y "Alertas" leen
-- public.requerimientos. Este script lleva allí los casos ABIERTOS del histórico
-- (sin respuesta vencidos y pendientes en término), para poder cerrarlos desde la app.
--
-- Garantías:
--  * No modifica ni borra ningún registro de historico_requerimientos.
--  * Cada caso queda enlazado por hist_key (vigencia|orfeo_entrada|radicacion_ente|organismo),
--    la misma clave que usa la app; por eso los cierres sobreviven a una recarga del histórico.
--  * Es idempotente: ejecutarlo de nuevo solo agrega casos abiertos que aún no estén.
--  * Los requerimientos creados a mano en la app conservan sus validaciones de siempre.
-- Después de recargar el histórico, ejecutar: select public.sembrar_desde_historico();
-- =====================================================================

-- 1. Enlace con el histórico
alter table public.requerimientos add column if not exists hist_key text;
create unique index if not exists requerimientos_hist_key_unq
  on public.requerimientos (hist_key) where hist_key is not null;

-- 2. Los radicados de los entes vienen en formatos libres ("OFICIO No. 0126", "Sin número"):
--    el formato estricto y la unicidad del radicado aplican solo a los creados en la app.
alter table public.requerimientos drop constraint if exists requerimientos_radicado_fmt;
alter table public.requerimientos add constraint requerimientos_radicado_fmt
  check (hist_key is not null or radicado ~ '^[0-9]{4}[A-Z]{2}[0-9]{4,10}$');
alter table public.requerimientos drop constraint if exists requerimientos_radicado_unq;
create unique index if not exists requerimientos_radicado_app_unq
  on public.requerimientos (radicado) where hist_key is null;

-- 3. Siembra de casos abiertos (solo Super administrador o ejecución directa en SQL Editor)
create or replace function public.sembrar_desde_historico()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_n integer;
begin
  if auth.uid() is not null and public.current_rol() is distinct from 'admin' then
    raise exception 'Solo el Super administrador puede sembrar casos desde el histórico';
  end if;

  -- Entes y dependencias que falten, con el nombre oficial del histórico
  insert into public.entes (nombre)
    select distinct h.ente from public.historico_requerimientos h
     where h.oportunidad in ('Sin respuesta (vencida)', 'Pendiente en término')
       and coalesce(trim(h.ente), '') <> ''
  on conflict (nombre) do nothing;
  insert into public.dependencias (nombre, activo)
    select distinct h.organismo, true from public.historico_requerimientos h
     where h.oportunidad in ('Sin respuesta (vencida)', 'Pendiente en término')
  on conflict (nombre) do nothing;

  insert into public.requerimientos
    (hist_key, radicado, vigencia, ente_id, dependencia_id, asunto, fecha_radicacion, fecha_limite, created_by)
  select
    k.hist_key,
    coalesce(nullif(trim(h.radicacion_ente), ''), nullif(trim(h.orfeo_entrada), ''), 'Sin número'),
    h.vigencia,
    e.id,
    d.id,
    case when length(trim(coalesce(h.asunto, ''))) > 3 then trim(h.asunto) else 'Sin asunto registrado' end,
    least(coalesce(h.fecha_recibo, h.fecha_maxima, current_date), coalesce(h.fecha_maxima, h.fecha_recibo + 15, current_date)),
    coalesce(h.fecha_maxima, h.fecha_recibo + 15, current_date),
    null
  from public.historico_requerimientos h
  cross join lateral (
    select h.vigencia::text || '|' || coalesce(h.orfeo_entrada, '') || '|' || coalesce(h.radicacion_ente, '') || '|' || h.organismo as hist_key
  ) k
  join public.entes e on e.nombre = h.ente
  join public.dependencias d on d.nombre = h.organismo
  where h.oportunidad in ('Sin respuesta (vencida)', 'Pendiente en término')
    and not exists (select 1 from public.requerimientos r where r.hist_key = k.hist_key)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.sembrar_desde_historico() from public, anon;
grant execute on function public.sembrar_desde_historico() to authenticated;

-- 4. Sembrar ahora y mostrar la conciliación por vigencia
select public.sembrar_desde_historico() as casos_sembrados;

select h.vigencia,
       count(*)                                                              as abiertos_en_historico,
       count(r.id)                                                           as en_modulo_operativo,
       count(*) - count(r.id)                                                as faltan
  from public.historico_requerimientos h
  left join public.requerimientos r
    on r.hist_key = h.vigencia::text || '|' || coalesce(h.orfeo_entrada, '') || '|' || coalesce(h.radicacion_ente, '') || '|' || h.organismo
 where h.oportunidad in ('Sin respuesta (vencida)', 'Pendiente en término')
 group by h.vigencia
 order by h.vigencia;
