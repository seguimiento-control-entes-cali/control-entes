-- =====================================================================
-- INSTALADOR COMPLETO · Control de Entes · Alcaldía de Santiago de Cali
-- GENERADO por scripts/generar-instalador.mjs: no editar a mano; editar los scripts y volver a generarlo.
-- Contiene, en orden: 01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 12, 13, 14, 16, 17, 18, 19, 20, 22, 23.
-- No contiene: 11 (datos reales), 15 (ya no hace nada), 21 (programa tareas).
-- Ejecutar UNA sola vez en el SQL Editor de un proyecto de Supabase VACÍO. Va en una sola transacción: si algo
-- falla, no queda nada instalado. No trae datos reales: solo los catálogos de entes y dependencias (02).
-- Al final, la verificación: tablas_faltantes debe ser 0 y funciones_ok true.
-- =====================================================================
begin;

-- >>>>>>>>>>>>>>>>>>>> 01_schema.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- CONTROL DE ENTES · Alcaldía de Santiago de Cali
-- Esquema completo para Supabase (ejecutar una sola vez en SQL Editor)
--
-- CAPA 1  Roles y políticas (RLS)            -> profiles, current_rol(), policies
-- CAPA 2  Auditoría inmutable SHA-256        -> audit_log, audit_trigger(), verificar_cadena_auditoria()
-- CAPA 3  Validación y anti-duplicados       -> UNIQUE + cerrar_requerimiento()
-- CAPA 4  Riesgo por vencimiento y escalamiento -> v_requerimientos (semáforo), escalar_requerimiento()
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
create table if not exists public.config (
  id                   int primary key default 1 check (id = 1),
  dias_rojo            int  not null default 5 check (dias_rojo between 1 and 30),
  correo_disciplinario text not null default ''
);
insert into public.config (id) values (1) on conflict do nothing;

create table if not exists public.entes (
  id         bigint generated always as identity primary key,
  nombre     text not null unique,
  sigla      text not null default '',
  tipo       text not null default 'Otro',
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.dependencias (
  id                bigint generated always as identity primary key,
  nombre            text not null unique,
  secretario_nombre text not null default '',
  correo            text not null default '',
  telefono          text not null default '',
  activo            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CAPA 1 · Perfiles y roles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text,
  nombre         text,
  rol            text not null default 'enlace'
                 check (rol in ('admin','alcalde','secretario','enlace','control_interno')),
  dependencia_id bigint references public.dependencias(id),
  activo         boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Toda cuenta nueva nace como 'enlace'. Solo queda ACTIVA si usa correo @cali.gov.co.
-- Un admin puede activar cuentas con otro dominio manualmente.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nombre, activo)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    lower(new.email) like '%@cali.gov.co'
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.profiles where id = auth.uid() and activo
$$;

create or replace function public.current_dep()
returns bigint language sql stable security definer set search_path = public as $$
  select dependencia_id from public.profiles where id = auth.uid() and activo
$$;

-- ---------------------------------------------------------------------
-- Requerimientos
-- ---------------------------------------------------------------------
create table if not exists public.requerimientos (
  id              uuid primary key default gen_random_uuid(),
  radicado        text not null,
  vigencia        int  not null,
  ente_id         bigint not null references public.entes(id),
  dependencia_id  bigint not null references public.dependencias(id),
  asunto          text not null check (length(trim(asunto)) > 3),
  fecha_radicacion date not null default current_date,
  fecha_limite    date not null,
  estado          text not null default 'abierto' check (estado in ('abierto','cerrado')),
  orfeo_salida    text,
  fecha_cierre    date,
  soporte_path    text,
  soporte_hash    text,
  escalado_at     timestamptz,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),

  -- CAPA 3 · anti-duplicados a nivel de base de datos
  constraint requerimientos_radicado_unq unique (radicado),
  constraint requerimientos_orfeo_unq    unique (orfeo_salida),
  constraint requerimientos_radicado_fmt check (radicado ~ '^[0-9]{4}[A-Z]{2}[0-9]{4,10}$'),
  constraint requerimientos_limite_ok    check (fecha_limite >= fecha_radicacion),
  constraint requerimientos_cierre_ok    check (
    (estado = 'abierto' and orfeo_salida is null and fecha_cierre is null)
    or
    (estado = 'cerrado' and orfeo_salida ~ '^[0-9]{10,20}$' and fecha_cierre is not null)
  )
);
create index if not exists idx_req_vigencia on public.requerimientos (vigencia, estado, fecha_limite);
create index if not exists idx_req_dep      on public.requerimientos (dependencia_id);

-- CAPA 4 · semáforo calculado por vencimiento (umbral configurable en public.config)
-- Se recrea (no solo "replace"): el script 12 agrega columnas a requerimientos y la vista usa r.*
drop view if exists public.v_requerimientos;
create view public.v_requerimientos with (security_invoker = true) as
select
  r.*,
  e.nombre as ente,
  e.sigla  as ente_sigla,
  d.nombre as dependencia,
  (r.fecha_limite - current_date) as dias_restantes,
  case
    when r.estado = 'cerrado' then 'verde'
    when (r.fecha_limite - current_date) <= (select dias_rojo from public.config where id = 1) then 'rojo'
    else 'amarillo'
  end as semaforo
from public.requerimientos r
join public.entes e        on e.id = r.ente_id
join public.dependencias d on d.id = r.dependencia_id;

create table if not exists public.alertas_log (
  id                bigint generated always as identity primary key,
  requerimiento_id  uuid not null references public.requerimientos(id),
  canal             text not null check (canal in ('whatsapp','correo','registro','disciplinario')),
  enviado_por       uuid default auth.uid(),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CAPA 2 · Auditoría inmutable (cadena de custodia SHA-256)
-- Cada fila incluye el hash de la fila anterior: alterar o borrar cualquier
-- registro rompe la cadena y verificar_cadena_auditoria() lo detecta.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  tabla       text not null,
  registro_id text not null,
  accion      text not null,
  usuario     text not null,
  payload     jsonb not null,
  cambios     jsonb not null default '{}',   -- en UPDATE: {campo: {de: valor anterior, a: valor nuevo}}
  prev_hash   text not null,
  hash        text not null,
  created_at  timestamptz not null default now()
);

create or replace function public.audit_hash(
  p_prev text, p_tabla text, p_accion text, p_registro text,
  p_usuario text, p_ts timestamptz, p_payload jsonb, p_cambios jsonb default '{}'
) returns text language sql immutable set search_path = public, extensions as $$
  select encode(
    extensions.digest(
      p_prev || '|' || p_tabla || '|' || p_accion || '|' || p_registro || '|' || p_usuario || '|' ||
      to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' || p_payload::text || '|' || p_cambios::text,
      'sha256'),
    'hex')
$$;

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_prev    text;
  v_payload jsonb;
  v_cambios jsonb := '{}'::jsonb;
  v_id      text;
  v_user    text := coalesce(auth.uid()::text, 'sistema');
  v_ts      timestamptz := date_trunc('microseconds', clock_timestamp());
begin
  perform pg_advisory_xact_lock(727001);   -- serializa la cadena
  select hash into v_prev from public.audit_log order by id desc limit 1;
  v_prev := coalesce(v_prev, repeat('0', 64));

  if tg_op = 'DELETE' then
    v_payload := to_jsonb(old);  v_id := old.id::text;
  else
    v_payload := to_jsonb(new);  v_id := new.id::text;
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('de', o.value, 'a', n.value)), '{}'::jsonb)
      into v_cambios
      from jsonb_each(to_jsonb(new)) n
      left join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.value is distinct from o.value;
  end if;

  insert into public.audit_log (tabla, registro_id, accion, usuario, payload, cambios, prev_hash, hash, created_at)
  values (tg_table_name, v_id, tg_op, v_user, v_payload, v_cambios, v_prev,
          public.audit_hash(v_prev, tg_table_name, tg_op, v_id, v_user, v_ts, v_payload, v_cambios), v_ts);

  return coalesce(new, old);
