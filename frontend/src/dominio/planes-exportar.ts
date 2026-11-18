// Planes de mejoramiento · exportación en el formato de cada contraloría (entrega 3b de la F3). Copia fiel de la 2.x:
// pmSheetPM01, pmSheetPM02, pmSheetsF14 y pmFaltantesExport (src/js/19-planes-de-mejoramiento.js), pmSheetAvanceSemestral
// y pmNombreSIA (src/js/19-planes-norma-y-memoria.js). Misma estructura, títulos, fórmulas y valores calculados.
// SheetJS llega como parámetro (se carga solo al exportar); aquí no se usa el navegador.
import type * as XLSX from 'xlsx';
import { formatoCorto } from './fechas';
import {
  avanceAl,
  calificacionAccion,
  calificacionCgsc,
  fechaPlan,
  llave,
  metaTxt,
  pct,
  semanas,
  txt,
  type Accion,
  type DatosPlanes,
  type Hallazgo,
  type Plan
} from './planes';

type SheetJS = typeof XLSX;
type Hoja = XLSX.WorkSheet;
type Rango = XLSX.Range;
/** Lo que necesita cada hoja: los datos del plan, el nombre de cada dependencia y quién exporta. */
export interface ContextoExport {
  d: DatosPlanes;
  dep: (id: number | null | undefined) => string;
  usuario: string;
  /** Script 19 instalado: sin él no hay calificación CGSC (PM.v19 de la 2.x). */
  v19?: boolean;
}

/** pmXDate: fecha AAAA-MM-DD → número de serie de Excel; vacío si falta o no es válida (nunca NaN). */
export const serieExcel = (s: string | null | undefined): number | '' => {
  if (!fechaPlan(s)) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
};
/** pmCantXls: el número (también 0), o vacío si falta o no es un número. */
export const cantidadExcel = (v: unknown): number | '' =>
  v === null || v === undefined || v === '' || !isFinite(Number(v)) ? '' : Number(v);
/** pmPlanData: hallazgos del plan en orden, cada uno con sus acciones en orden. */
export function datosDelPlan(p: Pick<Plan, 'id'>, d: DatosPlanes): { h: Hallazgo; acc: Accion[] }[] {
  const hall = d.hallazgos.filter(h => h.plan_id === p.id).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  return hall.map(h => ({
    h,
    acc: d.acciones.filter(a => a.hallazgo_id === h.id).sort((a, b) => (a.orden || 0) - (b.orden || 0))
  }));
}
/** pmRespTxt. */
function responsableTxt(a: Accion, ctx: ContextoExport): string {
  const dn = ctx.dep(a.dependencia_id),
    r = txt(a.responsable);
  if (!r) return dn;
  if (!dn || llave(r).includes(llave(dn))) return r;
  return r + ' - ' + dn;
}
/** pmConnPM01: connotación como la lista desplegable del formato PM_01 (hoja LISTA). */
export function connotacionPM01(h: Pick<Hallazgo, 'connotaciones'>): string {
  const c = new Set(h.connotaciones || []);
  if (c.has('sancionatoria') && c.size <= 2) return 'Sancionatorio';
  if (c.has('otra') && [...c].every(x => x === 'otra' || x === 'administrativa')) return 'Otra';
  const f = c.has('fiscal'),
    di = c.has('disciplinaria'),
    pe = c.has('penal');
  if (f && di && pe) return 'Administrativa, Fiscal, Penal y Disciplinaria';
  if (di && pe) return 'Administrativa, Disciplinaria y Penal';
  if (f && pe) return 'Administrativa fiscal y penal';
  if (f && di) return 'Administrativa fiscal y disciplinaria';
  if (f) return 'Administrativa fiscal';
  if (pe) return 'Administrativa penal';
  if (di) return 'Administrativa disciplinaria';
  return 'Administrativa';
}
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
];
const fechaLarga = (iso: string | null | undefined) => {
  if (!fechaPlan(iso)) return '';
  const [y, m, d] = String(iso).split('-').map(Number) as [number, number, number];
  return `${d} de ${MESES_LARGOS[m - 1]} de ${y}`;
};
/** Valor de IF(COUNT(rango)>0,AVERAGE(rango)*100/2,0) de los formatos PM_01 y PM_02. */
const promedioCal = (l: number[]) => (l.length ? ((l.reduce((s, x) => s + x, 0) / l.length) * 100) / 2 : 0);
/** Descripción con la causa, si no está ya dentro del texto. */
const descripcionConCausa = (h: Hallazgo) =>
  [
    txt(h.descripcion),
    h.causa && !llave(h.descripcion).includes(llave(h.causa).slice(0, 40)) ? 'Causa: ' + h.causa : ''
  ]
    .filter(Boolean)
    .join('\n');

type Valor = string | number | null | undefined | { f: string };
function escritor(ws: Hoja) {
  return (ref: string, v: Valor, extra?: Record<string, unknown> | null) => {
    if (v === null || v === undefined || v === '') return;
    ws[ref] =
      typeof v === 'object' && v.f
        ? { t: 'n', f: v.f }
        : { t: typeof v === 'number' ? 'n' : 's', v: v as string | number };
    if (extra) Object.assign(ws[ref] as object, extra);
  };
}

