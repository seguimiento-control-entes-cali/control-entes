-- =====================================================================
-- 16 · Carga de los Excel de control desde la app
-- Reemplaza, en una sola operación, los registros de una o varias vigencias del histórico con lo que
-- la app leyó del Excel, y deja el módulo operativo al día:
--   * Casos abiertos nuevos  → pasan a "Cargar respuesta ORFEO" (sembrar_desde_historico, script 12).
--   * Casos que el Excel ya trae respondidos y seguían abiertos en la app sin gestión → se retiran del
--     módulo operativo. Si ya tenían escalamientos registrados se conservan y se informan.
--   * Las respuestas registradas en la app (radicado ORFEO + PDF) no se tocan: se siguen mostrando
--     sobre el histórico porque se enlazan por la misma clave (vigencia|orfeo_entrada|radicación|organismo).
-- Cada carga queda en public.historico_cargas y en la cadena de auditoría.
-- Requiere los scripts 03, 09 y 12. Es idempotente.
-- =====================================================================

create table if not exists public.historico_cargas (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  usuario      text not null default '',
  archivos     text[] not null default '{}',
  vigencias    int[] not null,
  registros    int not null,
  corte        date,
  resultado    jsonb not null default '{}'::jsonb
);
alter table public.historico_cargas enable row level security;
drop policy if exists hcargas_read on public.historico_cargas;
create policy hcargas_read on public.historico_cargas for select to authenticated
  using (public.current_rol() in ('admin','alcalde','control_interno'));
revoke all on public.historico_cargas from anon;
grant select on public.historico_cargas to authenticated;
drop trigger if exists trg_audit_hcargas on public.historico_cargas;
create trigger trg_audit_hcargas after insert on public.historico_cargas
  for each row execute function public.audit_trigger();

