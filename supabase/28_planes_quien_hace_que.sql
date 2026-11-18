-- =====================================================================
-- 28 · Planes de mejoramiento: QUIÉN HACE QUÉ (pedido de Control Interno, 17-nov-2026)
--
-- El hallazgo es de la dependencia: ella formula el análisis de causa y las acciones. Control Interno
-- verifica: valida o devuelve la formulación, observa y hace seguimiento; no formula. Quien califica
-- oficialmente es la Contraloría (se registra su evaluación).
--
--   · Dependencia (secretario o enlace): carga el informe con SUS hallazgos, formula el análisis de causa
--     (método de Calidad en Daruma: 5 porqués, espina de pescado o árbol de problema, con el formato
--     diligenciado en PDF) y las acciones, y los envía a Control Interno. Mientras no estén validados los
--     puede corregir; validados, ya no. Marca la fecha en que lo cargó en el SIA Contralorías.
--   · Control Interno: también carga el informe y asigna los hallazgos a su dependencia; ve todo; valida o
--     devuelve (con observación); deja observaciones y la calificación de seguimiento en las acciones;
--     registra la evaluación de la Contraloría. No escribe el análisis de causa ni las acciones.
--   · Alcalde / Despacho: solo consulta (igual que antes).
--   · Super administrador: todo, para corregir.
--
-- Los hallazgos que ya existen quedan «validado» (ya estaban formulados); los nuevos empiezan en «borrador».
-- Requiere: scripts 01 a 27. Se puede ejecutar más de una vez. No borra ni cambia datos existentes.
-- =====================================================================

-- 1. Columnas nuevas del hallazgo ---------------------------------------------------------------------------
-- Análisis de causa (lo formula la dependencia). «causa» (columna anterior) sigue siendo la causa que
-- describe la Contraloría en su informe.
alter table public.pm_hallazgos add column if not exists causa_metodo text not null default '';
alter table public.pm_hallazgos add column if not exists causa_raiz text not null default '';
alter table public.pm_hallazgos add column if not exists causa_documento text not null default '';
-- Lo que la dependencia diligencia en la app del formato de Calidad MEDE01.05.02.P019.F002 «Herramientas análisis
-- de causas para planes de mejoramiento por proceso» (sus 4 pestañas: lluvia de ideas, causa-efecto, 5 porqués y
-- árbol de problemas). La app lo exporta llenando el formato oficial, con su diseño.
alter table public.pm_hallazgos add column if not exists causa_detalle jsonb not null default '{}'::jsonb;
-- Formulación: borrador → enviado → validado | devuelto. Los hallazgos existentes quedan validados.
alter table public.pm_hallazgos add column if not exists formulacion_estado text not null default 'validado';
alter table public.pm_hallazgos alter column formulacion_estado set default 'borrador';
alter table public.pm_hallazgos add column if not exists formulacion_obs text not null default '';
alter table public.pm_hallazgos add column if not exists formulacion_enviado_por text not null default '';
alter table public.pm_hallazgos add column if not exists formulacion_enviado_at timestamptz;
alter table public.pm_hallazgos add column if not exists formulacion_revisado_por text not null default '';
alter table public.pm_hallazgos add column if not exists formulacion_revisado_at timestamptz;
alter table public.pm_hallazgos add column if not exists sia_cargado_at date;
-- Evaluación oficial de la Contraloría (la registra Control Interno)
alter table public.pm_hallazgos add column if not exists eval_cgsc text not null default '';
alter table public.pm_hallazgos add column if not exists eval_cgsc_obs text not null default '';
alter table public.pm_hallazgos add column if not exists eval_cgsc_fecha date;
alter table public.pm_planes add column if not exists puntaje_cgsc numeric(6,2);
alter table public.pm_planes add column if not exists eval_cgsc_fecha date;

alter table public.pm_hallazgos drop constraint if exists pm_hall_causa_metodo_ok;
alter table public.pm_hallazgos add constraint pm_hall_causa_metodo_ok
  check (causa_metodo in ('', 'cinco_porques', 'espina_pescado', 'arbol_problema', 'otro'));
alter table public.pm_hallazgos drop constraint if exists pm_hall_causa_detalle_ok;
alter table public.pm_hallazgos add constraint pm_hall_causa_detalle_ok
  check (jsonb_typeof(causa_detalle) = 'object' and pg_column_size(causa_detalle) < 200000);
