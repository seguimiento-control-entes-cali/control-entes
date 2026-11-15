// Paridad con la 2.x · Planes, exportación (entrega 3b). Con datos FICTICIOS (la semilla de la demo y un plan con
// datos incompletos), el código REAL de la 2.x (pmSheetPM01, pmSheetPM02, pmSheetsF14, pmSheetAvanceSemestral,
// pmNombreSIA, pmFaltantesExport) y la 3.0 deben producir las mismas hojas celda por celda: valores, fórmulas,
// formatos, celdas combinadas y anchos de columna, en varias fechas de corte.
import { describe, expect, it } from 'vitest';
import * as X from 'xlsx';
import cargarApp from '../../tests/cargar-app.cjs';
import { DEPENDENCIAS_DEMO } from '../src/datos/demo/catalogos-semilla';
import { semillaPlanes } from '../src/datos/demo/planes-semilla';
import type { Accion, DatosPlanes, Hallazgo, Plan } from '../src/dominio/planes';
import {
  faltantesExport,
  hojaAvanceSemestral,
  hojaPM01,
  hojaPM02,
  hojasF14,
  nombreF14,
  nombreSIA,
  type ContextoExport
} from '../src/dominio/planes-exportar';

const dos = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const HOY = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const st: DatosPlanes = semillaPlanes(HOY);
// Calificaciones, observación atendida y dirección técnica, para cubrir esas ramas
(st.acciones[0] as Accion).cal_efectividad = 2;
(st.acciones[1] as Accion).cal_cumplimiento = 1;
(st.acciones[1] as Accion).cal_efectividad = 0;
Object.assign(st.acciones[2] as Accion, { obs_ci: 'Revisar la meta', obs_ci_estado: 'atendida' });
Object.assign(st.planes[0] as Plan, {
  direccion_tecnica: 'Dirección Técnica ficticia',
  ordenador_gasto: 'Ordenador ficticio'
});
// Plan con datos incompletos: sin fecha de suscripción, una acción sin fechas, otra con cantidad 0 y un hallazgo sin
// acciones (todo ficticio)
const pInc: Plan = {
  id: 'pm-inc',
  formato: 'F14_CGR',
  contraloria: 'Contraloría General de la República',
  ejercicio: 'Denuncia Fiscal Nº 896, vigencia 2025 (ficticia)',
  tipo_ejercicio: 'Actuación especial de fiscalización',
  fecha_suscripcion: '',
  estado: 'formulacion',
  numero_informe: 'Informe 12-2026'
};
const hInc: Hallazgo[] = [
  {
    id: 'h-inc-1',
    plan_id: 'pm-inc',
    numero: '1',
    descripcion: 'Hallazgo ficticio sin fechas',
    causa: 'Falta de seguimiento ficticia',
    connotaciones: ['administrativa', 'fiscal', 'penal'],
    orden: 1
  } as Hallazgo,
  {
    id: 'h-inc-2',
    plan_id: 'pm-inc',
    numero: '2',
    descripcion: 'Sin acciones',
    connotaciones: ['otra'],
    orden: 2
  } as Hallazgo
];
const aBase = st.acciones[0] as Accion;
const aInc: Accion[] = [
  {
    ...aBase,
    id: 'a-inc-1',
    plan_id: 'pm-inc',
    hallazgo_id: 'h-inc-1',
    fecha_inicio: '',
    fecha_fin: '',
    cantidad: 0,
    orden: 1
  },
  {
    ...aBase,
    id: 'a-inc-2',
    plan_id: 'pm-inc',
    hallazgo_id: 'h-inc-1',
    cantidad: null as unknown as number,
    responsable: 'Profesional ficticio',
    dependencia_id: null,
    orden: 2
  }
];
st.planes.push(pInc);
st.hallazgos.push(...hInc);
st.acciones.push(...aInc);

const deps = DEPENDENCIAS_DEMO.map(x => ({ id: x.id, nombre: x.nombre }));
const ctx: ContextoExport = {
  d: st,
  dep: id => deps.find(x => String(x.id) === String(id))?.nombre ?? '',
  usuario: 'admin.demo@cali.gov.co'
};

