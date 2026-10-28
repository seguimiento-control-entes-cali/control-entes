// =====================================================================
// Edge Function: gestion-cuentas
// Crea cuentas por invitación, cambia el correo cuando cambia el titular de una
// dependencia, reenvía el enlace de contraseña y activa o desactiva cuentas.
//
// Por qué una Edge Function: estas operaciones exigen la service_role key, que
// NUNCA puede ir en la app. Aquí vive en el servidor de Supabase (variable de
// entorno SUPABASE_SERVICE_ROLE_KEY, la pone Supabase automáticamente).
// Solo atiende a usuarios con rol 'admin' activo. Cada acción queda en
// public.cuentas_eventos (y en la cadena de auditoría).
//
// Despliegue: ver docs/DESPLIEGUE.md, sección "Cuentas".
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const DOMINIO = /^[a-z0-9._%+-]+@cali\.gov\.co$/;
const ROLES = ['admin', 'alcalde', 'control_interno', 'secretario', 'enlace'];
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
const correoValido = (c: unknown) => {
  const v = String(c ?? '').replace(/\s/g, '').toLowerCase();
  return DOMINIO.test(v) ? v : '';
};
const nombreCompleto = (n: unknown) => String(n ?? '').trim().split(/\s+/).filter(w => w.length > 1).length >= 2;
const claveAleatoria = () => crypto.randomUUID() + crypto.randomUUID();

/* Verificación en dos pasos (supabase/14): si la cuenta ya la activó, la sesión debe venir con el código (aal2).
   Sin esto, una contraseña robada bastaría para usar esta función, aunque la base de datos ya la exija. */
