// Planes de mejoramiento: QUIÉN HACE QUÉ (script 28, pedido de Control Interno del 17-nov-2026).
// La dependencia dueña del hallazgo formula el análisis de causa y las acciones y los envía; Control Interno
// valida o devuelve con observación; nadie se valida a sí mismo. Son las mismas reglas que aplica la base de
// datos (pm_hallazgos_rol_guard, pm_enviar_formulacion, pm_revisar_formulacion): aquí se usan para mostrar
// los botones correctos y en la demostración.
import type { Accion, Hallazgo } from './planes';

export type EstadoFormulacion = 'borrador' | 'enviado' | 'validado' | 'devuelto';

export const ESTADOS_FORMULACION: Record<EstadoFormulacion, { texto: string; clase: string; ayuda: string }> =
  {
    borrador: {
      texto: 'En formulación',
      clase: 'amarillo',
      ayuda: 'La dependencia está formulando el análisis de causa y las acciones.'
    },
    enviado: {
      texto: 'En revisión de Control Interno',
      clase: 'neutral',
      ayuda: 'La dependencia lo envió; Control Interno lo valida o lo devuelve.'
    },
    devuelto: {
      texto: 'Devuelto para ajustes',
      clase: 'rojo',
      ayuda: 'Control Interno pidió ajustes: la dependencia corrige y lo vuelve a enviar.'
    },
    validado: {
      texto: 'Validado por Control Interno',
      clase: 'verde',
      ayuda: 'Formulación validada: la dependencia puede cargarlo en el SIA Contralorías.'
    }
  };

export const estadoDe = (h: Pick<Hallazgo, 'formulacion_estado'>): EstadoFormulacion =>
  (h.formulacion_estado as EstadoFormulacion) || 'validado';

const DEPENDENCIA = ['secretario', 'enlace'];

/** ¿Puede escribir el análisis de causa y las acciones de este hallazgo? */
export function puedeFormular(
  h: Pick<Hallazgo, 'dependencia_id' | 'formulacion_estado'>,
  rol: string,
  depPropia: number | null
): boolean {
  if (rol === 'admin') return true;
  return (
    DEPENDENCIA.includes(rol) &&
    depPropia != null &&
    String(h.dependencia_id ?? '') === String(depPropia) &&
    ['borrador', 'devuelto'].includes(estadoDe(h))
  );
}

/** ¿Puede validar o devolver la formulación? (Control Interno o el Super administrador, cuando está enviada) */
export const puedeRevisarFormulacion = (h: Pick<Hallazgo, 'formulacion_estado'>, rol: string) =>
  ['admin', 'control_interno'].includes(rol) && estadoDe(h) === 'enviado';

/** ¿Puede enviarla a Control Interno? (la dependencia dueña, o el admin, solo en borrador o devuelto) */
export const puedeEnviar = (
  h: Pick<Hallazgo, 'dependencia_id' | 'formulacion_estado'>,
  rol: string,
  depPropia: number | null
) => ['borrador', 'devuelto'].includes(estadoDe(h)) && puedeFormular(h, rol, depPropia);

/**
 * ¿El hallazgo es del flujo de formulación? Los de planes anteriores al script 28 quedaron «validados» sin haber
 * pasado por la app (sin análisis ni revisión): para ellos no se muestra el bloque de formulación.
 */
export const enFlujoFormulacion = (
  h: Pick<Hallazgo, 'formulacion_estado' | 'formulacion_revisado_at' | 'causa_metodo'>
) => estadoDe(h) !== 'validado' || !!h.formulacion_revisado_at || !!h.causa_metodo;

/**
 * ¿Ya se pueden reportar avances de las acciones de este hallazgo? Solo cuando su formulación está validada por
 * Control Interno (orden del proceso: formular → enviar → validar → ejecutar y reportar). Sin hallazgo, sí.
 */
export const reportarHabilitado = (h: Pick<Hallazgo, 'formulacion_estado'> | null | undefined) =>
  !h || estadoDe(h) === 'validado';

export type PasoDependencia = 'formular' | 'corregir' | 'esperar' | 'sia';

/** Lo que le toca hacer a la dependencia con un hallazgo de su flujo de formulación (null: nada pendiente). */
export function pasoDependencia(
  h: Pick<Hallazgo, 'formulacion_estado' | 'formulacion_revisado_at' | 'causa_metodo' | 'sia_cargado_at'>
): PasoDependencia | null {
  const e = estadoDe(h);
  if (e === 'borrador') return 'formular';
  if (e === 'devuelto') return 'corregir';
  if (e === 'enviado') return 'esperar';
  return h.formulacion_revisado_at && !h.sia_cargado_at ? 'sia' : null;
}

/** Lo que falta para enviar (vacío: se puede enviar). Mismos requisitos que pm_enviar_formulacion. */
export function faltaParaEnviar(
  h: Pick<Hallazgo, 'id' | 'causa_metodo' | 'causa_raiz'>,
  acciones: readonly Pick<Accion, 'hallazgo_id'>[]
): string[] {
  const f: string[] = [];
  if (!h.causa_metodo) f.push('elegir la herramienta del análisis de causa');
  if ((h.causa_raiz ?? '').trim().length < 10) f.push('escribir la causa raíz (mínimo 10 caracteres)');
  if (!acciones.some(a => a.hallazgo_id === h.id)) f.push('formular al menos una acción');
  return f;
}

/** Campos que cambia cada paso (los usa la demostración; en Supabase los cambian las funciones del script 28). */
export function enviar(
  h: Hallazgo,
  acciones: readonly Accion[],
  usuario: string,
  ahora: string
): Partial<Hallazgo> {
  const falta = faltaParaEnviar(h, acciones);
  if (falta.length) throw new Error('Falta ' + falta.join(', '));
  if (!['borrador', 'devuelto'].includes(estadoDe(h)))
    throw new Error('Este hallazgo ya fue enviado o validado');
  return { formulacion_estado: 'enviado', formulacion_enviado_por: usuario, formulacion_enviado_at: ahora };
}
export function revisar(
  h: Hallazgo,
  estado: 'validado' | 'devuelto',
  observacion: string,
  usuario: string,
  ahora: string
): Partial<Hallazgo> {
  if (estadoDe(h) !== 'enviado') throw new Error('La dependencia aún no ha enviado este hallazgo a revisión');
  if (estado === 'devuelto' && observacion.trim().length < 5)
    throw new Error('Para devolverlo escriba la observación con los ajustes que debe hacer la dependencia');
  return {
    formulacion_estado: estado,
    formulacion_obs: observacion.trim(),
    formulacion_revisado_por: usuario,
    formulacion_revisado_at: ahora
  };
}

export const EVALUACIONES_CGSC = [
  ['efectiva', 'Efectiva'],
  ['parcialmente_efectiva', 'Parcialmente efectiva'],
  ['no_efectiva', 'No efectiva']
] as const;
