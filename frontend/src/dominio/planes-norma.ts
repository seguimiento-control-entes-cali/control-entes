// Planes de mejoramiento · norma de la CGSC (entrega 4a): plazos de presentación del plan (art. 7) y de los informes
// semestrales (art. 11), prórrogas (arts. 15 y 16) y nuevo plan por acciones con calificación inferior a 100 (art. 12,
// par. 5). Copia fiel de src/js/19-planes-norma-y-memoria.js de la 2.x (pmPresentacion, pmCortes, pmInformes,
// pmInformesPendientes, pmProrRequisitos, pmPuedeProrrogar, pmAccionesBajo100 y pmNuevoPlanCrear). Requiere el script 20.
import { sumarHabiles } from './dias-habiles';
import { diasEntre, formatoCorto, sumarDias } from './fechas';
import { habilesEntre } from './historico';
import {
  calificacionAccion,
  fechaPlan,
  pct,
  pctTxt,
  resolucion,
  type Accion,
  type Avance,
  type DatosPlanes,
  type InformeAvance,
  type Plan,
  type Prorroga
} from './planes';
import type { CargaPlan } from './planes-importar';

export const DIAS_PRESENTAR = 15;
export const DIAS_INFORME = 15;
export const DIAS_PRORROGA_PRESENTAR = 5; // art. 15: máximo 5 días hábiles, pedida con 5 días hábiles de antelación
export const DIAS_ANTELACION_ACCION = 15; // art. 16: pedida 15 días hábiles antes del vencimiento

/** Oficio de remisión enlazado al plan (llega con la entrega 4c; la 2.x lo toma de pmReqDe). */
export interface OficioPlan {
  fecha_radicacion?: string | null;
  fecha_limite?: string | null;
}

/** pmPresentacion: plazo de 15 días hábiles desde la radicación del informe final (art. 7). */
export function presentacion(p: Plan, prorrogas: readonly Prorroga[], oficio: OficioPlan | null = null) {
  if (!resolucion(p)) return null;
  const base = p.fecha_radicacion_informe || oficio?.fecha_radicacion || null;
  if (!base) return { base: null } as const;
  const limiteNorma = sumarHabiles(base, DIAS_PRESENTAR);
  const pr =
    prorrogas.find(x => x.plan_id === p.id && x.tipo === 'presentacion' && x.estado !== 'negada') ?? null;
  const limite = pr && pr.estado === 'concedida' ? (pr.fecha_nueva as string) : limiteNorma;
  const presentado = p.estado !== 'formulacion';
  return {
    base,
    limiteNorma,
    limite,
    prorroga: pr,
    presentado,
    tarde: presentado && p.fecha_suscripcion > limite,
    reqLimite: oficio && oficio.fecha_limite && oficio.fecha_limite !== limite ? oficio.fecha_limite : null
  };
}
/** pmCortes: 30 de junio y 31 de diciembre desde la suscripción hasta el primero posterior a «hasta». */
export function cortes(p: Plan, hasta: string): string[] {
  if (!resolucion(p) || p.estado === 'formulacion' || !fechaPlan(p.fecha_suscripcion)) return [];
  const out: string[] = [];
  for (let y = +p.fecha_suscripcion.slice(0, 4); y <= +hasta.slice(0, 4) + 1; y++)
    ['06-30', '12-31'].forEach(md => {
      const c = `${y}-${md}`;
      if (c >= p.fecha_suscripcion) out.push(c);
    });
  const i = out.findIndex(c => c > hasta);
  return i < 0 ? out : out.slice(0, i + 1);
}
export type EstadoInforme = 'presentado' | 'tarde' | 'pendiente' | 'vencido' | 'futuro' | 'no_aplica';
export const ESTADO_INFORME: Readonly<Record<EstadoInforme, readonly [string, string]>> = {
  presentado: ['verde', 'Presentado'],
  tarde: ['amarillo', 'Presentado fuera de término'],
  pendiente: ['amarillo', 'Por presentar'],
  vencido: ['rojo', 'Vencido sin presentar'],
  futuro: ['neutral', 'Próximo corte'],
  no_aplica: ['neutral', 'Plan cerrado']
};
export interface InformeCorte {
  corte: string;
  vence: string;
  inf: InformeAvance | null;
  prorroga: Prorroga | null;
  estado: EstadoInforme;
}
/** pmInformes: informes semestrales de un plan (art. 11), con su vencimiento y estado. */
export function informes(
  p: Plan,
  prorrogas: readonly Prorroga[],
  enviados: readonly InformeAvance[],
  hoy: string
): InformeCorte[] {
  return cortes(p, hoy).map(corte => {
    const inf = enviados.find(x => x.plan_id === p.id && x.corte === corte) ?? null;
    const pr = prorrogas.find(
      x => x.plan_id === p.id && x.tipo === 'informe' && x.corte === corte && x.estado !== 'negada'
    );
    const vence =
      pr && pr.estado === 'concedida' ? (pr.fecha_nueva as string) : sumarHabiles(corte, DIAS_INFORME);
    let estado: EstadoInforme;
    if (inf) estado = inf.fecha_envio > vence ? 'tarde' : 'presentado';
    else if (p.estado === 'cerrado') estado = 'no_aplica';
    else if (corte > hoy) estado = 'futuro';
    else if (vence < hoy) estado = 'vencido';
    else estado = 'pendiente';
    return { corte, vence, inf, prorroga: pr ?? null, estado };
  });
}
/** pmInformesPendientes: informes por presentar o vencidos de todos los planes, por vencimiento. */
export function informesPendientes(d: DatosPlanes, hoy: string): (InformeCorte & { p: Plan })[] {
  const out: (InformeCorte & { p: Plan })[] = [];
  d.planes.forEach(p =>
    informes(p, d.prorrogas ?? [], d.informes ?? [], hoy).forEach(i => {
      if (i.estado === 'vencido' || i.estado === 'pendiente') out.push({ p, ...i });
    })
  );
  return out.sort((a, b) => a.vence.localeCompare(b.vence));
}