/**
 * pmSheetPM01: Formato PM_01 CGSC versión 2020, igual a la plantilla oficial de la Contraloría
 * (FORMATO_202001_PM_CGSC plantilla.xlsx, 17-nov-2026): columna A angosta y vacía, el plan de la B a la S,
 * el cuadro de evaluación de la U a la Y, con las mismas uniones, títulos, fórmulas y anchos.
 * Por defecto sale SOLO LA FORMULACIÓN (B a K): es el archivo que la dependencia sube al SIA Contralorías después
 * de que Control Interno lo valida. El seguimiento (L a S: avance, cumplimiento, efectividad, estado, observación,
 * corte y %) se informa con el formato de avance; la calificación oficial la hace la Contraloría (18-nov-2026).
 * Con { conAvance: true } se llenan también L a S.
 */
export function hojaPM01(
  X: SheetJS,
  p: Plan,
  corte: string,
  ctx: ContextoExport,
  opts: { conAvance?: boolean } = {}
): Hoja {
  const datos = datosDelPlan(p, ctx.d);
  const ws: Hoja = {};
  const merges: Rango[] = [];
  const put = escritor(ws);
  const cumpl: number[] = [],
    efect: number[] = [];
  const M = (r: string) => merges.push(X.utils.decode_range(r));
  put('B1', 'CONTRALORÍA GENERAL DE SANTIAGO DE CALI');
  M('B1:G1');
  put('B2', 'FORMATO PM_01 CGSC - PLAN ');
  M('B2:G2');
  M('U2:Y2');
  put('U3', 'RESULTADO EVALUACIÓN PLAN DE MEJORAMIENTO');
  M('U3:Y3');
  put('U4', 'VARIABLES A EVALUAR');
  M('U4:V4');
  put('W4', 'Calificación Parcial');
  put('X4', 'Ponderación');
  put('Y4', 'Puntaje Atribuido');
  put('B5', 'Entidad auditada (1): ');
  put('D5', (p.entidad || 'DISTRITO DE SANTIAGO DE CALI').toUpperCase());
  M('D5:E5');
  M('H5:J5');
  put('U5', 'Cumplimiento del Plan de Mejoramiento ');
  M('U5:V5');
  put('W5', { f: '+M9' });
  put('X5', 0.2);
  put('Y5', { f: 'W5*X5' });
  put('B6', 'Nombre de la actuación de control fiscal (2): ' + (p.ejercicio || ''));
  M('B6:E6');
  put('B7', 'Tipo de actuación de control fiscal (3):');
  M('B7:C7');
  put('D7', p.tipo_ejercicio || '');
  M('D7:E7');
  M('H7:J7');
  put('U7', 'Efectividad de las acciones');
  M('U7:V7');
  put('W7', { f: '+N9' });
  put('X7', 0.8);
  put('Y7', { f: 'W7*X7' });
  put('B8', 'Fecha de suscripción (4): ' + fechaLarga(p.fecha_suscripcion));
  M('B8:C8');
  put('D8', 'Vigencia PVCFT (5)');
  put('E8', p.vigencia_pvcft || '');
  put('M8', { f: '+M9*0.2+N9*0.8' });
  M('M8:N8');
  put('U8', ' CUMPLIMIENTO PLAN DE MEJORAMIENTO');
  M('U8:W8');
  put('X8', { f: 'SUM(X5:X7)' });
  put('Y8', { f: 'SUM(Y5:Y7)' });
  put('M9', { f: 'IF(COUNT(M12:M696)>0,AVERAGE(M12:M696)*100/2,0)' });
  put('N9', { f: 'IF(COUNT(N12:N696)>0,AVERAGE(N12:N696)*100/2,0)' });
  put('U9', 'Concepto a emitir cumplimiento Plan de Mejoramiento');
  M('U9:W9');
  put('X9', { f: 'IF(AND((Y8)<=100,(Y8)>=80),W13,IF(AND((Y8)<80,(Y8)>=0),W14,W13))' });
  M('X9:Y9');
  put('B10', 'FORMULACIÓN DEL PLAN DE MEJORAMIENTO');
  M('B10:K10');
  put('L10', 'AVANCE DEL PLAN DE MEJORAMIENTO');
  M('L10:S10');
  [
    'N° hallazgo (6)',
    'Descripción de la condición y causa del hallazgo \n(7)',
    'Connotación del hallazgo \n(8)',
    'Macroproceso, criterio u otro\n(9)',
    'Acción de Correctiva\n(10)',
    'Meta \n(11)',
    'Fuente de verificación\n(12)',
    'Lugar de verificación\n(13)',
    'Fecha terminación de la Actividad\n(14)',
    'Responsable (Nombre y Cargo)\n(15)',
    'Descripción del avance de la acción\n(16)',
    'CUMPLIMIENTO\n20%',
    'EFECTIVIDAD\n80%',
    'ESTADO DE LA ACCIÓN\n(Cerrada-C / Abierta-A)',
    'DIRECCIÓN TECNICA RESPONSABLE',
    'OBSERVACIÓN SEGUIMIENTO',
    'Fecha de Corte del Avance \n(17)',
    '% de Avance\n(18)'
  ].forEach((t, i) => put(X.utils.encode_cell({ r: 10, c: i + 1 }), t));
  // Rangos de calificación (al lado de las primeras filas del plan, como en la plantilla)
  put('U12', 'RANGOS DE CALIFICACIÓN ');
  M('U12:V12');
  put('W12', 'Concepto');
  put('U13', '80 o más puntos');
  M('U13:V13');
  put('W13', 'Cumple');
  put('U14', 'Menos de 80 puntos');
  M('U14:V14');
  put('W14', 'No Cumple');
  const FECHA = 9, // J: fecha de terminación
    CORTE = 17, // R: fecha de corte del avance
    PCT = 18; // S: % de avance
  const formato = (c: number): Record<string, unknown> | null =>
    c === FECHA || c === CORTE ? { t: 'n', z: 'dd/mm/yyyy' } : c === PCT ? { t: 'n', z: '0%' } : null;
  let r = 11;
  datos.forEach(({ h, acc }) => {
    const r0 = r;
    (acc.length ? acc : [null]).forEach(a => {
      const av = a && opts.conAvance ? avanceAl(a, corte, ctx.d.avances) : null;
      const cal =
        a && opts.conAvance && ctx.v19 !== false ? calificacionAccion(a, corte, ctx.d.avances) : null;
      if (cal && typeof cal.c === 'number') cumpl.push(cal.c);
      if (cal && typeof cal.e === 'number') efect.push(cal.e);
      const fila: Valor[] = [
        h.numero,
        descripcionConCausa(h),
        connotacionPM01(h),
        h.macroproceso || '',
        a ? a.accion : '',
        a ? metaTxt(a) : '',
        a ? a.fuente_verificacion || '' : '',
        a ? a.lugar_verificacion || '' : '',
        a && fechaPlan(a.fecha_fin) ? serieExcel(a.fecha_fin) : '',
        a ? responsableTxt(a, ctx) : '',
        av ? (av as { descripcion?: string }).descripcion || '' : '',
        cal && cal.c != null ? cal.c : '',
        cal && cal.e != null ? cal.e : '',
        cal && (cal.c != null || cal.e != null) ? cal.estado : '',
        opts.conAvance ? p.direccion_tecnica || '' : '',
        a && opts.conAvance && a.obs_ci
          ? a.obs_ci + (a.obs_ci_estado === 'atendida' ? ' (atendida)' : '')
          : '',
        av && fechaPlan(av.fecha_corte) ? serieExcel(av.fecha_corte) : '',
        av && a ? pct(a, av.cantidad) : ''
      ];
      fila.forEach((v, i) => put(X.utils.encode_cell({ r, c: i + 1 }), v, formato(i + 1)));
      r++;
    });
    if (r - r0 > 1) for (let c = 1; c <= 4; c++) merges.push({ s: { r: r0, c }, e: { r: r - 1, c } });
  });
  // valor calculado de cada fórmula (el mismo que da Excel): el archivo queda correcto aunque no se recalcule
  const M9 = promedioCal(cumpl),
    N9 = promedioCal(efect),
    Y8 = M9 * 0.2 + N9 * 0.8;
  (
    [
      ['W5', M9],
      ['Y5', M9 * 0.2],
      ['W7', N9],
      ['Y7', N9 * 0.8],
      ['X8', 1],
      ['Y8', Y8],
      ['M8', Y8],
      ['M9', M9],
      ['N9', N9]
    ] as const
  ).forEach(([ref, v]) => ((ws[ref] as XLSX.CellObject).v = v));
  Object.assign(ws['X9'] as XLSX.CellObject, { t: 's', v: Y8 < 80 && Y8 >= 0 ? 'No Cumple' : 'Cumple' });
  r = Math.max(r, 14) + 3;
  put(X.utils.encode_cell({ r, c: 1 }), '______________________________');
  put(X.utils.encode_cell({ r, c: 7 }), '______________________________');
  put(X.utils.encode_cell({ r: r + 1, c: 1 }), p.representante_legal || '');
  put(X.utils.encode_cell({ r: r + 1, c: 7 }), p.ordenador_gasto || '');
  put(
    X.utils.encode_cell({ r: r + 2, c: 1 }),
    'Nombre y firma del Representante Legal del Sujeto de Vigilancia de Control Fiscal'
  );
  put(X.utils.encode_cell({ r: r + 2, c: 7 }), 'Nombre y firma del Ordenador del Gasto del Punto de Control');
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 2, c: 24 } });
  ws['!merges'] = merges;
  // Anchos de la plantilla (A=1 … Y=17)
  ws['!cols'] = [
    1, 13, 53, 25, 34, 34, 11, 18, 15, 15, 32, 38, 16, 16, 23, 21, 42, 30, 12, 12, 26, 21, 17, 14, 17
  ].map(w => ({ wch: w }));
  return ws;
}

