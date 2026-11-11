// Paridad con la 2.x · histórico de radicados: compara dominio/historico.ts con el código REAL de la 2.x.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import demo from '../../datos/demo/historico.json';
import {
  aplicarCierre,
  habilesEntre,
  llaveRadicado,
  NOMBRE_OPORTUNIDAD,
  ocultarDatosPersonales,
  PILDORA_OPORTUNIDAD,
  textoRespondio,
  textoTardia,
  type RadicadoHistorico
} from '../src/dominio/historico';

const d2 = cargarApp([
  'maskPII',
  'habilesEntre',
  'aplicarCierre',
  'OPO_NAMES',
  'OPO_PILL',
  'rowKey',
  'histFromPayload'
]) as {
  maskPII: (s: string) => string;
  habilesEntre: (a: string, b: string) => number;
  aplicarCierre: (r: Record<string, unknown>, f: string, o: string) => void;
  OPO_NAMES: string[];
  OPO_PILL: [string, string][];
  rowKey: (r: unknown) => string;
  histFromPayload: (j: unknown) => { rows: RadicadoHistorico[] };
};
const filas = d2.histFromPayload(demo).rows;

const ASUNTOS = [
  'Queja del ciudadano Juan Pérez Gómez, C.C. 1.234.567 sobre el servicio',
  'Petición de la señora María de los Ángeles Restrepo por favor responder',
  'Solicitud del peticionario Carlos Andrés Ruiz 16.789.012 a la Secretaría',
  'Derecho de petición: accionante LUIS FERNANDO, cédula No. 94.123.456',
  'Requerimiento de la Contraloría General sobre contratos 2024',
  'favor de Ana Lucía Torres y Pedro Gómez; urgente',
  'Estudiantes Laura Sofía Mejía y Daniel Castro solicitan información',
  'NUIP 1.107.123.456 del menor Santiago López',
  '',
  'Solicitud T.I. 1006123456 de la joven Valentina'
];

describe('paridad con la 2.x · histórico', () => {
  it('mismos estados de oportunidad y píldoras', () => {
    expect([...NOMBRE_OPORTUNIDAD]).toEqual(d2.OPO_NAMES);
    expect(PILDORA_OPORTUNIDAD.map(p => [...p])).toEqual(d2.OPO_PILL);
  });
  it('mismo ocultamiento de datos personales en el asunto (ejemplos y los 2.568 asuntos de la demo)', () => {
    for (const a of ASUNTOS) expect(ocultarDatosPersonales(a), a).toBe(d2.maskPII(a));
    for (const r of filas) expect(ocultarDatosPersonales(r.asu)).toBe(d2.maskPII(r.asu ?? ''));
  });
  it('mismos días hábiles entre fechas (incluye festivos y cambios de año)', () => {
    const pares = [
      ['2024-12-20', '2025-01-10'],
      ['2025-03-21', '2025-04-22'],
      ['2026-01-02', '2026-01-02'],
      ['2026-06-12', '2026-07-03'],
      ['2026-11-10', '2026-11-30']
    ];
    for (const [a, b] of pares)
      expect(habilesEntre(a as string, b as string), `${a}→${b}`).toBe(
        d2.habilesEntre(a as string, b as string)
      );
  });
  it('mismo resultado al aplicar un cierre hecho en la app y misma llave del radicado', () => {
    const muestras = filas.filter(r => r.opo === 2 || r.opo === 3).slice(0, 40);
    expect(muestras.length).toBeGreaterThan(0);
    for (const r of muestras) {
      const fecha = r.fmax ?? '2026-01-15';
      for (const f of [fecha, '2026-08-03']) {
        const v2 = { ...r };
        d2.aplicarCierre(v2, f, '20261234567890');
        const v3 = aplicarCierre(r, f, '20261234567890');
        expect({ opo: v3.opo, ret: v3.ret, tiem: v3.tiem, resp: v3.resp }).toEqual({
          opo: v2.opo,
          ret: v2.ret,
          tiem: v2.tiem,
          resp: v2.resp
        });
      }
      expect(llaveRadicado(r)).toBe(d2.rowKey(r));
    }
  });
  it('textos de las columnas ¿Respondió? y ¿Tardía?', () => {
    expect([0, 1, 2].map(textoRespondio)).toEqual(['No', 'Sí', '—']);
    expect([0, 1, 2, 3, 4, 5].map(textoTardia)).toEqual(['No', 'Sí', 'No', '—', '—', '—']);
  });
});
