// Actividad y cambios: quién modificó qué, seguimiento de notificaciones, actividad por usuario e informes.
// Copia de la 2.x: src/js/17-actividad.js (TABLA_LBL, ACC_LBL, FIELD_LBL, userLabel, auditWhat, auditDetail,
// vActividad), diff de src/js/04-capa-de-datos.js y shortTxt de src/js/10. Paridad en pruebas/paridad-actividad.test.ts.
import type { EventoAuditoria } from './auditoria';
import { formatoCelular, NIVELES_PRINCIPALES } from './directorio';
import type { RadicadoHistorico } from './historico';

export const ETIQUETA_TABLA: Readonly<Record<string, string>> = {
  requerimientos: 'Requerimiento',
  profiles: 'Cuenta',
  entes: 'Ente de control',
  dependencias: 'Dependencia',
  directorio: 'Directorio',
  notificaciones: 'Notificación',
  alertas_log: 'Escalamiento',
  informes: 'Informe'
};
export const ETIQUETA_ACCION: Readonly<Record<string, string>> = {
  INSERT: 'Creó',
  UPDATE: 'Modificó',
  DELETE: 'Eliminó'
};
export const ETIQUETA_CAMPO: Readonly<Record<string, string>> = {
  estado: 'Estado',
  orfeo_salida: 'ORFEO de salida',
  fecha_cierre: 'Fecha de cierre',
  rol: 'Rol',
  activo: 'Activo',
  dependencia_id: 'Dependencia',
  nombre: 'Nombre',
  cargo: 'Cargo',
  telefono: 'Celular',
  sigla: 'Sigla',
  tipo: 'Tipo',
  correo: 'Correo',
  secretario_nombre: 'Secretario(a)',
  escalado_at: 'Escalado',
  fecha_limite: 'Fecha límite',
  asunto: 'Asunto'
};

/** Texto recortado a n caracteres sin partir palabras (shortTxt de la 2.x). */
export function textoCorto(s: unknown, n: number): string {
  const t = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '...' : t;
}

/** Campos que cambiaron entre dos versiones de un registro: { campo: { de, a } } (diff de la 2.x). */
export function diferencias(a: Record<string, unknown> | null, b: Record<string, unknown> | null) {
  const o: Record<string, { de: unknown; a: unknown }> = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})]))
    if (JSON.stringify((a || {})[k]) !== JSON.stringify((b || {})[k]))
      o[k] = {
        de: (a || {})[k] === undefined ? null : (a as Record<string, unknown>)[k],
        a: (b || {})[k] === undefined ? null : (b as Record<string, unknown>)[k]
      };
  return o;
}

export interface PerfilActividad {
  id: string;
  email: string | null;
  rol: string;
  dependencia_id: number | null;
  activo: boolean;
}

/** Correo de quien hizo el cambio (userLabel de la 2.x). */
export function etiquetaUsuario(perfiles: readonly PerfilActividad[], u: string | null | undefined): string {
  const p = perfiles.find(x => x.id === u || x.email === u);
  return p ? (p.email ?? '') : u === 'sistema' ? 'Sistema' : u || '—';
}

/** "Qué": tipo de registro y su identificación (auditWhat de la 2.x). */
export function queCambio(a: Pick<EventoAuditoria, 'tabla' | 'registro_id' | 'payload'>): string {
  const p = (a.payload || {}) as Record<string, unknown>;
  const id =
    p.radicado ||
    p.email ||
    p.nombre ||
    (p.organismo ? String(p.organismo) + (p.cargo ? ' - ' + String(p.cargo) : '') : '') ||
    p.alcance ||
    p.canal ||
    a.registro_id;
  return `${ETIQUETA_TABLA[a.tabla] || a.tabla}: ${textoCorto(String(id), 70)}`;
}