/** Hoja LISTA de la plantilla: las listas oficiales (incidencia, macroproceso, ejercicio y sujetos de control). */
export const LISTA_PM_CGSC: readonly (readonly string[])[] = [
  ['INCIDENCIA', 'MACROPROCESO', 'Ejercicio de fiscalización', 'SUJETOS DE CONTROL '],
  [
    'Administrativa',
    'Financiero',
    'Auditoría Financiera de Gestión y Resultados - AFGR',
    'DISTRITO DE SANTIAGO DE CALI'
  ],
  [
    'Administrativa fiscal',
    'Presupuestal',
    'Auditoría de Desempeño - AD',
    'EMPRESA DE SERVICIOS PÚBLICOS EMCALI EICE ESP'
  ],
  ['Administrativa penal', 'Criterio de evaluación', 'Auditoría de Cumplimiento - AC', 'METROCALI '],
  [
    'Administrativa disciplinaria',
    'Otro',
    'Actuación Especial de Fiscalización - AEF',
    'EMPRESA DE RENOVACIÓN URBANA - EMRU'
  ],
  ['Administrativa fiscal y disciplinaria', '', 'Informe de Cierre Fiscal ', 'PERSONERÍA MUNICIPAL'],
  ['Administrativa fiscal y penal', '', 'Otro ', 'RED DE SALUD DEL NORTE'],
  ['Administrativa, Disciplinaria y Penal', '', '', 'RED DE SALUD DEL ORIENTE'],
  ['Administrativa, Fiscal, Penal y Disciplinaria ', '', '', 'RED DE SALUD DE SUR ORIENTE'],
  ['Sancionatorio', '', '', 'RED DE SALUD DEL LADERA'],
  ['Otra', '', '', 'RED DE SALUD DEL CENTRO'],
  ['', '', '', 'RED DE SALUD DEL HOSPITAL GERIATRICO Y ANCIANATO SAN MIGUEL'],
  ['', '', '', 'CORPORACIÓN DE EVENTOS, FERIAS Y ESPECTACULOS - CORFECALI'],
  ['', '', '', 'ESCUELA NACIONAL DEL DEPORTE - END'],
  ['', '', '', 'FONDO ESPECIAL DE VIVIENDA'],
  ['', '', '', 'EMPRESA DE SERVICIOS VARIOS EMSIVA EN LIQUIDACIÓN'],
  ['', '', '', 'INSTITUCIÓN UNIVESITARIA ANTONIO JOSÉ CAMACHO - UNIAJC'],
  ['', '', '', 'INSTITUTO POPULAR DE CULTURA - IPC EN LIQUIDACIÓN'],
  ['', '', '', 'CENTRO DE DIAGNÓSTICO AUTOMOTOR DEL VALLE - CDAV'],
  ['', '', '', 'INSTITUCIÓN UNIVESITARIA DE LAS CULTURAS Y LAS ARTES - IPC'],
  ['', '', '', 'AUTORIDAD REGIONAL DE TRANSPORTE RPG - ART - ASOVC']
];
export function hojaListaPM(X: SheetJS): Hoja {
  const ws = X.utils.aoa_to_sheet(LISTA_PM_CGSC.map(f => f.map(v => (v === '' ? null : v))));
  ws['!cols'] = [40, 24, 52, 62].map(w => ({ wch: w }));
  return ws;
}