alter table public.pm_hallazgos drop constraint if exists pm_hall_formulacion_ok;
alter table public.pm_hallazgos add constraint pm_hall_formulacion_ok
  check (formulacion_estado in ('borrador', 'enviado', 'validado', 'devuelto'));
alter table public.pm_hallazgos drop constraint if exists pm_hall_eval_cgsc_ok;
alter table public.pm_hallazgos add constraint pm_hall_eval_cgsc_ok
  check (eval_cgsc in ('', 'efectiva', 'parcialmente_efectiva', 'no_efectiva'));
alter table public.pm_planes drop constraint if exists pm_planes_puntaje_ok;
alter table public.pm_planes add constraint pm_planes_puntaje_ok
  check (puntaje_cgsc is null or (puntaje_cgsc >= 0 and puntaje_cgsc <= 100));

create index if not exists pm_hall_dep_idx on public.pm_hallazgos (dependencia_id);

-- 2. Guardas: cada rol solo cambia lo suyo -------------------------------------------------------------------
-- pm.interno = '1' lo ponen las funciones del módulo (importar, revisar, etc.): ahí no se aplican estas reglas.
create or replace function public.pm_interno() returns boolean language sql stable as $$
  select coalesce(current_setting('pm.interno', true), '') = '1'
$$;

-- Plan: la dependencia que lo crea lo deja en formulación y no cambia su estado
create or replace function public.pm_planes_rol_guard()
returns trigger language plpgsql as $$
declare v_rol text := public.current_rol();
begin
  if public.pm_interno() or auth.uid() is null or v_rol = 'admin' then return new; end if;
  if v_rol in ('secretario', 'enlace') then
    if tg_op = 'INSERT' then
      new.estado := 'formulacion';
    elsif new.estado is distinct from old.estado then
      raise exception 'El estado del plan lo cambia Control Interno';
    end if;
    if new.puntaje_cgsc is distinct from (case when tg_op = 'INSERT' then null else old.puntaje_cgsc end)
       or new.eval_cgsc_fecha is distinct from (case when tg_op = 'INSERT' then null else old.eval_cgsc_fecha end) then
      raise exception 'La evaluación de la Contraloría la registra Control Interno';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_pm_planes_rol_guard on public.pm_planes;
create trigger trg_pm_planes_rol_guard before insert or update on public.pm_planes
  for each row execute function public.pm_planes_rol_guard();

-- Hallazgo
create or replace function public.pm_hallazgos_rol_guard()
returns trigger language plpgsql as $$
declare
  v_rol text := public.current_rol();
  v_estado_plan text;
begin
  if tg_op = 'INSERT' then
    select estado into v_estado_plan from public.pm_planes where id = new.plan_id;
    -- Importado o creado por el admin: formulado si el plan ya está en ejecución
    if public.pm_interno() or auth.uid() is null or v_rol = 'admin' then
      if new.formulacion_estado = 'borrador' and v_estado_plan is distinct from 'formulacion' then
        new.formulacion_estado := 'validado';
      end if;
      return new;
    end if;
    -- Dependencia o Control Interno: todo hallazgo nuevo empieza en borrador y sin evaluación
    new.formulacion_estado := 'borrador';
    new.formulacion_obs := ''; new.formulacion_enviado_por := ''; new.formulacion_enviado_at := null;
    new.formulacion_revisado_por := ''; new.formulacion_revisado_at := null; new.sia_cargado_at := null;
    if v_rol in ('secretario', 'enlace') then
      new.eval_cgsc := ''; new.eval_cgsc_obs := ''; new.eval_cgsc_fecha := null;
    elsif v_rol = 'control_interno' then
      new.causa_metodo := ''; new.causa_raiz := ''; new.causa_documento := ''; new.causa_detalle := '{}'::jsonb;
    end if;
    return new;
  end if;

  if public.pm_interno() or auth.uid() is null or v_rol = 'admin' then return new; end if;
  -- El estado de la formulación y la fecha del SIA solo cambian con las funciones del módulo
  if new.formulacion_estado is distinct from old.formulacion_estado
     or new.formulacion_obs is distinct from old.formulacion_obs
     or new.formulacion_enviado_por is distinct from old.formulacion_enviado_por
     or new.formulacion_enviado_at is distinct from old.formulacion_enviado_at
     or new.formulacion_revisado_por is distinct from old.formulacion_revisado_por
     or new.formulacion_revisado_at is distinct from old.formulacion_revisado_at
     or new.sia_cargado_at is distinct from old.sia_cargado_at then
    raise exception 'El estado de la formulación cambia al enviarla, validarla o devolverla';
  end if;
  if v_rol in ('secretario', 'enlace') then
    if old.formulacion_estado not in ('borrador', 'devuelto') then
      raise exception 'El hallazgo ya fue enviado a Control Interno o validado: no se puede modificar';
    end if;
    if new.eval_cgsc is distinct from old.eval_cgsc or new.eval_cgsc_obs is distinct from old.eval_cgsc_obs
       or new.eval_cgsc_fecha is distinct from old.eval_cgsc_fecha then
      raise exception 'La evaluación de la Contraloría la registra Control Interno';
    end if;
  elsif v_rol = 'control_interno' then
    if new.causa_metodo is distinct from old.causa_metodo or new.causa_raiz is distinct from old.causa_raiz
       or new.causa_documento is distinct from old.causa_documento
       or new.causa_detalle is distinct from old.causa_detalle then
      raise exception 'El análisis de causa lo formula la dependencia; Control Interno lo valida o lo devuelve';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_pm_hallazgos_rol_guard on public.pm_hallazgos;
