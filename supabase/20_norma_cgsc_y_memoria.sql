-- =====================================================================
-- 20 · Planes de mejoramiento según las Resoluciones Reglamentarias de la CGSC 1000.30.00.24.043 (17-jun-2024)
--      y 1000.30.00.24.003 (16-ene-2024), y memoria documental de la aplicación.
--
--   Norma
--   * pm_planes.resolucion: resolución aplicable ('' = la app la deduce de la fecha; '24.043', '24.003', 'anterior').
--   * Calificación por acción: la Res. 24.043 (art. 12) solo admite 0 o 2; la Res. 24.003 admite 0, 1 o 2.
--   * pm_planes.fecha_radicacion_informe: base de los 15 días hábiles para presentar el plan (art. 7).
--   * pm_prorrogas: prórroga de presentación del plan o de un informe semestral (art. 15) y de fecha de
--     finalización de una acción (art. 16),
--     una sola vez cada una; pm_acciones.fecha_fin_original conserva la fecha inicial.
--   * pm_informes_avance: informes semestrales con corte 30 de junio y 31 de diciembre (art. 11).
--   * pm_planes.plan_origen_id: nuevo plan por acciones con calificación inferior a 100 (art. 12, par. 5).
--   * Connotación y traslado «otra» (art. 2: DIAN, Ministerio de Salud, Superintendencias, ADRES…).
--
--   Memoria
--   * archivo_documentos + depósito privado «archivo»: informe final, plan en Excel, formatos exportados,
--     informes de avance y oficios, con huella SHA-256 y radicado ORFEO. Se envían a la papelera (no se borran).
--   * audit_log.txid + pm_restaurar(): papelera de planes, hallazgos, acciones y traslados a partir de la
--     bitácora de auditoría (que guarda la fila completa de todo lo eliminado).
--
-- Requiere los scripts 13, 18 y 19. Es idempotente y no borra datos.
-- =====================================================================

-- ---------- columnas nuevas ----------
alter table public.pm_planes add column if not exists resolucion text not null default '';
alter table public.pm_planes add column if not exists fecha_radicacion_informe date;
alter table public.pm_planes add column if not exists plan_origen_id uuid references public.pm_planes(id) on delete set null;
alter table public.pm_planes drop constraint if exists pm_planes_resolucion_ok;
alter table public.pm_planes add constraint pm_planes_resolucion_ok check (resolucion in ('', '24.043', '24.003', 'anterior'));
alter table public.pm_acciones add column if not exists fecha_fin_original date;

-- connotación «otra» (art. 2, parágrafo: otro hallazgo con presunta incidencia)
alter table public.pm_hallazgos drop constraint if exists pm_hallazgos_connotaciones_check;
alter table public.pm_hallazgos drop constraint if exists pm_hall_conn_ok;
alter table public.pm_hallazgos add constraint pm_hall_conn_ok
  check (connotaciones <@ array['administrativa','disciplinaria','fiscal','penal','sancionatoria','otra']::text[]);
alter table public.pm_traslados drop constraint if exists pm_traslados_tipo_check;
alter table public.pm_traslados drop constraint if exists pm_tras_tipo_ok;
alter table public.pm_traslados add constraint pm_tras_tipo_ok
  check (tipo in ('disciplinaria','fiscal','penal','sancionatoria','otra'));

-- ---------- resolución aplicable ----------
-- Art. 19 y 20 de la Res. 24.043: planes presentados del 24-ene-2024 al 31-dic-2024 → Res. 24.003;
-- planes de ejercicios iniciados desde el 1-ene-2025 → Res. 24.043 (se toma la fecha de suscripción).
create or replace function public.pm_resolucion_de(p_formato text, p_resolucion text, p_fecha date)
returns text language sql immutable as $$
  select case
    when coalesce(p_formato, '') <> 'PM_01_CGSC' then ''
    when coalesce(p_resolucion, '') <> '' then p_resolucion
    when p_fecha >= date '2025-01-01' then '24.043'
    when p_fecha >= date '2024-01-24' then '24.003'
    when p_fecha is null then '24.043'
    else 'anterior'
  end
