// Reglas de la cuenta: contraseña nueva y verificación en dos pasos. Copiadas de la 2.x
// (src/js/08-vistas-catalogos-y-seguridad.js: guardarClave, mfaRolesObligatorio y mfaRolesRecomendado).
import type { Rol } from './roles';

/** Mensaje de error de la contraseña nueva, o null si se puede guardar. */
export function errorClaveNueva(clave: string, repetida: string): string | null {
  if (clave.length < 10 || !/[a-zA-Z]/.test(clave) || !/\d/.test(clave))
    return 'Mínimo 10 caracteres, con letras y números.';
  if (clave !== repetida) return 'Las dos contraseñas no coinciden.';
  return null;
}

/** Verificación en dos pasos por rol: obligatoria para el Super administrador, recomendada para supervisión. */
export function exigenciaVerificacion(rol: Rol): 'obligatoria' | 'recomendada' | 'opcional' {
  if (rol === 'admin') return 'obligatoria';
  if (rol === 'alcalde' || rol === 'control_interno') return 'recomendada';
  return 'opcional';
}

/** true si la dirección llega del correo de invitación o de recuperación (hay que definir la contraseña). */
export function esLlegadaParaClave(hash: string): boolean {
  return /type=(invite|recovery)/.test(hash);
}

/**
 * Enlace del correo PROTEGIDO contra los filtros de correo (24-nov-2026): los filtros de seguridad abren los enlaces
 * apenas llega el correo y gastan el enlace de un solo uso. Por eso la plantilla del correo de Supabase lleva a
 * «…/v3/#confirmar=1&token_hash=…&tipo=invite|recovery» y el enlace solo se usa cuando la PERSONA oprime «Continuar».
 */
export interface EnlaceConfirmar {
  tokenHash: string;
  tipo: 'invite' | 'recovery';
}
export function leerEnlaceConfirmar(hash: string): EnlaceConfirmar | null {
  if (!/(^#|&)confirmar=1(&|$)/.test(hash)) return null;
  // Sin URLSearchParams: esta capa se compila sin las definiciones del navegador
  const p = new Map(
    hash
      .replace(/^#/, '')
      .split('&')
      .map(par => {
        const i = par.indexOf('=');
        return [i < 0 ? par : par.slice(0, i), i < 0 ? '' : decodeURIComponent(par.slice(i + 1))] as const;
      })
  );
  const tokenHash = (p.get('token_hash') ?? '').trim();
  const tipo = p.get('tipo') ?? p.get('type') ?? '';
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash) || (tipo !== 'invite' && tipo !== 'recovery')) return null;
  return { tokenHash, tipo };
}