end $$;

create or replace function public.audit_block_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'La pista de auditoría es inmutable: no se permite % sobre audit_log', tg_op;
end $$;

drop trigger if exists trg_audit_immutable on public.audit_log;
create trigger trg_audit_immutable
  before update or delete on public.audit_log
  for each row execute function public.audit_block_changes();

drop trigger if exists trg_audit_immutable_trunc on public.audit_log;
create trigger trg_audit_immutable_trunc
  before truncate on public.audit_log
  for each statement execute function public.audit_block_changes();

drop trigger if exists trg_audit_req on public.requerimientos;
create trigger trg_audit_req after insert or update or delete on public.requerimientos
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles after update or delete on public.profiles
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit_alertas on public.alertas_log;
create trigger trg_audit_alertas after insert on public.alertas_log
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit_entes on public.entes;
create trigger trg_audit_entes after insert or update on public.entes
  for each row execute function public.audit_trigger();

drop trigger if exists trg_audit_deps on public.dependencias;
create trigger trg_audit_deps after insert or update on public.dependencias
  for each row execute function public.audit_trigger();

create or replace function public.verificar_cadena_auditoria()
returns table (ok boolean, total bigint, primer_id_roto bigint)
language plpgsql security definer set search_path = public, extensions as $$
declare
  r      record;
  v_prev text := repeat('0', 64);
  v_calc text;
  n      bigint := 0;
begin
  if public.current_rol() is null then
    raise exception 'Sin permiso';
  end if;
  for r in select * from public.audit_log order by id loop
    n := n + 1;
    v_calc := public.audit_hash(v_prev, r.tabla, r.accion, r.registro_id, r.usuario, r.created_at, r.payload, r.cambios);
    if r.prev_hash <> v_prev or r.hash <> v_calc then
      return query select false, n, r.id;
      return;
    end if;
    v_prev := r.hash;
  end loop;
  return query select true, n, null::bigint;
end $$;

-- ---------------------------------------------------------------------
-- CAPA 3 · Cierre de requerimiento con validación (servidor)
-- ---------------------------------------------------------------------
create or replace function public.cerrar_requerimiento(
  p_id uuid, p_orfeo text, p_fecha date, p_path text default null, p_hash text default null
) returns public.requerimientos
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.current_rol();
  v_dep bigint := public.current_dep();
  v_req public.requerimientos;
begin
  if v_rol not in ('admin','secretario','enlace') then
    raise exception 'Tu rol no puede registrar respuestas ORFEO';
  end if;

  select * into v_req from public.requerimientos where id = p_id for update;
  if not found then raise exception 'El requerimiento no existe'; end if;
  if v_rol <> 'admin' and v_req.dependencia_id is distinct from v_dep then
    raise exception 'Este requerimiento pertenece a otra dependencia';
  end if;
  if v_req.estado = 'cerrado' then raise exception 'El requerimiento ya está cerrado'; end if;
  if p_orfeo !~ '^[0-9]{10,20}$' then raise exception 'El radicado ORFEO debe tener entre 10 y 20 dígitos'; end if;
  if p_fecha > current_date then raise exception 'La fecha de envío no puede ser futura'; end if;
  if p_fecha < v_req.fecha_radicacion then raise exception 'La fecha de envío no puede ser anterior a la radicación'; end if;

  begin
    update public.requerimientos
       set estado = 'cerrado', orfeo_salida = p_orfeo, fecha_cierre = p_fecha,
           soporte_path = p_path, soporte_hash = p_hash
     where id = p_id
     returning * into v_req;
  exception when unique_violation then
    raise exception 'El radicado ORFEO % ya fue registrado en otro requerimiento', p_orfeo;
  end;
  return v_req;
end $$;

-- ---------------------------------------------------------------------
-- CAPA 4 · Escalamiento
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

-- ---------------------------------------------------------------------
-- CAPA 1 · Row Level Security
-- ---------------------------------------------------------------------
alter table public.config         enable row level security;
alter table public.entes          enable row level security;
alter table public.dependencias   enable row level security;
alter table public.profiles       enable row level security;
alter table public.requerimientos enable row level security;
alter table public.alertas_log    enable row level security;
alter table public.audit_log      enable row level security;

-- Lectura de catálogos y configuración: cualquier usuario activo
create policy config_read  on public.config        for select to authenticated using (public.current_rol() is not null);
create policy config_write on public.config        for update to authenticated using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');
create policy entes_read   on public.entes         for select to authenticated using (public.current_rol() is not null);
create policy entes_ins    on public.entes         for insert to authenticated with check (public.current_rol() = 'admin');
create policy entes_upd    on public.entes         for update to authenticated using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');
create policy deps_read    on public.dependencias  for select to authenticated using (public.current_rol() is not null);
create policy deps_ins     on public.dependencias  for insert to authenticated with check (public.current_rol() = 'admin');
create policy deps_upd     on public.dependencias  for update to authenticated using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');

-- Perfiles: cada quien ve el suyo; admin y control interno ven todos; solo admin modifica
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_rol() in ('admin','control_interno'));
create policy profiles_upd  on public.profiles for update to authenticated
  using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');

-- Requerimientos: secretario/enlace solo ven su dependencia. Nadie borra. El cierre es vía cerrar_requerimiento().
create policy req_read on public.requerimientos for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep())
);
create policy req_ins on public.requerimientos for insert to authenticated with check (
  public.current_rol() = 'admin'
  or (public.current_rol() = 'enlace' and dependencia_id = public.current_dep())
);
create policy req_upd on public.requerimientos for update to authenticated
  using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');

-- Alertas y auditoría: solo lectura para roles de supervisión
create policy alertas_read on public.alertas_log for select to authenticated
  using (public.current_rol() in ('admin','alcalde','control_interno'));
create policy audit_read on public.audit_log for select to authenticated
  using (public.current_rol() in ('admin','alcalde','control_interno'));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
revoke all on public.alertas_log from anon, authenticated;
grant select on public.alertas_log to authenticated;
revoke execute on all functions in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update on public.entes, public.dependencias, public.requerimientos to authenticated;
grant select, update on public.profiles, public.config to authenticated;
grant select on public.v_requerimientos to authenticated;
grant execute on function public.cerrar_requerimiento(uuid, text, date, text, text) to authenticated;
grant execute on function public.escalar_requerimiento(uuid, text) to authenticated;
grant execute on function public.verificar_cadena_auditoria() to authenticated;
grant execute on function public.current_rol(), public.current_dep() to authenticated;

-- ---------------------------------------------------------------------
-- Almacenamiento privado de soportes PDF
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soportes', 'soportes', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy soportes_read on storage.objects for select to authenticated
  using (bucket_id = 'soportes' and public.current_rol() is not null);
create policy soportes_ins on storage.objects for insert to authenticated
  with check (bucket_id = 'soportes' and public.current_rol() in ('admin','secretario','enlace'));

-- >>>>>>>>>>>>>>>>>>>> 02_seed.sql <<<<<<<<<<<<<<<<<<<<
-- Catálogos iniciales (ejecutar después de 01_schema.sql).
-- Los nombres de dependencias y entes son los mismos del histórico 2024-2026 para que el alcance por dependencia funcione.

