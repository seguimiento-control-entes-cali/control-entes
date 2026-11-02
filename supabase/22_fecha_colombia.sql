-- =====================================================================
-- 22 · Fecha de Colombia en lugar de la fecha del servidor (UTC)
-- El servidor está en UTC (verificado el 30-oct-2026): entre las 7:00 p. m. y la medianoche de Colombia,
-- current_date da el día siguiente. Este script reemplaza current_date por public.hoy_colombia() en:
--   * la vista v_requerimientos (días restantes y semáforo),
--   * el valor por defecto de requerimientos.fecha_radicacion,
--   * las funciones cerrar_requerimiento, sembrar_desde_historico, pm_reportar_avance y pm_resolver_prorroga.
-- No cambia la zona horaria de la base, ni las tareas programadas, ni ningún dato guardado.
-- Protección: antes de cambiar algo revisa que cada función sea la versión esperada (huella md5 del código sin CR:
-- la de producción al 2-nov-2026 o la que deja este script), que siga siendo security definer con
-- search_path=public, y que la vista tenga las 21 columnas esperadas. Si algo no coincide, se detiene sin cambiar
-- nada (todo va en una sola transacción). Se puede ejecutar más de una vez.
-- La vista y las funciones se reemplazan con "create or replace": conservan su dueño y sus permisos actuales.
-- Al final, la consulta de verificación (sirve a cualquier hora).
-- =====================================================================
begin;

-- 1. Protección
do $$
declare
  v_esperadas constant jsonb := jsonb_build_object(
    'cerrar_requerimiento',    jsonb_build_array('bdddb0081e6f671a41444cfce78e0613', '33f3daf9abb9a3d37db5be767bfaaec7'),
    'sembrar_desde_historico', jsonb_build_array('d9c8b62a695b77afc7c56caaf094a29e', '446824683ec4fdda1678e334baca06cd'),
    'pm_reportar_avance',      jsonb_build_array('1f2fe7b806ef75231e90283777947492', '9353a8d39696fa63eaeaeb1ac3b2ed35'),
    'pm_resolver_prorroga',    jsonb_build_array('c2e4461c895bdb6cb1bb5ec217309fb7', 'f913cd5e8167cf0ef77350f0ab0f4a5f'));
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

commit;

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