$$;

-- La Res. 24.043 (art. 12) califica cada acción con 0 («no cumple») o 2 («sí cumple»)
create or replace function public.pm_calificacion_guard()
returns trigger language plpgsql as $$
declare v_res text;
begin
  if new.cal_cumplimiento is distinct from 1 and new.cal_efectividad is distinct from 1 then return new; end if;
  select public.pm_resolucion_de(p.formato, p.resolucion, p.fecha_suscripcion) into v_res
    from public.pm_planes p where p.id = new.plan_id;
  if v_res = '24.043' then
    raise exception 'La Resolución 24.043 (artículo 12) califica cada acción solo con 0 (no cumple) o 2 (sí cumple)';
  end if;
  return new;
end $$;
drop trigger if exists trg_pm_calificacion_guard on public.pm_acciones;
create trigger trg_pm_calificacion_guard before insert or update of cal_cumplimiento, cal_efectividad on public.pm_acciones
  for each row execute function public.pm_calificacion_guard();

-- ---------- prórrogas (arts. 15 y 16) ----------
create table if not exists public.pm_prorrogas (
  id                       uuid primary key default gen_random_uuid(),
  plan_id                  uuid not null references public.pm_planes(id) on delete cascade,
  accion_id                uuid references public.pm_acciones(id) on delete cascade,
  tipo                     text not null check (tipo in ('presentacion','informe','accion')),
  corte                    date,
  fecha_solicitud          date not null,
  radicado_solicitud       text not null default '',
  fecha_vencimiento_anterior date not null,
  fecha_nueva              date not null,
  estado                   text not null default 'solicitada' check (estado in ('solicitada','concedida','negada')),
  radicado_respuesta       text not null default '',
  fecha_respuesta          date,
  observaciones            text not null default '',
  created_by               uuid default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check ((tipo = 'accion') = (accion_id is not null)),
  check ((tipo = 'informe') = (corte is not null)),
  check (fecha_nueva > fecha_vencimiento_anterior)
);
-- «por una sola vez»
create unique index if not exists pm_prorrogas_una_accion on public.pm_prorrogas(accion_id) where tipo = 'accion' and estado <> 'negada';
create unique index if not exists pm_prorrogas_una_present on public.pm_prorrogas(plan_id) where tipo = 'presentacion' and estado <> 'negada';
create unique index if not exists pm_prorrogas_una_informe on public.pm_prorrogas(plan_id, corte) where tipo = 'informe' and estado <> 'negada';
alter table public.pm_prorrogas enable row level security;
drop policy if exists pm_pror_read on public.pm_prorrogas;
create policy pm_pror_read on public.pm_prorrogas for select to authenticated
  using (coalesce(public.current_rol(), '') in ('admin','alcalde','control_interno'));
drop policy if exists pm_pror_write on public.pm_prorrogas;
create policy pm_pror_write on public.pm_prorrogas for all to authenticated
  using (coalesce(public.current_rol(), '') in ('admin','control_interno'))
  with check (coalesce(public.current_rol(), '') in ('admin','control_interno'));
revoke all on public.pm_prorrogas from anon;
grant select, insert, update, delete on public.pm_prorrogas to authenticated;
drop trigger if exists trg_audit_pm_pror on public.pm_prorrogas;
create trigger trg_audit_pm_pror after insert or update or delete on public.pm_prorrogas
  for each row execute function public.audit_trigger();

-- Prórroga de una acción concedida: cambia la fecha de terminación y conserva la original.
-- Condiciones del art. 16 que se verifican aquí: una sola vez, más de la mitad de la meta con avance
-- validado y nuevo plazo no mayor al 30 % del inicialmente establecido. (Los 15 días hábiles de
-- anticipación los verifica la aplicación con el calendario de festivos.)
create or replace function public.pm_resolver_prorroga(p_id uuid, p_estado text, p_radicado text default '', p_fecha date default current_date)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.pm_prorrogas;
  a public.pm_acciones;
  v_ini date; v_fin date; v_max date;
