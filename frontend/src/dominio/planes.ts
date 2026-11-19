// Planes de mejoramiento · reglas centrales. Copia de la 2.x (src/js/19-planes-de-mejoramiento.js y
// 19-planes-norma-y-memoria.js): cálculo del Formulario 14.1 de la CGR (pmSemanas, pmPct, pmAvAl, pmIndic), estado de
// cada acción (pmEstado, pmCounts), calificación de la Contraloría General de Santiago de Cali (pmCumpSug, pmCalAcc,
// pmCalCgsc), resolución aplicable (pmRes) y revisión de calidad de datos (pmCalidad, pmAccIssues). `hoy` se recibe
// como dato. Paridad comprobada en pruebas/paridad-planes.test.ts.
import { textoCorto } from './actividad';
import { diasEntre } from './fechas';
import type { DetalleCausas } from './detalle-causas';

export const ALERTA_DIAS = 30;
export const FORMATOS: Readonly<Record<string, { corto: string; nombre: string; contraloria: string }>> = {
  PM_01_CGSC: {
    corto: 'CGSC',
    nombre: 'Formato PM_01 CGSC',
    contraloria: 'Contraloría General de Santiago de Cali'
  },
  F14_CGR: {
    corto: 'CGR',
    nombre: 'Formularios 14 y 14.1',
    contraloria: 'Contraloría General de la República'
  },
  OTRO: { corto: 'Otro', nombre: 'Otro formato', contraloria: '' }
};
export const formatoDe = (p: { formato: string }) =>
  FORMATOS[p.formato] ?? (FORMATOS.OTRO as (typeof FORMATOS)[string]);
export const CONNOTACIONES: Readonly<Record<string, string>> = {
  administrativa: 'Administrativa',
  disciplinaria: 'Disciplinaria',
  fiscal: 'Fiscal',
  penal: 'Penal',
  sancionatoria: 'Sancionatoria',
  otra: 'Otra incidencia'
};
export const ESTADO_PLAN: Readonly<Record<string, string>> = {
  formulacion: 'En formulación',
  en_ejecucion: 'En ejecución',
  cerrado: 'Cerrado'
};
export const ESTADO_AVANCE: Readonly<Record<string, string>> = {
  reportado: 'Por validar',
  validado: 'Validado',
  devuelto: 'Devuelto'
};

export interface Plan {
  id: string;
  formato: string;
  contraloria: string;
  entidad?: string;
  nit?: string;
  representante_legal?: string;
  ordenador_gasto?: string;
  ejercicio: string;
  tipo_ejercicio?: string;
  modalidad?: string;
  vigencia_pvcft?: string;
  periodo_auditado?: string;
  numero_informe?: string;
  radicado_orfeo?: string;
  fecha_informe?: string | null;
  fecha_suscripcion: string;
  estado: string;
  observaciones?: string;
  resolucion?: string;
  fecha_radicacion_informe?: string | null;
  requerimiento_id?: string | null;
  /** Dirección técnica responsable (columna del PM_01 que se importa del archivo). */
  direccion_tecnica?: string;
}
export interface Hallazgo {
  id: string;
  plan_id: string;
  numero: string;
  descripcion: string;
  causa?: string;
  efecto?: string;
  connotaciones?: string[] | null;
  cuantia?: number | null;
  macroproceso?: string;
  orden?: number | null;
  dependencia_id?: number | null;
  dependencia_texto?: string;
  // Script 28: análisis de causa que formula la dependencia y flujo de validación de Control Interno
  causa_metodo?: string;
  causa_raiz?: string;
  causa_documento?: string;
  causa_detalle?: DetalleCausas | null;
  formulacion_estado?: string;
  formulacion_obs?: string;
  formulacion_enviado_por?: string;
  formulacion_enviado_at?: string | null;
  formulacion_revisado_por?: string;
  formulacion_revisado_at?: string | null;
  sia_cargado_at?: string | null;
  eval_cgsc?: string;
  eval_cgsc_obs?: string;
  eval_cgsc_fecha?: string | null;
}
export interface Accion {
  id: string;
  plan_id: string;
  hallazgo_id: string;
  dependencia_id: number | null;
  responsable?: string;
  accion: string;
  proposito?: string;
  actividad?: string;
  meta?: string;
  unidad_medida?: string;
  cantidad: number | null;
  fuente_verificacion?: string;
  lugar_verificacion?: string;
  fecha_inicio: string | null;
  fecha_fin: string;
  fecha_fin_original?: string | null;
  avance: number | null;
  fecha_corte: string | null;
  orden?: number | null;
  cal_cumplimiento?: number | null;
  cal_efectividad?: number | null;
  obs_ci?: string | null;
  obs_ci_estado?: string | null;
}
export interface Avance {
  id: string;
  accion_id: string;
  plan_id: string;
  dependencia_id: number | null;
  fecha_corte: string;
  cantidad: number;
  descripcion: string;
  estado: 'reportado' | 'validado' | 'devuelto';
  radicado_orfeo?: string;
  soporte_path?: string | null;
  soporte_hash?: string | null;
  observacion?: string;
  reportado_email?: string;
  revisado_email?: string;
  revisado_at?: string | null;
  created_at: string;
}
export interface Traslado {
  id?: string;
  plan_id?: string;
  hallazgo_id: string;
  tipo: string;
  estado?: string;
  destino?: string;
  radicado?: string;
  fecha?: string | null;
  observaciones?: string;
}

