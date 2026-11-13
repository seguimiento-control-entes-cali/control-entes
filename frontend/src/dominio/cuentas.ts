// Cuentas y roles. Copia de la 2.x: depIdDe, cuentaDe, titularDe y estadoCuenta de
// src/js/08-vistas-catalogos-y-seguridad.js, y las validaciones de guardarTitular y guardarInvitacion. Paridad
// comprobada en pruebas/paridad-cuentas.test.ts.
import {
  claveOrganismo,
  esNombreCompleto,
  normalizarCelular,
  normalizarCorreo,
  type Responsable
} from './directorio';

/** Cuenta de acceso (public.profiles). */
export interface Cuenta {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  dependencia_id: number | null;
  activo: boolean;
}
type Dep = { id: number; nombre: string };

/** Acciones de la función gestion-cuentas (supabase/functions/gestion-cuentas). */
export type AccionCuenta =
  | 'preparar'
  | 'activar_invitar'
  | 'invitar'
  | 'cambiar_correo'
  | 'enlace_clave'
  | 'activar'
  | 'desactivar';

export const depIdDe = (org: string, deps: readonly Dep[]) =>
  deps.find(d => claveOrganismo(d.nombre) === claveOrganismo(org))?.id ?? null;

/** Cuenta de secretario de la dependencia (la que corresponde al titular del directorio). */
export function cuentaDe(org: string, deps: readonly Dep[], cuentas: readonly Cuenta[]): Cuenta | null {
  const id = depIdDe(org, deps);
  return id ? (cuentas.find(p => p.dependencia_id === id && p.rol === 'secretario') ?? null) : null;
}
export const titularDe = (org: string, responsables: readonly Responsable[]) =>
  responsables.find(x => claveOrganismo(x.organismo) === claveOrganismo(org)) ?? null;

export type EstadoCuenta = 'sin' | 'incompleto' | 'inactiva' | 'distinto' | 'activa';
/** estadoCuenta de la 2.x: [estado, tono de la píldora, texto]. */
export function estadoCuenta(
  org: string,
  deps: readonly Dep[],
  cuentas: readonly Cuenta[],
  responsables: readonly Responsable[]
): [EstadoCuenta, 'rojo' | 'neutral' | 'amarillo' | 'verde', string] {
  const p = cuentaDe(org, deps, cuentas),
    t = titularDe(org, responsables),
    mail = t ? normalizarCorreo(t.correo) : '';
  if (!p)
    return mail && esNombreCompleto(t?.nombre)
      ? ['sin', 'rojo', 'Sin cuenta']
      : ['incompleto', 'neutral', 'Faltan datos del titular'];
  if (!p.activo) return ['inactiva', 'neutral', 'Preparada, sin activar'];
  if (mail && String(p.email).toLowerCase() !== mail)
    return ['distinto', 'amarillo', 'Correo distinto al directorio'];
  return ['activa', 'verde', 'Activa'];
}

/** ¿El titular tiene correo institucional y nombre completo? (requisito para preparar o crear su cuenta). */
export const titularCompleto = (t: Responsable | null) =>
  !!t && !!normalizarCorreo(t.correo) && esNombreCompleto(t.nombre);

/** Validaciones de "Cambiar titular" (guardarTitular), con los mismos textos. Devuelve el error o null. */
export function validarTitular(
  d: { nombre: string; correo: string; telefono: string },
  idCuentaActual: string | null,
  cuentas: readonly Cuenta[]
): string | null {
  const nombre = d.nombre.trim().replace(/\s+/g, ' '),
    correo = normalizarCorreo(d.correo),
    telTxt = d.telefono.trim();
  if (!esNombreCompleto(nombre)) return 'Escribe el nombre completo: nombres y apellidos.';
  if (!correo) return 'El correo debe ser institucional @cali.gov.co.';
  if (telTxt && !normalizarCelular(telTxt)) return 'El celular debe tener 10 dígitos e iniciar en 3.';
  const otro = cuentas.find(x => String(x.email).toLowerCase() === correo && x.id !== idCuentaActual);
  if (otro) return 'Ese correo ya pertenece a otra cuenta (' + otro.email + ').';
  return null;
}

/** Validaciones de "Invitar usuario" (guardarInvitacion). */
export function validarInvitacion(d: { nombre: string; correo: string; rol: string; dependencia: string }) {
  if (!esNombreCompleto(d.nombre.trim())) return 'Escribe el nombre completo.';
  if (!normalizarCorreo(d.correo)) return 'El correo debe ser institucional @cali.gov.co.';
  if (d.rol === 'enlace' && !d.dependencia) return 'Un enlace operativo debe tener dependencia.';
  return null;
}

/** Cuentas que no son la del secretario de una dependencia principal ("Otras cuentas"). */
export function otrasCuentas(cuentas: readonly Cuenta[], orgs: readonly string[], deps: readonly Dep[]) {
  const ids = new Set(orgs.map(o => depIdDe(o, deps)).filter(Boolean));
  return cuentas.filter(p => !(p.rol === 'secretario' && ids.has(p.dependencia_id)));
}

/** Matriz de permisos por rol (se aplica en la base de datos por RLS). */
export const MATRIZ_PERMISOS: readonly (readonly string[])[] = [
  ['Super administrador', 'Todo', 'Sí', 'Sí', 'Sí', 'Sí'],
  ['Alcalde / Despacho', 'Todo', 'No', 'No', 'Sí', 'Sí'],
  ['Control Interno', 'Todo', 'No', 'No', 'Sí', 'Sí'],
  ['Secretario de Despacho', 'Su dependencia', 'No', 'Su dependencia', 'No', 'No'],
  ['Enlace operativo', 'Su dependencia', 'Su dependencia', 'Su dependencia', 'Sí', 'No']
];
