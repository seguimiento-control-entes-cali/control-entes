-- =====================================================================
-- 31 · Seguimiento del DACI (Control Interno) a las metas cumplidas
-- (pedido verbal de Control Interno, aprobado por la responsable el 24-nov-2026).
--
-- En la ficha del plan, debajo de «Cumplimiento de metas vencidas» y antes de la calificación CGSC, Control Interno
-- registra su verificación de cada meta cumplida: Verificada / No verificada (sin registro = pendiente), con fecha,
-- observación y quién la hizo. La app muestra el resumen «X de Y metas cumplidas verificadas por el DACI».
--   · Solo Control Interno y el Super administrador registran la verificación;
--   · la dependencia no la puede escribir ni cambiar (ni al crear ni al editar la acción).
-- Requiere: scripts 01 a 30. Se puede ejecutar más de una vez. No cambia datos existentes.
-- =====================================================================

alter table public.pm_acciones add column if not exists daci_verificacion text;
alter table public.pm_acciones add column if not exists daci_fecha date;
alter table public.pm_acciones add column if not exists daci_observacion text not null default '';
alter table public.pm_acciones add column if not exists daci_por text not null default '';
alter table public.pm_acciones drop constraint if exists pm_acciones_daci_verificacion_check;
alter table public.pm_acciones add constraint pm_acciones_daci_verificacion_check
  check (daci_verificacion is null or daci_verificacion in ('verificada', 'no_verificada'));

-- Guardián de la acción (script 28) con los campos del DACI
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
                     'dependencia_id', 'updated_at',
                     'daci_verificacion', 'daci_fecha', 'daci_observacion', 'daci_por');
    if v_dif is not null then
      raise exception 'Control Interno no modifica la acción (%): déjelo en la observación', array_to_string(v_dif, ', ');
    end if;
  elsif v_rol in ('secretario', 'enlace') then
    if tg_op = 'INSERT' and (new.daci_verificacion is not null or new.daci_fecha is not null
       or coalesce(new.daci_observacion, '') <> '' or coalesce(new.daci_por, '') <> '') then
      raise exception 'La verificación de las metas la registra Control Interno';
    end if;
    if tg_op = 'UPDATE' then
      if new.obs_ci is distinct from old.obs_ci or new.obs_ci_at is distinct from old.obs_ci_at
         or new.cal_cumplimiento is distinct from old.cal_cumplimiento
         or new.cal_efectividad is distinct from old.cal_efectividad then
        raise exception 'La observación y la calificación de seguimiento las registra Control Interno';
      end if;
      if new.daci_verificacion is distinct from old.daci_verificacion or new.daci_fecha is distinct from old.daci_fecha
         or new.daci_observacion is distinct from old.daci_observacion or new.daci_por is distinct from old.daci_por then
        raise exception 'La verificación de las metas la registra Control Interno';
      end if;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists trg_pm_acciones_rol_guard on public.pm_acciones;
create trigger trg_pm_acciones_rol_guard before insert or update or delete on public.pm_acciones
  for each row execute function public.pm_acciones_rol_guard();