/** Lo que ve cada usuario de los planes (secretario y enlace: solo lo de su dependencia). */
export interface DatosPlanes {
  planes: Plan[];
  hallazgos: Hallazgo[];
  acciones: Accion[];
  avances: Avance[];
  /** Traslados de los hallazgos (script 18): null si no están instalados; vacío para secretario y enlace. */
  traslados?: Traslado[] | null;
  /** Script 19 instalado (calificación CGSC, observaciones de Control Interno, oficio): PM.v19 de la 2.x. */
  v19?: boolean;
  /** Script 20 instalado (prórrogas, informes semestrales y archivo documental): PM.v20 de la 2.x. */
  v20?: boolean;
  /** Script 28 instalado (quién hace qué: la dependencia formula, Control Interno valida). */
  v28?: boolean;
  prorrogas?: Prorroga[];
  informes?: InformeAvance[];
  documentos?: DocumentoArchivo[];
}
/** Prórroga de presentación del plan, de un informe semestral o de una acción (arts. 15 y 16; script 20). */
export interface Prorroga {
  id: string;
  plan_id: string;
  accion_id?: string | null;
  tipo: string;
  corte?: string | null;
  estado: string;
  fecha_nueva?: string | null;
  [k: string]: unknown;
}
/** Informe semestral de avance enviado (art. 11; script 20). */
export interface InformeAvance {
  id: string;
  plan_id: string;
  corte: string;
  fecha_envio: string;
  radicado_orfeo?: string;
  documento_id?: string | null;
  observaciones?: string;
}
/** Documento del archivo documental (depósito «archivo», con su huella SHA-256; script 20). */
export interface DocumentoArchivo {
  id: string;
  plan_id: string | null;
  requerimiento_id?: string | null;
  tipo: string;
  nombre: string;
  path: string;
  mime: string;
  tamano: number;
  sha256: string;
  radicado_orfeo?: string;
  observaciones?: string;
  subido_email?: string;
  created_at: string;
  eliminado_at?: string | null;
}

// ---------- utilidades de texto ----------
/** pmTxt: espacios normalizados conservando los saltos de línea. */
export const txt = (v: unknown) =>
  String(v == null ? '' : v)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
