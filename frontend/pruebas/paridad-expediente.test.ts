// Paridad con la 2.x · Expediente de dependencia, con los radicados de la demo y el código REAL de la 2.x: se ejecuta
// vDependencia de la 2.x para cada dependencia y se compara lo que dibuja con lo que calculan las reglas de la 3.0.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import demo from '../../datos/demo/historico.json';
import { porcentaje1 } from '../src/dominio/cumplimiento';
import {
  colorSemaforo,
  decimal1,
  dependenciaInicial,
  dependenciasDelHistorico,
  estadisticas,
  incumplimientoPorEnte,
  MAX_PENDIENTES,
  pendientesYVencidos,
  tendenciaMensual,
  vigenciasConDatos
} from '../src/dominio/expediente';
import type { RadicadoHistorico } from '../src/dominio/historico';

const d2 = cargarApp([
  'vDependencia',
  'statsOf',
  'semColor',
  'mainOrgsAll',
  'queueData',
  'HIST',
  'X',
  'histFromPayload'
]) as {
  vDependencia: (c: { innerHTML: string }) => void;
  statsOf: (f: RadicadoHistorico[]) => unknown;
  semColor: (s: string) => string;
  mainOrgsAll: () => string[];
  queueData: () => { org: string }[];
  HIST: { rows: RadicadoHistorico[]; corte: string };
  X: { org: string | null };
  histFromPayload: (j: unknown) => { rows: RadicadoHistorico[] };
};
const filas = d2.histFromPayload(demo).rows;
d2.HIST.rows = filas;
d2.HIST.corte = '2026-11-01';

/** Dibuja el expediente con la 2.x y devuelve su HTML. */
function html2(org: string | null) {
  d2.X.org = org;
  const c = { innerHTML: '' };
  d2.vDependencia(c);
  return c.innerHTML;
}
const todos = (re: RegExp, s: string) => [...s.matchAll(re)].map(m => m.slice(1));

describe('paridad con la 2.x · Expediente de dependencia', () => {
  const orgs = dependenciasDelHistorico(filas);

  it('mismas dependencias, misma dependencia inicial y mismos colores', () => {
    expect(orgs).toEqual(d2.mainOrgsAll());
    expect(orgs.length).toBeGreaterThan(5);
    expect(dependenciaInicial(filas)).toBe(d2.queueData()[0]?.org);
    html2(null);
    expect(d2.X.org).toBe(dependenciaInicial(filas));
    for (const s of ['rojo', 'amarillo', 'verde', 'muestra', 'otro'])
      expect(colorSemaforo(s)).toBe(d2.semColor(s));
  });

  it('para cada dependencia: indicadores, tendencia, entes y pendientes iguales', () => {
    for (const org of orgs) {
      const propias = filas.filter(r => r.org === org);
      const h = html2(org);
      const st = estadisticas(propias);
      expect(JSON.parse(JSON.stringify(st)), org).toEqual(JSON.parse(JSON.stringify(d2.statsOf(propias))));

      // Indicadores (tarjetas kpi) tal como los escribe la 2.x
      const kpis = todos(/<small>([^<]+)<\/small><b>([^<]*)/g, h);
      const nf = (n: number) => n.toLocaleString('es-CO');
      expect(kpis, org).toEqual([
        ['Evaluados', nf(st.ev)],
        ['A tiempo', nf(st.ok)],
        ['Respondidos tarde', nf(st.tar)],
        ['Sin respuesta', nf(st.sin)],
        ['Retraso promedio', st.tar ? decimal1(st.ret) : '0'],
        ['Tarda en responder', st.tiemN ? decimal1(st.tiem) : '—']
      ]);

      // Tendencia: los puntos con su tooltip
      const tit = todos(/<title>([^<]+)<\/title>/g, h).map(x => x[0]);
      const pts = tendenciaMensual(propias).filter(p => p.v != null);
      expect(tit, org).toEqual(pts.map(p => `${p.label}: ${porcentaje1(p.v ?? 0)} (${p.inc} de ${p.ev})`));

      // Entes con más incumplimiento
      const entes = todos(/<b style="font-size:\.82rem">([^<]+)<\/b><span class="mono muted">(\d+)/g, h);
      expect(entes, org).toEqual(incumplimientoPorEnte(propias).map(([e, n]) => [e, String(n)]));

      // Pendientes y vencidos, en el mismo orden
      const ids = todos(/data-i="(\d+)"/g, h).map(x => Number(x[0]));
      expect(ids, org).toEqual(
        pendientesYVencidos(propias)
          .slice(0, MAX_PENDIENTES)
          .map(r => r.i)
      );
      expect(h).toContain('Vigencias con datos: ' + vigenciasConDatos(propias).join(', ') + '.');
    }
  });
});