begin
  if coalesce(public.current_rol(), '') not in ('admin','control_interno') then
    raise exception 'Solo el Super administrador o Control Interno registran prórrogas';
  end if;
  if p_estado not in ('concedida','negada') then raise exception 'Estado de prórroga no válido'; end if;
  select * into v from public.pm_prorrogas where id = p_id for update;
  if not found then raise exception 'La prórroga no existe'; end if;
  if v.estado <> 'solicitada' then raise exception 'La prórroga ya fue resuelta'; end if;
  if p_estado = 'concedida' and v.tipo = 'accion' then
    select * into a from public.pm_acciones where id = v.accion_id for update;
    if coalesce(a.cantidad, 0) <= 0 or coalesce(a.avance, 0) / a.cantidad <= 0.5 then
      raise exception 'Artículo 16: la prórroga exige haber cumplido más de la mitad de la meta (avance validado)';
    end if;
    v_ini := a.fecha_inicio; v_fin := coalesce(a.fecha_fin_original, a.fecha_fin);
    v_max := v_fin + ceil((v_fin - v_ini) * 0.3)::int;
    if v.fecha_nueva > v_max then
      raise exception 'Artículo 16: el nuevo plazo no puede superar el 30 %% del inicialmente establecido (máximo %)', to_char(v_max, 'DD/MM/YYYY');
    end if;
    update public.pm_acciones set fecha_fin_original = coalesce(fecha_fin_original, fecha_fin), fecha_fin = v.fecha_nueva
     where id = a.id;
  end if;
  update public.pm_prorrogas set estado = p_estado, radicado_respuesta = coalesce(p_radicado, ''),
         fecha_respuesta = coalesce(p_fecha, current_date), updated_at = now()
   where id = p_id;
end $$;
revoke all on function public.pm_resolver_prorroga(uuid, text, text, date) from public, anon;
grant execute on function public.pm_resolver_prorroga(uuid, text, text, date) to authenticated;

-- ---------- memoria documental ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('archivo', 'archivo', false, 52428800, array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv'])
on conflict (id) do nothing;
drop policy if exists archivo_leer on storage.objects;
create policy archivo_leer on storage.objects for select to authenticated
  using (bucket_id = 'archivo' and coalesce(public.current_rol(), '') in ('admin','alcalde','control_interno'));
drop policy if exists archivo_subir on storage.objects;
create policy archivo_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'archivo' and coalesce(public.current_rol(), '') in ('admin','control_interno'));
drop policy if exists archivo_borrar on storage.objects;
create policy archivo_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'archivo' and coalesce(public.current_rol(), '') = 'admin');

create table if not exists public.archivo_documentos (
  id               uuid primary key default gen_random_uuid(),
  plan_id          uuid references public.pm_planes(id) on delete set null,
  requerimiento_id uuid references public.requerimientos(id) on delete set null,
  tipo             text not null check (tipo in ('informe_final','plan_excel','formato_exportado','informe_avance','oficio','soporte','otro')),
  nombre           text not null,
  path             text not null unique,
  mime             text not null default '',
  tamano           bigint not null default 0,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  radicado_orfeo   text not null default '',
  observaciones    text not null default '',
  subido_por       uuid default auth.uid(),
  subido_email     text not null default '',
  created_at       timestamptz not null default now(),
  eliminado_at     timestamptz,
  eliminado_por    uuid
);
create index if not exists archivo_doc_plan on public.archivo_documentos(plan_id);
alter table public.archivo_documentos enable row level security;
drop policy if exists archivo_doc_leer on public.archivo_documentos;
create policy archivo_doc_leer on public.archivo_documentos for select to authenticated
  using (coalesce(public.current_rol(), '') in ('admin','alcalde','control_interno'));
