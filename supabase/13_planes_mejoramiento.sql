-- =====================================================================
-- 13 · Planes de mejoramiento
-- Formatos soportados:
--   * PM_01 CGSC  · Contraloría General de Santiago de Cali (formulación y avance)
--   * F14 / F14.1 · Contraloría General de la República (suscripción y seguimiento)
--
-- Modelo:  plan → hallazgos → acciones (actividades con meta, plazo y responsable) → avances
--
-- Reglas que garantiza la base de datos (no dependen de la app):
--   * Formulan y editan: Super administrador y Control Interno.
--   * Cada dependencia solo ve sus acciones y reporta avance SOLO de sus acciones.
--   * El avance de una acción solo cambia al VALIDAR un reporte (pm_revisar_avance) o al importar.
--   * Un avance validado no se puede editar ni borrar. Acciones o planes con avances no se borran.
--   * Toda escritura queda en la pista de auditoría encadenada (audit_trigger).
-- Es idempotente: se puede ejecutar más de una vez.
-- =====================================================================

-- 1. Tablas -------------------------------------------------------------
create table if not exists public.pm_planes (
  id                  uuid primary key default gen_random_uuid(),
  formato             text not null check (formato in ('PM_01_CGSC','F14_CGR','OTRO')),
  ente_id             bigint references public.entes(id),
  contraloria         text not null,
  entidad             text not null default 'Distrito Especial de Santiago de Cali',
  nit                 text not null default '',
  representante_legal text not null default '',
  ordenador_gasto     text not null default '',
  ejercicio           text not null check (length(trim(ejercicio)) > 3),
  tipo_ejercicio      text not null default '',
  modalidad           text not null default '',
  vigencia_pvcft      text not null default '',
  periodo_auditado    text not null default '',
  numero_informe      text not null default '',
  radicado_orfeo      text not null default '',
  fecha_informe       date,
  fecha_suscripcion   date not null,
  estado              text not null default 'en_ejecucion' check (estado in ('formulacion','en_ejecucion','cerrado')),
  observaciones       text not null default '',
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.pm_hallazgos (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.pm_planes(id) on delete cascade,
  numero        text not null check (length(trim(numero)) > 0),
  descripcion   text not null check (length(trim(descripcion)) > 3),
  causa         text not null default '',
  efecto        text not null default '',
  connotaciones text[] not null default '{}'
                check (connotaciones <@ array['administrativa','disciplinaria','fiscal','penal','sancionatoria']::text[]),
  cuantia       numeric(18,2) check (cuantia is null or cuantia >= 0),
  macroproceso  text not null default '',
  orden         int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint pm_hallazgos_numero_unq unique (plan_id, numero)
);

create table if not exists public.pm_acciones (
  id                  uuid primary key default gen_random_uuid(),
  plan_id             uuid not null references public.pm_planes(id) on delete cascade,
  hallazgo_id         uuid not null references public.pm_hallazgos(id) on delete cascade,
  dependencia_id      bigint references public.dependencias(id),
  responsable         text not null default '',
  accion              text not null check (length(trim(accion)) > 3),
  proposito           text not null default '',
  actividad           text not null default '',
  meta                text not null default '',
  unidad_medida       text not null default 'Porcentaje',
  cantidad            numeric(14,2) not null default 100 check (cantidad > 0),
  fuente_verificacion text not null default '',
  lugar_verificacion  text not null default '',
  fecha_inicio        date not null,
  fecha_fin           date not null,
  avance              numeric(14,2) not null default 0 check (avance >= 0),
  fecha_corte         date,
  orden               int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint pm_acciones_fechas_ok check (fecha_fin >= fecha_inicio)
);

create table if not exists public.pm_avances (
  id              uuid primary key default gen_random_uuid(),
  accion_id       uuid not null references public.pm_acciones(id) on delete cascade,
  plan_id         uuid not null references public.pm_planes(id) on delete cascade,
  dependencia_id  bigint references public.dependencias(id),
  fecha_corte     date not null,
  cantidad        numeric(14,2) not null check (cantidad >= 0),
  descripcion     text not null check (length(trim(descripcion)) > 9),
  radicado_orfeo  text not null default '',
  soporte_path    text,
  soporte_hash    text,
  estado          text not null default 'reportado' check (estado in ('reportado','validado','devuelto')),
  observacion     text not null default '',
  reportado_por   uuid default auth.uid(),
  reportado_email text not null default '',
  revisado_por    uuid,
  revisado_email  text not null default '',
  revisado_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_pm_hall_plan   on public.pm_hallazgos (plan_id, orden);
create index if not exists idx_pm_acc_plan    on public.pm_acciones (plan_id, hallazgo_id, orden);
create index if not exists idx_pm_acc_dep     on public.pm_acciones (dependencia_id, fecha_fin);
create index if not exists idx_pm_av_accion   on public.pm_avances (accion_id, fecha_corte);
create index if not exists idx_pm_av_estado   on public.pm_avances (estado);

-- 2. Integridad --------------------------------------------------------
-- updated_at automático
create or replace function public.pm_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_pm_planes_touch on public.pm_planes;
create trigger trg_pm_planes_touch before update on public.pm_planes for each row execute function public.pm_touch();
drop trigger if exists trg_pm_hall_touch on public.pm_hallazgos;
create trigger trg_pm_hall_touch before update on public.pm_hallazgos for each row execute function public.pm_touch();

-- La acción debe pertenecer al mismo plan que su hallazgo; el avance solo lo cambian las funciones del módulo
create or replace function public.pm_acciones_guard()
returns trigger language plpgsql as $$
begin
  if (select plan_id from public.pm_hallazgos where id = new.hallazgo_id) is distinct from new.plan_id then
    raise exception 'La acción no corresponde al plan de su hallazgo';
  end if;
  if tg_op = 'INSERT' then
    if coalesce(current_setting('pm.interno', true), '') <> '1' then
      new.avance := 0; new.fecha_corte := null;
    end if;
  elsif (new.avance is distinct from old.avance or new.fecha_corte is distinct from old.fecha_corte)
        and coalesce(current_setting('pm.interno', true), '') <> '1' then
    raise exception 'El avance de una acción solo cambia validando un reporte de avance';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_pm_acciones_guard on public.pm_acciones;
create trigger trg_pm_acciones_guard before insert or update on public.pm_acciones
  for each row execute function public.pm_acciones_guard();

-- No se borra lo que ya tiene avances reportados (protege la trazabilidad)
create or replace function public.pm_borrado_guard()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'pm_acciones' and exists (select 1 from public.pm_avances where accion_id = old.id) then
    raise exception 'La acción tiene avances reportados: no se puede eliminar';
  elsif tg_table_name = 'pm_hallazgos' and exists (
      select 1 from public.pm_avances v join public.pm_acciones a on a.id = v.accion_id where a.hallazgo_id = old.id) then
    raise exception 'El hallazgo tiene acciones con avances reportados: no se puede eliminar';
  elsif tg_table_name = 'pm_planes' and exists (select 1 from public.pm_avances where plan_id = old.id)
        and coalesce(current_setting('pm.interno', true), '') <> '1' then
    raise exception 'El plan tiene avances reportados: no se puede eliminar';
  end if;
  return old;
end $$;
drop trigger if exists trg_pm_acc_del on public.pm_acciones;
create trigger trg_pm_acc_del before delete on public.pm_acciones for each row execute function public.pm_borrado_guard();
drop trigger if exists trg_pm_hall_del on public.pm_hallazgos;
create trigger trg_pm_hall_del before delete on public.pm_hallazgos for each row execute function public.pm_borrado_guard();
drop trigger if exists trg_pm_plan_del on public.pm_planes;
create trigger trg_pm_plan_del before delete on public.pm_planes for each row execute function public.pm_borrado_guard();

-- Auditoría encadenada (misma función de todo el sistema)
drop trigger if exists trg_audit_pm_planes on public.pm_planes;
create trigger trg_audit_pm_planes after insert or update or delete on public.pm_planes for each row execute function public.audit_trigger();
drop trigger if exists trg_audit_pm_hall on public.pm_hallazgos;
create trigger trg_audit_pm_hall after insert or update or delete on public.pm_hallazgos for each row execute function public.audit_trigger();
drop trigger if exists trg_audit_pm_acc on public.pm_acciones;
create trigger trg_audit_pm_acc after insert or update or delete on public.pm_acciones for each row execute function public.audit_trigger();
drop trigger if exists trg_audit_pm_av on public.pm_avances;
create trigger trg_audit_pm_av after insert or update or delete on public.pm_avances for each row execute function public.audit_trigger();

-- 3. Seguridad por filas -------------------------------------------------
alter table public.pm_planes    enable row level security;
alter table public.pm_hallazgos enable row level security;
alter table public.pm_acciones  enable row level security;
alter table public.pm_avances   enable row level security;

drop policy if exists pm_planes_read on public.pm_planes;
create policy pm_planes_read on public.pm_planes for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and exists (
      select 1 from public.pm_acciones a where a.plan_id = pm_planes.id and a.dependencia_id = public.current_dep()))
);
drop policy if exists pm_planes_write on public.pm_planes;
create policy pm_planes_write on public.pm_planes for all to authenticated
  using (public.current_rol() in ('admin','control_interno'))
  with check (public.current_rol() in ('admin','control_interno'));

