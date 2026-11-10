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
