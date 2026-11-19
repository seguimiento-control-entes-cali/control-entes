
-- =====================================================================
-- REVERSA del script 28 (quién hace qué). SOLO si algo sale mal después de aplicarlo.
-- Devuelve las reglas de permisos de planes, hallazgos y acciones a como estaban en producción el 19-nov-2026
-- (copiadas de pg_policies antes de aplicar el 28) y quita las guardas y funciones nuevas.
-- Las columnas nuevas se dejan (no estorban y conservan lo que se haya diligenciado).
-- Requiere su aprobación expresa antes de ejecutarlo.
-- =====================================================================

-- 1. Guardas por rol
drop trigger if exists trg_pm_planes_rol_guard on public.pm_planes;
drop trigger if exists trg_pm_hallazgos_rol_guard on public.pm_hallazgos;
drop trigger if exists trg_pm_acciones_rol_guard on public.pm_acciones;
drop function if exists public.pm_planes_rol_guard();
drop function if exists public.pm_hallazgos_rol_guard();
drop function if exists public.pm_acciones_rol_guard();

-- 2. Reglas nuevas fuera
drop policy if exists pm_planes_ins on public.pm_planes;
drop policy if exists pm_planes_upd on public.pm_planes;
drop policy if exists pm_planes_del on public.pm_planes;
drop policy if exists pm_hall_ins on public.pm_hallazgos;
drop policy if exists pm_hall_upd on public.pm_hallazgos;
drop policy if exists pm_hall_del on public.pm_hallazgos;
drop policy if exists pm_acc_ins on public.pm_acciones;
drop policy if exists pm_acc_upd on public.pm_acciones;
drop policy if exists pm_acc_del on public.pm_acciones;

-- 3. Reglas anteriores, exactamente como estaban
drop policy if exists pm_planes_read on public.pm_planes;
create policy pm_planes_read on public.pm_planes for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and exists (
      select 1 from public.pm_acciones a where a.plan_id = pm_planes.id and a.dependencia_id = public.current_dep())));
drop policy if exists pm_planes_write on public.pm_planes;
create policy pm_planes_write on public.pm_planes for all to authenticated
  using (public.current_rol() in ('admin','control_interno'))
  with check (public.current_rol() in ('admin','control_interno'));

drop policy if exists pm_hall_read on public.pm_hallazgos;
create policy pm_hall_read on public.pm_hallazgos for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and exists (
      select 1 from public.pm_acciones a where a.hallazgo_id = pm_hallazgos.id and a.dependencia_id = public.current_dep())));
drop policy if exists pm_hall_write on public.pm_hallazgos;
create policy pm_hall_write on public.pm_hallazgos for all to authenticated
  using (public.current_rol() in ('admin','control_interno'))
  with check (public.current_rol() in ('admin','control_interno'));

drop policy if exists pm_acc_read on public.pm_acciones;
create policy pm_acc_read on public.pm_acciones for select to authenticated using (
  public.current_rol() in ('admin','alcalde','control_interno')
  or (public.current_rol() in ('secretario','enlace') and dependencia_id = public.current_dep()));
drop policy if exists pm_acc_write on public.pm_acciones;
create policy pm_acc_write on public.pm_acciones for all to authenticated
  using (public.current_rol() in ('admin','control_interno'))
  with check (public.current_rol() in ('admin','control_interno'));

-- 4. Funciones del flujo fuera (la app sin ellas funciona como antes)
drop function if exists public.pm_enviar_formulacion(uuid);
drop function if exists public.pm_revisar_formulacion(uuid, text, text);
drop function if exists public.pm_marcar_sia(uuid, date);
drop function if exists public.pm_buscar_informe(text, text);

-- 5. Verificación: deben quedar las 6 reglas de antes
select count(*) = 6 as reglas_como_antes
  from pg_policies
 where schemaname = 'public' and tablename in ('pm_planes','pm_hallazgos','pm_acciones')
   and policyname in ('pm_planes_read','pm_planes_write','pm_hall_read','pm_hall_write','pm_acc_read','pm_acc_write');