/** pmKey: texto para comparar (sin tildes ni símbolos). */
export const llave = (s: unknown) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, ' ')
    .replace(/[^a-z0-9%()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** pmPctTxt. */
export const pctTxt = (v: number | null | undefined) =>
  v == null ? '—' : (Math.round(v * 1000) / 10).toLocaleString('es-CO') + '%';
/** pmNumTxt. */
export const numTxt = (v: unknown) => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
/** pmMetaTxt: meta en palabras + cantidad ("100% de supervisores capacitados" o "6 Conciliaciones"). */
export function metaTxt(a: Pick<Accion, 'unidad_medida' | 'cantidad' | 'meta'>): string {
  const pct = llave(a.unidad_medida).startsWith('porcent'),
    q = pct ? numTxt(a.cantidad) + '%' : numTxt(a.cantidad) + ' ' + (a.unidad_medida || '');
  if (!txt(a.meta)) return q;
  return pct && Number(a.cantidad) === 100 ? txt(a.meta) : txt(a.meta) + ' · ' + q;
}

// ---------- cálculo (Formulario 14.1 CGR) ----------
//   Plazo (semanas) = (fecha fin − fecha inicio) / 7          % avance = mín(1, avance físico / cantidad de la meta)
//   PLAI = plazo × % avance     PLAVI = PLAI si fecha fin ≤ fecha de evaluación, si no 0     PAAVI = plazo si vencida
//   Cumplimiento (CPM) = Σ PLAVI / Σ PAAVI        Avance (AP) = Σ PLAI / Σ plazo
export function semanas(a: Pick<Accion, 'fecha_inicio' | 'fecha_fin'>): number {
  if (!a.fecha_inicio || !a.fecha_fin) return 0;
  return Math.max(0, Math.round(diasEntre(a.fecha_inicio, a.fecha_fin)) / 7);
}
export function pct(a: Pick<Accion, 'cantidad' | 'avance'>, cant?: number | null): number {
  const c = Number(a.cantidad) || 0,
    v = cant == null ? Number(a.avance) || 0 : Number(cant) || 0;
  return c > 0 ? Math.min(1, Math.max(0, v / c)) : 0;
}
/** pmAvAl: último avance VALIDADO con fecha de corte hasta la indicada (o el avance cargado en la acción). */
export function avanceAl(
  a: Accion,
  corte: string,
  avances: readonly Avance[]
): { cantidad: number | null; fecha_corte: string } | null {
  const l = avances
    .filter(v => v.accion_id === a.id && v.estado === 'validado' && v.fecha_corte <= corte)
    .sort(
      (x, y) =>
        String(y.fecha_corte).localeCompare(String(x.fecha_corte)) ||
        String(y.revisado_at || '').localeCompare(String(x.revisado_at || ''))
    );
  const primero = l[0];
  if (primero) return primero;
  if (a.fecha_corte && a.fecha_corte <= corte) return { cantidad: a.avance, fecha_corte: a.fecha_corte };
  return null;
}
export interface Indicadores {
  n: number;
  pbea: number;
  pbec: number;
  plai: number;
  plavi: number;
  cpm: number | null;
  ap: number | null;
}
/** pmIndic: cumplimiento (CPM) y avance (AP) a la fecha de evaluación. */
export function indicadores(lista: readonly Accion[], fev: string, avances: readonly Avance[]): Indicadores {
  const o = { n: lista.length, pbea: 0, pbec: 0, plai: 0, plavi: 0 };
  for (const a of lista) {
    const av = avanceAl(a, fev, avances),
      p = pct(a, av ? av.cantidad : 0),
      s = semanas(a);
    o.pbea += s;
    o.plai += s * p;
    if (a.fecha_fin <= fev) {
      o.pbec += s;
      o.plavi += s * p;
    }
  }
  return {
    ...o,
    cpm: o.pbec ? o.plavi / o.pbec : null,
    ap: o.pbea ? o.plai / o.pbea : lista.length ? 0 : null
  };
}

export type EstadoAccion = 'cumplida' | 'vencida' | 'proxima' | 'termino';
/** pmEstado: estado de una acción hoy. */
export function estadoAccion(
  a: Pick<Accion, 'cantidad' | 'avance' | 'fecha_fin'>,
  hoy: string
): { k: EstadoAccion; pill: 'verde' | 'rojo' | 'amarillo' | 'neutral'; txt: string; d: number } {
  const p = pct(a),
    d = diasEntre(hoy, a.fecha_fin);
  if (p >= 1) return { k: 'cumplida', pill: 'verde', txt: 'Cumplida', d };
  if (d < 0) return { k: 'vencida', pill: 'rojo', txt: 'Vencida', d };
  if (d <= ALERTA_DIAS)
    return { k: 'proxima', pill: 'amarillo', txt: d === 0 ? 'Vence hoy' : `Vence en ${d} d`, d };
  return { k: 'termino', pill: 'neutral', txt: 'En término', d };
}
/** pmPend: avance reportado pendiente de validación. */
export const pendiente = (a: Pick<Accion, 'id'>, avances: readonly Avance[]) =>
  avances.find(v => v.accion_id === a.id && v.estado === 'reportado') ?? null;
/** pmUltimo: el avance más reciente. */
export const ultimo = (a: Pick<Accion, 'id'>, avances: readonly Avance[]) =>
  avances
    .filter(v => v.accion_id === a.id)
    .sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')))[0] ?? null;
export interface Conteo {
  n: number;
  cumplida: number;
  vencida: number;
  proxima: number;
  termino: number;
  pend: number;
  dev: number;
  sinDep: number;
}
/** pmCounts. */
export function conteos(lista: readonly Accion[], hoy: string, avances: readonly Avance[]): Conteo {
  const o: Conteo = {
    n: lista.length,
    cumplida: 0,
    vencida: 0,
    proxima: 0,
    termino: 0,
    pend: 0,
    dev: 0,
    sinDep: 0
  };
  for (const a of lista) {
    o[estadoAccion(a, hoy).k]++;
    if (pendiente(a, avances)) o.pend++;
    const u = ultimo(a, avances);
    if (u && u.estado === 'devuelto') o.dev++;
    if (!a.dependencia_id) o.sinDep++;
  }
  return o;
}

// ---------- calificación de la Contraloría General de Santiago de Cali (PM_01) ----------
//   Cumplimiento del plan = promedio(cumplimiento) × 100 / 2      Efectividad = promedio(efectividad) × 100 / 2
//   Calificación = cumplimiento × 0,2 + efectividad × 0,8          Solo promedian las acciones calificadas.
export const UMBRAL_CGSC = 80;
export const TEXTO_CALIFICACION: Readonly<Record<number, string>> = {
  0: 'No cumple',
  1: 'Cumple parcialmente',
  2: 'Cumple'
};
/** pmCumpSug: 2 si la meta se cumplió; 0 si venció sin cumplir; null si sigue en término. */
export function cumplimientoSugerido(a: Accion, fev: string, avances: readonly Avance[]): number | null {
  const av = avanceAl(a, fev, avances);
  const p = av ? pct(a, av.cantidad) : 0;
  if (p >= 1) return 2;
  if (a.fecha_fin && a.fecha_fin <= fev) return 0;
  return null;
}
/** pmCalAcc. */
export function calificacionAccion(a: Accion, fev: string, avances: readonly Avance[]) {
  const sug = cumplimientoSugerido(a, fev, avances);
  const c = a.cal_cumplimiento != null ? a.cal_cumplimiento : sug;
  const e = a.cal_efectividad != null ? a.cal_efectividad : null;
  return { c, e, sug, manual: a.cal_cumplimiento != null, estado: c === 2 && e === 2 ? 'C' : 'A' };
}
/** pmCalCgsc. */
export function calificacionCgsc(acc: readonly Accion[], fev: string, avances: readonly Avance[]) {
  const cs: number[] = [],
    es: number[] = [];
  let sinEf = 0;
  for (const a of acc) {
    const r = calificacionAccion(a, fev, avances);
    if (r.c != null) cs.push(r.c);
    if (r.e != null) es.push(r.e);
    else if (r.c != null) sinEf++;
  }
  const prom = (l: number[]) => (l.length ? (l.reduce((t, x) => t + x, 0) / l.length) * 50 : 0);
  const C = prom(cs),
    E = prom(es),
    T = C * 0.2 + E * 0.8;
  return {
    C,
    E,
    T,
    nC: cs.length,
    nE: es.length,
    sinEf,
    n: acc.length,
    concepto: cs.length ? (T >= UMBRAL_CGSC ? 'Cumple' : 'No cumple') : null
  };
}
/** pmPts: puntos con un decimal. */
export const puntos = (x: number) =>
  (Math.round(x * 10) / 10).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ---------- resolución aplicable (Contraloría General de Santiago de Cali) ----------
export const RESOLUCIONES: Readonly<
  Record<
    string,
    { nombre: string; corta: string; escala: number[]; plazoMeses: number | null; plazoTxt: string }
  >
> = {
  '24.043': {
    nombre: 'Resolución Reglamentaria 1000.30.00.24.043 del 17 de junio de 2024',
    corta: 'Res. 24.043',
    escala: [2, 0],
    plazoMeses: 6,
    plazoTxt: 'seis (6) meses (art. 5)'
  },
  '24.003': {
    nombre: 'Resolución Reglamentaria 1000.30.00.24.003 del 16 de enero de 2024',
    corta: 'Res. 24.003',
    escala: [2, 1, 0],
    plazoMeses: 12,
    plazoTxt: 'un (1) año (art. 5)'
  },
  anterior: {
    nombre: 'Resolución anterior al 24 de enero de 2024 (verifique la aplicable)',
    corta: 'Resolución anterior',
    escala: [2, 1, 0],
    plazoMeses: null,
    plazoTxt: ''
  }
};
/**
 * pmRes (igual a public.pm_resolucion_de() del script 20): presentados del 24-ene-2024 al 31-dic-2024 → 24.003; desde
 * el 1-ene-2025 → 24.043 (por la fecha de suscripción); se puede fijar a mano en el plan.
 */
export function resolucion(p: Pick<Plan, 'formato' | 'resolucion' | 'fecha_suscripcion'> | null): string {
  if (!p || p.formato !== 'PM_01_CGSC') return '';
  if (p.resolucion) return p.resolucion;
  const f = p.fecha_suscripcion;
  if (!f || f >= '2025-01-01') return '24.043';
  if (f >= '2024-01-24') return '24.003';
  return 'anterior';
}
export const resolucionInfo = (p: Parameters<typeof resolucion>[0]) => RESOLUCIONES[resolucion(p)] ?? null;
/** pmMasMeses: la fecha más n meses (con el desborde de fin de mes de JavaScript, igual que la 2.x). */
export function masMeses(iso: string, m: number): string {
  const [y, mo, d] = iso.split('-').map(Number) as [number, number, number];
  const f = new Date(Date.UTC(y, mo - 1 + m, d));
  return f.toISOString().slice(0, 10);
}

// ---------- calidad de datos ----------
const fechaCorta = (s: string | null | undefined) =>
  s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';

/** pmAccIssues: problemas de redacción y plazo de una acción. */
export function problemasAccion(a: Accion, p: Plan | null): string[] {
  const out: string[] = [];
  const acc = txt(a.accion);
  const primera = llave(acc.split(/\s+/)[0] || '');
  if (acc && !/(ar|er|ir)$/.test(primera))
    out.push('La acción debería empezar con un verbo en infinitivo (implementar, elaborar, realizar…).');
  const meta = txt(a.meta) + ' ' + (a.cantidad != null ? a.cantidad : '');
  if (!/\d|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|total/i.test(meta))
    out.push('La meta no es medible: incluya una cantidad o un porcentaje.');
  if (!txt(a.fuente_verificacion))
    out.push('Falta la fuente de verificación (la evidencia que se entregará).');
  // art. 5: 24.043 → seis (6) meses; 24.003 → un (1) año. Una prórroga concedida (art. 16) no cuenta.
  const ri = resolucionInfo(p);
  const max = ri && ri.plazoMeses;
  const base = (p && p.fecha_suscripcion) || a.fecha_inicio;
  const fin = a.fecha_fin_original || a.fecha_fin;
  if (ri && max && base && fin && fin > masMeses(base, max))
    out.push(
      `La fecha de terminación supera ${ri.plazoTxt} desde la suscripción (${ri.corta}; vence ${fechaCorta(fin)}).`
    );
  return out;
}
/** pmIncidencias: connotaciones que exigen traslado. */
export const incidencias = (h: Pick<Hallazgo, 'connotaciones'>) =>
  (h.connotaciones ?? []).filter(c =>
    ['disciplinaria', 'fiscal', 'penal', 'sancionatoria', 'otra'].includes(c)
  );
export interface ProblemaCalidad {
  nivel: 'r' | 'y';
  txt: string;
  act: string;
  id: string;
}
/** pmCalidad: todo lo que impide medir o exportar correctamente el plan (lo rojo primero). */
export function calidadPlan(
  p: Plan,
  hall: readonly Hallazgo[],
  acc: readonly Accion[],
  todas: readonly Accion[],
  avances: readonly Avance[],
  traslados: readonly Traslado[] | null,
  hoy: string
): ProblemaCalidad[] {
  const out: ProblemaCalidad[] = [];
  const add = (nivel: 'r' | 'y', t: string, act: string, id: string) => out.push({ nivel, txt: t, act, id });
  if (!p.fecha_suscripcion) add('r', 'El plan no tiene fecha de suscripción', 'pmEditPlan', p.id);
  if (p.formato === 'F14_CGR' && !p.nit)
    add('y', 'Falta el NIT de la entidad (lo exige el Formulario 14)', 'pmEditPlan', p.id);
  if (!p.representante_legal)
    add('y', 'Falta el nombre del representante legal para las firmas del formato', 'pmEditPlan', p.id);
  for (const h of hall) {
    if (!acc.some(a => a.hallazgo_id === h.id))
      add('r', `El hallazgo ${h.numero} no tiene acciones`, 'pmNewAcc', h.id);
    for (const a of todas.filter(x => x.hallazgo_id === h.id)) {
      const l = problemasAccion(a, p);
      if (l.length)
        add(
          'y',
          `Hallazgo ${h.numero}: ${l[0]}${l.length > 1 ? ` (y ${l.length - 1} más)` : ''}`,
          'pmEditAcc',
          a.id
        );
      if (a.obs_ci_estado === 'pendiente')
        add('y', `Hallazgo ${h.numero}: observación de Control Interno pendiente`, 'pmEditAcc', a.id);
    }
    if (traslados) {
      const sinTras = incidencias(h).filter(
        c => !traslados.some(t => t.hallazgo_id === h.id && t.tipo === c)
      );
      if (sinTras.length)
        add(
          'y',
          `El hallazgo ${h.numero} tiene incidencia ${sinTras.join(', ')} sin traslado registrado`,
          'pmNewTras',
          h.id
        );
    }
    if (!(h.connotaciones ?? []).length && p.formato === 'PM_01_CGSC')
      add('y', `El hallazgo ${h.numero} no tiene connotación`, 'pmEditHall', h.id);
  }
  for (const a of acc) {
    const h = hall.find(x => x.id === a.hallazgo_id),
      n = `Hallazgo ${h?.numero || '?'} · «${textoCorto(a.accion, 60)}»`;
    if (!a.dependencia_id)
      add('r', `${n}: sin dependencia asignada (nadie la ve ni la reporta)`, 'pmEditAcc', a.id);
    if (semanas(a) === 0)
      add('y', `${n}: inicio y fin el mismo día, no pesa en los indicadores`, 'pmEditAcc', a.id);
    if (p.fecha_suscripcion && a.fecha_fin < p.fecha_suscripcion)
      add('r', `${n}: termina antes de la suscripción del plan`, 'pmEditAcc', a.id);
    if (!txt(a.meta) && p.formato === 'PM_01_CGSC')
      add('y', `${n}: sin meta (columna 11 del PM_01)`, 'pmEditAcc', a.id);
    if (!txt(a.fuente_verificacion)) add('y', `${n}: sin fuente de verificación`, 'pmEditAcc', a.id);
    if (p.formato === 'F14_CGR' && !txt(a.actividad))
      add('y', `${n}: sin descripción de actividades (Formulario 14)`, 'pmEditAcc', a.id);
    if (estadoAccion(a, hoy).k === 'vencida' && !pendiente(a, avances))
      add('r', `${n}: vencida sin cumplir y sin avance en validación`, 'pmOpenAcc', a.id);
  }
  return out.sort((a, b) => (a.nivel === 'r' ? 0 : 1) - (b.nivel === 'r' ? 0 : 1));
}

// ---------- lectura de números y fechas (pmNum y pmFecha de la 2.x) ----------
/** pmNum: "1.234,5", "1,234.5", "45%", "$ 300" → número; NaN si no se puede. */
export function numero(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v)
    .replace(/[%\s$]/g, '')
    .trim();
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.'))
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}
const MESES_PM: Readonly<Record<string, number>> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  jan: 1,
  apr: 4,
  aug: 8,
  dec: 12
};
function isoValida(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}
/**
 * pmFecha: fecha desde Excel o texto (número de serie, 30/06/2022, 2022-06-30, 30/jun/2022, "30 de junio de 2022",
 * "junio 30 de 2022"). Devuelve AAAA-MM-DD o null.
 */