drop policy if exists archivo_doc_subir on public.archivo_documentos;
create policy archivo_doc_subir on public.archivo_documentos for insert to authenticated
  with check (coalesce(public.current_rol(), '') in ('admin','control_interno'));
drop policy if exists archivo_doc_papelera on public.archivo_documentos;
create policy archivo_doc_papelera on public.archivo_documentos for update to authenticated
  using (coalesce(public.current_rol(), '') in ('admin','control_interno'))
  with check (coalesce(public.current_rol(), '') in ('admin','control_interno'));
-- borrar de verdad: solo el Super administrador y solo lo que ya está en la papelera
drop policy if exists archivo_doc_purgar on public.archivo_documentos;
create policy archivo_doc_purgar on public.archivo_documentos for delete to authenticated
  using (coalesce(public.current_rol(), '') = 'admin' and eliminado_at is not null);
revoke all on public.archivo_documentos from anon;
grant select, insert, update, delete on public.archivo_documentos to authenticated;
-- el contenido de un documento no cambia: solo se envía a la papelera o se restaura
create or replace function public.archivo_doc_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.path is distinct from old.path or new.sha256 is distinct from old.sha256 or new.tamano is distinct from old.tamano then
    raise exception 'El archivo de un documento no se puede reemplazar: suba uno nuevo';
  end if;
  new.eliminado_por := case when new.eliminado_at is null then null else coalesce(new.eliminado_por, auth.uid()) end;
  return new;
end $$;
drop trigger if exists trg_archivo_doc_guard on public.archivo_documentos;
create trigger trg_archivo_doc_guard before update on public.archivo_documentos
  for each row execute function public.archivo_doc_guard();
drop trigger if exists trg_audit_archivo_doc on public.archivo_documentos;
create trigger trg_audit_archivo_doc after insert or update or delete on public.archivo_documentos
  for each row execute function public.audit_trigger();

-- ---------- informes semestrales de avance (art. 11) ----------
create table if not exists public.pm_informes_avance (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references public.pm_planes(id) on delete cascade,
  corte          date not null check (to_char(corte, 'MM-DD') in ('06-30','12-31')),
  fecha_envio    date not null,
  radicado_orfeo text not null default '',
  documento_id   uuid references public.archivo_documentos(id) on delete set null,
  observaciones  text not null default '',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  unique (plan_id, corte)
);
alter table public.pm_informes_avance enable row level security;
drop policy if exists pm_inf_read on public.pm_informes_avance;
create policy pm_inf_read on public.pm_informes_avance for select to authenticated
  using (coalesce(public.current_rol(), '') in ('admin','alcalde','control_interno'));
drop policy if exists pm_inf_write on public.pm_informes_avance;
create policy pm_inf_write on public.pm_informes_avance for all to authenticated
  using (coalesce(public.current_rol(), '') in ('admin','control_interno'))
  with check (coalesce(public.current_rol(), '') in ('admin','control_interno'));
revoke all on public.pm_informes_avance from anon;
grant select, insert, update, delete on public.pm_informes_avance to authenticated;
drop trigger if exists trg_audit_pm_inf on public.pm_informes_avance;
create trigger trg_audit_pm_inf after insert or update or delete on public.pm_informes_avance
  for each row execute function public.audit_trigger();

-- ---------- papelera: restaurar desde la bitácora ----------
-- txid agrupa lo que se eliminó en una misma operación (un plan con sus hallazgos, acciones y avances)
-- Sin valor por defecto al crearla: así los registros anteriores quedan en NULL (no comparten un mismo número)
alter table public.audit_log add column if not exists txid bigint;
alter table public.audit_log alter column txid set default txid_current();
create table if not exists public.pm_restauraciones (
  audit_id        bigint primary key references public.audit_log(id),
  restaurado_por  uuid default auth.uid(),
  restaurado_at   timestamptz not null default now()
);
alter table public.pm_restauraciones enable row level security;
drop policy if exists pm_rest_read on public.pm_restauraciones;
create policy pm_rest_read on public.pm_restauraciones for select to authenticated
  using (coalesce(public.current_rol(), '') in ('admin','control_interno'));
