// Paridad con la 2.x · Centro de mando, con los radicados de la demo y el código REAL de la 2.x (monthsList,
// windowStatsByOrg, queueData, semOf y statsOf de src/js/09, 10 y 12).
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import demo from '../../datos/demo/historico.json';
import { semaforoHistorico, UMBRALES } from '../src/dominio/cumplimiento';
import { estadisticas } from '../src/dominio/expediente';
import type { RadicadoHistorico } from '../src/dominio/historico';
import {
  cifrasMando,
  cintaSeguimiento,
  colaAccion,
  enteConMasSinRespuesta,
  estadisticasVentana,
  finVentana,
  mesesTablero,
  ordenTablero,
  pintarTablero,
  VENTANAS
} from '../src/dominio/mando';

const CORTE = '2026-11-01';
const d2 = cargarApp([
  'monthsList',
  'windowStatsByOrg',
  'queueData',
  'semOf',
  'statsOf',
  'HIST',
  'TM',
  'Q',
  'histFromPayload'
]) as {
  monthsList: () => { key: string; end: string; label: string }[];
  windowStatsByOrg: (end: string) => Map<string, { ok: number; inc: number }>;
  queueData: () => unknown[];
  semOf: (ev: number, t: number) => string;
  statsOf: (f: RadicadoHistorico[]) => unknown;
  HIST: { rows: RadicadoHistorico[]; corte: string };
  TM: { ventana: number };
  Q: { vigs: Record<number, boolean> };
  histFromPayload: (j: unknown) => { rows: RadicadoHistorico[] };
};
const filas = d2.histFromPayload(demo).rows;
d2.HIST.rows = filas;
d2.HIST.corte = CORTE;
const plano = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

describe('paridad con la 2.x · Centro de mando', () => {
  const meses = mesesTablero(filas, CORTE);

  it('mismos meses de la máquina del tiempo', () => {
    expect(meses.length).toBeGreaterThan(12);
    expect(meses).toEqual(d2.monthsList());
  });

  it('para cada ventana y cada mes: mismas cifras por dependencia y mismo color', () => {
    for (const v of VENTANAS) {
      d2.TM.ventana = v;
      for (const mes of meses) {
        const fin = finVentana(mes, CORTE);
        const nuestra = estadisticasVentana(filas, fin, v);
        expect([...nuestra.entries()], `${v} meses · ${mes.key}`).toEqual([
          ...d2.windowStatsByOrg(fin).entries()
        ]);
        const t = pintarTablero(ordenTablero(filas, nuestra), nuestra);
        for (const k of t.teclas) {
          const esperado = k.ev < 3 ? 'gris' : d2.semOf(Math.max(k.ev, UMBRALES.min), k.tasa);
          expect(k.sem, k.org).toBe(esperado);
        }
        expect(t.rojo + t.amarillo + t.verde + t.gris).toBe(t.teclas.length);
      }
    }
  });

  it('el último mes de la demo tiene dependencias en varios colores', () => {
    const fin = finVentana(meses[meses.length - 1] as (typeof meses)[number], CORTE);
    const ws = estadisticasVentana(filas, fin, 6);
    const t = pintarTablero(ordenTablero(filas, ws), ws);
    expect(t.rojo + t.amarillo + t.verde).toBeGreaterThan(0);
    // Orden: de mayor a menor incumplimiento; sin muestra al final
    const tasas = t.teclas.filter(k => k.ev >= 3).map(k => k.tasa);
    expect(tasas).toEqual([...tasas].sort((a, b) => b - a));
  });

  it('misma cola de acción y mismas cifras para cada combinación de vigencias', () => {
    const combos = [[2026], [2025], [2024], [2026, 2025], [2026, 2025, 2024], []];
    for (const vigs of combos) {
      d2.Q.vigs = { 2026: vigs.includes(2026), 2025: vigs.includes(2025), 2024: vigs.includes(2024) };
      expect(colaAccion(filas, vigs), vigs.join()).toEqual(d2.queueData());
    }
    d2.Q.vigs = { 2026: true, 2025: false, 2024: false };
    const c = cifrasMando(filas, [2026]);
    expect(plano(c.g)).toEqual(
      plano(d2.statsOf(filas.filter(r => ['Secretaría', 'Departamento', 'UAE', 'Despacho'].includes(r.niv))))
    );
    expect(plano(estadisticas(filas))).toEqual(plano(d2.statsOf(filas)));
    expect(c.venc).toBeGreaterThan(0);
  });

  it('cinta y ente con más pendientes: los mismos criterios de la 2.x', () => {
    const cinta = cintaSeguimiento(filas, [2026]);
    const porVencer = cinta.filter(r => r.opo === 3);
    const vencidos = cinta.filter(r => r.opo === 2);
    expect(porVencer.length).toBeLessThanOrEqual(14);
    expect(vencidos.length).toBeLessThanOrEqual(10);
    expect(vencidos.every(r => r.v === 2026)).toBe(true);
    expect(enteConMasSinRespuesta(filas, [2026])?.[1]).toBeGreaterThan(0);
  });

  it('semáforo: con 3 a 9 casos ya hay color (igual que paintTreemap)', () => {
    expect(semaforoHistorico(Math.max(3, UMBRALES.min), 0.5)).toBe(d2.semOf(Math.max(3, 10), 0.5));
  });
});