create or replace function public.cargar_historico(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_vigs     int[] := array(select (jsonb_array_elements_text(p->'vigencias'))::int);
  v_mail     text := coalesce((select email from public.profiles where id = auth.uid()), 'sistema');
  v_n        int;
  v_ajenas   int;
  v_retirados int := 0;
  v_conserv  int := 0;
  v_sembrados int := 0;
  v_huerf    int := 0;
  v_antes    jsonb;
  v_despues  jsonb;
  v_res      jsonb;
begin
  if auth.uid() is not null and public.current_rol() is distinct from 'admin' then
    raise exception 'Solo el Super administrador puede cargar el Excel de control';
  end if;
  if coalesce(array_length(v_vigs, 1), 0) = 0 then raise exception 'No se indicó la vigencia a cargar'; end if;
  if jsonb_array_length(coalesce(p->'filas', '[]'::jsonb)) = 0 then raise exception 'El archivo no trae registros'; end if;

  select count(*) into v_ajenas from jsonb_array_elements(p->'filas') f
   where not ((f->>'vigencia')::int = any(v_vigs));
  if v_ajenas > 0 then raise exception 'Hay % registros de una vigencia distinta a la que se está cargando', v_ajenas; end if;

  select coalesce(jsonb_object_agg(oportunidad, n), '{}'::jsonb) into v_antes
    from (select oportunidad, count(*) n from public.historico_requerimientos where vigencia = any(v_vigs) group by 1) x;

  -- 1. Reemplazo del histórico de las vigencias cargadas
  delete from public.historico_requerimientos where vigencia = any(v_vigs);
  insert into public.historico_requerimientos (
      vigencia, hoja_excel, radicacion_ente, ente, orfeo_entrada, fecha_recibo, organismo, tipo_organismo, asunto,
      termino_dias_habiles, fecha_maxima, orfeo_respuesta, fecha_respuesta, respondio, tardia, oportunidad,
      retraso_dias_habiles, dias_habiles_responder, estado_excel, observaciones, fila_excel)
  select vigencia, coalesce(hoja_excel, 'CONTROL'), radicacion_ente, ente, orfeo_entrada, fecha_recibo, organismo, tipo_organismo, asunto,
      termino_dias_habiles, fecha_maxima, orfeo_respuesta, fecha_respuesta, respondio, tardia, oportunidad,
      retraso_dias_habiles, dias_habiles_responder, estado_excel, observaciones, fila_excel
    from jsonb_to_recordset(p->'filas') as x(
      vigencia int, hoja_excel text, radicacion_ente text, ente text, orfeo_entrada text, fecha_recibo date, organismo text,
      tipo_organismo text, asunto text, termino_dias_habiles int, fecha_maxima date, orfeo_respuesta text, fecha_respuesta date,
      respondio text, tardia text, oportunidad text, retraso_dias_habiles int, dias_habiles_responder int, estado_excel text,
      observaciones text, fila_excel int);
  get diagnostics v_n = row_count;

  -- 2. Casos que estaban abiertos en la app (sembrados del histórico, sin respuesta registrada en la app)
  --    y que el Excel ya no trae abiertos
  with abiertos as (
    select h.vigencia::text || '|' || coalesce(h.orfeo_entrada, '') || '|' || coalesce(h.radicacion_ente, '') || '|' || h.organismo as k
      from public.historico_requerimientos h
     where h.vigencia = any(v_vigs) and h.oportunidad in ('Sin respuesta (vencida)', 'Pendiente en término')
  ), viejos as (
    select r.id from public.requerimientos r
     where r.hist_key is not null and r.estado = 'abierto' and r.vigencia = any(v_vigs)
       and r.hist_key not in (select k from abiertos)
  ), borrados as (
    delete from public.requerimientos r
     where r.id in (select id from viejos)
       and not exists (select 1 from public.alertas_log a where a.requerimiento_id = r.id)
    returning 1
  )
  select count(*) into v_retirados from borrados;

  with abiertos as (
    select h.vigencia::text || '|' || coalesce(h.orfeo_entrada, '') || '|' || coalesce(h.radicacion_ente, '') || '|' || h.organismo as k
      from public.historico_requerimientos h
     where h.vigencia = any(v_vigs) and h.oportunidad in ('Sin respuesta (vencida)', 'Pendiente en término')
  )
  select count(*) into v_conserv from public.requerimientos r
   where r.hist_key is not null and r.estado = 'abierto' and r.vigencia = any(v_vigs)
     and r.hist_key not in (select k from abiertos);

  -- 3. Casos abiertos nuevos al módulo operativo
  v_sembrados := public.sembrar_desde_historico();

  -- 4. Respuestas registradas en la app cuyo caso ya no aparece igual en el Excel
  select count(*) into v_huerf from public.requerimientos r
   where r.hist_key is not null and r.estado = 'cerrado' and r.vigencia = any(v_vigs)
     and not exists (select 1 from public.historico_requerimientos h
                      where h.vigencia::text || '|' || coalesce(h.orfeo_entrada, '') || '|' || coalesce(h.radicacion_ente, '') || '|' || h.organismo = r.hist_key);

  select coalesce(jsonb_object_agg(oportunidad, n), '{}'::jsonb) into v_despues
    from (select oportunidad, count(*) n from public.historico_requerimientos where vigencia = any(v_vigs) group by 1) x;

  v_res := jsonb_build_object(
    'registros', v_n, 'antes', v_antes, 'despues', v_despues,
    'abiertos_retirados', v_retirados, 'abiertos_conservados_con_escalamiento', v_conserv,
    'abiertos_nuevos', v_sembrados, 'respuestas_app_sin_caso', v_huerf);

  insert into public.historico_cargas (usuario, archivos, vigencias, registros, corte, resultado)
  values (v_mail, array(select jsonb_array_elements_text(coalesce(p->'archivos', '[]'::jsonb))), v_vigs, v_n,
          nullif(p->>'corte', '')::date, v_res);
  return v_res;
end $$;
revoke all on function public.cargar_historico(jsonb) from public, anon;
grant execute on function public.cargar_historico(jsonb) to authenticated;

-- Verificación: registros por vigencia
select vigencia, count(*) as registros from public.historico_requerimientos group by vigencia order by vigencia;
