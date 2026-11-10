// Implementación real de los contratos con supabase-js (D-24): único lugar donde se importa supabase-js.
// Copia el mismo comportamiento de la 2.x (src/js/21-arranque.js y 08-vistas-catalogos-y-seguridad.js):
//  · ingreso con contraseña → perfil → cuenta activa → si la cuenta tiene verificación en dos pasos, pedir el código;
//  · el código se verifica con el primer factor TOTP verificado (challengeAndVerify);
//  · cada ingreso registra una fila en public.accesos (si falla, no impide entrar).
// La seguridad la ponen las políticas RLS de la base; aquí solo se traduce.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ErrorDatos, type Datos, type Perfil, type Sesion } from '../contratos';
import { esRol } from '../../dominio/roles';

export function crearClienteSupabase(url: string, clave: string): SupabaseClient {
  return createClient(url, clave, { auth: { persistSession: true, autoRefreshToken: true } });
}

interface FilaPerfil {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: string;
  dependencia_id: number | null;
  activo: boolean;
}

export function aPerfil(f: FilaPerfil): Perfil {
  if (!esRol(f.rol))
    throw new ErrorDatos('sin_permiso', 'El rol de la cuenta no es válido. Contacte al administrador.');
  return {
    id: f.id,
    correo: f.email ?? '',
    nombre: f.nombre ?? '',
    rol: f.rol,
    dependenciaId: f.dependencia_id,
    activo: f.activo
  };
}

/** El QR llega como "data:image/svg+xml;utf-8,<svg …>" sin codificar; se codifica para que se dibuje completo
 *  (igual que qrSeguro de la 2.x, src/js/08-vistas-catalogos-y-seguridad.js). */
export function qrSeguro(qr: string): string {
  const s = String(qr || '');
  const i = s.indexOf(',');
  if (i < 0 || !/^data:image\/svg\+xml/i.test(s) || /;base64,/i.test(s.slice(0, i + 1))) return s;
  const svg = s.slice(i + 1);
  return (
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(/%3C/i.test(svg) ? decodeURIComponent(svg) : svg)
  );
}

const red = () =>
  new ErrorDatos('red', 'No hay conexión con el servidor. Revise su internet e intente de nuevo.');

