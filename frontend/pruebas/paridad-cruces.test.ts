// Paridad con la 2.x · Cruces y temas, con el código REAL de la 2.x (cruceData, temasAuto, idsOf, cxCsv).
// La demo no trae números citados en los asuntos, así que se agregan asuntos ficticios con contratos, procesos,
// expedientes, radicados y documentos para probar los cruces exactos.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import demo from '../../datos/demo/historico.json';
import {
  alertasCruces,
  datosCruce,
  filasCsvCruces,
  filtrarTemas,
  type Caso,
  type FiltroCruces,
  type RevisionCruce,
  type TemaManual
} from '../src/dominio/cruces';
import type { RadicadoHistorico } from '../src/dominio/historico';
import { idsDe, llaveFila, NOMBRE_TEMA, temasAuto } from '../src/dominio/temas';

interface App2 {
  cruceData: () => { casos: Caso[]; reit: Caso[]; conc: Caso[]; info: Map<number, unknown> };
  cruceAlertCount: () => number;
  temasAuto: (s: unknown) => unknown;
  idsOf: (s: unknown) => unknown;
  TEMA_LBL: Record<string, string>;
  TEMA_MAN: Record<string, TemaManual>;
  CRUCE_REV: Record<string, RevisionCruce>;
  HIST: { rows: RadicadoHistorico[] };
  histFromPayload: (j: unknown) => { rows: RadicadoHistorico[] };
}
const nueva2x = () =>
  cargarApp([
    'cruceData',
    'cruceAlertCount',
    'temasAuto',
    'idsOf',
    'TEMA_LBL',
    'TEMA_MAN',
    'CRUCE_REV',
    'HIST',
    'histFromPayload'
  ]) as App2;

const ASUNTOS = [
  'Solicitud de información del contrato 4151.010.26.1.0234-2024 y su liquidación',
  'Auditoría al contrato No. 4151.010.26.1.234 de 2024, pagos al contratista',
  'Expediente IUS-E-2023-123456 queja disciplinaria contra funcionario',
  'Proceso disciplinario IUS E 2023 123456, traslado de pruebas',
  'Proceso de responsabilidad fiscal PRF-1234-2022-00567, hallazgo fiscal',
  'Requerimiento PRF 1234-2022-567 detrimento patrimonial',
  'Derecho de petición del ciudadano C.C. 1.144.123.456 sobre subsidio',
  'Queja de la señora con cc 1144123456 por atención',
  'SINPROC No. 2345678 vigilancia preventiva obra pública',
  'Radicado 202641730101835989 solicitud de copias',
  'Traslado por competencia radicado 202641730101835989 de la Personería',
  'Proceso de selección 4151.010.32.1.045-2025 licitación pública',
  'Expediente D-2024-1234567 de la Procuraduría',
  'Celular 3001234567 no es radicado',
  'Solicitud de información',
  'Obra de infraestructura vial: interventoría y avance de obra',
  '  Varias   palabras  —  con raya y TILDES: Contratación Pública  '
];
const ENTES = [
  'Contraloría General de la República',
  'Procuraduría Provincial de Cali',
  'Personería Distrital de Santiago de Cali',
  'Defensoría del Pueblo',
  'Concejo Distrital'
];

/** Demo + filas ficticias que citan los mismos números desde entes distintos. */
function filasDePrueba(): RadicadoHistorico[] {
  const base = nueva2x().histFromPayload(demo).rows;
  const extra = ASUNTOS.flatMap((asu, j) =>
    [0, 1].map(k => {
      const r = base[(j * 37 + k * 11) % base.length] as RadicadoHistorico;
      return {
        ...r,
        i: base.length + j * 2 + k,
        asu,
        ente: ENTES[(j + k * 2) % ENTES.length] as string,
        rad: 'PR-' + j + '-' + k,
        rec: `2025-0${1 + (j % 9)}-1${k}`
      };
    })
  );
  return [...base, ...extra];
}
const plano = (x: unknown) => JSON.parse(JSON.stringify(x));
const resumen = (l: readonly Caso[]) =>
  l.map(c => ({
    clave: c.clave,
    tipo: c.tipo,
    ids: c.tipo === 'tematico' ? undefined : c.ids,
    filas: c.rows.map(r => r.i),
    fams: c.fams,
    desde: c.desde,
    hasta: c.hasta,
    abierto: c.abierto
  }));

