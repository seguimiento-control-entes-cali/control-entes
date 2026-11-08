-- =====================================================================
-- 24 · Aviso diario de planes de mejoramiento (función avisos-planes)
--  * Configuración: casilla de activación (APAGADA por defecto), correo de copia a Control Interno (vacío o
--    @cali.gov.co) y el resultado del último envío.
--  * Tabla pm_avisos: un registro por aviso enviado (acción, tipo "previo" o "atraso" y fecha de terminación).
--    La regla única impide avisar dos veces lo mismo; si la acción recibe una prórroga, su fecha cambia y se avisa
--    de nuevo. Solo la escribe la función con la llave de servicio; la leen el Super administrador y Control Interno.
-- La programación de la tarea diaria va aparte, en supabase/25_programar_avisos.sql (siempre apagada).
-- Requiere: scripts 01 a 20. Se puede ejecutar más de una vez. No cambia ningún dato existente.
-- =====================================================================

-- 1. Configuración
alter table public.config add column if not exists avisos_activo boolean not null default false;
alter table public.config add column if not exists avisos_copia_correo text not null default '';
alter table public.config drop constraint if exists config_avisos_copia_ok;
alter table public.config add constraint config_avisos_copia_ok
  check (avisos_copia_correo = '' or lower(avisos_copia_correo) ~ '^[a-z0-9._%+-]+@cali\.gov\.co$');
alter table public.config add column if not exists avisos_ultimo timestamptz;
alter table public.config add column if not exists avisos_ultimo_detalle text not null default '';

-- 2. Avisos enviados
create table if not exists public.pm_avisos (
  id             bigint generated always as identity primary key,
  accion_id      uuid not null references public.pm_acciones(id) on delete cascade,
  tipo           text not null check (tipo in ('previo', 'atraso')),
  fecha_fin      date not null,
  dependencia_id bigint references public.dependencias(id),
  correo         text not null default '',
  copia          text not null default '',
  created_at     timestamptz not null default now(),
  constraint pm_avisos_unico unique (accion_id, tipo, fecha_fin)
);
create index if not exists idx_pm_avisos_fecha on public.pm_avisos (created_at desc);
alter table public.pm_avisos enable row level security;
drop policy if exists pm_avisos_leer on public.pm_avisos;
create policy pm_avisos_leer on public.pm_avisos for select to authenticated
  using (public.current_rol() in ('admin', 'control_interno'));
revoke all on public.pm_avisos from anon, authenticated;
grant select on public.pm_avisos to authenticated;

-- 3. Auditoría: cada aviso registrado (y cada reserva liberada si el correo falla) queda en la cadena
drop trigger if exists trg_audit_pm_avisos on public.pm_avisos;
create trigger trg_audit_pm_avisos after insert or delete on public.pm_avisos
  for each row execute function public.audit_trigger();

-- Verificación: debe dar true en las cuatro columnas
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'config'
     and column_name in ('avisos_activo', 'avisos_copia_correo', 'avisos_ultimo', 'avisos_ultimo_detalle')) = 4 as configuracion_ok,
  (select not avisos_activo from public.config where id = 1)                                                    as aviso_apagado,
  to_regclass('public.pm_avisos') is not null                                                                    as tabla_ok,
  (select relrowsecurity from pg_class where oid = 'public.pm_avisos'::regclass)                                 as rls_activo;