/** pmSheetPM02: papel de trabajo PT 03-PF, evaluación del plan, versión 2.1. */
export function hojaPM02(X: SheetJS, p: Plan, corte: string, ctx: ContextoExport): Hoja {
  const datos = datosDelPlan(p, ctx.d);
  const ws: Hoja = {};
  const merges: Rango[] = [];
  const put = escritor(ws);
  const M = (x: string) => merges.push(X.utils.decode_range(x));
  const acc = ctx.d.acciones.filter(a => a.plan_id === p.id);
  const k = ctx.v19 !== false ? calificacionCgsc(acc, corte, ctx.d.avances) : { C: 0 };
  put('A1', 'CONTRALORÍA GENERAL DE SANTIAGO DE CALI');
  M('A1:F1');
  put('A2', 'PAPEL DE TRABAJO PT 03-PF EVALUACIÓN PLAN DE MEJORAMIENTO - Versión 2.1');
  M('A2:F2');
  put('Q3', 'RESULTADO EVALUACIÓN PLAN DE MEJORAMIENTO');
  M('Q3:U3');
  put('B4', 'AVANCE PLAN DE MEJORAMIENTO');
  M('B4:E4');
  put('Q4', 'VARIABLES A EVALUAR');
  M('Q4:R4');
  put('S4', 'Calificación Parcial');
  put('T4', 'Ponderación');
  put('U4', 'Puntaje Atribuido');
  put('A6', 'Entidad auditada:');
  M('A6:D6');
  put('E6', (p.entidad || 'DISTRITO DE SANTIAGO DE CALI').toUpperCase());
  put('Q6', 'Cumplimiento del Plan de Mejoramiento ');
  M('Q6:R6');
  const S6 = Math.round(k.C * 100) / 100;
  put('S6', S6);
  put('T6', 0.2);
  put('U6', { f: 'S6*T6' });
  put('A7', 'Auditoría u otra actuación:');
  M('A7:D7');
  put('E7', p.ejercicio || '');
  put('Q7', 'Efectividad de las acciones');
  M('Q7:R7');
  put('S7', { f: '+L10' });
  put('T7', 0.8);
  put('U7', { f: 'S7*T7' });
  put('A8', 'Fecha realización:');
  M('A8:B8');
  put('C8', 'Vigencia PVCFT');
  put('D8', p.vigencia_pvcft || '');
  put('Q8', ' PROCENTAJE DE AVANCE PLAN DE MEJORAMIENTO');
  M('Q8:S8');
  put('T8', { f: 'SUM(T6:T7)' });
  put('U8', { f: 'SUM(U6:U7)' });
  [
    'N° hallazgo',
    'Descripción del hallazgo',
    'INCIDENCIA',
    'MACROPROCESO PROCESO',
    'Acción de mejora',
    'Meta',
    'Fuente de verificación',
    'Lugar de verificación',
    'Fecha terminación de la Actividad',
    'Responsable (Nombre y Cargo)',
    '% de avance'
  ].forEach((t, c) => put(X.utils.encode_cell({ r: 9, c }), t));
  put('L10', { f: 'IF(COUNT(L11:L695)>0,AVERAGE(L11:L695)*100/2,0)' });
  put('M10', 'ESTADO (C/A)');
  put('N10', 'RESPONSABLE DEL AVANCE');
  put('O10', 'OBSERVACIONES DEL AVANCE DE LA ACCIÓN');
  let r = 10;
  const efect: number[] = [];
  datos.forEach(({ h, acc: l }) =>
    l.forEach(a => {
      const av = avanceAl(a, corte, ctx.d.avances) as
        | ({ cantidad: number | null; fecha_corte: string } & {
            descripcion?: string;
            reportado_email?: string;
          })
        | null;
      const cal = ctx.v19 !== false ? calificacionAccion(a, corte, ctx.d.avances) : null;
      if (cal && typeof cal.e === 'number') efect.push(cal.e);
      (
        [
          h.numero,
          txt(h.descripcion),
          connotacionPM01(h),
          h.macroproceso || '',
          a.accion,
          metaTxt(a),
          a.fuente_verificacion || '',
          a.lugar_verificacion || '',
          fechaPlan(a.fecha_fin) ? serieExcel(a.fecha_fin) : '',
          responsableTxt(a, ctx),
          av ? pct(a, av.cantidad) : 0,
          cal && cal.e != null ? cal.e : '',
          cal && (cal.c != null || cal.e != null) ? cal.estado : '',
          av ? av.reportado_email || '' : '',
          av
            ? [av.descripcion || '', 'Corte ' + formatoCorto(av.fecha_corte)].filter(Boolean).join(' · ')
            : ''
        ] as Valor[]
      ).forEach((v, c) =>
        put(
          X.utils.encode_cell({ r, c }),
          v,
          c === 8 && v !== '' ? { t: 'n', z: 'dd/mm/yyyy' } : c === 10 ? { t: 'n', z: '0%' } : null
        )
      );
      r++;
    })
  );
  const L10 = promedioCal(efect),
    U6 = S6 * 0.2,
    U7 = L10 * 0.8;
  (
    [
      ['U6', U6],
      ['S7', L10],
      ['U7', U7],
      ['T8', 0.2 + 0.8],
      ['U8', U6 + U7],
      ['L10', L10]
    ] as const
  ).forEach(([ref, v]) => ((ws[ref] as XLSX.CellObject).v = v));
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 11), c: 20 } });
  ws['!merges'] = merges;
  ws['!cols'] = [10, 60, 22, 18, 45, 28, 28, 22, 14, 32, 10, 12, 12, 28, 50, 4, 24, 12, 12, 12, 12].map(
    w => ({
      wch: w
    })
  );
  return ws;
}

