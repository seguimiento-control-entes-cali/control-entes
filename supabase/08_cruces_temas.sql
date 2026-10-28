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