/** "Detalle del cambio": hasta 4 campos con su valor anterior y el nuevo (auditDetail de la 2.x). */
export function detalleCambio(a: Pick<EventoAuditoria, 'accion' | 'tabla' | 'cambios' | 'payload'>): string {
  const ch = (a.cambios || {}) as Record<string, { de: unknown; a: unknown }>,
    keys = Object.keys(ch).filter(k => !['updated_at', 'updated_by', 'created_at'].includes(k));
  if (a.accion === 'UPDATE' && keys.length)
    return (
      keys
        .slice(0, 4)
        .map(k => {
          const v = (x: unknown) =>
            x == null || x === ''
              ? 'vacío'
              : k === 'telefono'
                ? formatoCelular(String(x))
                : textoCorto(String(x), 38);
          return `${ETIQUETA_CAMPO[k] || k}: ${v(ch[k]?.de)} → ${v(ch[k]?.a)}`;
        })
        .join('; ') + (keys.length > 4 ? ' …' : '')
    );
  if (a.accion === 'INSERT')
    return a.tabla === 'notificaciones'
      ? `Mensaje a ${((a.payload || {}) as Record<string, unknown>).destinatario || '—'}`
      : a.tabla === 'informes'
        ? `Huella ${String(((a.payload || {}) as Record<string, unknown>).huella || '').slice(0, 12)}…`
        : 'Registro nuevo';
  return '';
}

export const tonoAccion = (accion: string) =>
  accion === 'DELETE' ? 'rojo' : accion === 'UPDATE' ? 'amarillo' : 'verde';

export interface FiltroCambios {
  q: string;
  u: string;
  t: string;
  a: string;
}
export function filtrarCambios(
  cambios: readonly EventoAuditoria[],
  perfiles: readonly PerfilActividad[],
  f: FiltroCambios
): EventoAuditoria[] {
  const qq = f.q.toLowerCase();
  return cambios.filter(
    a =>
      (!f.u || etiquetaUsuario(perfiles, a.usuario) === f.u) &&
      (!f.t || a.tabla === f.t) &&
      (!f.a || a.accion === f.a) &&
      (!qq ||
        (queCambio(a) + ' ' + detalleCambio(a) + ' ' + etiquetaUsuario(perfiles, a.usuario))
          .toLowerCase()
          .includes(qq))
  );
}

export interface Notificacion {
  ts: string;
  org: string;
  usuario: string | null;
  n: number;
  /** Destinatario y plantilla (el Informe ejecutivo los muestra). */
  nombre?: string;
  tpl?: string;
}

/**
 * Dependencias principales con radicados sin respuesta (vencidos) en las vigencias elegidas del Centro de mando
 * (en la 2.x, por defecto solo 2026). Igual a la cola que usa la pestaña de seguimiento.
 */
export function pendientesPorDependencia(filas: readonly RadicadoHistorico[], vigencias: readonly number[]) {
  const m = new Map<string, number>();
  for (const r of filas)
    if ((NIVELES_PRINCIPALES as readonly string[]).includes(r.niv) && r.opo === 2 && vigencias.includes(r.v))
      m.set(r.org, (m.get(r.org) || 0) + 1);
  return m;
}

/** Pestaña "Seguimiento de notificaciones" de la 2.x. Las notificaciones vienen de la más nueva a la más vieja. */
export function seguimientoNotificaciones(
  pendientes: ReadonlyMap<string, number>,
  notifs: readonly Notificacion[],
  ahora: number
) {
  const orgs = [...new Set([...pendientes.keys(), ...notifs.map(n => n.org)])];
  return orgs
    .map(o => {
      const last = notifs.find(n => n.org === o),
        cnt = notifs.filter(n => n.org === o).length,
        hoy = pendientes.get(o) || 0;
      const dias = last ? Math.floor((ahora - new Date(last.ts).getTime()) / 864e5) : null;
      const est: readonly ['verde' | 'amarillo' | 'rojo', string] = !last
        ? ['rojo', 'NUNCA NOTIFICADA']
        : hoy === 0
          ? ['verde', 'RESUELTA']
          : hoy < last.n
            ? ['amarillo', 'EN PROGRESO']
            : (dias as number) >= 7
              ? ['rojo', 'SIN ATENDER']
              : ['amarillo', 'EN PLAZO'];
      return { o, last, cnt, hoy, dias, est };
    })
    .sort((a, b) => b.hoy - a.hoy);
}

/** Usuarios que ingresaron en los últimos 7 días (indicador de la 2.x). */
export function activosUltimos7Dias(
  perfiles: readonly PerfilActividad[],
  accesos: Readonly<Record<string, string>>,
  ahora: number
) {
  const hace = new Date(ahora - 7 * 864e5).toISOString();
  return perfiles.filter(p => (accesos[p.id] || accesos[p.email ?? ''] || '') > hace).length;
}
