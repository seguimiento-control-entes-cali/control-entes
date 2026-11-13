// Paridad con la 2.x · Informe ejecutivo, con los radicados de la demo y el código REAL de la 2.x (reportModel,
// narrative y sha256Hex de src/js/16 y 02) para cada vigencia y cada dependencia.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import demo from '../../datos/demo/historico.json';
import { sha256Hex } from '../src/dominio/auditoria';
import { dependenciasDelHistorico } from '../src/dominio/expediente';
import { fechaDeCorte, type RadicadoHistorico } from '../src/dominio/historico';
import { filasCsvInforme, modeloInforme, narrativa, nombrePdf, textoHuella } from '../src/dominio/informe';

const d2 = cargarApp([
  'reportModel',
  'narrative',
  'sha256Hex',
  'OPO_PILL',
  'HIST',
  'RP',
  'histFromPayload'
]) as {
  reportModel: () => unknown;
  narrative: (m: unknown) => string[];
  sha256Hex: (s: string) => Promise<string>;
  OPO_PILL: [string, string][];
  HIST: { rows: RadicadoHistorico[]; corte: string };
  RP: { vig: string; org: string; casos: boolean };
  histFromPayload: (j: unknown) => { rows: RadicadoHistorico[] };
};
const filas = d2.histFromPayload(demo).rows;
const CORTE = fechaDeCorte(filas);
d2.HIST.rows = filas;
d2.HIST.corte = CORTE;
const plano = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

describe('paridad con la 2.x · Informe ejecutivo', () => {
  const orgs = ['', ...dependenciasDelHistorico(filas)];
  const vigs = ['todas', '2026', '2025', '2024'];

  it('mismo modelo y misma narrativa para cada vigencia y cada dependencia', () => {
    let n = 0;
    for (const vig of vigs)
      for (const org of orgs) {
        d2.RP.vig = vig;
        d2.RP.org = org;
        const m2 = d2.reportModel();
        const m3 = modeloInforme(filas, CORTE, { vig, org });
        expect(plano(m3), `${vig} · ${org || 'todas'}`).toEqual(plano(m2));
        expect(narrativa(m3, vig), `${vig} · ${org || 'todas'}`).toEqual(d2.narrative(m2));
        n++;
      }
    expect(n).toBeGreaterThan(40);
  });

  it('la narrativa general nombra las 3 dependencias con más incumplimientos y compara trimestres', () => {
    const m = modeloInforme(filas, CORTE, { vig: 'todas', org: '' });
    const p = narrativa(m, 'todas');
    expect(p[0]).toMatch(/^En las vigencias 2024, 2025 y 2026 se evaluaron /);
    expect(p[1]).toMatch(/^Las dependencias con mayor número de incumplimientos son: /);
    expect(p.some(x => x.startsWith('En los últimos tres meses'))).toBe(true);
  });

  it('misma huella SHA-256 de los datos', async () => {
    for (const vig of vigs) {
      const m = modeloInforme(filas, CORTE, { vig, org: '' });
      expect(sha256Hex(textoHuella(m.rows))).toBe(await d2.sha256Hex(textoHuella(m.rows)));
    }
  });

  it('CSV de datos con la oportunidad escrita como en la 2.x y nombre del PDF', () => {
    const m = modeloInforme(filas, CORTE, { vig: '2026', org: '' });
    const csv = filasCsvInforme(m.rows);
    expect(csv.length).toBe(m.rows.length + 1);
    m.rows.forEach((r, i) => expect(csv[i + 1]?.[7]).toBe(d2.OPO_PILL[r.opo]?.[1]));
    expect(nombrePdf(CORTE, '')).toBe('Informe_Ejecutivo_Cumplimiento_' + CORTE);
    expect(nombrePdf(CORTE, 'Secretaría de Cultura')).toBe(
      'Informe_Ejecutivo_Cumplimiento_' + CORTE + '_Cultura'
    );
  });
});
