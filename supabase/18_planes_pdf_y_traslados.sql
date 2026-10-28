-- =====================================================================
-- 18 · Planes de mejoramiento: hallazgos leídos del informe final, traslados y dependencia del hallazgo
--   * pm_hallazgos.dependencia_id / dependencia_texto: a quién corresponde el hallazgo aunque todavía
--     no tenga acciones (plan en formulación creado desde el PDF del informe).
--   * pm_traslados: traslados de hallazgos con incidencia disciplinaria, fiscal, penal o sancionatoria
--     (a quién, con qué radicado, cuándo y en qué estado va).
--   * pm_importar: guarda también la dependencia del hallazgo.
-- Requiere el script 13. Es idempotente y no borra datos.
-- =====================================================================

alter table public.pm_hallazgos add column if not exists dependencia_id bigint references public.dependencias(id);
alter table public.pm_hallazgos add column if not exists dependencia_texto text not null default '';

create table if not exists public.pm_traslados (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.pm_planes(id) on delete cascade,
  hallazgo_id    uuid not null references public.pm_hallazgos(id) on delete cascade,
  tipo           text not null check (tipo in ('disciplinaria','fiscal','penal','sancionatoria')),
  destino        text not null check (length(trim(destino)) > 2),
  radicado       text not null default '',
  fecha          date,
  estado         text not null default 'trasladado'
                 check (estado in ('trasladado','en_indagacion','en_investigacion','archivado','con_decision')),
  observaciones  text not null default '',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists pm_traslados_hallazgo on public.pm_traslados(hallazgo_id);
alter table public.pm_traslados enable row level security;
drop policy if exists pm_tras_read on public.pm_traslados;
create policy pm_tras_read on public.pm_traslados for select to authenticated
  using (public.current_rol() in ('admin','alcalde','control_interno'));
drop policy if exists pm_tras_write on public.pm_traslados;
create policy pm_tras_write on public.pm_traslados for all to authenticated
  using (public.current_rol() in ('admin','control_interno'))
  with check (public.current_rol() in ('admin','control_interno'));
revoke all on public.pm_traslados from anon;
grant select, insert, update, delete on public.pm_traslados to authenticated;
drop trigger if exists trg_audit_pm_tras on public.pm_traslados;
create trigger trg_audit_pm_tras after insert or update or delete on public.pm_traslados
  for each row execute function public.audit_trigger();

create or replace function public.pm_importar(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan uuid; v_h uuid; v_a uuid; h jsonb; a jsonb; pl jsonb := p->'plan';
  v_mail text := coalesce((select email from public.profiles where id = auth.uid()), 'sistema');
  v_oh int := 0; v_oa int := 0;
begin
  if auth.uid() is not null and coalesce(public.current_rol(), '') not in ('admin','control_interno') then
    raise exception 'Solo el Super administrador o Control Interno importan planes';
  end if;
  if jsonb_array_length(coalesce(p->'hallazgos', '[]'::jsonb)) = 0 then
    raise exception 'El archivo no trae hallazgos';
  end if;
  perform set_config('pm.interno', '1', true);

  insert into public.pm_planes (formato, ente_id, contraloria, entidad, nit, representante_legal, ordenador_gasto,
         ejercicio, tipo_ejercicio, modalidad, vigencia_pvcft, periodo_auditado, numero_informe, radicado_orfeo,
         fecha_informe, fecha_suscripcion, estado, observaciones)
  values (pl->>'formato', nullif(pl->>'ente_id', '')::bigint, pl->>'contraloria',
          coalesce(nullif(pl->>'entidad', ''), 'Distrito Especial de Santiago de Cali'),
          coalesce(pl->>'nit', ''), coalesce(pl->>'representante_legal', ''), coalesce(pl->>'ordenador_gasto', ''),
          pl->>'ejercicio', coalesce(pl->>'tipo_ejercicio', ''), coalesce(pl->>'modalidad', ''),
          coalesce(pl->>'vigencia_pvcft', ''), coalesce(pl->>'periodo_auditado', ''), coalesce(pl->>'numero_informe', ''),
          coalesce(pl->>'radicado_orfeo', ''), nullif(pl->>'fecha_informe', '')::date, (pl->>'fecha_suscripcion')::date,
          coalesce(nullif(pl->>'estado', ''), 'en_ejecucion'),
          coalesce(pl->>'observaciones', ''))
  returning id into v_plan;

  for h in select * from jsonb_array_elements(p->'hallazgos') loop
    v_oh := v_oh + 1;
    insert into public.pm_hallazgos (plan_id, numero, descripcion, causa, efecto, connotaciones, cuantia, macroproceso, orden,
           dependencia_id, dependencia_texto)
    values (v_plan, h->>'numero', h->>'descripcion', coalesce(h->>'causa', ''), coalesce(h->>'efecto', ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(h->'connotaciones', '[]'::jsonb)) x), '{}'),
            nullif(h->>'cuantia', '')::numeric, coalesce(h->>'macroproceso', ''), v_oh,
            nullif(h->>'dependencia_id', '')::bigint, coalesce(h->>'dependencia_texto', ''))
    returning id into v_h;
    for a in select * from jsonb_array_elements(coalesce(h->'acciones', '[]'::jsonb)) loop
      v_oa := v_oa + 1;
      insert into public.pm_acciones (plan_id, hallazgo_id, dependencia_id, responsable, accion, proposito, actividad, meta,
             unidad_medida, cantidad, fuente_verificacion, lugar_verificacion, fecha_inicio, fecha_fin, orden)
      values (v_plan, v_h, nullif(a->>'dependencia_id', '')::bigint, coalesce(a->>'responsable', ''), a->>'accion',
              coalesce(a->>'proposito', ''), coalesce(a->>'actividad', ''), coalesce(a->>'meta', ''),
              coalesce(nullif(a->>'unidad_medida', ''), 'Porcentaje'), coalesce(nullif(a->>'cantidad', '')::numeric, 100),
              coalesce(a->>'fuente_verificacion', ''), coalesce(a->>'lugar_verificacion', ''),
              (a->>'fecha_inicio')::date, (a->>'fecha_fin')::date, v_oa)
      returning id into v_a;
      if nullif(a->>'avance', '') is not null and nullif(a->>'fecha_corte', '') is not null then
        insert into public.pm_avances (accion_id, plan_id, dependencia_id, fecha_corte, cantidad, descripcion, estado,
               observacion, reportado_email, revisado_por, revisado_email, revisado_at)
        values (v_a, v_plan, nullif(a->>'dependencia_id', '')::bigint, (a->>'fecha_corte')::date, (a->>'avance')::numeric,
                coalesce(nullif(trim(a->>'descripcion_avance'), ''), 'Avance importado del archivo ' || coalesce(p->>'archivo', '')),
                'validado', 'Importado del archivo ' || coalesce(p->>'archivo', ''), v_mail, auth.uid(), v_mail, now());
        update public.pm_acciones set avance = (a->>'avance')::numeric, fecha_corte = (a->>'fecha_corte')::date where id = v_a;
      end if;
    end loop;
  end loop;
  perform set_config('pm.interno', '', true);
  return v_plan;
end $$;
revoke all on function public.pm_importar(jsonb) from public, anon;
grant execute on function public.pm_importar(jsonb) to authenticated;

-- Verificación
select (select count(*) from information_schema.columns where table_name = 'pm_hallazgos' and column_name = 'dependencia_id') as columna_dependencia,
       (select count(*) from public.pm_traslados) as traslados;
