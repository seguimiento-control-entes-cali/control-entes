// Seguimiento del DACI (Control Interno) a las metas cumplidas (script 31; pedido verbal de Control Interno,
// 24-nov-2026). En la ficha del plan, debajo de «Cumplimiento de metas vencidas» y antes de la calificación CGSC:
// Control Interno verifica cada meta que la app da por cumplida (avance validado ≥ 100 %).
import { estadoAccion, type Accion } from './planes';

export type EstadoDaci = 'verificada' | 'no_verificada' | 'pendiente';

export const TEXTO_DACI: Record<EstadoDaci, { txt: string; pill: 'verde' | 'rojo' | 'neutral' }> = {
  verificada: { txt: 'Verificada por el DACI', pill: 'verde' },
  no_verificada: { txt: 'No verificada', pill: 'rojo' },
  pendiente: { txt: 'Pendiente de verificar', pill: 'neutral' }
};

export const estadoDaci = (a: Pick<Accion, 'daci_verificacion'>): EstadoDaci =>
  a.daci_verificacion === 'verificada' || a.daci_verificacion === 'no_verificada'
    ? a.daci_verificacion
    : 'pendiente';

/** Acciones del plan cuya meta está cumplida hoy (la misma regla del semáforo de la acción). */
export const metasCumplidas = <A extends Pick<Accion, 'cantidad' | 'avance' | 'fecha_fin'>>(
  acc: readonly A[],
  hoy: string
) => acc.filter(a => estadoAccion(a, hoy).k === 'cumplida');

export interface ResumenDaci {
  cumplidas: number;
  verificadas: number;
  noVerificadas: number;
  pendientes: number;
  /** Verificadas sobre cumplidas (0 a 1), o null si no hay metas cumplidas. */
  pct: number | null;
}

export function resumenDaci(cumplidas: readonly Pick<Accion, 'daci_verificacion'>[]): ResumenDaci {
  const n = (e: EstadoDaci) => cumplidas.filter(a => estadoDaci(a) === e).length;
  const verificadas = n('verificada');
  return {
    cumplidas: cumplidas.length,
    verificadas,
    noVerificadas: n('no_verificada'),
    pendientes: n('pendiente'),
    pct: cumplidas.length ? verificadas / cumplidas.length : null
  };
}

/** Cambios para guardar la verificación (fecha y quién la hizo). `null` en estado: vuelve a pendiente. */
export function cambiosDaci(
  estado: 'verificada' | 'no_verificada' | null,
  fecha: string,
  observacion: string,
  correo: string
) {
  if (!estado) return { daci_verificacion: null, daci_fecha: null, daci_observacion: '', daci_por: '' };
  return {
    daci_verificacion: estado,
    daci_fecha: fecha,
    daci_observacion: observacion.trim(),
    daci_por: correo
  };
}

/** La verificación «No verificada» exige observación (qué falta o por qué no se verificó). */
export const errorDaci = (estado: string, fecha: string, observacion: string): string | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Escriba la fecha de la verificación';
  if (estado === 'no_verificada' && observacion.trim().length < 4)
    return 'Escriba la observación: qué falta o por qué no se verificó';
  return null;
};