create trigger trg_pm_hallazgos_rol_guard before insert or update on public.pm_hallazgos
  for each row execute function public.pm_hallazgos_rol_guard();

-- Acción: Control Interno no la formula (solo observación, estado de la observación, calificación de
-- seguimiento y traslado a otra dependencia); la dependencia no cambia la observación ni la calificación.
create or replace function public.pm_acciones_rol_guard()
returns trigger language plpgsql as $$
declare
  v_rol text := public.current_rol();
  v_dif text[];
begin
  if public.pm_interno() or auth.uid() is null or v_rol = 'admin' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if v_rol = 'control_interno' then
    -- Puede quitar una acción mal cargada (o al borrar su hallazgo), pero no crearla ni reescribirla
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'INSERT' then
      raise exception 'Las acciones las formula la dependencia; Control Interno las valida o las devuelve';
    end if;
    select array_agg(k) into v_dif
      from jsonb_each(to_jsonb(new)) n(k, v)
     where n.v is distinct from to_jsonb(old) -> n.k
       and k not in ('obs_ci', 'obs_ci_estado', 'obs_ci_at', 'cal_cumplimiento', 'cal_efectividad',
                     'dependencia_id', 'updated_at');
    if v_dif is not null then
      raise exception 'Control Interno no modifica la acción (%): déjelo en la observación', array_to_string(v_dif, ', ');
    end if;
  elsif v_rol in ('secretario', 'enlace') and tg_op = 'UPDATE' then
    if new.obs_ci is distinct from old.obs_ci or new.obs_ci_at is distinct from old.obs_ci_at
       or new.cal_cumplimiento is distinct from old.cal_cumplimiento
       or new.cal_efectividad is distinct from old.cal_efectividad then
      raise exception 'La observación y la calificación de seguimiento las registra Control Interno';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_pm_acciones_rol_guard on public.pm_acciones;
create trigger trg_pm_acciones_rol_guard before insert or update or delete on public.pm_acciones
  for each row execute function public.pm_acciones_rol_guard();

-- 3. Permisos (RLS) -----------------------------------------------------------------------------------------
-- La dependencia ve los planes donde tiene hallazgos o acciones, y los que ella misma creó.
drop policy if exists pm_planes_read on public.pm_planes;
create policy pm_planes_read on public.pm_planes for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and (
        created_by = auth.uid()
     or exists (select 1 from public.pm_hallazgos h where h.plan_id = pm_planes.id and h.dependencia_id = public.current_dep())
     or exists (select 1 from public.pm_acciones a where a.plan_id = pm_planes.id and a.dependencia_id = public.current_dep())))
);
drop policy if exists pm_planes_write on public.pm_planes;
drop policy if exists pm_planes_ins on public.pm_planes;
create policy pm_planes_ins on public.pm_planes for insert to authenticated
  with check (public.current_rol() in ('admin','control_interno','secretario','enlace'));
drop policy if exists pm_planes_upd on public.pm_planes;
create policy pm_planes_upd on public.pm_planes for update to authenticated
  using (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and created_by = auth.uid() and estado = 'formulacion'))
  with check (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and created_by = auth.uid()));