insert into public.entes (nombre, sigla, tipo) values
  ('Contraloría General de Santiago de Cali', 'CGSC', 'Fiscal'),
  ('Contraloría General de la República', 'CGR', 'Fiscal'),
  ('Contraloría de Bogotá D.C', 'CB', 'Fiscal'),
  ('Defensoría del Pueblo', 'DP', 'Ministerio Público'),
  ('Otro', '', 'Otro'),
  ('Personería Municipal Santiago de Cali', 'PMC', 'Ministerio Público'),
  ('Personería de Bogotá D.C', 'PB', 'Ministerio Público'),
  ('Procuraduría General de la Nación', 'PGN', 'Ministerio Público'),
  ('Procuraduría Provincial de Cali', 'PPC', 'Ministerio Público'),
  ('Procuraduría Regional del Valle', 'PRV', 'Ministerio Público')
on conflict (nombre) do nothing;

insert into public.dependencias (nombre) values
  ('Departamento Administrativo de Contratación Pública'),
  ('Departamento Administrativo de Control Disciplinario Interno'),
  ('Departamento Administrativo de Control Interno'),
  ('Departamento Administrativo de Desarrollo e Innovación Institucional'),
  ('Departamento Administrativo de Gestión Jurídica Pública'),
  ('Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)'),
  ('Departamento Administrativo de Hacienda Municipal'),
  ('Departamento Administrativo de Planeación Municipal'),
  ('Departamento Administrativo de Tecnologías de la Información y las Comunicaciones'),
  ('Oficina de la Secretaría Privada y Despacho del Alcalde'),
  ('Secretaría de Bienestar Social'),
  ('Secretaría de Cultura'),
  ('Secretaría de Desarrollo Económico'),
  ('Secretaría de Desarrollo Territorial y Participación Ciudadana'),
  ('Secretaría de Educación'),
  ('Secretaría de Gestión del Riesgo de Emergencias y Desastres'),
  ('Secretaría de Gobierno'),
  ('Secretaría de Infraestructura'),
  ('Secretaría de Movilidad'),
  ('Secretaría de Paz y Cultura Ciudadana'),
  ('Secretaría de Salud Pública'),
  ('Secretaría de Seguridad y Justicia'),
  ('Secretaría de Turismo'),
  ('Secretaría de Vivienda Social y Hábitat'),
  ('Secretaría del Deporte y la Recreación'),
  ('Teatro Municipal Enrique Buenaventura'),
  ('Unidad Administrativa Especial Estudios Takeshima'),
  ('Unidad Administrativa Especial de Gestión de Bienes y Servicios'),
  ('Unidad Administrativa Especial de Protección Animal'),
  ('Unidad Administrativa Especial de Servicios Públicos Municipales')
on conflict (nombre) do nothing;

-- >>>>>>>>>>>>>>>>>>>> 03_historico.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Histórico de requerimientos 2024-2026 (cargado desde los Excel de control)
-- Ejecutar después de 01_schema.sql. Luego importar historico_requerimientos.csv
-- desde Table Editor > historico_requerimientos > Insert > Import data from CSV.
-- =====================================================================

create table if not exists public.historico_requerimientos (
  id                     bigint generated always as identity primary key,
  vigencia               int  not null,
  radicacion_ente        text,
  ente                   text,
  orfeo_entrada          text,
  fecha_recibo           date,
  organismo              text not null,
  tipo_organismo         text,
  asunto                 text,
  termino_dias_habiles   int,
  fecha_maxima           date,
  orfeo_respuesta        text,
  fecha_respuesta        date,
  respondio              text check (respondio in ('Sí','No','No aplica')),
  tardia                 text check (tardia in ('Sí','No','No aplica')),
  oportunidad            text not null check (oportunidad in
                           ('A tiempo','Tardía','Sin respuesta (vencida)','Pendiente en término',
                            'Respondida (sin fecha para medir)','No requiere respuesta')),
  retraso_dias_habiles   int,
  dias_habiles_responder int,
  estado_excel           text,
  observaciones          text,
  fila_excel             int
);
create index if not exists idx_hist_org on public.historico_requerimientos (organismo, vigencia);

-- Nombre de la dependencia del usuario (debe coincidir con la columna organismo).
create or replace function public.current_dep_name()
returns text language sql stable security definer set search_path = public as $$
  select d.nombre from public.profiles p join public.dependencias d on d.id = p.dependencia_id
  where p.id = auth.uid() and p.activo
$$;
grant execute on function public.current_dep_name() to authenticated;

alter table public.historico_requerimientos enable row level security;
-- El Alcalde, el administrador y Control Interno ven todo; secretarios y enlaces solo su dependencia.
create policy hist_read on public.historico_requerimientos for select to authenticated
  using (
    public.current_rol() in ('admin','alcalde','control_interno')
    or (public.current_rol() in ('secretario','enlace') and organismo = public.current_dep_name())
  );
revoke all on public.historico_requerimientos from anon;
grant select on public.historico_requerimientos to authenticated;

-- Ranking de cumplimiento por organismo y vigencia.
-- Semáforo: verde < 20% de incumplimiento, rojo >= 40%, mínimo 10 casos evaluados.
create or replace view public.v_cumplimiento_organismo with (security_invoker = true) as
select
  organismo,
  vigencia,
  count(*) filter (where oportunidad = 'A tiempo')                                   as a_tiempo,
  count(*) filter (where oportunidad = 'Tardía')                                     as tardias,
  count(*) filter (where oportunidad = 'Sin respuesta (vencida)')                    as sin_respuesta,
  count(*) filter (where oportunidad in ('Tardía','Sin respuesta (vencida)'))        as incumplimientos,
  count(*) filter (where oportunidad in ('A tiempo','Tardía','Sin respuesta (vencida)')) as evaluables,
  round(100.0 * count(*) filter (where oportunidad in ('Tardía','Sin respuesta (vencida)'))
        / nullif(count(*) filter (where oportunidad in ('A tiempo','Tardía','Sin respuesta (vencida)')), 0), 1) as pct_incumplimiento,
  case
    when count(*) filter (where oportunidad in ('A tiempo','Tardía','Sin respuesta (vencida)')) < 10 then 'MUESTRA INSUFICIENTE'
    when 1.0 * count(*) filter (where oportunidad in ('Tardía','Sin respuesta (vencida)'))
         / count(*) filter (where oportunidad in ('A tiempo','Tardía','Sin respuesta (vencida)')) >= 0.40 then 'ROJO'
    when 1.0 * count(*) filter (where oportunidad in ('Tardía','Sin respuesta (vencida)'))
         / count(*) filter (where oportunidad in ('A tiempo','Tardía','Sin respuesta (vencida)')) < 0.20 then 'VERDE'
    else 'AMARILLO'
  end as semaforo
from public.historico_requerimientos
where tipo_organismo <> 'Otro'
group by organismo, vigencia;
grant select on public.v_cumplimiento_organismo to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 04_directorio_notificaciones.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Directorio del gabinete (solo secretarios y directores) y bitácora de notificaciones.
-- Ejecutar después de 03_historico.sql. Luego importar datos_privados/directorio_gabinete.csv
-- en la tabla directorio (Table Editor > Insert > Import data from CSV).
-- =====================================================================

create table if not exists public.directorio (
  id         bigint generated always as identity primary key,
  organismo  text not null,
  cargo      text not null,
  nombre     text not null default '',
  telefono   text not null default '' check (telefono = '' or telefono ~ '^57[0-9]{10}$'),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (organismo, cargo)
);