type Hoja = X.WorkSheet;
const d2 = cargarApp([
  'S',
  'PM',
  'pmSheetPM01',
  'pmSheetPM02',
  'pmSheetsF14',
  'pmSheetAvanceSemestral',
  'pmNombreSIA',
  'pmFaltantesExport'
]) as {
  S: { deps: unknown[]; user: unknown };
  PM: Record<string, unknown>;
  pmSheetPM01: (x: typeof X, p: Plan, corte: string) => Hoja;
  pmSheetPM02: (x: typeof X, p: Plan, corte: string) => Hoja;
  pmSheetsF14: (x: typeof X, p: Plan, corte: string) => [Hoja, Hoja];
  pmSheetAvanceSemestral: (x: typeof X, p: Plan, corte: string) => Hoja;
  pmNombreSIA: (p: Plan, o?: { avance?: boolean; corte?: string | null }) => string;
  pmFaltantesExport: (p: Plan) => unknown;
};
d2.S.deps = deps;
d2.S.user = { email: 'admin.demo@cali.gov.co' };
Object.assign(d2.PM, { planes: st.planes, hall: st.hallazgos, acc: st.acciones, av: st.avances, v19: true });
const plano = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;
const CORTES = [HOY, '2025-12-31', '2026-06-30', '2027-06-30'];

describe('paridad con la 2.x · exportar planes en el formato de la contraloría', () => {
  it('PM_01 y PM_02 de la CGSC iguales celda por celda', () => {
    for (const p of st.planes)
      for (const c of CORTES) {
        expect(plano(hojaPM01(X, p, c, ctx)), `PM_01 ${p.id} ${c}`).toEqual(plano(d2.pmSheetPM01(X, p, c)));
        expect(plano(hojaPM02(X, p, c, ctx)), `PM_02 ${p.id} ${c}`).toEqual(plano(d2.pmSheetPM02(X, p, c)));
      }
  });
  it('Formularios 14 y 14.1 de la CGR iguales (fórmulas, totales y convenciones)', () => {
    for (const p of st.planes)
      for (const c of CORTES)
        expect(plano(hojasF14(X, p, c, ctx)), `F14 ${p.id} ${c}`).toEqual(plano(d2.pmSheetsF14(X, p, c)));
  });
  it('informe semestral de avance (art. 11) igual', () => {
    for (const p of st.planes)
      for (const c of CORTES)
        expect(plano(hojaAvanceSemestral(X, p, c, ctx)), `${p.id} ${c}`).toEqual(
          plano(d2.pmSheetAvanceSemestral(X, p, c))
        );
  });
  it('mismo nombre de archivo para el SIA Contralorías y mismos datos faltantes', () => {
    const casos: Plan[] = [
      ...st.planes,
      { ...pInc, ejercicio: 'Auditoría financiera ficticia 77-2024', fecha_suscripcion: '2026-02-01' },
      { ...pInc, ejercicio: 'Auditoría de desempeño', tipo_ejercicio: '', vigencia_pvcft: '2026' },
      { ...pInc, ejercicio: 'Tema o asunto ficticio 5 de 2025' }
    ];
    for (const p of casos) {
      for (const o of [undefined, { avance: true, corte: '2026-06-30' }]) {
        // con fecha de suscripción vacía la 2.x usa la fecha de hoy (pmHoy)
        expect(nombreSIA(p, HOY, o), p.ejercicio).toBe(d2.pmNombreSIA(p, o));
      }
    }
    expect(nombreSIA(st.planes[0] as Plan, HOY)).toMatch(/^FORMATO_202001_PM_CGSC_\d{6}_[A-Z]+/);
    expect(nombreF14(pInc, '2026-06-30')).toBe('F14_CGR_informe_12_2026_corte_2026-06-30.xlsx');
    for (const p of st.planes)
      expect(plano(faltantesExport(p, st)), p.id).toEqual(plano(d2.pmFaltantesExport(p)));
    expect(faltantesExport(pInc, st)).toMatchObject({
      plan: ['fecha de suscripción'],
      acciones: [
        { id: 'a-inc-1', faltan: ['fecha de inicio', 'fecha de terminación'], cero: true },
        { id: 'a-inc-2', faltan: ['cantidad'], cero: false }
      ]
    });
  });
  it('el libro se escribe como .xlsx y se vuelve a leer con las fórmulas', () => {
    const p = st.planes.find(x => x.formato === 'F14_CGR') as Plan;
    const wb = X.utils.book_new();
    const [a, b] = hojasF14(X, p, HOY, ctx);
    X.utils.book_append_sheet(wb, a, 'Informe Plan de mejoramiento ');
    X.utils.book_append_sheet(wb, b, 'Avance Plan de Mejoramiento');
    const bin = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer;
    const r = X.read(new Uint8Array(bin), { type: 'array', cellFormula: true });
    const ws = r.Sheets['Avance Plan de Mejoramiento'] as Hoja;
    const formulas = Object.values(ws).filter(c => c && typeof c === 'object' && 'f' in c).length;
    expect(formulas).toBeGreaterThan(5);
  });
});