drop policy if exists pm_planes_del on public.pm_planes;
create policy pm_planes_del on public.pm_planes for delete to authenticated
  using (public.current_rol() in ('admin','control_interno'));

drop policy if exists pm_hall_read on public.pm_hallazgos;
create policy pm_hall_read on public.pm_hallazgos for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and (
        dependencia_id = public.current_dep()
     or exists (select 1 from public.pm_acciones a where a.hallazgo_id = pm_hallazgos.id and a.dependencia_id = public.current_dep())))
);
drop policy if exists pm_hall_write on public.pm_hallazgos;
drop policy if exists pm_hall_ins on public.pm_hallazgos;
create policy pm_hall_ins on public.pm_hallazgos for insert to authenticated
  with check (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()));
drop policy if exists pm_hall_upd on public.pm_hallazgos;
create policy pm_hall_upd on public.pm_hallazgos for update to authenticated
  using (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()))
  with check (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()));
drop policy if exists pm_hall_del on public.pm_hallazgos;
create policy pm_hall_del on public.pm_hallazgos for delete to authenticated
  using (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()
             and formulacion_estado in ('borrador','devuelto')));

-- Acciones: la dependencia las formula mientras su hallazgo esté en borrador o devuelto
drop policy if exists pm_acc_write on public.pm_acciones;
drop policy if exists pm_acc_ins on public.pm_acciones;
create policy pm_acc_ins on public.pm_acciones for insert to authenticated
  with check (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()
             and exists (select 1 from public.pm_hallazgos h where h.id = hallazgo_id
                          and h.dependencia_id = public.current_dep() and h.formulacion_estado in ('borrador','devuelto'))));
drop policy if exists pm_acc_upd on public.pm_acciones;
create policy pm_acc_upd on public.pm_acciones for update to authenticated
  using (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()
             and exists (select 1 from public.pm_hallazgos h where h.id = hallazgo_id
                          and h.formulacion_estado in ('borrador','devuelto'))))
  with check (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()));
drop policy if exists pm_acc_del on public.pm_acciones;
create policy pm_acc_del on public.pm_acciones for delete to authenticated
  using (public.current_rol() in ('admin','control_interno')
         or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()
             and exists (select 1 from public.pm_hallazgos h where h.id = hallazgo_id
                          and h.formulacion_estado in ('borrador','devuelto'))));

