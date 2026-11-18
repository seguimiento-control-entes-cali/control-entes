-- =====================================================================
-- 27 · El Super administrador SIEMPRE necesita el código de verificación en dos pasos en la base de datos
--
-- Antes (script 14): la base le quitaba el rol a una cuenta de supervisión que entrara solo con la contraseña,
-- pero SOLO si esa cuenta ya tenía la verificación activada. Un administrador que nunca la activó entraba
-- con la contraseña y, llamando a la base sin pasar por la pantalla de la app, actuaba como administrador.
-- Si alguien le robaba la contraseña, tenía el control completo.
--
-- Ahora:
--   · Super administrador: la base solo le reconoce el rol si la sesión viene con el código (aal2),
--     tenga o no la verificación activada. Sin código puede entrar, ver su propio perfil y activarla
--     (la app ya lo lleva a esa pantalla), pero no puede leer ni cambiar nada como administrador.
--   · Alcalde y Control Interno: igual que antes (recomendada; si la activaron, se exige el código).
--   · Secretarios y enlaces: igual que antes.
-- Las funciones Edge gestion-cuentas y respaldo aplican la misma regla.
--
-- Requiere: scripts 01 a 26. Se puede ejecutar más de una vez. No cambia ningún dato.
-- =====================================================================

-- 0. Antes de cambiar: administradores activos y si ya tienen la verificación activada.
--    Quien salga con tiene_codigo = false deberá activarla en su próximo ingreso (la app se lo pide).
select p.email, exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') as tiene_codigo
  from public.profiles p
 where p.rol = 'admin' and p.activo
 order by p.email;

-- 1. Rol efectivo según el nivel de verificación de la sesión
create or replace function public.current_rol()
returns text language sql stable security definer set search_path = public as $$
  select case
           when p.rol = 'admin'
            and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
           then null
           when p.rol in ('alcalde','control_interno')
            and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2'
            and exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified')
           then null
           else p.rol
         end
    from public.profiles p
   where p.id = auth.uid() and p.activo
$$;

-- 2. Verificación: en el editor SQL de Supabase no hay sesión de usuario, así que sale null (es lo esperado).
--    La prueba real: entrar a la app como administrador con el código y comprobar que todo funciona igual.
select public.current_rol() as rol_en_esta_sesion,
       position('p.rol = ''admin''' in pg_get_functiondef('public.current_rol()'::regprocedure)) > 0 as admin_exige_codigo;
