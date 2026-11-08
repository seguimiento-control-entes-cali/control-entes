// Roles de la aplicación. Los nombres vienen de public.profiles.rol (supabase/01_schema.sql) y los textos de
// ROLES en src/js/02-utilidades.js de la 2.x. Quién ve qué lo decide la base de datos (RLS); aquí solo se usa
// para mostrar el menú correcto, nunca como control de seguridad.

export const ROLES = ['admin', 'alcalde', 'secretario', 'enlace', 'control_interno'] as const;
export type Rol = (typeof ROLES)[number];

export const NOMBRE_ROL: Readonly<Record<Rol, string>> = {
  admin: 'Super administrador',
  alcalde: 'Alcalde / Despacho',
  secretario: 'Secretario(a) / Director(a)',
  enlace: 'Enlace operativo',
  control_interno: 'Control Interno'
};

/** Roles de supervisión: ven todas las dependencias (políticas req_read, hist_read… de la base). */
const SUPERVISION: ReadonlySet<Rol> = new Set<Rol>(['admin', 'alcalde', 'control_interno']);

export function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

/** true si el rol ve todas las dependencias; false si solo la suya (secretario y enlace). */
export function esSupervision(rol: Rol): boolean {
  return SUPERVISION.has(rol);
}
