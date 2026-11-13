// Expediente de dependencia ("Mi dependencia" para secretarios y enlaces). Copia de la 2.x:
// src/js/13-expediente-dependencia.js (vDependencia, svgDonut y svgTrend), statsOf, semColor, mainOrgsAll y MESES de
// 10-historico-y-directorio-datos.js, queueData de 12-centro-de-mando.js y la acción depCsv de 18-acciones.js.
// Paridad comprobada en pruebas/paridad-expediente.test.ts.
import { semaforoHistorico, type SemaforoHistorico } from './cumplimiento';
import { NIVELES_PRINCIPALES, nombreCorto } from './directorio';
import { ocultarDatosPersonales, PILDORA_OPORTUNIDAD, type RadicadoHistorico } from './historico';

export const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
] as const;

/** Color de cada semáforo (semColor de la 2.x). */
export function colorSemaforo(s: SemaforoHistorico | string): string {
  return (
    (
      { rojo: '#FF5C70', amarillo: '#FFC44D', verde: '#38D99A', muestra: '#7C8BA8' } as Record<string, string>
    )[s] ?? '#7C8BA8'
  );
}

export interface EstadisticasDependencia {
  ok: number;
  tar: number;
  sin: number;
  pend: number;
  retSum: number;
  tiemSum: number;
  tiemN: number;
  ev: number;
  inc: number;
  tasa: number;
  ret: number;
  tiem: number;
  sem: SemaforoHistorico;
}

/** statsOf de la 2.x. */
export function estadisticas(filas: readonly RadicadoHistorico[]): EstadisticasDependencia {
  let ok = 0,
    tar = 0,
    sin = 0,
    pend = 0,
    retSum = 0,
    tiemSum = 0,
    tiemN = 0;
  for (const r of filas) {
    if (r.opo === 0) ok++;
    else if (r.opo === 1) {
      tar++;
      retSum += r.ret || 0;
    } else if (r.opo === 2) sin++;
    else if (r.opo === 3) pend++;
    if (r.tiem != null && r.tiem >= 0 && r.opo <= 1) {
      tiemSum += r.tiem;
      tiemN++;
    }
  }
  const ev = ok + tar + sin,
    inc = tar + sin,
    tasa = ev ? inc / ev : 0;
  return {
    ok,
    tar,
    sin,
    pend,
    retSum,
    tiemSum,
    tiemN,
    ev,
    inc,
    tasa,
    ret: tar ? retSum / tar : 0,
    tiem: tiemN ? tiemSum / tiemN : 0,
    sem: semaforoHistorico(ev, tasa)
  };
}