create table if not exists public.notificaciones (
  id           bigint generated always as identity primary key,
  organismo    text not null,
  destinatario text not null default '',
  telefono     text not null default '',
  plantilla    text not null,
  n_items      int  not null default 0,
  canal        text not null default 'whatsapp' check (canal in ('whatsapp')),
  mensaje      text not null,
  enviado_por  uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists idx_notif_org on public.notificaciones (organismo, created_at desc);

alter table public.directorio     enable row level security;
alter table public.notificaciones enable row level security;

-- Directorio: supervisión ve todo; secretarios y enlaces solo el de su dependencia; escribe admin y alcalde.
create policy dir_read on public.directorio for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and organismo = public.current_dep_name()));
create policy dir_ins on public.directorio for insert to authenticated with check (public.current_rol() in ('admin','alcalde'));
create policy dir_upd on public.directorio for update to authenticated using (public.current_rol() in ('admin','alcalde')) with check (public.current_rol() in ('admin','alcalde'));

-- Notificaciones: la bitácora no se edita ni se borra.
create policy notif_read on public.notificaciones for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and organismo = public.current_dep_name()));
create policy notif_ins on public.notificaciones for insert to authenticated with check (public.current_rol() in ('admin','alcalde','control_interno'));

revoke all on public.directorio, public.notificaciones from anon;
grant select, insert, update on public.directorio to authenticated;
grant select, insert on public.notificaciones to authenticated;

-- Trazabilidad en la cadena de auditoría SHA-256
drop trigger if exists trg_audit_dir on public.directorio;
create trigger trg_audit_dir after insert or update on public.directorio for each row execute function public.audit_trigger();
drop trigger if exists trg_audit_notif on public.notificaciones;
create trigger trg_audit_notif after insert on public.notificaciones for each row execute function public.audit_trigger();

-- >>>>>>>>>>>>>>>>>>>> 05_actividad_informes.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- Actividad del equipo e informes generados. Ejecutar después de 04_directorio_notificaciones.sql.
-- =====================================================================

-- Quién ingresó y cuándo (solo se inserta; no se edita).
create table if not exists public.accesos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_accesos_user on public.accesos (user_id, created_at desc);

-- Informes ejecutivos generados desde la aplicación (con la huella SHA-256 de los datos usados).
create table if not exists public.informes (
  id          bigint generated always as identity primary key,
  generado_por uuid not null default auth.uid(),
  alcance     text not null,                  -- 'Todas las dependencias' o el nombre de la dependencia
  vigencias   text not null,
  corte       date,
  n_registros int  not null default 0,
  huella      text not null,
  created_at  timestamptz not null default now()
);

alter table public.accesos  enable row level security;
alter table public.informes enable row level security;

create policy acc_ins on public.accesos for insert to authenticated with check (user_id = auth.uid() and public.current_rol() is not null);
create policy acc_read on public.accesos for select to authenticated using (public.current_rol() in ('admin','alcalde','control_interno') or user_id = auth.uid());
create policy inf_ins on public.informes for insert to authenticated with check (generado_por = auth.uid() and public.current_rol() is not null);
create policy inf_read on public.informes for select to authenticated using (public.current_rol() in ('admin','alcalde','control_interno') or generado_por = auth.uid());

-- El Alcalde también puede ver las cuentas (para el panel de actividad).
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.current_rol() in ('admin','alcalde','control_interno'));

revoke all on public.accesos, public.informes from anon;
grant select, insert on public.accesos, public.informes to authenticated;

drop trigger if exists trg_audit_informes on public.informes;
create trigger trg_audit_informes after insert on public.informes for each row execute function public.audit_trigger();

-- >>>>>>>>>>>>>>>>>>>> 06_directorio_validaciones.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 06 · Directorio del gabinete sin errores para WhatsApp
-- Ejecutar después de 05_actividad_informes.sql.
--
-- Garantiza en el servidor (no solo en la app) que:
--   1. Cada responsable queda amarrado a una dependencia que existe, con el
--      nombre oficial exacto (corrige tildes, mayúsculas y espacios).
--   2. El nombre va completo (al menos nombres y apellidos) si hay celular.
--   3. El celular es colombiano (57 + 10 dígitos que inician en 3) y no se
--      repite entre dos responsables.
-- Además crea la vista v_directorio_verificacion para revisar cruces
-- entre dependencias, histórico y directorio antes de salir a producción.
-- =====================================================================

-- Llave normalizada: sin tildes, minúsculas, sin paréntesis ni signos.
create or replace function public.org_key(t text)
returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(regexp_replace(
           translate(lower(coalesce(t,'')),'áéíóúüñàèìòù','aeiouunaeiou'),
         '\(.*?\)',' ','g'),'[^a-z0-9 ]',' ','g'),'\s+',' ','g'))
$$;

-- Nombre oficial de una dependencia a partir de cualquier variante escrita.
create or replace function public.org_oficial(t text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select h.organismo from public.historico_requerimientos h where public.org_key(h.organismo) = public.org_key(t) limit 1),
    (select d.nombre from public.dependencias d where public.org_key(d.nombre) = public.org_key(t) limit 1))
$$;

create or replace function public.directorio_validar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_of text;
begin
  new.organismo := regexp_replace(trim(new.organismo),'\s+',' ','g');
  new.cargo     := regexp_replace(trim(new.cargo),'\s+',' ','g');
  new.nombre    := regexp_replace(trim(coalesce(new.nombre,'')),'\s+',' ','g');
  new.telefono  := regexp_replace(coalesce(new.telefono,''),'\D','','g');
  if new.telefono ~ '^3[0-9]{9}$' then new.telefono := '57' || new.telefono; end if;

  v_of := public.org_oficial(new.organismo);
  if v_of is null then
    raise exception 'La dependencia "%" no existe. Usa el nombre oficial de la lista de dependencias.', new.organismo;
  end if;
  new.organismo := v_of;

  if new.telefono <> '' and new.telefono !~ '^573[0-9]{9}$' then
    raise exception 'El celular debe tener 10 dígitos e iniciar en 3.';
  end if;
  if new.telefono <> '' and array_length(regexp_split_to_array(new.nombre,' '),1) < 2 then
    raise exception 'Escribe el nombre completo del responsable (nombres y apellidos).';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_dir_validar on public.directorio;
create trigger trg_dir_validar before insert or update on public.directorio
  for each row execute function public.directorio_validar();

-- Un mismo celular no puede quedar en dos dependencias.
create unique index if not exists ux_directorio_telefono on public.directorio (telefono) where telefono <> '';

-- Normaliza lo que ya esté cargado (dispara el trigger sobre cada fila).
update public.directorio set organismo = organismo;

-- Vista de verificación: ejecutar  select * from public.v_directorio_verificacion;
-- Debe devolver cero filas antes de salir a producción.
create or replace view public.v_directorio_verificacion with (security_invoker = true) as
  select 'Dependencia sin responsable en el directorio' as problema, h.organismo as dependencia, null::text as detalle
    from (select distinct organismo from public.historico_requerimientos
          where tipo_organismo in ('Secretaría','Departamento','UAE','Despacho')) h
   where not exists (select 1 from public.directorio d where public.org_key(d.organismo) = public.org_key(h.organismo))
  union all
  select 'Responsable sin celular válido', d.organismo, d.cargo || ' · ' || coalesce(nullif(d.nombre,''),'sin nombre')
    from public.directorio d where d.telefono !~ '^573[0-9]{9}$'
  union all
  select 'Responsable sin nombre completo', d.organismo, d.cargo
    from public.directorio d where array_length(regexp_split_to_array(trim(d.nombre),'\s+'),1) < 2 or trim(d.nombre) = ''
  union all
  select 'Cuenta de secretario o enlace cuya dependencia no coincide con el histórico', dp.nombre, p.email
    from public.profiles p join public.dependencias dp on dp.id = p.dependencia_id
   where p.rol in ('secretario','enlace')
     and not exists (select 1 from public.historico_requerimientos h where h.organismo = dp.nombre);
