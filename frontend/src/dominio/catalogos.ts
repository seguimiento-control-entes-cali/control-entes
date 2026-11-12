// Catálogos: entes de control y dependencias. Copia de la 2.x: src/js/08-vistas-catalogos-y-seguridad.js (vCatalog,
// catModal y saveCat). Solo el Super administrador agrega o edita; la base lo exige además por RLS (entes_ins,
// entes_upd, deps_ins y deps_upd en supabase/01_schema.sql).
import type { Rol } from './roles';

export type TablaCatalogo = 'entes' | 'dependencias';

/** Tipos de ente que ofrece la ventana de la 2.x, en el mismo orden (el primero queda elegido en uno nuevo). */
export const TIPOS_ENTE = ['Fiscal', 'Ministerio Público', 'Político', 'Disciplinario', 'Otro'] as const;

/** Columnas de la tabla: [campo, título] (cols de vCatalog). */
export const COLUMNAS_CATALOGO = {
  entes: [
    ['nombre', 'Nombre'],
    ['sigla', 'Sigla'],
    ['tipo', 'Tipo']
  ],
  dependencias: [
    ['nombre', 'Dependencia'],
    ['secretarioNombre', 'Secretario(a)'],
    ['correo', 'Correo'],
    ['telefono', 'Teléfono']
  ]
} as const;

/** Campos de la ventana de agregar o editar: [campo, etiqueta] (f de catModal). */
export const CAMPOS_CATALOGO = {
  entes: [
    ['nombre', 'Nombre completo'],
    ['sigla', 'Sigla'],
    ['tipo', 'Tipo']
  ],
  dependencias: [
    ['nombre', 'Dependencia'],
    ['secretarioNombre', 'Secretario(a) de Despacho'],
    ['correo', 'Correo institucional'],
    ['telefono', 'Teléfono celular (para WhatsApp)']
  ]
} as const;

export const TITULO_VENTANA = (tabla: TablaCatalogo, editar: boolean) =>
  (editar ? 'Editar ' : 'Agregar ') + (tabla === 'entes' ? 'ente de control' : 'dependencia');

export const puedeEditarCatalogos = (rol: Rol) => rol === 'admin';

/** Texto de una celda: vacío se muestra como "—" (x[c] || '—' de la 2.x). */
export const textoCelda = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

/**
 * Limpia lo escrito (quita espacios al inicio y al final, igual que saveCat) y valida que tenga nombre.
 * Devuelve el registro limpio o el mensaje de error de la 2.x.
 */
export function limpiarCatalogo<T extends { nombre: string }>(
  o: T
): { ok: true; valor: T } | { ok: false; error: string } {
  const valor = Object.fromEntries(
    Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])
  ) as T;
  if (!valor.nombre) return { ok: false, error: 'El nombre es obligatorio' };
  return { ok: true, valor };
}