-- 4. Funciones del flujo de formulación ----------------------------------------------------------------------
-- La dependencia envía el análisis de causa y las acciones de un hallazgo a Control Interno
create or replace function public.pm_enviar_formulacion(p_hallazgo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.current_rol();
  h public.pm_hallazgos;
  v_mail text := coalesce((select email from public.profiles where id = auth.uid()), '');
begin
  select * into h from public.pm_hallazgos where id = p_hallazgo for update;
  if h.id is null then raise exception 'Hallazgo no encontrado'; end if;
  if not (v_rol = 'admin' or (v_rol in ('secretario','enlace') and h.dependencia_id = public.current_dep())) then
    raise exception 'Solo la dependencia responsable del hallazgo envía su formulación';
  end if;
  if h.formulacion_estado not in ('borrador','devuelto') then
    raise exception 'Este hallazgo ya fue enviado o validado';
  end if;
  if h.causa_metodo = '' or length(trim(h.causa_raiz)) < 10 then
    raise exception 'Falta el análisis de causa: elija el método y escriba la causa raíz';
  end if;
  if not exists (select 1 from public.pm_acciones where hallazgo_id = h.id) then
    raise exception 'Falta formular al menos una acción para este hallazgo';
  end if;
  perform set_config('pm.interno', '1', true);
  update public.pm_hallazgos
     set formulacion_estado = 'enviado', formulacion_enviado_por = v_mail, formulacion_enviado_at = now()
   where id = h.id;
  perform set_config('pm.interno', '', true);
end $$;

-- Control Interno valida o devuelve (con observación) la formulación de un hallazgo
create or replace function public.pm_revisar_formulacion(p_hallazgo uuid, p_estado text, p_observacion text default '')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.current_rol();
  h public.pm_hallazgos;
  v_mail text := coalesce((select email from public.profiles where id = auth.uid()), '');
begin
  if coalesce(v_rol, '') not in ('admin','control_interno') then
    raise exception 'Solo Control Interno valida o devuelve la formulación';
  end if;
  if p_estado not in ('validado','devuelto') then raise exception 'Estado de revisión no válido'; end if;
  select * into h from public.pm_hallazgos where id = p_hallazgo for update;
  if h.id is null then raise exception 'Hallazgo no encontrado'; end if;
  if h.formulacion_estado <> 'enviado' then
    raise exception 'La dependencia aún no ha enviado este hallazgo a revisión';
  end if;
  if p_estado = 'devuelto' and length(trim(coalesce(p_observacion, ''))) < 5 then
    raise exception 'Para devolverlo escriba la observación con los ajustes que debe hacer la dependencia';
  end if;
  perform set_config('pm.interno', '1', true);
  update public.pm_hallazgos
     set formulacion_estado = p_estado, formulacion_obs = coalesce(trim(p_observacion), ''),
         formulacion_revisado_por = v_mail, formulacion_revisado_at = now()
   where id = h.id;
  perform set_config('pm.interno', '', true);
end $$;

-- La dependencia (o Control Interno) registra la fecha en que cargó en el SIA los hallazgos validados
create or replace function public.pm_marcar_sia(p_plan uuid, p_fecha date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_rol text := public.current_rol();
  v_n int;
begin
  if coalesce(v_rol, '') not in ('admin','control_interno','secretario','enlace') then
    raise exception 'Sin permiso para registrar el cargue en el SIA';
  end if;
  if p_fecha is null or p_fecha > public.hoy_colombia() then raise exception 'Fecha de cargue no válida'; end if;
  perform set_config('pm.interno', '1', true);
  update public.pm_hallazgos
     set sia_cargado_at = p_fecha
   where plan_id = p_plan and formulacion_estado = 'validado'
     and (v_rol in ('admin','control_interno') or dependencia_id = public.current_dep());
  get diagnostics v_n = row_count;
  perform set_config('pm.interno', '', true);
  if v_n = 0 then raise exception 'No hay hallazgos validados de su dependencia en este plan'; end if;
  return v_n;
end $$;

-- ¿Ya se cargó este informe? (evita planes duplicados aunque el plan sea de otra dependencia)
create or replace function public.pm_buscar_informe(p_contraloria text, p_numero text)
returns table (plan_id uuid, ejercicio text, creado_por text, fecha_suscripcion date)
language sql stable security definer set search_path = public as $$
  select p.id, p.ejercicio, coalesce(pr.email, ''), p.fecha_suscripcion
    from public.pm_planes p
    left join public.profiles pr on pr.id = p.created_by
   where public.current_rol() is not null
     and length(trim(coalesce(p_numero, ''))) > 0
     and lower(trim(p.numero_informe)) = lower(trim(p_numero))
     and lower(trim(p.contraloria)) = lower(trim(coalesce(p_contraloria, '')))
$$;

revoke execute on function public.pm_enviar_formulacion(uuid), public.pm_revisar_formulacion(uuid, text, text),
  public.pm_marcar_sia(uuid, date), public.pm_buscar_informe(text, text) from public, anon;
grant execute on function public.pm_enviar_formulacion(uuid), public.pm_revisar_formulacion(uuid, text, text),
  public.pm_marcar_sia(uuid, date), public.pm_buscar_informe(text, text) to authenticated;

-- 5. Verificación: todo debe salir en true -------------------------------------------------------------------
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'pm_hallazgos'
     and column_name in ('causa_metodo','causa_raiz','causa_documento','causa_detalle','formulacion_estado',
                         'sia_cargado_at','eval_cgsc')) = 7
                                                                                   as columnas_nuevas,
  not exists (select 1 from pg_policies where tablename in ('pm_planes','pm_hallazgos','pm_acciones')
                and policyname in ('pm_planes_write','pm_hall_write','pm_acc_write'))  as politicas_reemplazadas,
  (select count(*) from pg_trigger where tgname in ('trg_pm_planes_rol_guard','trg_pm_hallazgos_rol_guard',
     'trg_pm_acciones_rol_guard')) = 3                                                  as guardas_instaladas,
  (select count(*) from public.pm_hallazgos where formulacion_estado = 'borrador') = 0
    or exists (select 1 from public.pm_planes where estado = 'formulacion')            as existentes_quedan_validados;