revoke all on public.v_directorio_verificacion from anon;
grant select on public.v_directorio_verificacion to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 07_correo_institucional.sql <<<<<<<<<<<<<<<<<<<<
-- 07 · Notificación por correo institucional (Google Workspace @cali.gov.co)
-- Ejecutar después de 06. Se puede ejecutar varias veces sin error.
--   1. Agrega el correo institucional de cada secretario o director al directorio.
--   2. Solo acepta correos @cali.gov.co (corrige mayúsculas y espacios).
--   3. La bitácora de notificaciones registra el canal (WhatsApp o correo)
--      y la dirección a la que se envió.

alter table public.directorio add column if not exists correo text not null default '';
alter table public.directorio drop constraint if exists directorio_correo_check;
alter table public.directorio add constraint directorio_correo_check
  check (correo = '' or correo ~ '^[a-z0-9._%+-]+@cali\.gov\.co$');

alter table public.notificaciones add column if not exists correo text not null default '';
alter table public.notificaciones drop constraint if exists notificaciones_canal_check;
alter table public.notificaciones add constraint notificaciones_canal_check
  check (canal in ('whatsapp','correo'));

create or replace function public.directorio_validar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_of text;
begin
  new.organismo := regexp_replace(trim(new.organismo),'\s+',' ','g');
  new.cargo     := regexp_replace(trim(new.cargo),'\s+',' ','g');
  new.nombre    := regexp_replace(trim(coalesce(new.nombre,'')),'\s+',' ','g');
  new.telefono  := regexp_replace(coalesce(new.telefono,''),'\D','','g');
  new.correo    := lower(regexp_replace(coalesce(new.correo,''),'\s','','g'));
  if new.telefono ~ '^3[0-9]{9}$' then new.telefono := '57' || new.telefono; end if;

  v_of := public.org_oficial(new.organismo);
  if v_of is null then
    raise exception 'La dependencia "%" no existe. Usa el nombre oficial de la lista de dependencias.', new.organismo;
  end if;
  new.organismo := v_of;

  if new.telefono <> '' and new.telefono !~ '^573[0-9]{9}$' then
    raise exception 'El celular debe tener 10 dígitos e iniciar en 3.';
  end if;
  if new.correo <> '' and new.correo !~ '^[a-z0-9._%+-]+@cali\.gov\.co$' then
    raise exception 'El correo debe ser institucional (@cali.gov.co).';
  end if;
  if (new.telefono <> '' or new.correo <> '') and array_length(regexp_split_to_array(new.nombre,' '),1) < 2 then
    raise exception 'Escribe el nombre completo del responsable (nombres y apellidos).';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Un mismo correo no puede quedar en dos dependencias.
create unique index if not exists ux_directorio_correo on public.directorio (correo) where correo <> '';

-- Verificación ampliada: también señala responsables sin correo institucional.
create or replace view public.v_directorio_verificacion with (security_invoker = true) as
  select 'Dependencia sin responsable en el directorio' as problema, h.organismo as dependencia, null::text as detalle
    from (select distinct organismo from public.historico_requerimientos
          where tipo_organismo in ('Secretaría','Departamento','UAE','Despacho')) h
   where not exists (select 1 from public.directorio d where public.org_key(d.organismo) = public.org_key(h.organismo))
  union all
  select 'Responsable sin celular válido', d.organismo, d.cargo || ' · ' || coalesce(nullif(d.nombre,''),'sin nombre')
    from public.directorio d where d.telefono !~ '^573[0-9]{9}$'
  union all
  select 'Responsable sin correo institucional', d.organismo, d.cargo || ' · ' || coalesce(nullif(d.nombre,''),'sin nombre')
    from public.directorio d where d.correo = ''
  union all
  select 'Responsable sin nombre completo', d.organismo, d.cargo
    from public.directorio d where array_length(regexp_split_to_array(trim(d.nombre),'\s+'),1) < 2 or trim(d.nombre) = '';
revoke all on public.v_directorio_verificacion from anon;
grant select on public.v_directorio_verificacion to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 08_cruces_temas.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 08 · Cruces y temas
-- Ejecutar después de 07_correo_institucional.sql (o al final del instalador).
--
-- La clasificación automática por tema y la detección de cruces se calculan
-- en la app con reglas fijas sobre el histórico. Aquí se guardan solo las
-- decisiones humanas, con su auditoría:
--   tema_manual     corrección del tema de un requerimiento
--   cruce_revision  confirmación o descarte de un cruce entre entes
-- Pueden escribir: Super administrador, Alcalde y Control Interno.
-- Pueden leer: todos los usuarios activos.
-- =====================================================================