revoke all on public.pm_restauraciones from anon;
grant select on public.pm_restauraciones to authenticated;

-- Dos eliminaciones son de la misma operación si comparten txid; en registros anteriores a este script
-- (txid NULL), si son del mismo plan y ocurrieron en el mismo instante (± 2 segundos)
create or replace function public.pm_misma_operacion(a public.audit_log, b public.audit_log)
returns boolean language sql immutable as $$
  select case
    when a.txid is not null and b.txid is not null then a.txid = b.txid
    when a.txid is null and b.txid is null then
      abs(extract(epoch from (a.created_at - b.created_at))) <= 2
      and coalesce(a.payload->>'plan_id', a.registro_id) = coalesce(b.payload->>'plan_id', b.registro_id)
      and (a.tabla = 'pm_planes' or b.tabla <> 'pm_planes')
    else false
  end
$$;

-- Vuelve a insertar una fila tal como estaba, con las columnas que existan hoy (las nuevas toman su valor por defecto)
create or replace function public.pm_reinsertar(p_tabla text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_cols text;
begin
  if p_tabla not in ('pm_planes','pm_hallazgos','pm_acciones','pm_avances','pm_traslados','pm_prorrogas','pm_informes_avance') then
    raise exception 'Tabla no restaurable: %', p_tabla;
  end if;
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = p_tabla and p_payload ? c.column_name;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)',
                 p_tabla, v_cols, v_cols, p_tabla) using p_payload;
end $$;
revoke all on function public.pm_reinsertar(text, jsonb) from public, anon, authenticated;

-- Lo que hay en la papelera: eliminaciones «de primer nivel» aún no restauradas
create or replace function public.pm_papelera()
returns table (audit_id bigint, tabla text, registro_id text, plan_id text, descripcion text,
               eliminado_por text, eliminado_at timestamptz, dependientes int)
language sql security definer set search_path = public stable as $$
  select a.id, a.tabla, a.registro_id,
         coalesce(a.payload->>'plan_id', a.registro_id),
         case a.tabla
           when 'pm_planes' then coalesce(a.payload->>'ejercicio', '')
           when 'pm_hallazgos' then 'Hallazgo ' || coalesce(a.payload->>'numero', '') || ': ' || left(coalesce(a.payload->>'descripcion', ''), 140)
           when 'pm_acciones' then left(coalesce(a.payload->>'accion', ''), 160)
           when 'pm_traslados' then 'Traslado ' || coalesce(a.payload->>'tipo', '') || ' a ' || coalesce(a.payload->>'destino', '')
         end,
         a.usuario, a.created_at,
         (select count(*)::int from public.audit_log d
           where d.accion = 'DELETE' and d.id <> a.id and public.pm_misma_operacion(a, d)
             and d.tabla in ('pm_hallazgos','pm_acciones','pm_avances','pm_traslados','pm_prorrogas','pm_informes_avance'))
    from public.audit_log a
   where coalesce(public.current_rol(), '') in ('admin','control_interno')
     and a.accion = 'DELETE'
     and a.tabla in ('pm_planes','pm_hallazgos','pm_acciones','pm_traslados')
     and not exists (select 1 from public.pm_restauraciones r where r.audit_id = a.id)
     -- de primer nivel: su «padre» no se eliminó en la misma operación
     and not exists (
       select 1 from public.audit_log p
        where p.accion = 'DELETE' and p.id <> a.id and public.pm_misma_operacion(a, p)
          and ((p.tabla = 'pm_planes' and a.tabla <> 'pm_planes' and p.registro_id = a.payload->>'plan_id')
            or (p.tabla = 'pm_hallazgos' and a.tabla in ('pm_acciones','pm_traslados') and p.registro_id = a.payload->>'hallazgo_id')))
   order by a.created_at desc
   limit 500
