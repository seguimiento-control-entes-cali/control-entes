-- =====================================================================
-- 19 · Planes de mejoramiento: calificación de la CGSC, revisión de Control Interno y enlace con el oficio
--   * pm_acciones.cal_cumplimiento / cal_efectividad (0, 1 o 2): calificación de cada acción con la
--     metodología del formato PM_01 / PT 03-PF de la Contraloría General de Santiago de Cali
--     (cumplimiento 20 % + efectividad 80 %).
--   * pm_acciones.obs_ci / obs_ci_estado: observación de Control Interno a la formulación y si ya se atendió.
--   * pm_planes.requerimiento_id: oficio de la contraloría que remitió el informe (plazo y cierre).
--   * pm_planes.direccion_tecnica: dirección técnica de la contraloría responsable (columna O del PM_01).
--   * pm_importar: guarda también lo anterior.
--   * Corrección de seguridad en escalar_requerimiento, pm_revisar_avance, pm_importar y pm_eliminar_plan
--     (rechazan las sesiones sin rol) y Control Interno puede eliminar planes.
-- Requiere los scripts 13 y 18. Es idempotente y no borra datos.
-- =====================================================================

alter table public.pm_planes add column if not exists requerimiento_id uuid references public.requerimientos(id) on delete set null;
alter table public.pm_planes add column if not exists direccion_tecnica text not null default '';

alter table public.pm_acciones add column if not exists cal_cumplimiento smallint;
alter table public.pm_acciones add column if not exists cal_efectividad smallint;
alter table public.pm_acciones add column if not exists obs_ci text not null default '';
alter table public.pm_acciones add column if not exists obs_ci_estado text not null default '';
alter table public.pm_acciones add column if not exists obs_ci_at timestamptz;
alter table public.pm_acciones drop constraint if exists pm_acc_cal_ok;
alter table public.pm_acciones add constraint pm_acc_cal_ok check (
  (cal_cumplimiento is null or cal_cumplimiento between 0 and 2) and
  (cal_efectividad is null or cal_efectividad between 0 and 2) and
  obs_ci_estado in ('', 'pendiente', 'atendida'));
create index if not exists pm_planes_req on public.pm_planes(requerimiento_id);

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
         fecha_informe, fecha_suscripcion, estado, observaciones, requerimiento_id, direccion_tecnica)
  values (pl->>'formato', nullif(pl->>'ente_id', '')::bigint, pl->>'contraloria',
          coalesce(nullif(pl->>'entidad', ''), 'Distrito Especial de Santiago de Cali'),
          coalesce(pl->>'nit', ''), coalesce(pl->>'representante_legal', ''), coalesce(pl->>'ordenador_gasto', ''),
          pl->>'ejercicio', coalesce(pl->>'tipo_ejercicio', ''), coalesce(pl->>'modalidad', ''),
          coalesce(pl->>'vigencia_pvcft', ''), coalesce(pl->>'periodo_auditado', ''), coalesce(pl->>'numero_informe', ''),
          coalesce(pl->>'radicado_orfeo', ''), nullif(pl->>'fecha_informe', '')::date, (pl->>'fecha_suscripcion')::date,
          coalesce(nullif(pl->>'estado', ''), 'en_ejecucion'),
          coalesce(pl->>'observaciones', ''), nullif(pl->>'requerimiento_id', '')::uuid,
          coalesce(pl->>'direccion_tecnica', ''))
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
             unidad_medida, cantidad, fuente_verificacion, lugar_verificacion, fecha_inicio, fecha_fin, orden,
             obs_ci, obs_ci_estado, obs_ci_at)
      values (v_plan, v_h, nullif(a->>'dependencia_id', '')::bigint, coalesce(a->>'responsable', ''), a->>'accion',
              coalesce(a->>'proposito', ''), coalesce(a->>'actividad', ''), coalesce(a->>'meta', ''),
              coalesce(nullif(a->>'unidad_medida', ''), 'Porcentaje'), coalesce(nullif(a->>'cantidad', '')::numeric, 100),
              coalesce(a->>'fuente_verificacion', ''), coalesce(a->>'lugar_verificacion', ''),
              (a->>'fecha_inicio')::date, (a->>'fecha_fin')::date, v_oa,
              coalesce(a->>'obs_ci', ''), case when coalesce(trim(a->>'obs_ci'), '') = '' then '' else 'pendiente' end,
              case when coalesce(trim(a->>'obs_ci'), '') = '' then null else now() end)
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