/** pmSheetsF14: Formularios 14 (suscripción) y 14.1 (seguimiento) de la CGR, con sus fórmulas. */
export function hojasF14(X: SheetJS, p: Plan, corte: string, ctx: ContextoExport): [Hoja, Hoja] {
  const datos = datosDelPlan(p, ctx.d);
  const filas: { h: Hallazgo; a: Accion }[] = [];
  datos.forEach(({ h, acc }) => acc.forEach(a => filas.push({ h, a })));
  const enc = (titulo: string, form: string): unknown[][] => [
    [],
    ['INFORME PRESENTADO A LA CONTRALORIA GENERAL DE LA REPUBLICA'],
    [titulo],
    [form],
    [],
    ['ENTIDAD:', p.entidad || '', '', '', '', '', '', '', '', 'NIT:', p.nit || ''],
    ['REPRESENTANTE LEGAL:', p.representante_legal || ''],
    ['PERIODO FISCAL', p.periodo_auditado || p.vigencia_pvcft || ''],
    ['MODALIDAD DE AUDITORIA:', p.modalidad || p.tipo_ejercicio || ''],
    ['FECHA DE SUSCRIPCIÓN:', serieExcel(p.fecha_suscripcion)]
  ];
  const cab = [
    'No.',
    'Código hallazgo',
    'Descripción hallazgo ',
    'Causa del hallazgo',
    'Efecto del hallazgo',
    'Acción de mejoramiento',
    'Propósito de la Acción de Mejora',
    'Descripción de las Actividades ',
    'Denominación de la Unidad de medida de la Actividad',
    'Cantidad de Medida de la Actividad',
    'Fecha iniciación de la Actividad',
    'Fecha terminación de la Actividad',
    'Plazo en semanas de la Actividad'
  ];
  const base = (x: { h: Hallazgo; a: Accion }, i: number): unknown[] => [
    i + 1,
    x.h.numero,
    x.h.descripcion,
    x.h.causa || '',
    x.h.efecto || '',
    x.a.accion,
    x.a.proposito || '',
    x.a.actividad || x.a.meta || '',
    x.a.unidad_medida,
    cantidadExcel(x.a.cantidad),
    serieExcel(x.a.fecha_inicio),
    serieExcel(x.a.fecha_fin)
  ];
  // formato de fecha solo donde hay un número de serie (una fecha faltante queda como celda vacía)
  const fecha = (ws: Hoja, r: number, c: number) => {
    const a = X.utils.encode_cell({ r, c });
    const cel = ws[a] as XLSX.CellObject | undefined;
    if (cel && typeof cel.v === 'number') Object.assign(cel, { t: 'n', z: 'dd/mm/yyyy' });
  };
  const vacias = (n: number) => Array.from({ length: n }, () => '');
  // Formulario 14 · suscripción
  const a1 = enc('SUSCRIPCIÓN PLANES DE MEJORAMIENTO', 'FORMULARIO No 14');
  a1.push([], [], [...cab, 'Area Responsable']);
  const d1 = a1.length;
  filas.forEach((x, i) =>
    a1.push([...base(x, i), semanas(x.a), ctx.dep(x.a.dependencia_id) || x.a.responsable || ''])
  );
  a1.push(
    [],
    [],
    [],
    [...vacias(9), 'FIRMA DEL REPRESENTANTE LEGAL'],
    [...vacias(9), 'Nombre: ' + (p.representante_legal || '')],
    [...vacias(9), 'Correo electrónico:']
  );
  const ws1 = X.utils.aoa_to_sheet(a1);
  fecha(ws1, 9, 1);
  filas.forEach((x, i) => {
    const r = d1 + i,
      n = r + 1;
    fecha(ws1, r, 10);
    fecha(ws1, r, 11);
    ws1[X.utils.encode_cell({ r, c: 12 })] = { t: 'n', v: semanas(x.a), f: `(+L${n}-K${n})/7`, z: '0.00' };
  });
  ws1['!cols'] = [6, 12, 50, 30, 30, 40, 30, 40, 18, 10, 12, 12, 10, 30].map(w => ({ wch: w }));
  // Formulario 14.1 · seguimiento
  const a2 = enc('SEGUIMIENTO PLANES DE MEJORAMIENTO', 'FORMULARIO No 14.1');
  a2[5] = ['ENTIDAD:', p.entidad || '', ...vacias(12), 'NIT:', p.nit || ''];
  a2.push(['Fecha de Evaluación:', ...vacias(17), serieExcel(corte)]);
  a2.push([
    ...cab,
    'Avance fisico de ejecución de las Actividades',
    'Porcentaje de Avance fisico de ejecución de las Actividades',
    'Puntaje  Logrado  por las Actividades  (PLAI)',
    'Puntaje Logrado por las Actividades  Vencidas (PLAVI)  ',
    'Puntaje atribuido a las actividades vencidas (PAAVI)',
    'Observaciones'
  ]);
  a2.push([]);
  const d2 = a2.length;
  const tot = { plai: 0, plavi: 0, paavi: 0, pbea: 0 };
  const calc = (a: Accion) => {
    const av = avanceAl(a, corte, ctx.d.avances) as { cantidad: number | null; descripcion?: string } | null,
      cant = av ? Number(av.cantidad) : 0,
      s = semanas(a),
      pc = pct(a, cant),
      venc = a.fecha_fin <= corte;
    return { av, cant, s, pc, venc };
  };
  filas.forEach((x, i) => {
    const { av, cant, s, pc, venc } = calc(x.a);
    tot.pbea += s;
    tot.plai += s * pc;
    tot.plavi += venc ? s * pc : 0;
    tot.paavi += venc ? s : 0;
    a2.push([
      ...base(x, i),
      s,
      cant,
      pc,
      s * pc,
      venc ? s * pc : 0,
      venc ? s : 0,
      av ? av.descripcion || '' : ''
    ]);
  });
  const rt = a2.length;
  a2.push(['TOTALES', ...vacias(14), tot.plai, tot.plavi, tot.paavi]);
  a2.push(['Elaboró: ' + ctx.usuario], []);
  a2.push(
    [...vacias(9), 'FIRMA DEL REPRESENTANTE LEGAL'],
    [...vacias(9), 'Nombre: ' + (p.representante_legal || '')],
    [...vacias(9), 'Correo electrónico:'],
    []
  );
  const re = a2.length;
  a2.push(['Convenciones: ', ...vacias(5), 'Evaluación del Plan de Mejoramiento']);
  a2.push([...vacias(6), 'Puntajes base de Evaluación:']);
  a2.push([
    '',
    '',
    'Columnas de calculo automático ',
    ...vacias(3),
    'Puntaje base de evalaluación de cumplimiento',
    ...vacias(10),
    'PBEC',
    '',
    tot.paavi
  ]);
  a2.push([
    '',
    '',
    'Informacion suministrada en el informe de la CGR ',
    ...vacias(3),
    'Puntaje base de evaluación de avance',
    ...vacias(10),
    'PBEA',
    '',
    tot.pbea
  ]);
  a2.push([
    '',
    '',
    'Fila de Totales',
    ...vacias(3),
    'Cumplimiento del Plan de Mejoramiento',
    ...vacias(10),
    'CPM = POMMVi / PBEC',
    '',
    tot.paavi ? tot.plavi / tot.paavi : 0
  ]);
  a2.push([
    ...vacias(6),
    'Avance del plan de Mejoramiento',
    ...vacias(10),
    'AP =  POMi / PBEA',
    '',
    tot.pbea ? tot.plai / tot.pbea : 0
  ]);
  const ws2 = X.utils.aoa_to_sheet(a2);
  fecha(ws2, 9, 1);
  const S11 = '$S$' + 11; // celda de la fecha de evaluación, como en la plantilla oficial
  fecha(ws2, 10, 18);
  const nPrimera = d2 + 1,
    nUltima = d2 + filas.length;
  filas.forEach((x, i) => {
    const r = d2 + i,
      n = r + 1,
      { s, pc, venc } = calc(x.a);
    fecha(ws2, r, 10);
    fecha(ws2, r, 11);
    const set = (c: number, v: number, f: string, z: string) =>
      (ws2[X.utils.encode_cell({ r, c })] = { t: 'n', v, f, z });
    set(12, s, `(+L${n}-K${n})/7`, '0.00');
    set(14, pc, `IF(N${n}/J${n}>1,1,+N${n}/J${n})`, '0%');
    set(15, s * pc, `+M${n}*O${n}`, '0.00');
    set(16, venc ? s * pc : 0, `IF(L${n}<=${S11},P${n},0)`, '0.00');
    set(17, venc ? s : 0, `IF(${S11}>=L${n},M${n},0)`, '0.00');
  });
  if (filas.length) {
    const nt = rt + 1;
    ws2[X.utils.encode_cell({ r: rt, c: 15 })] = {
      t: 'n',
      v: tot.plai,
      f: `SUM(P${nPrimera}:P${nUltima})`,
      z: '0.00'
    };
    ws2[X.utils.encode_cell({ r: rt, c: 16 })] = {
      t: 'n',
      v: tot.plavi,
      f: `SUM(Q${nPrimera}:Q${nUltima})`,
      z: '0.00'
    };
    ws2[X.utils.encode_cell({ r: rt, c: 17 })] = {
      t: 'n',
      v: tot.paavi,
      f: `SUM(R${nPrimera}:R${nUltima})`,
      z: '0.00'
    };
    const c19 = (r: number, v: number, f: string, z: string) =>
      (ws2[X.utils.encode_cell({ r, c: 19 })] = { t: 'n', v, f, z });
    c19(re + 2, tot.paavi, `+R${nt}`, '0.00');
    c19(re + 3, tot.pbea, `SUM(M${nPrimera}:M${nUltima})`, '0.00');
    c19(re + 4, tot.paavi ? tot.plavi / tot.paavi : 0, `IF(Q${nt}=0,0,+Q${nt}/T${re + 3})`, '0.00%');
    c19(re + 5, tot.pbea ? tot.plai / tot.pbea : 0, `IF(P${nt}=0,0,+P${nt}/T${re + 4})`, '0.00%');
  }
  ws2['!cols'] = [6, 12, 50, 30, 30, 40, 30, 40, 18, 10, 12, 12, 10, 12, 12, 12, 12, 12, 40, 12].map(w => ({
    wch: w
  }));
  return [ws1, ws2];
}

