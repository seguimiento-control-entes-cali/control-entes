-- =====================================================================
-- 14 · Verificación en dos pasos y resumen semanal por correo
-- Es idempotente: se puede ejecutar más de una vez.
--
-- 1. Verificación en dos pasos (código de 6 dígitos de una app autenticadora).
--    Quien tenga un rol de supervisión (Super administrador, Alcalde, Control Interno) y ya haya
--    activado su verificación en dos pasos, solo actúa con ese rol si ingresó con el código.
--    Con solo la contraseña la base de datos no le reconoce el rol: así una contraseña robada
--    no basta. La app obliga al Super administrador a activarla en su primer ingreso.
-- 2. Resumen semanal por correo a cada secretario o director (Edge Function resumen-semanal).
-- =====================================================================

-- 1. Rol efectivo según el nivel de verificación de la sesión
create or replace function public.current_rol()
returns text language sql stable security definer set search_path = public as $$
  select case
           when p.rol in ('admin','alcalde','control_interno')
            and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
            and exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
           then null
           else p.rol
         end
    from public.profiles p
   where p.id = auth.uid() and p.activo
$$;

-- 2. Parámetros del resumen semanal
alter table public.config add column if not exists resumen_activo boolean not null default false;
alter table public.config add column if not exists resumen_ultimo timestamptz;
alter table public.config add column if not exists resumen_ultimo_detalle text not null default '';

-- 3. Verificación
select public.current_rol() as rol_en_esta_sesion,
       (select resumen_activo from public.config where id = 1) as resumen_activo;