create table if not exists public.tema_manual (
  row_key     text primary key,                 -- vigencia|orfeo_entrada|radicacion_ente|organismo
  tema        text not null check (tema in ('contractual','fiscal','disciplinario','peticion','ddhh','obras','administrativo','servicios','sin')),
  usuario     text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.cruce_revision (
  clave       text primary key,                 -- identificador estable del cruce
  estado      text not null check (estado in ('confirmado','descartado')),
  nota        text not null default '',
  usuario     text,
  updated_at  timestamptz not null default now()
);

-- Quién y cuándo: lo pone el servidor, no la app.
create or replace function public.firmar_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.usuario := coalesce((select email from public.profiles where id = auth.uid()), new.usuario, 'sistema');
  new.updated_at := now();
  return new;
end $$;

-- Auditoría encadenada: usa audit_trigger() de 01_schema (requiere columna id).
alter table public.tema_manual    add column if not exists id bigint generated always as identity;
alter table public.cruce_revision add column if not exists id bigint generated always as identity;

drop trigger if exists trg_firma_tema on public.tema_manual;
create trigger trg_firma_tema before insert or update on public.tema_manual for each row execute function public.firmar_decision();
drop trigger if exists trg_firma_cruce on public.cruce_revision;
create trigger trg_firma_cruce before insert or update on public.cruce_revision for each row execute function public.firmar_decision();
drop trigger if exists trg_audit_tema on public.tema_manual;
create trigger trg_audit_tema after insert or update or delete on public.tema_manual for each row execute function public.audit_trigger();
drop trigger if exists trg_audit_cruce on public.cruce_revision;
create trigger trg_audit_cruce after insert or update or delete on public.cruce_revision for each row execute function public.audit_trigger();

alter table public.tema_manual    enable row level security;
alter table public.cruce_revision enable row level security;

drop policy if exists tema_read  on public.tema_manual;
drop policy if exists tema_write on public.tema_manual;
drop policy if exists cruce_read  on public.cruce_revision;
drop policy if exists cruce_write on public.cruce_revision;
create policy tema_read   on public.tema_manual    for select to authenticated using (public.current_rol() is not null);
create policy tema_write  on public.tema_manual    for all    to authenticated using (public.current_rol() in ('admin','alcalde','control_interno')) with check (public.current_rol() in ('admin','alcalde','control_interno'));
create policy cruce_read  on public.cruce_revision for select to authenticated using (public.current_rol() is not null);
create policy cruce_write on public.cruce_revision for all    to authenticated using (public.current_rol() in ('admin','alcalde','control_interno')) with check (public.current_rol() in ('admin','alcalde','control_interno'));

revoke all on public.tema_manual, public.cruce_revision from anon;
grant select, insert, update, delete on public.tema_manual, public.cruce_revision to authenticated;

-- >>>>>>>>>>>>>>>>>>>> 09_hoja_excel.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 10_cuentas.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 10 · Gestión de cuentas por dependencia
-- Bitácora de acciones sobre cuentas (invitar, cambiar correo por cambio de
-- titular, reenviar enlace, activar, desactivar). La escribe solo la Edge
-- Function gestion-cuentas (con service_role); la leen los roles de supervisión.
-- =====================================================================
create table if not exists public.cuentas_eventos (
  id         bigint generated always as identity primary key,
  accion     text not null check (accion in ('invitar','cambiar_correo','enlace_clave','activar','desactivar')),
  actor      text not null,
  detalle    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.cuentas_eventos enable row level security;
drop policy if exists cuentas_eventos_read on public.cuentas_eventos;
create policy cuentas_eventos_read on public.cuentas_eventos for select to authenticated
  using (public.current_rol() in ('admin','alcalde','control_interno'));
revoke all on public.cuentas_eventos from anon;
grant select on public.cuentas_eventos to authenticated;
drop trigger if exists trg_audit_cuentas on public.cuentas_eventos;
create trigger trg_audit_cuentas after insert on public.cuentas_eventos for each row execute function public.audit_trigger();

-- >>>>>>>>>>>>>>>>>>>> 12_operativo_desde_historico.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 13_planes_mejoramiento.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 14_seguridad_y_resumen.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 14 · Verificación en dos pasos y resumen semanal por correo
-- Es idempotente: se puede ejecutar más de una vez.
--
-- 1. Verificación en dos pasos (código de 6 dígitos de una app autenticadora).
--    Quien tenga un rol de supervisión (Super administrador, Alcalde, Control Interno) y ya haya
--    activado su verificación en dos pasos, solo actúa con ese rol si ingresó con el código.
--    Con solo la contraseña la base de datos no le reconoce el rol: así una contraseña robada
--    no basta. La app obliga al Super administrador a activarla en su primer ingreso.
-- 2. Resumen semanal por correo a cada secretario o director (Edge Function resumen-semanal).
-- =====================================================================

-- 1. Rol efectivo según el nivel de verificación de la sesión
create or replace function public.current_rol()
returns text language sql stable security definer set search_path = public as $$
  select case
           when p.rol in ('admin','alcalde','control_interno')
            and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
            and exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
           then null
           else p.rol
         end
    from public.profiles p
   where p.id = auth.uid() and p.activo
$$;

-- 2. Parámetros del resumen semanal
alter table public.config add column if not exists resumen_activo boolean not null default false;
alter table public.config add column if not exists resumen_ultimo timestamptz;
alter table public.config add column if not exists resumen_ultimo_detalle text not null default '';

-- 3. Verificación
select public.current_rol() as rol_en_esta_sesion,
       (select resumen_activo from public.config where id = 1) as resumen_activo;

-- >>>>>>>>>>>>>>>>>>>> 16_carga_excel.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 17_respaldos_y_monitoreo.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 17 · Copias de seguridad automáticas y monitoreo
--  * Bucket privado "respaldos": cada copia es un archivo .json.gz con todas las tablas de la app.
--    Solo el Super administrador puede verlas y descargarlas. Se conservan las 12 más recientes.
--  * Tabla eventos_sistema: errores y avisos de las funciones del servidor y de la app, para que
--    el Super administrador vea en Configuración si algo falló (sin revisar registros técnicos).
--  * La copia semanal (domingos 11:00 p. m. hora de Colombia) YA NO se programa aquí: se programa con
--    supabase/21_programar_tareas_boveda.sql, que lee la dirección y la clave de la bóveda (Vault).
-- Requiere: scripts 01 a 16.
-- Se puede ejecutar más de una vez.
-- =====================================================================

-- 1. Último respaldo en la configuración
alter table public.config add column if not exists respaldo_ultimo timestamptz;
alter table public.config add column if not exists respaldo_ultimo_detalle text not null default '';

-- 2. Bucket privado de respaldos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('respaldos', 'respaldos', false, 52428800, array['application/gzip', 'application/json'])
on conflict (id) do nothing;
drop policy if exists respaldos_leer on storage.objects;
create policy respaldos_leer on storage.objects for select to authenticated
  using (bucket_id = 'respaldos' and public.current_rol() = 'admin');
-- Escribir y borrar solo lo hace la función "respaldo" con la llave de servicio (no necesita política).

-- 3. Eventos del sistema (monitoreo)
create table if not exists public.eventos_sistema (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  origen     text not null,                       -- 'resumen-semanal', 'respaldo', 'app', ...
  nivel      text not null check (nivel in ('info', 'aviso', 'error')),
  mensaje    text not null,
  detalle    jsonb not null default '{}'::jsonb,
  usuario    text,
  revisado   boolean not null default false
);
create index if not exists eventos_sistema_fecha on public.eventos_sistema (created_at desc);
alter table public.eventos_sistema enable row level security;
drop policy if exists eventos_leer on public.eventos_sistema;
create policy eventos_leer on public.eventos_sistema for select to authenticated
  using (public.current_rol() = 'admin');
drop policy if exists eventos_revisar on public.eventos_sistema;
create policy eventos_revisar on public.eventos_sistema for update to authenticated
  using (public.current_rol() = 'admin') with check (public.current_rol() = 'admin');
revoke all on public.eventos_sistema from anon;
grant select, update (revisado) on public.eventos_sistema to authenticated;

-- Errores que ocurren en el navegador de cualquier usuario: se registran sin exponer la tabla.
-- Límite: 20 por usuario por hora, para que un error repetido no llene la tabla.
create or replace function public.registrar_error_app(p_mensaje text, p_detalle jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_mail text := (select email from public.profiles where id = auth.uid());
begin
  if auth.uid() is null then return; end if;
  if (select count(*) from public.eventos_sistema
       where origen = 'app' and usuario = v_mail and created_at > now() - interval '1 hour') >= 20 then
    return;
  end if;
  insert into public.eventos_sistema (origen, nivel, mensaje, detalle, usuario)
  values ('app', 'error', left(coalesce(p_mensaje, ''), 500), coalesce(p_detalle, '{}'::jsonb), v_mail);
end $$;
revoke all on function public.registrar_error_app(text, jsonb) from public, anon;
grant execute on function public.registrar_error_app(text, jsonb) to authenticated;

-- 4. Copia semanal: se programa con supabase/21_programar_tareas_boveda.sql. Esta parte tenía escrita la
--    dirección fija del proyecto anterior y una clave para reemplazar a mano; ejecutarla habría reprogramado la
--    tarea hacia ese proyecto.
select 'La copia semanal se programa con supabase/21_programar_tareas_boveda.sql' as aviso;

-- >>>>>>>>>>>>>>>>>>>> 18_planes_pdf_y_traslados.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 19_planes_calificacion_cgsc.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 20_norma_cgsc_y_memoria.sql <<<<<<<<<<<<<<<<<<<<
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

-- >>>>>>>>>>>>>>>>>>>> 22_fecha_colombia.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 22 · Fecha de Colombia en lugar de la fecha del servidor (UTC)
-- El servidor está en UTC (verificado el 30-oct-2026): entre las 7:00 p. m. y la medianoche de Colombia,
-- current_date da el día siguiente. Este script reemplaza current_date por public.hoy_colombia() en:
--   * la vista v_requerimientos (días restantes y semáforo),
--   * el valor por defecto de requerimientos.fecha_radicacion,
--   * las funciones cerrar_requerimiento, sembrar_desde_historico, pm_reportar_avance y pm_resolver_prorroga.
-- No cambia la zona horaria de la base, ni las tareas programadas, ni ningún dato guardado.
-- Protección: antes de cambiar algo revisa que cada función sea la versión esperada (huella md5 del código sin CR:
-- la de producción al 2-nov-2026, la de los scripts 01, 12, 13 y 20 en una instalación nueva con
-- 00_instalar_todo.sql, o la que deja este script), que siga siendo security definer con
-- search_path=public, y que la vista tenga las 21 columnas esperadas. Si algo no coincide, se detiene sin cambiar
-- nada (todo va en una sola transacción). Se puede ejecutar más de una vez.
-- La vista y las funciones se reemplazan con "create or replace": conservan su dueño y sus permisos actuales.
-- Al final, la consulta de verificación (sirve a cualquier hora).
-- =====================================================================

-- 1. Protección
do $$
declare
  v_esperadas constant jsonb := jsonb_build_object(
    -- (producción al 2-nov-2026, versión nueva de este script, scripts del repositorio en una instalación nueva)
    'cerrar_requerimiento',    jsonb_build_array('bdddb0081e6f671a41444cfce78e0613', '33f3daf9abb9a3d37db5be767bfaaec7', '404386d20d402fa91336060e8661fbc8'),
    'sembrar_desde_historico', jsonb_build_array('d9c8b62a695b77afc7c56caaf094a29e', '446824683ec4fdda1678e334baca06cd', 'ba665dd95bcb8cea98af763eaab7d8b1'),
    'pm_reportar_avance',      jsonb_build_array('1f2fe7b806ef75231e90283777947492', '9353a8d39696fa63eaeaeb1ac3b2ed35', 'b2cdc79c5971a82c068ac768723dbe02'),
    'pm_resolver_prorroga',    jsonb_build_array('c2e4461c895bdb6cb1bb5ec217309fb7', 'f913cd5e8167cf0ef77350f0ab0f4a5f', 'c2e4461c895bdb6cb1bb5ec217309fb7'));
  v_columnas constant text := 'id,radicado,vigencia,ente_id,dependencia_id,asunto,fecha_radicacion,fecha_limite,'
    || 'estado,orfeo_salida,fecha_cierre,soporte_path,soporte_hash,escalado_at,created_by,created_at,'
    || 'ente,ente_sigla,dependencia,dias_restantes,semaforo';
  r   record;
  v_n int;
  v_t text;
begin
  for r in select key as nombre, value as huellas from jsonb_each(v_esperadas) loop
    select count(*) into v_n from pg_proc where pronamespace = 'public'::regnamespace and proname = r.nombre;
    if v_n <> 1 then
      raise exception 'Se esperaba una sola función public.% y hay %. No se cambió nada.', r.nombre, v_n;
    end if;
    if not exists (select 1 from pg_proc p
                    where p.pronamespace = 'public'::regnamespace and p.proname = r.nombre
                      and r.huellas ? md5(replace(p.prosrc, E'\r', ''))) then
      raise exception 'La función public.% no coincide con ninguna versión esperada. No se cambió nada.', r.nombre;
    end if;
    if not exists (select 1 from pg_proc p
                    where p.pronamespace = 'public'::regnamespace and p.proname = r.nombre
                      and p.prosecdef and p.proconfig = array['search_path=public']) then
      raise exception 'La función public.% no es security definer con search_path=public. No se cambió nada.', r.nombre;
    end if;
  end loop;
  select string_agg(column_name, ',' order by ordinal_position) into v_t
    from information_schema.columns where table_schema = 'public' and table_name = 'v_requerimientos';
  if v_t is distinct from v_columnas then
    raise exception 'La vista v_requerimientos no tiene las 21 columnas esperadas (tiene: %). No se cambió nada.', v_t;
  end if;
end $$;

-- 2. Fecha de Colombia (UTC-5 todo el año, sin horario de verano). fecha_colombia(ts) permite verificarla a cualquier hora.
create or replace function public.fecha_colombia(p_ts timestamptz)
returns date language sql stable set search_path = '' as $$ select (p_ts at time zone 'America/Bogota')::date $$;
create or replace function public.hoy_colombia()
returns date language sql stable set search_path = '' as $$ select public.fecha_colombia(now()) $$;
-- La vista usa security_invoker: quien la consulta (anon, authenticated o service_role) debe poder ejecutarlas.
revoke all on function public.fecha_colombia(timestamptz), public.hoy_colombia() from public;
grant execute on function public.fecha_colombia(timestamptz), public.hoy_colombia() to anon, authenticated, service_role;

-- 3. Valor por defecto de la fecha de radicación
alter table public.requerimientos alter column fecha_radicacion set default public.hoy_colombia();

-- 4. Vista: las mismas 21 columnas y en el mismo orden que en producción (sin hist_key), con la fecha de Colombia
create or replace view public.v_requerimientos with (security_invoker = true) as
select
  r.id, r.radicado, r.vigencia, r.ente_id, r.dependencia_id, r.asunto, r.fecha_radicacion, r.fecha_limite,
  r.estado, r.orfeo_salida, r.fecha_cierre, r.soporte_path, r.soporte_hash, r.escalado_at, r.created_by, r.created_at,
  e.nombre as ente,
  e.sigla  as ente_sigla,
  d.nombre as dependencia,
  (r.fecha_limite - public.hoy_colombia()) as dias_restantes,
  case
    when r.estado = 'cerrado' then 'verde'
    when (r.fecha_limite - public.hoy_colombia()) <= (select dias_rojo from public.config where id = 1) then 'rojo'
    else 'amarillo'
  end as semaforo
from public.requerimientos r
join public.entes e        on e.id = r.ente_id
join public.dependencias d on d.id = r.dependencia_id;

-- 5. Funciones: copia de su definición en el repositorio (01, 12, 13 y 20), cambiando solo
--    current_date por public.hoy_colombia(). Sin grant ni revoke: conservan sus permisos actuales.
create or replace function public.cerrar_requerimiento(
  p_id uuid, p_orfeo text, p_fecha date, p_path text default null, p_hash text default null
) returns public.requerimientos
language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.current_rol();
  v_dep bigint := public.current_dep();
  v_req public.requerimientos;
begin
  if v_rol not in ('admin','secretario','enlace') then
    raise exception 'Tu rol no puede registrar respuestas ORFEO';
  end if;

  select * into v_req from public.requerimientos where id = p_id for update;
  if not found then raise exception 'El requerimiento no existe'; end if;
  if v_rol <> 'admin' and v_req.dependencia_id is distinct from v_dep then
    raise exception 'Este requerimiento pertenece a otra dependencia';
  end if;
  if v_req.estado = 'cerrado' then raise exception 'El requerimiento ya está cerrado'; end if;
  if p_orfeo !~ '^[0-9]{10,20}$' then raise exception 'El radicado ORFEO debe tener entre 10 y 20 dígitos'; end if;
  if p_fecha > public.hoy_colombia() then raise exception 'La fecha de envío no puede ser futura'; end if;
  if p_fecha < v_req.fecha_radicacion then raise exception 'La fecha de envío no puede ser anterior a la radicación'; end if;

  begin
    update public.requerimientos
       set estado = 'cerrado', orfeo_salida = p_orfeo, fecha_cierre = p_fecha,
           soporte_path = p_path, soporte_hash = p_hash
     where id = p_id
     returning * into v_req;
  exception when unique_violation then
    raise exception 'El radicado ORFEO % ya fue registrado en otro requerimiento', p_orfeo;
  end;
  return v_req;
end $$;

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
    least(coalesce(h.fecha_recibo, h.fecha_maxima, public.hoy_colombia()), coalesce(h.fecha_maxima, h.fecha_recibo + 15, public.hoy_colombia())),
    coalesce(h.fecha_maxima, h.fecha_recibo + 15, public.hoy_colombia()),
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
  if p_fecha is null or p_fecha > public.hoy_colombia() then raise exception 'La fecha de corte no puede ser futura'; end if;
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

create or replace function public.pm_resolver_prorroga(p_id uuid, p_estado text, p_radicado text default '', p_fecha date default public.hoy_colombia())
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
         fecha_respuesta = coalesce(p_fecha, public.hoy_colombia()), updated_at = now()
   where id = p_id;
end $$;


-- =====================================================================
-- Verificación (solo lectura; sirve a cualquier hora). Todas las columnas deben salir en true.
-- =====================================================================
select
  public.fecha_colombia('2026-10-31 04:00:00+00') = date '2026-10-30'   as las_11_pm_es_el_mismo_dia,     -- 30-oct 11:00 p. m. en Cali
  public.fecha_colombia('2026-10-30 04:59:59+00') = date '2026-10-29'   as las_11_59_pm_es_el_mismo_dia,  -- 29-oct 11:59:59 p. m.
  public.fecha_colombia('2026-10-30 05:00:00+00') = date '2026-10-30'   as medianoche_cambia_de_dia,      -- 30-oct 12:00 a. m.
  public.hoy_colombia() = (now() at time zone 'America/Bogota')::date   as hoy_colombia_ok,
  (select count(*) from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('cerrar_requerimiento','sembrar_desde_historico','pm_reportar_avance','pm_resolver_prorroga')
      and p.prosecdef and p.proowner = 'postgres'::regrole and p.proconfig = array['search_path=public']
      and p.prosrc not ilike '%current_date%'
      and pg_get_function_arguments(p.oid) not ilike '%current_date%') = 4 as funciones_ok,
  pg_get_viewdef('public.v_requerimientos'::regclass) not ilike '%current_date%' as vista_sin_current_date,
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'v_requerimientos')
    = 'id,radicado,vigencia,ente_id,dependencia_id,asunto,fecha_radicacion,fecha_limite,estado,orfeo_salida,'
      || 'fecha_cierre,soporte_path,soporte_hash,escalado_at,created_by,created_at,ente,ente_sigla,dependencia,'
      || 'dias_restantes,semaforo'                                         as vista_21_columnas,
  (select reloptions from pg_class where oid = 'public.v_requerimientos'::regclass)
    @> array['security_invoker=true']                                  as vista_security_invoker,
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'requerimientos' and column_name = 'fecha_radicacion')
    ilike '%hoy_colombia%'                                             as default_fecha_ok;

-- Permisos (para comparar con los de antes del script; deben ser iguales):
--   vista: anon, authenticated, postgres y service_role con los 7 permisos;
--   cerrar_requerimiento: {=X/postgres, postgres, authenticated, service_role}; las otras 3 sin =X.
select 'vista'::text as objeto, grantee::text as rol_o_permisos,
       string_agg(privilege_type::text, ', ' order by privilege_type::text) as permisos
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'v_requerimientos'
group by grantee
union all
select proname::text, proacl::text, null::text from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('cerrar_requerimiento','sembrar_desde_historico','pm_reportar_avance','pm_resolver_prorroga',
                  'hoy_colombia','fecha_colombia')
order by 1, 2;

-- >>>>>>>>>>>>>>>>>>>> 23_respaldo_texto.sql <<<<<<<<<<<<<<<<<<<<
-- =====================================================================
-- 23 · Copias de seguridad que conservan los decimales exactos (formato 3)
-- La función "respaldo" leía las tablas como números de JavaScript, que no guardan los ceros de la derecha:
-- 100.00 quedaba como 100. Los datos se restauraban bien (las columnas tienen 2 decimales fijos), pero la copia
-- de cada fila que guarda la auditoría (audit_log.payload) cambiaba de texto y la cadena de huellas SHA-256
-- dejaba de verificar después de restaurar.
-- respaldo_lote() entrega cada lote de una tabla como el texto JSON que genera PostgreSQL, con los números tal
-- como están guardados. Solo lee; la usa la función "respaldo" con la llave de servicio (service_role).
-- Requiere: scripts 01 a 20. Se puede ejecutar más de una vez. No cambia ningún dato.
-- =====================================================================

create or replace function public.respaldo_lote(p_tabla text, p_orden text, p_desde integer, p_cantidad integer)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v text;
begin
  -- Solo las tablas de la copia (las mismas de supabase/functions/respaldo/index.ts)
  if p_tabla <> all (array['config', 'entes', 'dependencias', 'profiles', 'directorio', 'requerimientos', 'alertas_log',
      'notificaciones', 'informes', 'accesos', 'historico_requerimientos', 'historico_cargas', 'tema_manual',
      'cruce_revision', 'cuentas_eventos', 'pm_planes', 'pm_hallazgos', 'pm_acciones', 'pm_avances', 'pm_traslados',
      'pm_prorrogas', 'archivo_documentos', 'pm_informes_avance', 'eventos_sistema', 'audit_log', 'pm_restauraciones']) then
    raise exception 'La tabla % no hace parte de la copia de seguridad', p_tabla;
  end if;
  if to_regclass('public.' || quote_ident(p_tabla)) is null then
    return null; -- la tabla aún no existe (script pendiente): la copia sigue sin ella
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = p_tabla and column_name = p_orden) then
    raise exception 'La tabla % no tiene la columna %', p_tabla, p_orden;
  end if;
  if p_desde < 0 or p_cantidad not between 1 and 5000 then
    raise exception 'Lote no válido (desde %, cantidad %)', p_desde, p_cantidad;
  end if;
  execute format('select coalesce(json_agg(t order by t.%1$I), ''[]''::json)::text
                    from (select * from public.%2$I order by %1$I offset $1 limit $2) t', p_orden, p_tabla)
     into v using p_desde, p_cantidad;
  return v;
end $$;
revoke all on function public.respaldo_lote(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.respaldo_lote(text, text, integer, integer) to service_role;

-- Verificación: debe dar true en las tres columnas.
select
  (select prosecdef from pg_proc where oid = 'public.respaldo_lote(text, text, integer, integer)'::regprocedure) as security_definer,
  has_function_privilege('service_role', 'public.respaldo_lote(text, text, integer, integer)', 'execute')   as service_role_puede,
  not has_function_privilege('authenticated', 'public.respaldo_lote(text, text, integer, integer)', 'execute') as usuarios_no_pueden;

commit;

-- >>>>>>>>>>>>>>>>>>>> Verificación de la instalación <<<<<<<<<<<<<<<<<<<<
select
  (select count(*) from unnest(array['config', 'entes', 'dependencias', 'profiles', 'directorio', 'requerimientos', 'alertas_log', 'notificaciones', 'informes', 'accesos', 'historico_requerimientos', 'historico_cargas', 'tema_manual', 'cruce_revision', 'cuentas_eventos', 'pm_planes', 'pm_hallazgos', 'pm_acciones', 'pm_avances', 'pm_traslados', 'pm_prorrogas', 'archivo_documentos', 'pm_informes_avance', 'eventos_sistema', 'audit_log', 'pm_restauraciones']) as t
    where to_regclass('public.' || t) is null) as tablas_faltantes,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('verificar_cadena_auditoria', 'hoy_colombia', 'respaldo_lote')) = 3 as funciones_ok;