drop policy if exists pm_hall_read on public.pm_hallazgos;
create policy pm_hall_read on public.pm_hallazgos for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and exists (
      select 1 from public.pm_acciones a where a.hallazgo_id = pm_hallazgos.id and a.dependencia_id = public.current_dep()))
);
drop policy if exists pm_hall_write on public.pm_hallazgos;
create policy pm_hall_write on public.pm_hallazgos for all to authenticated
  using (public.current_rol() in ('admin','control_interno'))
  with check (public.current_rol() in ('admin','control_interno'));

drop policy if exists pm_acc_read on public.pm_acciones;
create policy pm_acc_read on public.pm_acciones for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep())
);
drop policy if exists pm_acc_write on public.pm_acciones;
create policy pm_acc_write on public.pm_acciones for all to authenticated
  using (public.current_rol() in ('admin','control_interno'))
  with check (public.current_rol() in ('admin','control_interno'));

drop policy if exists pm_av_read on public.pm_avances;
create policy pm_av_read on public.pm_avances for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep())
);
-- pm_avances no tiene políticas de escritura: solo se escribe con las funciones de abajo.

revoke all on public.pm_planes, public.pm_hallazgos, public.pm_acciones, public.pm_avances from anon;
grant select, insert, update, delete on public.pm_planes, public.pm_hallazgos, public.pm_acciones to authenticated;
grant select on public.pm_avances to authenticated;