// ---------- prórrogas ----------
export type TipoProrroga = 'accion' | 'presentacion' | 'informe';
export const TITULO_PRORROGA: Readonly<Record<TipoProrroga, string>> = {
  accion: 'Prórroga de la fecha de finalización (art. 16)',
  presentacion: 'Prórroga de presentación del plan (art. 15)',
  informe: 'Prórroga del informe semestral (art. 15)'
};
export interface ContextoProrroga {
  a?: Accion;
  p?: Plan;
  venc?: string;
  corte?: string | null;
}
/** pmProrRequisitos: requisitos de cada tipo de prórroga, [{ ok, txt }]. */
export function requisitosProrroga(
  tipo: TipoProrroga,
  ctx: ContextoProrroga,
  f: { fecha_solicitud: string; fecha_nueva: string },
  prorrogas: readonly Prorroga[]
): { ok: boolean; txt: string }[] {
  const r: { ok: boolean; txt: string }[] = [];
  const sol = f.fecha_solicitud,
    nueva = f.fecha_nueva;
  if (tipo === 'accion') {
    const a = ctx.a as Accion;
    const previa = prorrogas.some(x => x.accion_id === a.id && x.estado !== 'negada');
    r.push({ ok: !previa, txt: 'Se solicita por una sola vez (art. 16)' });
    const pc = pct(a);
    r.push({
      ok: pc > 0.5,
      txt: `Más de la mitad de la meta cumplida con avance validado (hoy: ${pctTxt(pc)})`
    });
    const fin = (a.fecha_fin_original as string | undefined) || a.fecha_fin;
    const dias = Math.max(0, Math.round(diasEntre(a.fecha_inicio ?? fin, fin)));
    const max = sumarDias(fin, Math.ceil(dias * 0.3));
    r.push({
      ok: !!fechaPlan(nueva) && nueva > a.fecha_fin && nueva <= max,
      txt: `Nueva fecha posterior a ${formatoCorto(a.fecha_fin)} y no mayor al 30 % del plazo inicial (máximo ${formatoCorto(max)})`
    });
    r.push({
      ok: !!fechaPlan(sol) && habilesEntre(sol, a.fecha_fin) >= DIAS_ANTELACION_ACCION,
      txt: `Solicitada al menos 15 días hábiles antes del vencimiento (${formatoCorto(a.fecha_fin)}): ${fechaPlan(sol) ? habilesEntre(sol, a.fecha_fin) + ' días hábiles' : '—'}`
    });
  } else {
    const venc = ctx.venc as string;
    const p = ctx.p as Plan;
    const previa = prorrogas.some(
      x =>
        x.plan_id === p.id &&
        x.tipo === tipo &&
        x.estado !== 'negada' &&
        (tipo !== 'informe' || x.corte === ctx.corte)
    );
    const max = sumarHabiles(venc, DIAS_PRORROGA_PRESENTAR);
    r.push({ ok: !previa, txt: 'Se solicita por una sola vez (art. 15)' });
    r.push({
      ok: !!fechaPlan(sol) && habilesEntre(sol, venc) >= DIAS_PRORROGA_PRESENTAR,
      txt: `Solicitada con al menos 5 días hábiles de antelación al vencimiento (${formatoCorto(venc)}): ${fechaPlan(sol) ? habilesEntre(sol, venc) + ' días hábiles' : '—'}`
    });
    r.push({
      ok: !!fechaPlan(nueva) && nueva > venc && nueva <= max,
      txt: `Prórroga de máximo 5 días hábiles (hasta ${formatoCorto(max)})`
    });
  }
  return r;
}
/** pmPuedeProrrogar: botón «Prórroga» de una acción. */
export function puedeProrrogar(a: Accion, d: DatosPlanes, edita: boolean): boolean {
  const p = d.planes.find(x => x.id === a.plan_id);
  return (
    edita &&
    !!d.v20 &&
    !!p &&
    !!resolucion(p) &&
    p.estado === 'en_ejecucion' &&
    pct(a) < 1 &&
    !(d.prorrogas ?? []).some(x => x.accion_id === a.id && x.estado !== 'negada')
  );
}
/** pmProrLinea: texto de la última prórroga de una acción, o null. */
export function lineaProrroga(
  a: Accion,
  prorrogas: readonly Prorroga[]
): { pr: Prorroga; texto: string } | null {
  const pr = prorrogas
    .filter(x => x.accion_id === a.id)
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
  if (!pr) return null;
  const texto =
    pr.estado === 'concedida'
      ? `Prórroga concedida (art. 16): termina ${formatoCorto(a.fecha_fin)}; fecha original ${formatoCorto((a.fecha_fin_original as string | undefined) || (pr.fecha_vencimiento_anterior as string))}`
      : pr.estado === 'negada'
        ? `Prórroga negada (solicitada hasta ${formatoCorto(pr.fecha_nueva)})`
        : `Prórroga solicitada hasta ${formatoCorto(pr.fecha_nueva)}, pendiente de respuesta de la CGSC`;
  return { pr, texto };
}

