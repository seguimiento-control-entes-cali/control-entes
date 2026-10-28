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
