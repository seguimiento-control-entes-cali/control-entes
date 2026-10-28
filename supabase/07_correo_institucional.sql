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