-- 4. Funciones del módulo ------------------------------------------------
-- Reportar avance (cantidad = avance físico ACUMULADO a la fecha de corte)
create or replace function public.pm_reportar_avance(
  p_accion uuid, p_fecha date, p_cantidad numeric, p_descripcion text,
  p_orfeo text default '', p_path text default null, p_hash text default null, p_validar boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.current_rol();
  v_a   public.pm_acciones%rowtype;
  v_id  uuid;
  v_mail text := coalesce((select email from public.profiles where id = auth.uid()), '');
begin
  select * into v_a from public.pm_acciones where id = p_accion;
  if not found then raise exception 'La acción no existe'; end if;
  if v_rol is null then raise exception 'Tu cuenta no está activa'; end if;
  if v_rol = 'alcalde' then raise exception 'Tu rol no reporta avances'; end if;
  if v_rol in ('secretario','enlace') and v_a.dependencia_id is distinct from public.current_dep() then
    raise exception 'Solo puedes reportar avances de las acciones de tu dependencia';
  end if;
  if p_fecha is null or p_fecha > current_date then raise exception 'La fecha de corte no puede ser futura'; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'El avance debe ser un número mayor o igual a cero'; end if;
  if length(trim(coalesce(p_descripcion, ''))) < 10 then raise exception 'Describe el avance (mínimo 10 caracteres)'; end if;
  if exists (select 1 from public.pm_avances where accion_id = p_accion and estado = 'reportado') then
    raise exception 'Esta acción ya tiene un avance pendiente de validar';
  end if;

  insert into public.pm_avances (accion_id, plan_id, dependencia_id, fecha_corte, cantidad, descripcion,
                                 radicado_orfeo, soporte_path, soporte_hash, reportado_email)
  values (p_accion, v_a.plan_id, v_a.dependencia_id, p_fecha, p_cantidad, trim(p_descripcion),
          coalesce(trim(p_orfeo), ''), p_path, p_hash, v_mail)
  returning id into v_id;

  if p_validar and v_rol in ('admin','control_interno') then
    perform public.pm_revisar_avance(v_id, 'validado', 'Registrado y validado por ' || v_mail);
  end if;
  return v_id;
end $$;

-- Validar o devolver un avance reportado
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

-- Importación atómica de un plan completo (desde el Excel PM_01 o F14/F14.1)
-- p = { plan:{...}, hallazgos:[{numero, descripcion, ..., acciones:[{..., avance, fecha_corte}]}], archivo:'nombre.xlsx' }
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
    insert into public.pm_hallazgos (plan_id, numero, descripcion, causa, efecto, connotaciones, cuantia, macroproceso, orden)
    values (v_plan, h->>'numero', h->>'descripcion', coalesce(h->>'causa', ''), coalesce(h->>'efecto', ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(h->'connotaciones', '[]'::jsonb)) x), '{}'),
            nullif(h->>'cuantia', '')::numeric, coalesce(h->>'macroproceso', ''), v_oh)
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

-- Eliminar un plan importado por error (solo Super administrador; borra también sus avances)
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

revoke all on function public.pm_reportar_avance(uuid, date, numeric, text, text, text, text, boolean) from public, anon;
revoke all on function public.pm_revisar_avance(uuid, text, text) from public, anon;
revoke all on function public.pm_importar(jsonb) from public, anon;
revoke all on function public.pm_eliminar_plan(uuid) from public, anon;
grant execute on function public.pm_reportar_avance(uuid, date, numeric, text, text, text, text, boolean) to authenticated;
grant execute on function public.pm_revisar_avance(uuid, text, text) to authenticated;
grant execute on function public.pm_importar(jsonb) to authenticated;
grant execute on function public.pm_eliminar_plan(uuid) to authenticated;

-- Control Interno también puede adjuntar soportes de avances (carpeta pm/ del almacenamiento privado)
drop policy if exists soportes_ins_pm on storage.objects;
create policy soportes_ins_pm on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and name like 'pm/%' and public.current_rol() = 'control_interno');

-- 5. Verificación ---------------------------------------------------------
select 'pm_planes' as tabla, count(*) as registros from public.pm_planes
union all select 'pm_hallazgos', count(*) from public.pm_hallazgos
union all select 'pm_acciones', count(*) from public.pm_acciones
union all select 'pm_avances', count(*) from public.pm_avances;
