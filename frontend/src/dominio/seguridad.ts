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