export function fechaPlan(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime()))
    return isoValida(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isoValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = llave(v).replace(/[()]/g, ' ');
  let m = s.match(/(\d{4}) (\d{1,2}) (\d{1,2})/);
  if (m) return isoValida(+(m[1] as string), +(m[2] as string), +(m[3] as string));
  m = s.match(/(\d{1,2}) (\d{1,2}) (\d{2,4})/);
  if (m) return isoValida(+(m[3] as string), +(m[2] as string), +(m[1] as string));
  m = s.match(/(\d{1,2}) (?:de )?([a-z]{3,})\.? (?:de |del )?(\d{2,4})/);
  const mes1 = m ? MESES_PM[(m[2] as string).slice(0, 3)] : undefined;
  if (m && mes1) return isoValida(+(m[3] as string), mes1, +(m[1] as string));
  m = s.match(/([a-z]{3,}) (\d{1,2}) (?:de |del )?(\d{4})/);
  const mes2 = m ? MESES_PM[(m[1] as string).slice(0, 3)] : undefined;
  if (m && mes2) return isoValida(+(m[3] as string), mes2, +(m[2] as string));
  return null;
}

// ---------- validaciones de los formularios (pmSavePlan, pmSaveHall, pmSaveAcc, pmSaveAv, pmDoReview) ----------
export function validarPlan(
  o: Pick<Plan, 'contraloria' | 'ejercicio' | 'fecha_suscripcion'> & { fecha_informe?: string | null }
) {
  if (!o.contraloria) return 'Indica la contraloría';
  if (o.ejercicio.length < 4) return 'Escribe el nombre del ejercicio de fiscalización';
  if (!fechaPlan(o.fecha_suscripcion)) return 'Indica la fecha de suscripción del plan';
  if (o.fecha_informe && !fechaPlan(o.fecha_informe)) return 'La fecha del informe no es válida';
  return null;
}
export function validarHallazgo(o: {
  numero: string;
  descripcion: string;
  cuantiaTexto: string;
  cuantia: number | null;
}) {
  if (!o.numero) return 'Indica el número del hallazgo';
  if (o.descripcion.length < 4) return 'Describe el hallazgo';
  if (o.cuantiaTexto && (o.cuantia == null || isNaN(o.cuantia) || o.cuantia < 0))
    return 'La cuantía debe ser un número';
  return null;
}
/** Errores que impiden guardar una acción (las advertencias de redacción van aparte: problemasAccion). */
export function validarAccion(
  o: Pick<Accion, 'accion' | 'unidad_medida' | 'cantidad' | 'fecha_inicio' | 'fecha_fin' | 'dependencia_id'>
) {
  if (o.accion.length < 4) return 'Describe la acción';
  if (!o.unidad_medida) return 'Indica la unidad de medida';
  if (!(Number(o.cantidad) > 0)) return 'La cantidad de la meta debe ser mayor que cero';
  if (!fechaPlan(o.fecha_inicio) || !fechaPlan(o.fecha_fin))
    return 'Indica las fechas de inicio y de terminación';
  if ((o.fecha_fin as string) < (o.fecha_inicio as string))
    return 'La fecha de terminación no puede ser anterior a la de inicio';
  if (!o.dependencia_id) return 'Asigna la dependencia responsable: sin ella nadie podrá reportar el avance';
  return null;
}
export function validarAvance(
  o: { fecha_corte: string; cantidad: number; descripcion: string; radicado_orfeo: string },
  archivo: { nombre: string; tipo: string; tamano: number } | null,
  hoy: string
) {
  if (!fechaPlan(o.fecha_corte)) return 'Indica la fecha de corte';
  if (o.fecha_corte > hoy) return 'La fecha de corte no puede ser futura';
  if (isNaN(o.cantidad) || o.cantidad < 0) return 'El avance debe ser un número mayor o igual a cero';
  if (o.descripcion.length < 10) return 'Describe el avance (mínimo 10 caracteres)';
  if (o.radicado_orfeo && !/^\d{10,20}$/.test(o.radicado_orfeo))
    return 'El radicado ORFEO debe tener entre 10 y 20 dígitos';
  if (!archivo && !o.radicado_orfeo) return 'Adjunta el PDF del soporte o indica el radicado ORFEO';
  if (archivo && archivo.tipo && archivo.tipo !== 'application/pdf' && !/\.pdf$/i.test(archivo.nombre))
    return 'El soporte debe ser un archivo PDF';
  if (archivo && archivo.tamano > 10 * 1024 * 1024) return 'El PDF supera 10 MB';
  return null;
}
export const validarDevolucion = (estado: string, obs: string) =>
  estado === 'devuelto' && txt(obs).length < 5
    ? 'Indica a la dependencia por qué se devuelve el avance'
    : null;