const nivelSesion = (jwt: string) => {
  try {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4))).aal ?? 'aal1';
  } catch {
    return 'aal1';
  }
};
// deno-lint-ignore no-explicit-any
const exigeCodigo = async (admin: any, userId: string, jwt: string) => {
  if (nivelSesion(jwt) === 'aal2') return false;
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  // deno-lint-ignore no-explicit-any
  return (data?.factors ?? []).some((f: any) => f.status === 'verified');
};

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return responder('ok');
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SITIO = Deno.env.get('SITIO_URL') ?? ''; // dirección publicada de la app (para los enlaces del correo)
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. ¿Quién llama? Debe ser un administrador activo.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: quien, error: eQuien } = await admin.auth.getUser(jwt);
  if (eQuien || !quien?.user) return responder({ error: 'Sesión no válida. Vuelve a ingresar.' }, 401);
  const { data: perfil } = await admin.from('profiles').select('rol, activo, email').eq('id', quien.user.id).maybeSingle();
  if (!perfil || perfil.rol !== 'admin' || !perfil.activo)
    return responder({ error: 'Solo el Super administrador puede gestionar cuentas.' }, 403);
  if (await exigeCodigo(admin, quien.user.id, jwt))
    return responder({ error: 'Ingrese con su código de verificación en dos pasos para gestionar cuentas.' }, 403);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return responder({ error: 'Solicitud mal formada.' }, 400);
  }
  const registrar = (accion: string, detalle: Record<string, unknown>) =>
    admin.from('cuentas_eventos').insert({ accion, actor: perfil.email, detalle });

  // Dependencia por nombre: la crea si no existe (con el nombre oficial del histórico)
  const dependenciaId = async (nombre: unknown): Promise<number | null> => {
    const n = String(nombre ?? '').trim();
    if (!n) return null;
    const { data: d } = await admin.from('dependencias').select('id').eq('nombre', n).maybeSingle();
    if (d) return d.id;
    const { data: nueva, error } = await admin.from('dependencias').insert({ nombre: n, activo: true }).select('id').single();
    if (error) throw new Error('No se pudo crear la dependencia: ' + error.message);
    return nueva.id;
  };
  const usuarioPorCorreo = async (correo: string) => {
    const { data } = await admin.from('profiles').select('id, email, rol, dependencia_id, activo').ilike('email', correo).maybeSingle();
    return data;
  };
  const enviarEnlaceClave = (correo: string) =>
    admin.auth.resetPasswordForEmail(correo, SITIO ? { redirectTo: SITIO } : undefined);

  try {
    switch (b.accion) {
      // ---- Crear (invitar) la cuenta de una dependencia o de un usuario general ----
      case 'invitar': {
        const correo = correoValido(b.correo);
        if (!correo) return responder({ error: 'El correo debe ser institucional @cali.gov.co.' }, 400);
        if (!nombreCompleto(b.nombre)) return responder({ error: 'Escribe el nombre completo (nombres y apellidos).' }, 400);
        const rol = ROLES.includes(String(b.rol)) ? String(b.rol) : 'secretario';
        const depId = rol === 'secretario' || rol === 'enlace' ? await dependenciaId(b.dependencia) : null;
        if ((rol === 'secretario' || rol === 'enlace') && !depId) return responder({ error: 'Falta la dependencia.' }, 400);
        let existente = await usuarioPorCorreo(correo);
        if (!existente) {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(correo, {
            data: { nombre: String(b.nombre).trim() },
            ...(SITIO ? { redirectTo: SITIO } : {})
          });
          if (error) return responder({ error: 'Supabase no pudo enviar la invitación: ' + error.message }, 400);
          existente = { id: data.user.id } as never;
        }
        const { error: eP } = await admin.from('profiles')
          .update({ email: correo, nombre: String(b.nombre).trim(), rol, dependencia_id: depId, activo: true })
          .eq('id', existente!.id);
        if (eP) throw new Error(eP.message);
        await registrar('invitar', { correo, nombre: b.nombre, rol, dependencia: b.dependencia ?? null });
        return responder({ ok: true, id: existente!.id, mensaje: `Invitación enviada a ${correo}.` });
      }

      // ---- Preparar la cuenta sin enviar correo: queda creada y bloqueada hasta que se active ----
      case 'preparar': {
        const correo = correoValido(b.correo);
        if (!correo) return responder({ error: 'El correo debe ser institucional @cali.gov.co.' }, 400);
        if (!nombreCompleto(b.nombre)) return responder({ error: 'Escribe el nombre completo (nombres y apellidos).' }, 400);
        const rol = ROLES.includes(String(b.rol)) ? String(b.rol) : 'secretario';
        const depId = rol === 'secretario' || rol === 'enlace' ? await dependenciaId(b.dependencia) : null;
        if ((rol === 'secretario' || rol === 'enlace') && !depId) return responder({ error: 'Falta la dependencia.' }, 400);
        let existente = await usuarioPorCorreo(correo);
        if (existente && existente.activo) return responder({ error: 'Esa cuenta ya existe y está activa.' }, 409);
        if (!existente) {
          // Sin invitación: correo confirmado, contraseña aleatoria que nadie conoce y acceso bloqueado.
          const { data, error } = await admin.auth.admin.createUser({
            email: correo, email_confirm: true, password: claveAleatoria(),
            user_metadata: { nombre: String(b.nombre).trim() }, ban_duration: '876000h'
          });
          if (error) return responder({ error: 'Supabase no pudo crear la cuenta: ' + error.message }, 400);
          existente = { id: data.user.id } as never;
        }
        const { error: eP } = await admin.from('profiles')
          .update({ email: correo, nombre: String(b.nombre).trim(), rol, dependencia_id: depId, activo: false })
          .eq('id', existente!.id);
        if (eP) throw new Error(eP.message);
        await registrar('preparar', { correo, nombre: b.nombre, rol, dependencia: b.dependencia ?? null });
        return responder({ ok: true, id: existente!.id, mensaje: `Cuenta preparada para ${correo}, sin activar y sin enviar correo.` });
      }

      // ---- Activar una cuenta preparada (o desactivada) y enviar el enlace para definir la contraseña ----
      case 'activar_invitar': {
        const id = String(b.id ?? '');
        if (!id) return responder({ error: 'Falta la cuenta a activar.' }, 400);
        const { data: pf } = await admin.from('profiles').select('email').eq('id', id).maybeSingle();
        if (!pf) return responder({ error: 'La cuenta no existe.' }, 404);
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
        if (error) return responder({ error: error.message }, 400);
        await admin.from('profiles').update({ activo: true }).eq('id', id);
        const { error: eMail } = await enviarEnlaceClave(pf.email);
        await registrar('activar_invitar', { id, correo: pf.email });
        return responder({
          ok: true,
          mensaje: eMail
            ? `Cuenta activada, pero no se pudo enviar el enlace (${eMail.message}). Use "Reenviar enlace de contraseña".`
            : `Cuenta activada. Se envió a ${pf.email} el enlace para definir su contraseña.`
        });
      }

      // ---- Cambio de titular: la cuenta de la dependencia pasa al nuevo correo ----
      case 'cambiar_correo': {
        const id = String(b.id ?? '');
        const nuevo = correoValido(b.correo);
        if (!id) return responder({ error: 'Falta la cuenta a modificar.' }, 400);
        if (!nuevo) return responder({ error: 'El correo nuevo debe ser institucional @cali.gov.co.' }, 400);
        if (!nombreCompleto(b.nombre)) return responder({ error: 'Escribe el nombre completo del nuevo titular.' }, 400);
        const otro = await usuarioPorCorreo(nuevo);
        if (otro && otro.id !== id) return responder({ error: 'Ese correo ya pertenece a otra cuenta.' }, 409);
        const { data: antes } = await admin.from('profiles').select('email, nombre').eq('id', id).maybeSingle();
        if (!antes) return responder({ error: 'La cuenta no existe.' }, 404);
        // Correo nuevo confirmado y contraseña anterior invalidada: el titular saliente pierde el acceso.
        const { error } = await admin.auth.admin.updateUserById(id, {
          email: nuevo, email_confirm: true, password: claveAleatoria(), user_metadata: { nombre: String(b.nombre).trim() }
        });
        if (error) return responder({ error: 'No se pudo cambiar el correo: ' + error.message }, 400);
        await admin.from('profiles').update({ email: nuevo, nombre: String(b.nombre).trim(), activo: true }).eq('id', id);
        const { error: eMail } = await enviarEnlaceClave(nuevo);
        await registrar('cambiar_correo', { id, de: antes.email, a: nuevo, titular_anterior: antes.nombre, titular_nuevo: b.nombre });
        return responder({
          ok: true,
          mensaje: eMail
            ? `Correo cambiado a ${nuevo}, pero no se pudo enviar el enlace de contraseña (${eMail.message}). Usa "Reenviar enlace".`
            : `La cuenta ahora es de ${nuevo}. Se envió el enlace para que defina su contraseña. El titular anterior ya no puede ingresar.`
        });
      }

      // ---- Reenviar el enlace para definir o recuperar la contraseña ----
      case 'enlace_clave': {
        const correo = correoValido(b.correo);
        if (!correo) return responder({ error: 'Correo no válido.' }, 400);
        const { error } = await enviarEnlaceClave(correo);
        if (error) return responder({ error: 'No se pudo enviar el enlace: ' + error.message }, 400);
        await registrar('enlace_clave', { correo });
        return responder({ ok: true, mensaje: `Enlace enviado a ${correo}.` });
      }

      // ---- Activar o desactivar (desactivar también bloquea el inicio de sesión) ----
      case 'activar':
      case 'desactivar': {
        const id = String(b.id ?? '');
        if (id === quien.user.id) return responder({ error: 'No puedes desactivar tu propia cuenta.' }, 400);
        const activo = b.accion === 'activar';
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: activo ? 'none' : '876000h' });
        if (error) return responder({ error: error.message }, 400);
        await admin.from('profiles').update({ activo }).eq('id', id);
        await registrar(String(b.accion), { id });
        return responder({ ok: true, mensaje: activo ? 'Cuenta activada.' : 'Cuenta desactivada: ya no puede ingresar.' });
      }

      default:
        return responder({ error: 'Acción desconocida.' }, 400);
    }
  } catch (e) {
    return responder({ error: (e as Error).message }, 500);
  }
});
