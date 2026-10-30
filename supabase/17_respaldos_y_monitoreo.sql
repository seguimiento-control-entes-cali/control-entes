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
