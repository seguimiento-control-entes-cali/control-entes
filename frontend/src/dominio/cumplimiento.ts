// Cumplimiento por secretaría (ranking de oportunidad sobre el histórico). Copia de la 2.x:
// src/js/09-cumplimiento-e-historico.js (SEMP, semOf, pct1, aggOrgs, sortOrgs, vCumplimiento, drillModal) y la acción
// cumCsv de 18-acciones.js. Paridad comprobada en pruebas/paridad-cumplimiento.test.ts.
import type { RadicadoHistorico } from './historico';

/** Umbrales del semáforo histórico (los mismos del Excel de control). */
export const UMBRALES = { verde_lt: 0.2, rojo_ge: 0.4, min: 10 } as const;
export type SemaforoHistorico = 'verde' | 'amarillo' | 'rojo' | 'muestra';

export function semaforoHistorico(evaluados: number, tasa: number): SemaforoHistorico {
  return evaluados < UMBRALES.min
    ? 'muestra'
    : tasa >= UMBRALES.rojo_ge
      ? 'rojo'
      : tasa < UMBRALES.verde_lt
        ? 'verde'
        : 'amarillo';
}

/** Porcentaje con un decimal y coma decimal (pct1 de la 2.x). */
export const porcentaje1 = (x: number) => (x * 100).toFixed(1).replace('.', ',') + '%';

export interface CumplimientoOrganismo {
  org: string;
  niv: string;
  ok: number;
  tar: number;
  sin: number;
  pend: number;
  retSum: number;
  y: Record<2024 | 2025 | 2026, number>;
  ev: number;
  inc: number;
  tasa: number;
  ret: number;
  sem: SemaforoHistorico;
}
export type NivelCumplimiento = 'principal' | 'todos' | 'sub';
export type OrdenCumplimiento = 'inc' | 'tasa';

/** aggOrgs de la 2.x: agrupa por organismo las respuestas a tiempo, tardías, sin respuesta y pendientes. */
export function agruparPorOrganismo(
  filas: readonly RadicadoHistorico[],
  vig: string,
  niv: NivelCumplimiento
): CumplimientoOrganismo[] {
  const m = new Map<string, CumplimientoOrganismo>();
  for (const r of filas) {
    if (vig !== 'todas' && r.v !== +vig) continue;
    if (r.org === 'Sin dato' || r.org === 'Todos los organismos' || r.niv === 'Otro') continue;
    if (niv === 'principal' && r.niv === 'Subunidad') continue;
    if (niv === 'sub' && r.niv !== 'Subunidad') continue;
    let o = m.get(r.org);
    if (!o) {
      o = {
        org: r.org,
        niv: r.niv,
        ok: 0,
        tar: 0,
        sin: 0,
        pend: 0,
        retSum: 0,
        y: { 2024: 0, 2025: 0, 2026: 0 },
        ev: 0,
        inc: 0,
        tasa: 0,
        ret: 0,
        sem: 'muestra'
      };
      m.set(r.org, o);
    }
    const anio = r.v as 2024 | 2025 | 2026;
    if (r.opo === 0) o.ok++;
    else if (r.opo === 1) {
      o.tar++;
      o.retSum += r.ret || 0;
      o.y[anio] = (o.y[anio] ?? 0) + 1;
    } else if (r.opo === 2) {
      o.sin++;
      o.y[anio] = (o.y[anio] ?? 0) + 1;
    } else if (r.opo === 3) o.pend++;
  }
  return [...m.values()]
    .map(o => {
      o.ev = o.ok + o.tar + o.sin;
      o.inc = o.tar + o.sin;
      o.tasa = o.ev ? o.inc / o.ev : 0;
      o.ret = o.tar ? o.retSum / o.tar : 0;
      o.sem = semaforoHistorico(o.ev, o.tasa);
      return o;
    })
    .filter(o => o.ev > 0);
}

/** sortOrgs de la 2.x: por número de incumplimientos o por porcentaje (las de muestra insuficiente al final). */
export function ordenarCumplimiento(lista: CumplimientoOrganismo[], orden: OrdenCumplimiento) {
  if (orden === 'tasa')
    return lista.sort(
      (a, b) => Number(a.sem === 'muestra') - Number(b.sem === 'muestra') || b.tasa - a.tasa || b.inc - a.inc
    );
  return lista.sort((a, b) => b.inc - a.inc || b.tasa - a.tasa);
}

/** Totales de la parte de arriba (evaluados, a tiempo, tarde, sin respuesta, % y su semáforo). */
export function totalesCumplimiento(lista: readonly CumplimientoOrganismo[]) {
  const t = lista.reduce(
    (a, o) => ({ ok: a.ok + o.ok, tar: a.tar + o.tar, sin: a.sin + o.sin, pend: a.pend + o.pend }),
    { ok: 0, tar: 0, sin: 0, pend: 0 }
  );
  const ev = t.ok + t.tar + t.sin,
    inc = t.tar + t.sin,
    tasa = ev ? inc / ev : 0;
  return { ...t, ev, inc, tasa, sem: semaforoHistorico(ev, tasa) };
}

/** Radicados tardíos o sin respuesta de un organismo, del mayor al menor retraso (drillModal de la 2.x). */
export function radicadosIncumplidos(filas: readonly RadicadoHistorico[], org: string, vig: string) {
  return filas
    .filter(r => r.org === org && (r.opo === 1 || r.opo === 2) && (vig === 'todas' || r.v === +vig))
    .sort((a, b) => (b.ret || 0) - (a.ret || 0));
}

/** Filas de cumplimiento_por_organismo.csv (acción cumCsv de la 2.x). */
export function filasCsvCumplimiento(lista: readonly CumplimientoOrganismo[]): unknown[][] {
  return [
    [
      'Puesto',
      'Organismo',
      'Tipo',
      'Evaluados',
      'A tiempo',
      'Tardías',
      'Sin respuesta vencida',
      'Incumplimientos',
      '% incumplimiento',
      'Semáforo',
      'Retraso promedio (días hábiles)'
    ],
    ...lista.map((o, i) => [
      i + 1,
      o.org,
      o.niv,
      o.ev,
      o.ok,
      o.tar,
      o.sin,
      o.inc,
      porcentaje1(o.tasa),
      o.sem.toUpperCase(),
      o.tar ? o.ret.toFixed(1) : ''
    ])
  ];
}
