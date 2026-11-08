// Semáforo de un requerimiento. Porte de decorate() en src/js/05-reglas-de-negocio.js de la 2.x:
// cerrado → verde; abierto con dias_rojo días o menos para la fecha límite (o vencido) → rojo; si no, amarillo.
// "hoy" se recibe como dato (la fecha de Colombia, ver fechaColombia) para que la regla sea pura y comprobable.
import { diasEntre, type FechaISO } from './fechas';

export type Semaforo = 'rojo' | 'amarillo' | 'verde';
export type EstadoRequerimiento = 'abierto' | 'cerrado';

/** Umbral por defecto de public.config.dias_rojo (supabase/01_schema.sql). */
export const DIAS_ROJO_POR_DEFECTO = 5;

/** Textos del semáforo (SEM de la 2.x). */
export const ETIQUETA_SEMAFORO: Readonly<Record<Semaforo, string>> = {
  rojo: 'Crítico',
  amarillo: 'En término',
  verde: 'Cerrado'
};

export interface ResultadoSemaforo {
  /** Días de calendario que faltan para la fecha límite (negativo si ya pasó). */
  dias: number;
  semaforo: Semaforo;
  /** Abierto y con la fecha límite ya pasada. */
  vencido: boolean;
}

export function calcularSemaforo(
  req: { estado: EstadoRequerimiento; fechaLimite: FechaISO },
  hoy: FechaISO,
  diasRojo: number = DIAS_ROJO_POR_DEFECTO
): ResultadoSemaforo {
  const dias = diasEntre(hoy, req.fechaLimite);
  // `|| 5` como en la 2.x: un umbral 0 o vacío usa el valor por defecto
  const umbral = diasRojo || DIAS_ROJO_POR_DEFECTO;
  const semaforo: Semaforo = req.estado === 'cerrado' ? 'verde' : dias <= umbral ? 'rojo' : 'amarillo';
  return { dias, semaforo, vencido: req.estado === 'abierto' && dias < 0 };
}