-- ---------------------------------------------------------------------
-- Corrección de seguridad: una sesión SIN rol (contraseña sin el código de verificación, cuenta
-- desactivada) daba NULL en current_rol() y «NULL not in (...)» no es verdadero, así que estas
-- funciones no la rechazaban. Ahora se compara con coalesce(current_rol(), '').
-- Además, Control Interno (responsable de los planes) también puede eliminar un plan.
-- ---------------------------------------------------------------------
create or replace function public.escalar_requerimiento(p_id uuid, p_canal text default 'registro')
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.current_rol(), '') not in ('admin','alcalde','control_interno','enlace') then
    raise exception 'Tu rol no puede escalar alertas';
  end if;
  if not exists (select 1 from public.requerimientos where id = p_id and estado = 'abierto') then
    raise exception 'El requerimiento no existe o ya está cerrado';
  end if;
  insert into public.alertas_log (requerimiento_id, canal) values (p_id, p_canal);
  update public.requerimientos set escalado_at = now() where id = p_id;
end $$;

create or replace function public.pm_revisar_avance(p_id uuid, p_estado text, p_observacion text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pm_avances%rowtype;
  v_mail text := coalesce((select email from public.profiles where id = auth.uid()), 'sistema');
begin
  if auth.uid() is not null and coalesce(public.current_rol(), '') not in ('admin','control_interno') then
    raise exception 'Solo el Super administrador o Control Interno validan avances';
  end if;
  if p_estado not in ('validado','devuelto') then raise exception 'Estado de revisión no válido'; end if;
  select * into v from public.pm_avances where id = p_id for update;
  if not found then raise exception 'El avance no existe'; end if;
  if v.estado <> 'reportado' then raise exception 'Este avance ya fue revisado'; end if;
  if p_estado = 'devuelto' and length(trim(coalesce(p_observacion, ''))) < 5 then
    raise exception 'Indica a la dependencia por qué se devuelve el avance';
  end if;

  update public.pm_avances
     set estado = p_estado, observacion = coalesce(trim(p_observacion), ''),
         revisado_por = auth.uid(), revisado_email = v_mail, revisado_at = now()
   where id = p_id;

  if p_estado = 'validado' then
    perform set_config('pm.interno', '1', true);
    -- La acción toma el avance validado con la fecha de corte más reciente
    update public.pm_acciones a
       set avance = x.cantidad, fecha_corte = x.fecha_corte
      from (select cantidad, fecha_corte from public.pm_avances
             where accion_id = v.accion_id and estado = 'validado'
             order by fecha_corte desc, revisado_at desc limit 1) x
     where a.id = v.accion_id;
    perform set_config('pm.interno', '', true);
  end if;
end $$;

create or replace function public.pm_eliminar_plan(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(public.current_rol(), '') not in ('admin','control_interno') then
    raise exception 'Solo el Super administrador o Control Interno eliminan planes';
  end if;
  if exists (select 1 from public.pm_avances where plan_id = p_id and reportado_por is not null
             and observacion not like 'Importado del archivo%') then
    raise exception 'El plan tiene avances reportados por las dependencias: no se puede eliminar';
  end if;
  perform set_config('pm.interno', '1', true);
  delete from public.pm_avances where plan_id = p_id;
  delete from public.pm_planes where id = p_id;
  perform set_config('pm.interno', '', true);
end $$;

-- Verificación
select (select count(*) from information_schema.columns
         where table_name = 'pm_acciones' and column_name in ('cal_cumplimiento','cal_efectividad','obs_ci','obs_ci_estado')) as columnas_acciones,
       (select count(*) from information_schema.columns
         where table_name = 'pm_planes' and column_name in ('requerimiento_id','direccion_tecnica')) as columnas_planes;
