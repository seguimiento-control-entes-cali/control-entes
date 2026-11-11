// Paridad con la 2.x · cumplimiento por secretaría, con los 2.568 radicados de la demo y el código REAL de la 2.x.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import demo from '../../datos/demo/historico.json';
import {
  agruparPorOrganismo,
  filasCsvCumplimiento,
  ordenarCumplimiento,
  porcentaje1,
  radicadosIncumplidos,
  semaforoHistorico,
  UMBRALES,
  type NivelCumplimiento,
  type OrdenCumplimiento
} from '../src/dominio/cumplimiento';
import type { RadicadoHistorico } from '../src/dominio/historico';

const d2 = cargarApp(['aggOrgs', 'sortOrgs', 'semOf', 'pct1', 'SEMP', 'HIST', 'C', 'histFromPayload']) as {
  aggOrgs: (vig: string, niv: string) => unknown[];
  sortOrgs: (l: unknown[]) => unknown[];
  semOf: (ev: number, t: number) => string;
  pct1: (x: number) => string;
  SEMP: Record<string, number>;
  HIST: { rows: RadicadoHistorico[] };
  C: { sort: string; vig: string };
  histFromPayload: (j: unknown) => { rows: RadicadoHistorico[] };
};
const filas = d2.histFromPayload(demo).rows;
d2.HIST.rows = filas;

describe('paridad con la 2.x · cumplimiento por secretaría', () => {
  it('mismos umbrales, semáforo y porcentaje', () => {
    expect({ ...UMBRALES }).toEqual(d2.SEMP);
    for (const ev of [0, 9, 10, 50])
      for (const t of [0, 0.1999, 0.2, 0.3999, 0.4, 0.75, 1])
        expect(semaforoHistorico(ev, t), `${ev} ${t}`).toBe(d2.semOf(ev, t));
    for (const x of [0, 0.1234, 0.5, 0.99999, 1]) expect(porcentaje1(x)).toBe(d2.pct1(x));
  });
  it('mismo ranking para cada vigencia, nivel y orden (incluido el CSV)', () => {
    for (const vig of ['todas', '2024', '2025', '2026'])
      for (const niv of ['principal', 'todos', 'sub'] as NivelCumplimiento[])
        for (const orden of ['inc', 'tasa'] as OrdenCumplimiento[]) {
          d2.C.sort = orden;
          const v2 = d2.sortOrgs(d2.aggOrgs(vig, niv));
          const v3 = ordenarCumplimiento(agruparPorOrganismo(filas, vig, niv), orden);
          expect(JSON.parse(JSON.stringify(v3)), `${vig} ${niv} ${orden}`).toEqual(
            JSON.parse(JSON.stringify(v2))
          );
          expect(filasCsvCumplimiento(v3).length).toBe(v2.length + 1);
        }
  });
  it('radicados incumplidos de un organismo, del mayor al menor retraso', () => {
    const org = agruparPorOrganismo(filas, 'todas', 'principal')[0]?.org ?? '';
    const r = radicadosIncumplidos(filas, org, 'todas');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every(x => x.org === org && (x.opo === 1 || x.opo === 2))).toBe(true);
    for (let i = 1; i < r.length; i++) expect((r[i - 1]?.ret || 0) >= (r[i]?.ret || 0)).toBe(true);
  });
});