/** pmSheetAvanceSemestral: informe semestral de avance (art. 11), columnas 1 a 15 del art. 5 y 16, 17 y 18. */
export function hojaAvanceSemestral(X: SheetJS, p: Plan, corte: string, ctx: ContextoExport): Hoja {
  const datos = datosDelPlan(p, ctx.d);
  const aoa: unknown[][] = [
    ['CONTRALORÍA GENERAL DE SANTIAGO DE CALI'],
    ['FORMATO PM_01 CGSC - PLAN DE MEJORAMIENTO · INFORME SEMESTRAL DE AVANCE'],
    [],
    ['Entidad auditada (1): ' + (p.entidad || '')],
    ['Nombre de la actuación de control fiscal (2): ' + (p.ejercicio || '')],
    ['Tipo de actuación de control fiscal (3): ' + (p.tipo_ejercicio || '')],
    [
      'Fecha de suscripción (4): ' + formatoCorto(p.fecha_suscripcion),
      '',
      '',
      '',
      '',
      '',
      '',
      'Vigencia PVCFT (5)',
      p.vigencia_pvcft || ''
    ],
    [],
    [
      'FORMULACIÓN DEL PLAN DE MEJORAMIENTO',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'AVANCE DEL PLAN DE MEJORAMIENTO'
    ],
    [
      'N° hallazgo (6)',
      'Descripción de la condición y causa del hallazgo (7)',
      'Connotación del hallazgo (8)',
      'Macroproceso, criterio u otro (9)',
      'Acción correctiva (10)',
      'Meta (11)',
      'Fuente de verificación (12)',
      'Lugar de verificación (13)',
      'Fecha terminación de la actividad (14)',
      'Responsable (Nombre y Cargo) (15)',
      'Descripción del avance de ejecución (16)',
      'Fecha de corte del avance (17)',
      'Porcentaje de avance (18)'
    ]
  ];
  const merges: Rango[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
    { s: { r: 8, c: 0 }, e: { r: 8, c: 9 } },
    { s: { r: 8, c: 10 }, e: { r: 8, c: 12 } }
  ];
  const fechas: [number, number][] = [],
    pcts: [number, number][] = [];
  datos.forEach(({ h, acc }) => {
    const r0 = aoa.length;
    (acc.length ? acc : [null]).forEach(a => {
      const av = a
        ? (avanceAl(a, corte, ctx.d.avances) as { cantidad: number | null; descripcion?: string } | null)
        : null;
      if (a) fechas.push([aoa.length, 8]);
      if (a) fechas.push([aoa.length, 11]);
      if (a) pcts.push([aoa.length, 12]);
      aoa.push([
        h.numero,
        descripcionConCausa(h),
        connotacionPM01(h),
        h.macroproceso || '',
        a ? a.accion : '',
        a ? metaTxt(a) : '',
        a ? a.fuente_verificacion || '' : '',
        a ? a.lugar_verificacion || '' : '',
        a && fechaPlan(a.fecha_fin) ? serieExcel(a.fecha_fin) : '',
        a ? responsableTxt(a, ctx) : '',
        av ? av.descripcion || '' : '',
        a ? serieExcel(corte) : '',
        a ? (av ? pct(a, av.cantidad) : 0) : ''
      ]);
    });
    if (aoa.length - r0 > 1)
      for (let c = 0; c <= 3; c++) merges.push({ s: { r: r0, c }, e: { r: aoa.length - 1, c } });
  });
  aoa.push([], [], ['______________________________', '', '', '', '', '', '______________________________']);
  aoa.push([p.representante_legal || '', '', '', '', '', '', p.ordenador_gasto || '']);
  aoa.push([
    'Nombre y firma del Representante Legal',
    '',
    '',
    '',
    '',
    '',
    'Jefe de Control Interno (copia, art. 11)'
  ]);
  const ws = X.utils.aoa_to_sheet(aoa);
  fechas.forEach(([r, c]) => {
    const cel = ws[X.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
    if (cel && cel.v !== '') Object.assign(cel, { t: 'n', z: 'dd/mm/yyyy' });
  });
  pcts.forEach(([r, c]) => {
    const cel = ws[X.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
    if (cel && cel.v !== '') Object.assign(cel, { t: 'n', z: '0%' });
  });
  ws['!merges'] = merges;
  ws['!cols'] = [10, 60, 22, 18, 45, 28, 28, 22, 14, 32, 50, 14, 12].map(w => ({ wch: w }));
  return ws;
}

// ---------- nombre del archivo ----------
/** pmSiglaTipo. */
export function siglaTipo(p: Pick<Plan, 'tipo_ejercicio' | 'ejercicio'>): string {
  const t = llave((p.tipo_ejercicio || '') + ' ' + (p.ejercicio || ''));
  if (/aef ?df|denuncia/.test(t)) return 'AEFDF';
  if (/aef ?ta|tema o asunto/.test(t)) return 'AEFTA';
  if (/actuacion especial/.test(t)) return 'AEF';
  if (/abreviada|afgra/.test(t)) return 'AFGRA';
  if (/financiera/.test(t)) return 'AFGR';
  if (/desempeno/.test(t)) return 'AD';
  if (/cumplimiento/.test(t)) return 'AC';
  if (/cierre fiscal/.test(t)) return 'CIERRE';
  return 'PM';
}
/** pmNombreSIA: nombre exigido por el SIA Contralorías (FORMATO_202001_PM_CGSC_…). */
export function nombreSIA(
  p: Pick<Plan, 'fecha_suscripcion' | 'ejercicio' | 'vigencia_pvcft' | 'tipo_ejercicio'>,
  hoy: string,
  opts: { avance?: boolean; corte?: string | null } = {}
): string {
  const base = opts.corte || p.fecha_suscripcion || hoy;
  const ym = base.slice(0, 4) + base.slice(5, 7);
  // número de la actuación y su año: «Denuncia Fiscal Nº 896, vigencia 2025» o «896-2025» → _896_2025
  const t = txt(p.ejercicio) + ' ' + txt(p.vigencia_pvcft);
  let num = '';
  for (const m of t.matchAll(/\b(\d{1,5})\b/g)) {
    if (/^20\d{2}$/.test(m[1] as string)) continue;
    const ini = (m.index ?? 0) + m[0].length;
    const y = /\b(20\d{2})\b/.exec(t.slice(ini, ini + 60));
    if (y) {
      num = `_${m[1]}_${y[1]}`;
      break;
    }
  }
  const sufijo = opts.avance ? '_AVANCE' : '';
  return `FORMATO_202001_PM_CGSC_${ym}_${siglaTipo(p)}${num}${sufijo}.xlsx`.replace(/[^A-Za-z0-9_.-]/g, '');
}
/** Nombre del archivo de la CGR (pmDoExport). */
export const nombreF14 = (p: Pick<Plan, 'numero_informe' | 'ejercicio'>, corte: string) =>
  `F14_CGR_${llave(p.numero_informe || p.ejercicio)
    .replace(/[^a-z0-9]+/g, '_')
    .slice(0, 40)}_corte_${corte}.xlsx`;

// ---------- datos que faltan ----------
/**
 * pmFaltantesExport: el F14 usa la fecha de suscripción, las fechas de inicio y terminación y la cantidad de cada
 * acción; PM_01 y PM_02, la fecha de terminación. Lo que falte se exporta como celda vacía. Una cantidad 0 se exporta,
 * pero la fórmula de porcentaje de la plantilla de la CGR (IF(N/J>1,1,+N/J)) da #DIV/0! en Excel.
 */
export function faltantesExport(p: Plan, d: DatosPlanes) {
  const plan = fechaPlan(p.fecha_suscripcion) ? [] : ['fecha de suscripción'];
  const acciones: { id: string; hallazgo: string; accion: string; faltan: string[]; cero: boolean }[] = [];
  datosDelPlan(p, d).forEach(({ h, acc }) =>
    acc.forEach(a => {
      const faltan: string[] = [];
      if (!fechaPlan(a.fecha_inicio)) faltan.push('fecha de inicio');
      if (!fechaPlan(a.fecha_fin)) faltan.push('fecha de terminación');
      const cant = cantidadExcel(a.cantidad);
      if (cant === '') faltan.push('cantidad');
      if (faltan.length || cant === 0)
        acciones.push({ id: a.id, hallazgo: h.numero, accion: a.accion || '', faltan, cero: cant === 0 });
    })
  );
  return { plan, acciones };
}