describe('paridad con la 2.x · temas e identificadores', () => {
  it('mismo tema y mismos identificadores para cada asunto (demo y ficticios)', () => {
    const d2 = nueva2x();
    const asuntos = new Set([...filasDePrueba().map(r => r.asu), ...ASUNTOS, null, '']);
    for (const a of asuntos) {
      expect(plano(temasAuto(a)), String(a)).toEqual(plano(d2.temasAuto(a)));
      expect(plano(idsDe(a)), String(a)).toEqual(plano(d2.idsOf(a)));
    }
    expect({ ...NOMBRE_TEMA }).toEqual({ ...d2.TEMA_LBL });
  });
});

describe('paridad con la 2.x · cruces', () => {
  const filas = filasDePrueba();

  it('mismos cruces exactos, reiteraciones y alertas de mismo tema', () => {
    const d2 = nueva2x();
    d2.HIST.rows = filas;
    const v2 = d2.cruceData(),
      v3 = datosCruce(filas, {});
    expect(v3.casos.length).toBeGreaterThan(3);
    expect(v3.conc.length).toBeGreaterThan(10);
    expect(resumen(v3.casos)).toEqual(plano(resumen(v2.casos)));
    expect(resumen(v3.reit)).toEqual(plano(resumen(v2.reit)));
    expect(resumen(v3.conc)).toEqual(plano(resumen(v2.conc)));
    expect(plano([...v3.info.entries()])).toEqual(plano([...v2.info.entries()]));
  });

  it('con temas corregidos a mano y cruces descartados, igual que la 2.x', () => {
    const d2 = nueva2x();
    d2.HIST.rows = filas;
    const man: Record<string, TemaManual> = {};
    filas.slice(0, 40).forEach((r, j) => {
      man[llaveFila(r)] = {
        tema: ['fiscal', 'obras', 'sin', 'contractual'][j % 4] as string,
        usuario: 'a',
        ts: ''
      };
    });
    Object.assign(d2.TEMA_MAN, man);
    const v2 = d2.cruceData(),
      v3 = datosCruce(filas, man);
    expect(resumen(v3.conc)).toEqual(plano(resumen(v2.conc)));
    expect(plano([...v3.info.entries()])).toEqual(plano([...v2.info.entries()]));
    const rev: Record<string, RevisionCruce> = {};
    for (const c of [...v3.casos.slice(0, 1), ...v3.conc.slice(0, 3)])
      rev[c.clave] = { estado: 'descartado', nota: '', usuario: 'a', ts: '' };
    Object.assign(d2.CRUCE_REV, rev);
    expect(alertasCruces(v3, rev, null)).toBe(d2.cruceAlertCount());
  });

  it('filtros de la pestaña Temas y el CSV', () => {
    const v3 = datosCruce(filas, {});
    const f: FiltroCruces = {
      tab: 'temas',
      tema: 'contractual',
      fam: 'Contraloría',
      org: '',
      vig: '2025',
      q: ''
    };
    const l = filtrarTemas(filas, v3, f, null);
    expect(l.length).toBeGreaterThan(0);
    for (let i = 1; i < l.length; i++)
      expect((l[i - 1]?.rec ?? l[i - 1]?.fmax ?? '') >= (l[i]?.rec ?? l[i]?.fmax ?? '')).toBe(true);
    const csv = filasCsvCruces(l, v3);
    expect(csv[0]).toHaveLength(14);
    expect(csv).toHaveLength(l.length + 1);
    expect(
      filtrarTemas(filas, v3, { ...f, tab: 'sin' }, null).every(r => v3.info.get(r.i)?.prim === 'sin')
    ).toBe(true);
  });
});