$$;
revoke all on function public.pm_papelera() from public, anon;
grant execute on function public.pm_papelera() to authenticated;

-- Restaura lo eliminado en una operación: el elemento y todo lo que se eliminó con él (en orden)
create or replace function public.pm_restaurar(p_audit_id bigint)
returns text language plpgsql security definer set search_path = public as $$
declare
  a public.audit_log;
  d record;
  n int := 0;
begin
  if coalesce(public.current_rol(), '') not in ('admin','control_interno') then
    raise exception 'Solo el Super administrador o Control Interno restauran desde la papelera';
  end if;
  select * into a from public.audit_log where id = p_audit_id;
  if not found or a.accion <> 'DELETE' or a.tabla not in ('pm_planes','pm_hallazgos','pm_acciones','pm_traslados') then
    raise exception 'No es un elemento de la papelera';
  end if;
  if exists (select 1 from public.pm_restauraciones where audit_id = p_audit_id) then
    raise exception 'Este elemento ya fue restaurado';
  end if;
  if a.tabla <> 'pm_planes' and not exists (select 1 from public.pm_planes where id = (a.payload->>'plan_id')::uuid) then
    raise exception 'Primero restaure el plan al que pertenece';
  end if;
  perform set_config('pm.interno', '1', true);
  for d in
    select x.* from public.audit_log x
     where x.accion = 'DELETE'
       and (x.id = a.id or (public.pm_misma_operacion(a, x)
            and x.tabla in ('pm_planes','pm_hallazgos','pm_acciones','pm_avances','pm_traslados','pm_prorrogas','pm_informes_avance')))
       and not exists (select 1 from public.pm_restauraciones r where r.audit_id = x.id)
     order by array_position(array['pm_planes','pm_hallazgos','pm_acciones','pm_avances','pm_traslados','pm_prorrogas','pm_informes_avance'], x.tabla), x.id
  loop
    begin
      perform public.pm_reinsertar(d.tabla, d.payload);
    exception when unique_violation then
      raise exception 'No se puede restaurar: ya existe un registro igual (por ejemplo, un hallazgo con el mismo número). Revíselo y vuelva a intentar.';
    end;
    insert into public.pm_restauraciones (audit_id) values (d.id);
    n := n + 1;
  end loop;
  perform set_config('pm.interno', '', true);
  return n || ' registro(s) restaurado(s)';
end $$;
revoke all on function public.pm_restaurar(bigint) from public, anon;
grant execute on function public.pm_restaurar(bigint) to authenticated;

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
         fecha_informe, fecha_suscripcion, estado, observaciones, requerimiento_id, direccion_tecnica,
         resolucion, fecha_radicacion_informe, plan_origen_id)
  values (pl->>'formato', nullif(pl->>'ente_id', '')::bigint, pl->>'contraloria',
          coalesce(nullif(pl->>'entidad', ''), 'Distrito Especial de Santiago de Cali'),
          coalesce(pl->>'nit', ''), coalesce(pl->>'representante_legal', ''), coalesce(pl->>'ordenador_gasto', ''),
          pl->>'ejercicio', coalesce(pl->>'tipo_ejercicio', ''), coalesce(pl->>'modalidad', ''),
          coalesce(pl->>'vigencia_pvcft', ''), coalesce(pl->>'periodo_auditado', ''), coalesce(pl->>'numero_informe', ''),
          coalesce(pl->>'radicado_orfeo', ''), nullif(pl->>'fecha_informe', '')::date, (pl->>'fecha_suscripcion')::date,
          coalesce(nullif(pl->>'estado', ''), 'en_ejecucion'),
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

-- Verificación
select (select count(*) from information_schema.tables where table_schema = 'public'
         and table_name in ('pm_prorrogas','pm_informes_avance','archivo_documentos','pm_restauraciones')) as tablas_nuevas,
       (select count(*) from storage.buckets where id = 'archivo') as deposito_archivo;
