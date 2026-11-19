// Informe de incumplimiento de los planes de mejoramiento por dependencia (pedido de Control Interno, 18-nov-2026):
// de mayor a menor incumplimiento, en número y en porcentaje, con las acciones que vencen pronto (alertas).
// Usa el mismo estado de cada acción que el resto del módulo (estadoAccion: cumplida, vencida, por vencer en
// ALERTA_DIAS días, en término).
//   % de incumplimiento = vencidas sin cumplir ÷ acciones cuyo plazo ya terminó (vencidas + cumplidas con fecha pasada)
import { diasEntre } from './fechas';
import { ALERTA_DIAS, estadoAccion, indicadores, type Accion, type Avance } from './planes';

export interface FilaIncumplimiento {
  dependencia_id: number | null;
  dependencia: string;
  acciones: number;
  cumplidas: number;
  vencidas: number;
  proximas: number;
  /** Acciones cuyo plazo ya terminó (base del porcentaje). */
  plazoVencido: number;
  /** Vencidas ÷ plazo vencido (0 a 1); null si ninguna acción ha llegado a su fecha. */
  pctIncumplimiento: number | null;
  /** Cumplimiento de metas vencidas (CPM) del módulo, para comparar. */
  pctCumplimiento: number | null;
}

export function incumplimientoPorDependencia(
  acciones: readonly Accion[],
  avances: readonly Avance[],
  hoy: string,
  nombre: (id: number | null) => string
): FilaIncumplimiento[] {
  const grupos = new Map<string, Accion[]>();
  for (const a of acciones) {
    const k = a.dependencia_id == null ? 'sin' : String(a.dependencia_id);
    grupos.set(k, [...(grupos.get(k) ?? []), a]);
  }
  const filas: FilaIncumplimiento[] = [];
  for (const [k, l] of grupos) {
    const id = k === 'sin' ? null : Number(k);
    let cumplidas = 0,
      vencidas = 0,
      proximas = 0,
      plazoVencido = 0;
    for (const a of l) {
      const e = estadoAccion(a, hoy);
      if (e.k === 'cumplida') cumplidas++;
      if (e.k === 'vencida') vencidas++;
      if (e.k === 'proxima') proximas++;
      if (a.fecha_fin && diasEntre(hoy, a.fecha_fin) < 0) plazoVencido++;
    }
    filas.push({
      dependencia_id: id,
      dependencia: (id == null ? '' : nombre(id)) || 'Sin dependencia asignada',
      acciones: l.length,
      cumplidas,
      vencidas,
      proximas,
      plazoVencido,
      pctIncumplimiento: plazoVencido ? vencidas / plazoVencido : null,
      pctCumplimiento: indicadores(l, hoy, avances).cpm
    });
  }
  // De mayor a menor incumplimiento: número de vencidas, luego porcentaje, luego las que vencen pronto
  return filas.sort(
    (a, b) =>
      b.vencidas - a.vencidas ||
      (b.pctIncumplimiento ?? -1) - (a.pctIncumplimiento ?? -1) ||
      b.proximas - a.proximas ||
      a.dependencia.localeCompare(b.dependencia)
  );
}

/** Totales de la administración. */
export function totalIncumplimiento(filas: readonly FilaIncumplimiento[]) {
  const s = (k: 'acciones' | 'cumplidas' | 'vencidas' | 'proximas' | 'plazoVencido') =>
    filas.reduce((t, f) => t + f[k], 0);
  const plazoVencido = s('plazoVencido');
  return {
    acciones: s('acciones'),
    cumplidas: s('cumplidas'),
    vencidas: s('vencidas'),
    proximas: s('proximas'),
    plazoVencido,
    pctIncumplimiento: plazoVencido ? s('vencidas') / plazoVencido : null,
    conVencidas: filas.filter(f => f.vencidas > 0).length,
    conProximas: filas.filter(f => f.proximas > 0).length
  };
}

const pct = (v: number | null) =>
  v == null ? '—' : (Math.round(v * 1000) / 10).toLocaleString('es-CO') + ' %';

/** Filas para descargar (CSV que abre Excel). */
export function filasInformeIncumplimiento(filas: readonly FilaIncumplimiento[], hoy: string): unknown[][] {
  const t = totalIncumplimiento(filas);
  return [
    ['Informe de incumplimiento de planes de mejoramiento por dependencia · corte ' + hoy],
    [
      'Posición',
      'Dependencia',
      'Acciones',
      'Cumplidas',
      'Vencidas sin cumplir',
      'Plazo ya terminado',
      '% de incumplimiento',
      `Vencen en ${ALERTA_DIAS} días`,
      'Cumplimiento de metas vencidas (CPM)'
    ],
    ...filas.map((f, i) => [
      i + 1,
      f.dependencia,
      f.acciones,
      f.cumplidas,
      f.vencidas,
      f.plazoVencido,
      pct(f.pctIncumplimiento),
      f.proximas,
      pct(f.pctCumplimiento)
    ]),
    [
      '',
      'Total administración',
      t.acciones,
      t.cumplidas,
      t.vencidas,
      t.plazoVencido,
      pct(t.pctIncumplimiento),
      t.proximas,
      ''
    ]
  ];
}
export { pct as pctIncumplimientoTxt };
