-- =====================================================================
-- 30 · «Proyectar respuesta»: oficio de respuesta en la plantilla Word de cada dependencia
-- (aprobado por la responsable el 24-nov-2026).
--
-- La app arma el borrador del oficio de respuesta a un requerimiento sobre la plantilla ORFEO de la dependencia
-- (membrete, pie de página y recuadro de radicado *RAD_S*, que llena ORFEO al radicar). Para eso:
--   · entes: nombre y cargo del titular (el destinatario del oficio), que mantiene el Super administrador;
--   · dependencias: cargo de quien firma (el nombre del secretario ya existe en secretario_nombre);
--   · depósito privado «plantillas»: un .docx por dependencia (oficio/dep-<id>.docx). Lo LEEN todas las cuentas
--     activas (cada dependencia descarga su membrete); solo el Super administrador lo sube, reemplaza o borra.
-- Nada se envía a servicios externos. La app no radica en ORFEO: solo prepara el borrador.
-- Requiere: scripts 01 a 29. Se puede ejecutar más de una vez. No cambia datos existentes.
-- =====================================================================

alter table public.entes add column if not exists titular_nombre text not null default '';
alter table public.entes add column if not exists titular_cargo text not null default '';
alter table public.dependencias add column if not exists cargo_remitente text not null default '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plantillas', 'plantillas', false, 5242880,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

drop policy if exists plantillas_leer on storage.objects;
create policy plantillas_leer on storage.objects for select to authenticated
  using (bucket_id = 'plantillas' and public.current_rol() is not null);
drop policy if exists plantillas_subir on storage.objects;
create policy plantillas_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'plantillas' and coalesce(public.current_rol(), '') = 'admin');
drop policy if exists plantillas_reemplazar on storage.objects;
create policy plantillas_reemplazar on storage.objects for update to authenticated
  using (bucket_id = 'plantillas' and coalesce(public.current_rol(), '') = 'admin')
  with check (bucket_id = 'plantillas' and coalesce(public.current_rol(), '') = 'admin');
drop policy if exists plantillas_borrar on storage.objects;
create policy plantillas_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'plantillas' and coalesce(public.current_rol(), '') = 'admin');
