// Planes de mejoramiento · entrega 4c-2: oficio de remisión del informe, aprobación del plan y mensaje de notificación a
// la dependencia. Copia fiel de src/js/19-planes-de-mejoramiento.js de la 2.x (pmReqSugerido, pmAprobarModal y pmMsg).
import { textoCorto } from './actividad';
import { formatoCorto } from './fechas';
import {
  ALERTA_DIAS,
  FORMATOS,
  estadoAccion,
  llave,
  pct,
  pctTxt,
  problemasAccion,
  txt,
  type DatosPlanes,
  type Plan
} from './planes';

/** Lo que se necesita de un requerimiento (oficio de la contraloría). */
export interface OficioReq {
  id: string;
  radicado: string;
  asunto: string;
  estado: string;
  fecha_radicacion?: string | null;
  fecha_limite?: string | null;
}

/**
 * pmReqSugerido: el oficio que remitió el informe, por el número de la actuación con su año ("896-2025",
 * "Nº 896, vigencia 2025", "896 de 2025"); prefiere los abiertos.
 */
export function oficioSugerido<R extends OficioReq>(p: Plan, reqs: readonly R[]): R | null {
  const t = txt(p.ejercicio) + ' ' + txt(p.numero_informe) + ' ' + txt(p.vigencia_pvcft);
  const anos = [...new Set(t.match(/\b20\d{2}\b/g) || [])];
  const nums = [...new Set((t.match(/\b\d{2,5}\b/g) || []).filter(n => !/^20\d{2}$/.test(n)))];
  const claves: string[] = [];
  // llave quita los signos: "896-2025" y "896 de 2025" quedan como "8962025" y "896de2025"
  nums.forEach(n => anos.forEach(a => claves.push(n + a, n + 'de' + a)));
  if (!claves.length) return null;
  const norm = (x: unknown) => ' ' + llave(x).replace(/\s+/g, '') + ' ';
  const cands = reqs.filter(r => {
    if (!/informe final|plan de mejoramiento/i.test(r.asunto || '')) return false;
    const a = norm(r.asunto);
    return claves.some(k => a.includes(k));
  });
  return (
    cands.slice().sort((x, y) => (x.estado === 'abierto' ? 0 : 1) - (y.estado === 'abierto' ? 0 : 1))[0] ??
    null
  );
}

/** pmAprobarModal: lo que impide aprobar el plan y lo que conviene revisar (no lo impide). */
export function revisionAprobacion(p: Plan, d: DatosPlanes) {
  const hall = d.hallazgos.filter(h => h.plan_id === p.id),
    acc = d.acciones.filter(a => a.plan_id === p.id);
  const sinAcc = hall.filter(h => !acc.some(a => a.hallazgo_id === h.id));
  const pend = acc.filter(a => a.obs_ci_estado === 'pendiente');
  const avisos = acc
    .map(a => ({ a, l: problemasAccion(a, p) }))
    .filter(x => x.l.length)
    .map(x => `• ${textoCorto(x.a.accion, 70)}: ${x.l.join(' ')}`);
  const bloqueos: string[] = [];
  if (!acc.length) bloqueos.push('El plan no tiene acciones.');
  if (sinAcc.length) bloqueos.push(`Hallazgos sin acciones: ${sinAcc.map(h => h.numero).join(', ')}.`);
  if (pend.length) bloqueos.push(`${pend.length} observación(es) de Control Interno pendientes.`);
  return { bloqueos, avisos };
}

/** pmMsg: mensaje para la dependencia con sus acciones vencidas y las que vencen pronto. */
export function mensajeDependencia(
  depId: number | string,
  d: DatosPlanes,
  depNombre: string,
  hoy: string
): { n: number; txt: string } {
  const l = d.acciones
    .filter(a => String(a.dependencia_id) === String(depId))
    .filter(a => ['vencida', 'proxima'].includes(estadoAccion(a, hoy).k))
    .sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)));
  const venc = l.filter(a => estadoAccion(a, hoy).k === 'vencida'),
    prox = l.filter(a => estadoAccion(a, hoy).k === 'proxima');
  const linea = (a: (typeof l)[number]) => {
    const p = d.planes.find(x => x.id === a.plan_id),
      h = d.hallazgos.find(x => x.id === a.hallazgo_id);
    const corto = (FORMATOS[p?.formato ?? ''] ?? FORMATOS.OTRO)?.corto;
    return `- ${corto}, hallazgo ${h?.numero}: ${textoCorto(a.accion, 120)} (termina ${formatoCorto(a.fecha_fin)}; avance validado ${pctTxt(pct(a))})`;
  };
  return {
    n: l.length,
    txt:
      `Respetado(a) secretario(a) / director(a):\n\nLe informo el estado de las acciones de los planes de mejoramiento suscritos con las contralorías a cargo de ${depNombre}, con corte al ${formatoCorto(hoy)}:\n` +
      (venc.length
        ? `\nAcciones vencidas sin cumplimiento total (${venc.length}):\n${venc.map(linea).join('\n')}\n`
        : '') +
      (prox.length
        ? `\nAcciones que vencen en los próximos ${ALERTA_DIAS} días (${prox.length}):\n${prox.map(linea).join('\n')}\n`
        : '') +
      `\nLe solicito reportar el avance con su soporte en la aplicación Control de Entes (módulo Planes de mejoramiento), para su validación y posterior reporte a la contraloría.\n\nCordialmente,\nDespacho del Alcalde`
  };
}