export function datosSupabase(sb: SupabaseClient): Datos {
  async function perfilDe(usuarioId: string): Promise<Perfil | null> {
    const { data, error } = await sb.from('profiles').select('*').eq('id', usuarioId).maybeSingle();
    if (error) throw red();
    return data ? aPerfil(data as FilaPerfil) : null;
  }

  async function nivel(): Promise<{ actual: 'aal1' | 'aal2'; siguiente: string | null }> {
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return { actual: data?.currentLevel === 'aal2' ? 'aal2' : 'aal1', siguiente: data?.nextLevel ?? null };
  }

  async function sesion(): Promise<Sesion | null> {
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (!s) return null;
    const n = await nivel();
    // Con verificación en dos pasos pendiente no hay sesión completa todavía
    if (n.siguiente === 'aal2' && n.actual !== 'aal2') return null;
    return { usuarioId: s.user.id, correo: s.user.email ?? '', nivel: n.actual };
  }

  return {
    auth: {
      async ingresar(correo, clave) {
        const { data, error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
        if (error || !data.session) throw new ErrorDatos('credenciales', 'Correo o contraseña incorrectos.');
        const perfil = await perfilDe(data.session.user.id);
        if (!perfil) {
          await sb.auth.signOut();
          throw new ErrorDatos('sin_permiso', 'No se pudo cargar tu perfil. Contacta al administrador.');
        }
        if (!perfil.activo) {
          await sb.auth.signOut();
          throw new ErrorDatos(
            'cuenta_inactiva',
            'Tu cuenta está pendiente de activación por un administrador.'
          );
        }
        const n = await nivel();
        if (n.siguiente === 'aal2' && n.actual !== 'aal2') return { tipo: 'requiere_codigo' };
        return { tipo: 'listo', sesion: { usuarioId: perfil.id, correo: perfil.correo, nivel: n.actual } };
      },
      async verificarCodigo(codigo) {
        const limpio = codigo.replace(/\D/g, '');
        if (limpio.length !== 6) throw new ErrorDatos('codigo', 'Escriba los 6 dígitos.');
        const { data, error } = await sb.auth.mfa.listFactors();
        if (error) throw red();
        const factor = (data?.totp ?? []).find(f => f.status === 'verified');
        if (!factor) throw new ErrorDatos('codigo', 'La cuenta no tiene verificación en dos pasos activa.');
        const v = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: limpio });
        if (v.error)
          throw new ErrorDatos('codigo', 'El código no es correcto o ya cambió. Escriba el código actual.');
        const s = await sesion();
        if (!s) throw new ErrorDatos('codigo', 'No se pudo completar la verificación. Intente de nuevo.');
        return s;
      },
      sesionActual: sesion,
      async salir() {
        await sb.auth.signOut();
      },
      async recuperarClave(correo, volverA) {
        const { error } = await sb.auth.resetPasswordForEmail(correo.trim(), { redirectTo: volverA });
        if (error) throw new ErrorDatos('otro', 'No se pudo enviar el enlace: ' + error.message);
      },
      async cambiarClave(nueva) {
        const { error } = await sb.auth.updateUser({ password: nueva });
        if (error) throw new ErrorDatos('otro', 'No se pudo guardar: ' + error.message);
      },
      async tieneVerificacion() {
        const { data, error } = await sb.auth.mfa.listFactors();
        if (error) throw red();
        return (data?.totp ?? []).some(f => f.status === 'verified');
      },
      async iniciarVerificacion() {
        const { data: f, error: e1 } = await sb.auth.mfa.listFactors();
        if (e1) throw red();
        // Igual que la 2.x: se quitan los intentos anteriores sin terminar
        for (const x of (f?.all ?? []).filter(x => x.factor_type === 'totp' && x.status !== 'verified'))
          await sb.auth.mfa.unenroll({ factorId: x.id });
        const n = (f?.totp ?? []).filter(x => x.status === 'verified').length;
        const nombre = 'Celular ' + (n + 1) + ' (' + new Date().toLocaleDateString('es-CO') + ')';
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: nombre });
        if (error || !data)
          throw new ErrorDatos(
            'otro',
            'No se pudo iniciar la verificación en dos pasos: ' + (error?.message ?? '')
          );
        return { factorId: data.id, qr: qrSeguro(data.totp.qr_code), secreto: data.totp.secret };
      },
      async confirmarVerificacion(factorId, codigo) {
        const limpio = codigo.replace(/\D/g, '');
        if (limpio.length !== 6) throw new ErrorDatos('codigo', 'Escriba los 6 dígitos que muestra la app.');
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: limpio });
        if (error)
          throw new ErrorDatos(
            'codigo',
            'El código no es correcto o ya cambió. Escriba el código actual de la app.'
          );
      },
      async cancelarVerificacion(factorId) {
        await sb.auth.mfa.unenroll({ factorId }).then(
          () => undefined,
          () => undefined
        );
      }
    },
    identidad: {
      async miPerfil() {
        const s = await sesion();
        if (!s) return null;
        const p = await perfilDe(s.usuarioId);
        return p && p.activo ? p : null;
      },
      async registrarAcceso() {
        // Igual que la 2.x: el registro de acceso nunca impide entrar
        await sb
          .from('accesos')
          .insert({})
          .then(
            () => undefined,
            () => undefined
          );
      }
    },
    catalogos: {
      async entes() {
        const { data, error } = await sb
          .from('entes')
          .select('id, nombre, sigla, tipo, activo')
          .order('nombre');
        if (error) throw red();
        return data ?? [];
      },
      async dependencias() {
        const { data, error } = await sb.from('dependencias').select('id, nombre, activo').order('nombre');
        if (error) throw red();
        return data ?? [];
      },
      async configuracion() {
        const { data, error } = await sb
          .from('config')
          .select('dias_rojo, correo_disciplinario')
          .eq('id', 1)
          .maybeSingle();
        if (error) throw red();
        return { diasRojo: data?.dias_rojo || 5, correoDisciplinario: data?.correo_disciplinario ?? '' };
      }
    }
  };
}
