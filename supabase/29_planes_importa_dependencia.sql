-- =====================================================================
-- 29 · Planes de mejoramiento: la DEPENDENCIA también carga el informe desde el archivo de la Contraloría
-- (pedido de Control Interno, 17-nov-2026; complementa el script 28 «quién hace qué»).
--
-- pm_importar (scripts 13, 18, 19 y 20) solo dejaba importar al Super administrador y a Control Interno.
-- Ahora también al secretario y al enlace, con estas reglas:
--   · el plan que importa una dependencia queda «en formulación» (sus hallazgos, en borrador, para formular);
--   · el número del informe final es obligatorio y, si ya está cargado (mismo número y misma contraloría), se
--     rechaza y se dice quién lo cargó;
--   · del archivo solo se importan las acciones de SU dependencia; las demás no (las formula cada dependencia);
--   · los avances del archivo no se importan (los avances se reportan con soporte y los valida Control Interno).
-- Para el Super administrador y Control Interno no cambia nada.
-- Requiere: scripts 01 a 28. Se puede ejecutar más de una vez. No cambia datos existentes.
-- =====================================================================

create or replace function public.pm_importar(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_plan uuid; v_h uuid; v_a uuid; h jsonb; a jsonb; pl jsonb := p->'plan';
  v_mail text := coalesce((select email from public.profiles where id = auth.uid()), 'sistema');
  v_oh int := 0; v_oa int := 0;
  v_rol text := coalesce(public.current_rol(), '');
  v_dep bigint := public.current_dep();
  v_es_dep boolean;
  v_dup record;
begin
  if auth.uid() is not null and v_rol not in ('admin','control_interno','secretario','enlace') then
    raise exception 'Su rol no puede importar planes de mejoramiento';
  end if;
  v_es_dep := auth.uid() is not null and v_rol in ('secretario','enlace');
  if v_es_dep and v_dep is null then
    raise exception 'Su cuenta no tiene dependencia asignada: pida al Super administrador que la asigne';
  end if;
  if jsonb_array_length(coalesce(p->'hallazgos', '[]'::jsonb)) = 0 then
    raise exception 'El archivo no trae hallazgos';
  end if;
  -- Sin el número del informe no se puede saber si ya lo cargó otra dependencia
  if v_es_dep and length(trim(coalesce(pl->>'numero_informe', ''))) = 0 then
    raise exception 'Escriba el número del informe final de la Contraloría';
  end if;
  -- Informe ya cargado (la dependencia no puede verlo si es de otra, por eso se busca aquí)
  if v_es_dep and length(trim(coalesce(pl->>'numero_informe', ''))) > 0 then
    select p2.ejercicio, coalesce(pr.email, '') as quien into v_dup
      from public.pm_planes p2 left join public.profiles pr on pr.id = p2.created_by
     where lower(trim(p2.numero_informe)) = lower(trim(pl->>'numero_informe'))
       and lower(trim(p2.contraloria)) = lower(trim(coalesce(pl->>'contraloria', '')))
     limit 1;
    if found then
      raise exception 'Este informe ya fue cargado (plan «%»%). Pida a Control Interno que le asigne sus hallazgos.',
        v_dup.ejercicio, case when v_dup.quien <> '' then ', por ' || v_dup.quien else '' end;
    end if;
  end if;
  perform set_config('pm.interno', '1', true);

  insert into public.pm_planes (formato, ente_id, contraloria, entidad, nit, representante_legal, ordenador_gasto,
         ejercicio, tipo_ejercicio, modalidad, vigencia_pvcft, periodo_auditado, numero_informe, radicado_orfeo,
         fecha_informe, fecha_suscripcion, estado, observaciones, requerimiento_id, direccion_tecnica,
         resolucion, fecha_radicacion_informe, plan_origen_id)
  values (pl->>'formato', nullif(pl->>'ente_id', '')::bigint, pl->>'contraloria',
          coalesce(nullif(pl->>'entidad', ''), 'Distrito Especial de Santiago de Cali'),
          coalesce(pl->>'nit', ''), coalesce(pl->>'representante_legal', ''), coalesce(pl->>'ordenador_gasto', ''),
          pl->>'ejercicio', coalesce(pl->>'tipo_ejercicio', ''), coalesce(pl->>'modalidad', ''),
          coalesce(pl->>'vigencia_pvcft', ''), coalesce(pl->>'periodo_auditado', ''), coalesce(pl->>'numero_informe', ''),
          coalesce(pl->>'radicado_orfeo', ''), nullif(pl->>'fecha_informe', '')::date, (pl->>'fecha_suscripcion')::date,
          case when v_es_dep then 'formulacion' else coalesce(nullif(pl->>'estado', ''), 'en_ejecucion') end,
          coalesce(pl->>'observaciones', ''), nullif(pl->>'requerimiento_id', '')::uuid,
          coalesce(pl->>'direccion_tecnica', ''),
          coalesce(pl->>'resolucion', ''), nullif(pl->>'fecha_radicacion_informe', '')::date, nullif(pl->>'plan_origen_id', '')::uuid)
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
      -- La dependencia solo trae sus propias acciones (las demás las formula cada dependencia)
      if v_es_dep and coalesce(nullif(a->>'dependencia_id', '')::bigint, v_dep) <> v_dep then
        continue;
      end if;
      v_oa := v_oa + 1;
      insert into public.pm_acciones (plan_id, hallazgo_id, dependencia_id, responsable, accion, proposito, actividad, meta,
             unidad_medida, cantidad, fuente_verificacion, lugar_verificacion, fecha_inicio, fecha_fin, orden,
             obs_ci, obs_ci_estado, obs_ci_at)
      values (v_plan, v_h, case when v_es_dep then v_dep else nullif(a->>'dependencia_id', '')::bigint end,
              coalesce(a->>'responsable', ''), a->>'accion',
              coalesce(a->>'proposito', ''), coalesce(a->>'actividad', ''), coalesce(a->>'meta', ''),
              coalesce(nullif(a->>'unidad_medida', ''), 'Porcentaje'), coalesce(nullif(a->>'cantidad', '')::numeric, 100),
              coalesce(a->>'fuente_verificacion', ''), coalesce(a->>'lugar_verificacion', ''),
              (a->>'fecha_inicio')::date, (a->>'fecha_fin')::date, v_oa,
              case when v_es_dep then '' else coalesce(a->>'obs_ci', '') end,
              case when v_es_dep or coalesce(trim(a->>'obs_ci'), '') = '' then '' else 'pendiente' end,
              case when v_es_dep or coalesce(trim(a->>'obs_ci'), '') = '' then null else now() end)
      returning id into v_a;
      if not v_es_dep and nullif(a->>'avance', '') is not null and nullif(a->>'fecha_corte', '') is not null then
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

revoke execute on function public.pm_importar(jsonb) from public, anon;
grant execute on function public.pm_importar(jsonb) to authenticated;

-- Archivo documental (script 20): la dependencia guarda el archivo original del informe que carga en el plan, y
-- ve solo los documentos que ella misma subió. Lo de Control Interno y de otras dependencias sigue sin verlo.
drop policy if exists archivo_doc_subir_dep on public.archivo_documentos;
create policy archivo_doc_subir_dep on public.archivo_documentos for insert to authenticated
  with check (coalesce(public.current_rol(), '') in ('secretario','enlace')
              and subido_por = auth.uid() and plan_id is not null
              and exists (select 1 from public.pm_planes p where p.id = plan_id));
drop policy if exists archivo_doc_leer_dep on public.archivo_documentos;
create policy archivo_doc_leer_dep on public.archivo_documentos for select to authenticated
  using (coalesce(public.current_rol(), '') in ('secretario','enlace') and subido_por = auth.uid());
drop policy if exists archivo_subir_dep on storage.objects;
create policy archivo_subir_dep on storage.objects for insert to authenticated
  with check (bucket_id = 'archivo' and coalesce(public.current_rol(), '') in ('secretario','enlace')
              and exists (select 1 from public.pm_planes p where p.id::text = split_part(name, '/', 1)));
drop policy if exists archivo_leer_dep on storage.objects;
create policy archivo_leer_dep on storage.objects for select to authenticated
  using (bucket_id = 'archivo' and coalesce(public.current_rol(), '') in ('secretario','enlace')
         and exists (select 1 from public.archivo_documentos d where d.path = name and d.subido_por = auth.uid()));

-- Verificación: debe salir true
select position('v_es_dep' in pg_get_functiondef('public.pm_importar(jsonb)'::regprocedure)) > 0 as dependencia_puede_importar;