// ---------- nuevo plan por acciones con calificación inferior a 100 ----------
/** pmAccionesBajo100: una acción obtiene 100 puntos solo con cumplimiento 2 y efectividad 2. */
export function accionesBajo100(
  p: Plan,
  acciones: readonly Accion[],
  avances: readonly Avance[],
  fev: string
): Accion[] {
  return acciones.filter(a => {
    if (a.plan_id !== p.id) return false;
    const r = calificacionAccion(a, fev, avances);
    return r.c != null && r.e != null && !(r.c === 2 && r.e === 2);
  });
}
/** Duración inicial de una acción en días (mínimo 1). */
export const duracionAccion = (a: Accion) =>
  Math.max(
    1,
    Math.round(
      diasEntre(a.fecha_inicio ?? a.fecha_fin, (a.fecha_fin_original as string | undefined) || a.fecha_fin)
    )
  );
/** Nueva fecha de terminación: Res. 24.043 → 30 % del tiempo inicial; 24.003 → el mismo tiempo. */
export const nuevaFinAccion = (a: Accion, res: string, hoy: string) =>
  sumarDias(hoy, res === '24.043' ? Math.ceil(duracionAccion(a) * 0.3) : duracionAccion(a));
/** pmNuevoPlanCrear: carga para pm_importar con el plan nuevo en formulación, enlazado al original. */
export function cargaNuevoPlan(p: Plan, d: DatosPlanes, hoy: string, fev: string): CargaPlan {
  const l = accionesBajo100(p, d.acciones, d.avances, fev);
  const res = resolucion(p);
  const porHall: Record<string, Accion[]> = {};
  l.forEach(a => (porHall[a.hallazgo_id] = porHall[a.hallazgo_id] || []).push(a));
  const plan = {
    formato: p.formato,
    contraloria: p.contraloria,
    ente_id: (p as { ente_id?: number | null }).ente_id || null,
    entidad: p.entidad ?? '',
    nit: p.nit || '',
    representante_legal: p.representante_legal || '',
    ordenador_gasto: p.ordenador_gasto || '',
    ejercicio: 'Nuevo plan (art. 12, par. 5) · ' + p.ejercicio,
    tipo_ejercicio: p.tipo_ejercicio || '',
    modalidad: p.modalidad || '',
    vigencia_pvcft: p.vigencia_pvcft || '',
    periodo_auditado: p.periodo_auditado || '',
    numero_informe: p.numero_informe || '',
    radicado_orfeo: '',
    fecha_informe: p.fecha_informe || null,
    fecha_suscripcion: hoy,
    estado: 'formulacion',
    resolucion: p.resolucion || '',
    plan_origen_id: p.id,
    direccion_tecnica: p.direccion_tecnica || '',
    observaciones: `Acciones con calificación inferior a 100 puntos en el plan «${p.ejercicio}».`
  };
  return {
    archivo: 'nuevo plan (art. 12, par. 5)',
    plan: plan as unknown as CargaPlan['plan'],
    hallazgos: Object.keys(porHall).map(hid => {
      const h = d.hallazgos.find(x => x.id === hid);
      return {
        numero: h?.numero ?? '',
        descripcion: h?.descripcion ?? '',
        causa: h?.causa || '',
        efecto: h?.efecto || '',
        connotaciones: h?.connotaciones || [],
        cuantia: h?.cuantia ?? null,
        macroproceso: h?.macroproceso || '',
        dependencia_id: h?.dependencia_id || null,
        dependencia_texto: (h?.dependencia_texto as string | undefined) || '',
        acciones: (porHall[hid] ?? []).map(a => ({
          dependencia_id: a.dependencia_id || null,
          responsable: a.responsable || '',
          accion: a.accion,
          proposito: a.proposito || '',
          actividad: a.actividad || '',
          meta: a.meta || '',
          unidad_medida: a.unidad_medida || 'Unidades',
          cantidad: a.cantidad as number,
          fuente_verificacion: a.fuente_verificacion || '',
          lugar_verificacion: a.lugar_verificacion || '',
          fecha_inicio: hoy,
          fecha_fin: nuevaFinAccion(a, res, hoy),
          avance: null,
          fecha_corte: null,
          descripcion_avance: '',
          obs_ci: ''
        }))
      };
    })
  };
}