/** Dependencias principales que aparecen en el histórico, en orden alfabético (mainOrgsAll de la 2.x). */
export function dependenciasDelHistorico(filas: readonly RadicadoHistorico[]): string[] {
  const niv: readonly string[] = NIVELES_PRINCIPALES;
  return [...new Set(filas.filter(r => niv.includes(r.niv)).map(r => r.org))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}

/**
 * Dependencia que se abre primero: la que encabeza la cola del Centro de mando (queueData de la 2.x con su vigencia
 * por defecto, 2026): más radicados sin respuesta y luego más por vencer. Si no hay, la primera en orden alfabético.
 */
export function dependenciaInicial(
  filas: readonly RadicadoHistorico[],
  vigencias: readonly number[] = [2026]
): string | undefined {
  const niv: readonly string[] = NIVELES_PRINCIPALES;
  const m = new Map<string, { org: string; venc: number; pend: number }>();
  for (const r of filas) {
    if (!niv.includes(r.niv) || !vigencias.includes(r.v) || (r.opo !== 2 && r.opo !== 3)) continue;
    let o = m.get(r.org);
    if (!o) {
      o = { org: r.org, venc: 0, pend: 0 };
      m.set(r.org, o);
    }
    if (r.opo === 2) o.venc++;
    else o.pend++;
  }
  const cola = [...m.values()].sort((a, b) => b.venc - a.venc || b.pend - a.pend);
  return cola[0]?.org ?? dependenciasDelHistorico(filas)[0];
}

export interface PuntoTendencia {
  label: string;
  short: string;
  ev: number;
  inc: number;
  /** Tasa de incumplimiento del mes; null si hay menos de 3 evaluados. */
  v: number | null;
}

/** Tendencia mensual por mes de vencimiento, últimos 24 meses con datos (vDependencia de la 2.x). */
export function tendenciaMensual(filas: readonly RadicadoHistorico[]): PuntoTendencia[] {
  const porMes: Record<string, { ev: number; inc: number }> = {};
  for (const r of filas) {
    if (!r.fmax || r.opo > 2) continue;
    const k = r.fmax.slice(0, 7);
    const o = (porMes[k] ??= { ev: 0, inc: 0 });
    o.ev++;
    if (r.opo > 0) o.inc++;
  }
  return Object.keys(porMes)
    .sort()
    .slice(-24)
    .map(k => {
      const o = porMes[k] as { ev: number; inc: number };
      const [y = '', m = '1'] = k.split('-');
      const mes = MESES[+m - 1] ?? '';
      return {
        label: mes + ' ' + y,
        short: mes.slice(0, 3) + ' ' + y.slice(2),
        ev: o.ev,
        inc: o.inc,
        v: o.ev >= 3 ? o.inc / o.ev : null
      };
    });
}

/** Los 6 entes con más respuestas tardías o sin respuesta (vDependencia de la 2.x). */
export function incumplimientoPorEnte(filas: readonly RadicadoHistorico[]): [string, number][] {
  const porEnte: Record<string, number> = {};
  for (const r of filas) if (r.opo === 1 || r.opo === 2) porEnte[r.ente] = (porEnte[r.ente] || 0) + 1;
  return Object.entries(porEnte)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
}

/** Sin respuesta y por vencer: primero los vencidos, luego el mayor retraso y la fecha máxima más antigua. */
export function pendientesYVencidos(filas: readonly RadicadoHistorico[]): RadicadoHistorico[] {
  return filas
    .filter(r => r.opo === 2 || r.opo === 3)
    .sort(
      (a, b) =>
        Number(b.opo === 2) - Number(a.opo === 2) ||
        (b.ret || 0) - (a.ret || 0) ||
        String(a.fmax).localeCompare(String(b.fmax))
    );
}

/** Máximo de filas de la tabla de pendientes; el resto está en Histórico de radicados. */
export const MAX_PENDIENTES = 60;

/** Vigencias con datos, de la más reciente a la más antigua. */
export const vigenciasConDatos = (filas: readonly RadicadoHistorico[]) =>
  [...new Set(filas.map(r => r.v))].sort((a, b) => b - a);

/** Número con una coma decimal (toFixed(1) de la 2.x). */
export const decimal1 = (x: number) => x.toFixed(1).replace('.', ',');

/** Nombre del archivo del reporte (depCsv de la 2.x). */
export const archivoReporte = (org: string) => 'reporte_' + nombreCorto(org).replace(/\W+/g, '_') + '.csv';

/** Filas del reporte de la dependencia, con encabezado (depCsv de la 2.x). */
export function filasReporte(filas: readonly RadicadoHistorico[], org: string): unknown[][] {
  return [
    [
      'Vigencia',
      'N.º radicación ente',
      'Ente',
      'Asunto',
      'Fecha máxima',
      'Fecha respuesta',
      'ORFEO respuesta',
      'Oportunidad',
      'Retraso (días hábiles)'
    ],
    ...filas
      .filter(r => r.org === org)
      .map(r => [
        r.v,
        r.rad,
        r.ente,
        ocultarDatosPersonales(r.asu),
        r.fmax,
        r.fresp,
        r.orfR,
        PILDORA_OPORTUNIDAD[r.opo]?.[1],
        r.ret
      ])
  ];
}

/** Geometría del anillo de "a tiempo" (svgDonut de la 2.x). */
export function anillo(p: number) {
  const r = 52,
    C = 2 * Math.PI * r;
  return { r, C, off: C * (1 - Math.max(0, Math.min(1, p))) };
}
