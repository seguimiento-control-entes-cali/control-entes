// Fechas de calendario (AAAA-MM-DD) sin hora ni zona horaria. Reglas puras: plan §7.3.
// Se calcula con la fecha en UTC a propósito: así el resultado no depende de la zona horaria del equipo
// (la 2.x usa la hora local; la paridad se comprueba en pruebas/paridad-2x.test.ts en UTC y en America/Bogota).

/** Fecha de calendario en formato AAAA-MM-DD. */
export type FechaISO = string;

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Convierte AAAA-MM-DD (también acepta un texto más largo, como un timestamp) en sus partes. */
export function partes(fecha: FechaISO): { anio: number; mes: number; dia: number } {
  const m = RE_FECHA.exec(String(fecha).slice(0, 10));
  if (!m) throw new Error(`Fecha no válida: ${fecha}`);
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

const aDia = (fecha: FechaISO) => {
  const { anio, mes, dia } = partes(fecha);
  return Date.UTC(anio, mes - 1, dia) / 86400000;
};
const deDia = (n: number): FechaISO => new Date(n * 86400000).toISOString().slice(0, 10);

/** Fecha que resulta de sumar n días de calendario (n puede ser negativo). */
export function sumarDias(fecha: FechaISO, n: number): FechaISO {
  return deDia(aDia(fecha) + n);
}

/** Días de calendario desde `desde` hasta `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return aDia(hasta) - aDia(desde);
}

/** Día de la semana: 0 domingo … 6 sábado. */
export function diaSemana(fecha: FechaISO): number {
  return new Date(aDia(fecha) * 86400000).getUTCDay();
}

/** Arma AAAA-MM-DD a partir de año, mes (1-12) y día. */
export function fecha(anio: number, mes: number, dia: number): FechaISO {
  return deDia(Date.UTC(anio, mes - 1, dia) / 86400000);
}

/** Fecha de Colombia (UTC-5 todo el año, sin horario de verano) de un instante; igual a public.fecha_colombia (script 22). */
export function fechaColombia(instante: Date): FechaISO {
  return new Date(instante.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** DD/MM/AAAA, o "—" si no hay fecha (igual a fmtD de la 2.x). */
export function formatoCorto(f: FechaISO | null | undefined): string {
  return f ? String(f).slice(0, 10).split('-').reverse().join('/') : '—';
}
