import { describe, expect, it } from 'vitest';
import {
  anillo,
  archivoReporte,
  estadisticas,
  filasReporte,
  pendientesYVencidos,
  tendenciaMensual
} from './expediente';
import type { RadicadoHistorico } from './historico';

const r = (i: number, o: Partial<RadicadoHistorico>): RadicadoHistorico => ({
  i,
  v: 2026,
  rad: 'R' + i,
  ente: 'CGR',
  orfE: null,
  rec: null,
  org: 'Secretaría de Salud Pública',
  niv: 'Secretaría',
  asu: 'Asunto',
  term: 10,
  fmax: '2026-03-10',
  orfR: null,
  fresp: null,
  resp: 0,
  opo: 0,
  ret: null,
  tiem: null,
  ...o
});

describe('expediente de dependencia (reglas de vDependencia de la 2.x)', () => {
  it('cuenta evaluados, tardíos, sin respuesta y promedios', () => {
    const st = estadisticas([
      r(1, { opo: 0, tiem: 4 }),
      r(2, { opo: 1, ret: 3, tiem: 12 }),
      r(3, { opo: 2, ret: 7 }),
      r(4, { opo: 3 })
    ]);
    expect(st).toMatchObject({
      ev: 3,
      ok: 1,
      tar: 1,
      sin: 1,
      pend: 1,
      inc: 2,
      ret: 3,
      tiem: 8,
      sem: 'muestra'
    });
  });

  it('la tendencia exige 3 evaluados por mes', () => {
    const pts = tendenciaMensual([
      r(1, { fmax: '2026-01-05', opo: 0 }),
      r(2, { fmax: '2026-01-06', opo: 1 }),
      r(3, { fmax: '2026-01-07', opo: 2 }),
      r(4, { fmax: '2026-02-01', opo: 0 }),
      r(5, { fmax: '2026-02-02', opo: 3 })
    ]);
    expect(pts).toEqual([
      { label: 'enero 2026', short: 'ene 26', ev: 3, inc: 2, v: 2 / 3 },
      { label: 'febrero 2026', short: 'feb 26', ev: 1, inc: 0, v: null }
    ]);
  });

  it('pendientes: primero vencidos, luego mayor retraso y fecha más antigua', () => {
    const l = pendientesYVencidos([
      r(1, { opo: 3, fmax: '2026-01-01' }),
      r(2, { opo: 2, ret: 2 }),
      r(3, { opo: 2, ret: 9 }),
      r(4, { opo: 0 })
    ]);
    expect(l.map(x => x.i)).toEqual([3, 2, 1]);
  });

  it('reporte CSV con nombre corto y datos personales ocultos', () => {
    expect(archivoReporte('Secretaría de Salud Pública')).toBe('reporte_Salud_P_blica.csv');
    const f = filasReporte(
      [r(1, { asu: 'Petición de C.C. 1234567' }), r(2, { org: 'Otra' })],
      'Secretaría de Salud Pública'
    );
    expect(f).toHaveLength(2);
    expect(f[1]).toEqual([
      2026,
      'R1',
      'CGR',
      'Petición de [documento reservado]',
      '2026-03-10',
      null,
      null,
      'A TIEMPO',
      null
    ]);
  });

  it('anillo: porcentaje limitado entre 0 y 1', () => {
    expect(anillo(0).off).toBeCloseTo(anillo(0).C);
    expect(anillo(2).off).toBe(0);
  });
});