/** ¿Puede reportar avance? (pmCanReport): quien edita planes, o secretaría y enlace en su dependencia. */
export const puedeReportar = (a: Pick<Accion, 'dependencia_id'> | null, rol: string, dep: number | null) =>
  !!a &&
  (['admin', 'control_interno'].includes(rol) ||
    (['secretario', 'enlace'].includes(rol) && !!dep && String(a.dependencia_id) === String(dep)));
export const puedeEditarPlanes = (rol: string) => ['admin', 'control_interno'].includes(rol);
export const TIPOS_EJERCICIO = [
  'Auditoría financiera y de gestión',
  'Auditoría de cumplimiento',
  'Auditoría de desempeño',
  'Actuación especial de fiscalización',
  'Otra'
];

/** pmSavePlan: las columnas de los scripts 19 y 20 solo se envían si están instalados (si no, guardar fallaría). */
/** Columnas del script 28 (quién hace qué): no se envían si la base aún no lo tiene. */
export const COLUMNAS_V28 = [
  'causa_metodo',
  'causa_raiz',
  'causa_documento',
  'causa_detalle',
  'eval_cgsc',
  'eval_cgsc_obs',
  'eval_cgsc_fecha',
  'puntaje_cgsc'
] as const;
export function columnasInstaladas(o: Record<string, unknown>, v: Pick<DatosPlanes, 'v19' | 'v20' | 'v28'>) {
  if (!v.v28) {
    delete o.causa_metodo;
    delete o.causa_raiz;
    delete o.causa_documento;
    delete o.causa_detalle;
    delete o.eval_cgsc;
    delete o.eval_cgsc_obs;
    delete o.eval_cgsc_fecha;
    delete o.puntaje_cgsc;
  }
  if (!v.v19) {
    delete o.direccion_tecnica;
    delete o.requerimiento_id;
  }
  if (v.v20) o.fecha_radicacion_informe = o.fecha_radicacion_informe || null;
  else {
    delete o.resolucion;
    delete o.fecha_radicacion_informe;
  }
  return o;
}
