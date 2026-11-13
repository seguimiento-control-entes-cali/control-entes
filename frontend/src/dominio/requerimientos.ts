// Módulo operativo: requerimientos vivos de la vigencia. Copia de la 2.x: decorate y counts de
// src/js/05-reglas-de-negocio.js, diasTxt de 02-utilidades.js, y vTablero, renderReqRows y saveReq de
// 07-vistas-operacion.js. Paridad comprobada en pruebas/paridad-requerimientos.test.ts.
import { calcularSemaforo, type Semaforo } from './semaforo';
import { normalizarTexto } from './temas';

/** Fila de public.v_requerimientos (la vista agrega ente, sigla y dependencia). */
export interface Requerimiento {
  id: string;
  radicado: string;
  vigencia: number;
  ente_id: number;
  dependencia_id: number;
  asunto: string;
  fecha_radicacion: string;
  fecha_limite: string;
  estado: 'abierto' | 'cerrado';
  orfeo_salida: string | null;
  fecha_cierre: string | null;
  soporte_path: string | null;
  soporte_hash: string | null;
  escalado_at: string | null;
  ente?: string | null;
  ente_sigla?: string | null;
  dependencia?: string | null;
}
export interface RequerimientoVivo extends Requerimiento {
  dias: number;
  sem: Semaforo;
  venc: boolean;
  /** Nombre y sigla del ente y nombre de la dependencia, resueltos con los catálogos. */
  ente_n: string;
  ente_s: string;
  dep_n: string;
}

/** decorate de la 2.x. `hoy` es la fecha de Colombia; `diasRojo`, el umbral de Configuración. */
export function decorar(
  r: Requerimiento,
  hoy: string,
  diasRojo: number,
  entes: readonly { id: number; nombre: string; sigla?: string | null }[],
  deps: readonly { id: number; nombre: string }[]
): RequerimientoVivo {
  const s = calcularSemaforo({ estado: r.estado, fechaLimite: r.fecha_limite }, hoy, diasRojo);
  const e = entes.find(x => x.id === r.ente_id);
  return {
    ...r,
    dias: s.dias,
    sem: s.semaforo,
    venc: s.vencido,
    ente_n: e?.nombre || r.ente || '—',
    ente_s: e?.sigla || r.ente_sigla || '',
    dep_n: deps.find(d => d.id === r.dependencia_id)?.nombre || r.dependencia || '—'
  };
}

export interface Conteo {
  total: number;
  rojo: number;
  amarillo: number;
  verde: number;
}
export const conteos = (lista: readonly RequerimientoVivo[]): Conteo =>
  lista.reduce<Conteo>(
    (a, r) => {
      a.total++;
      a[r.sem]++;
      return a;
    },
    { total: 0, rojo: 0, amarillo: 0, verde: 0 }
  );

/** diasTxt de la 2.x. */
export const textoDias = (d: number) =>
  d < 0 ? `Vencido hace ${-d} d` : d === 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `En ${d} días`;

// ---------- Tablero y métricas (vTablero) ----------
export interface ResumenTablero {
  k: Conteo;
  /** Porcentaje cerrado (redondeado). */
  pct: number;
  porEnte: [string, Conteo][];
  proximos: RequerimientoVivo[];
  porDependencia: [string, { n: number; rojo: number }][];
}
export function resumenTablero(lista: readonly RequerimientoVivo[]): ResumenTablero {
  const k = conteos(lista),
    pct = k.total ? Math.round((k.verde * 100) / k.total) : 0;
  const byEnte: Record<string, RequerimientoVivo[]> = {};
  for (const r of lista) (byEnte[r.ente_n] = byEnte[r.ente_n] ?? []).push(r);
  const porEnte = Object.entries(byEnte)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([n, l]) => [n, conteos(l)] as [string, Conteo]);
  const abiertos = lista.filter(r => r.estado === 'abierto');
  const proximos = abiertos
    .slice()
    .sort((a, b) => a.dias - b.dias)
    .slice(0, 6);
  const byDep: Record<string, { n: number; rojo: number }> = {};
  for (const r of abiertos) {
    const o = (byDep[r.dep_n] = byDep[r.dep_n] ?? { n: 0, rojo: 0 });
    o.n++;
    if (r.sem === 'rojo') o.rojo++;
  }
  const porDependencia = Object.entries(byDep)
    .sort((a, b) => b[1].rojo - a[1].rojo || b[1].n - a[1].n)
    .slice(0, 6);
  return { k, pct, porEnte, proximos, porDependencia };
}

// ---------- Requerimientos (renderReqRows) ----------
export interface FiltroRequerimientos {
  q: string;
  sem: '' | Semaforo;
  /** id del ente como texto, o vacío. */
  ente: string;
  dep: string;
}
const ORDEN_SEM: Readonly<Record<Semaforo, number>> = { rojo: 0, amarillo: 1, verde: 2 };
export function filtrarRequerimientos(
  lista: readonly RequerimientoVivo[],
  f: FiltroRequerimientos
): RequerimientoVivo[] {
  const q = f.q.toLowerCase().trim();
  return lista
    .filter(
      r =>
        (!f.sem || r.sem === f.sem) &&
        (!f.ente || String(r.ente_id) === f.ente) &&
        (!f.dep || String(r.dependencia_id) === f.dep) &&
        (!q ||
          [r.radicado, r.asunto, r.ente_n, r.dep_n, r.orfeo_salida].some(x =>
            String(x || '')
              .toLowerCase()
              .includes(q)
          ))
    )
    .sort((a, b) => ORDEN_SEM[a.sem] - ORDEN_SEM[b.sem] || a.dias - b.dias);
}

// ---------- Nuevo requerimiento (saveReq) ----------
export const RX_RADICADO = /^[0-9]{4}[A-Z]{2}[0-9]{4,10}$/;
export interface NuevoRequerimiento {
  radicado: string;
  asunto: string;
  fechaRadicacion: string;
  fechaLimite: string;
}
/** Validaciones de saveReq, en el mismo orden y con los mismos textos. Devuelve el error o null. */
export function validarNuevo(
  n: NuevoRequerimiento,
  vigencia: number,
  existentes: readonly { radicado: string }[]
): string | null {
  const rad = n.radicado.trim().toUpperCase(),
    asu = n.asunto.trim();
  if (!RX_RADICADO.test(rad)) return 'Radicado inválido. Ejemplo: ' + vigencia + 'EE004812';
  if (asu.length < 4) return 'Escribe el asunto del requerimiento';
  if (!n.fechaRadicacion || !n.fechaLimite) return 'Completa las fechas';
  if (n.fechaLimite < n.fechaRadicacion) return 'La fecha límite no puede ser anterior a la radicación';
  if (existentes.some(r => r.radicado === rad)) return 'Ese radicado ya existe en esta vigencia';
  return null;
}

// ---------- Cargar respuesta ORFEO (vCarga) ----------
/** Búsqueda del caso en la carga ORFEO (sin tildes ni mayúsculas, como nrmTxt de la 2.x). */
export const coincideCaso = (r: RequerimientoVivo, q: string) => {
  const t = normalizarTexto(q).trim();
  return !t || [r.radicado, r.ente_n, r.ente_s, r.dep_n, r.asunto].some(v => normalizarTexto(v).includes(t));
};

/** Vistas que muestran el selector de vigencia de la barra superior (VISTAS_CON_VIGENCIA de la 2.x). */
export const VISTAS_CON_VIGENCIA = ['tablero', 'requerimientos', 'carga', 'alertas', 'reportes'] as const;
/** Vigencias del selector: la actual y las dos anteriores. */
export const vigenciasSelector = (anio: number) => [anio, anio - 1, anio - 2];

/** Validaciones de "Guardar y marcar en verde" (vCarga), en el mismo orden y con los mismos textos. */
export function validarCarga(
  d: {
    orfeo: string;
    fecha: string;
    archivo: { nombre: string; tipo: string; tamano: number; cabecera: string } | null;
  },
  r: Pick<Requerimiento, 'fecha_radicacion'>,
  hoy: string,
  existentes: readonly Pick<Requerimiento, 'orfeo_salida'>[],
  fechaCorta: (f: string) => string
): string | null {
  if (!/^[0-9]{10,20}$/.test(d.orfeo)) return 'El radicado ORFEO debe tener entre 10 y 20 dígitos';
  if (orfeoRepetido(d.orfeo, existentes)) return 'Este radicado ORFEO ya está asociado a otro requerimiento';
  if (!d.fecha) return 'Indica la fecha de envío';
  if (d.fecha > hoy) return 'La fecha de envío no puede ser futura';
  if (d.fecha < r.fecha_radicacion)
    return 'La fecha de envío no puede ser anterior a la radicación (' + fechaCorta(r.fecha_radicacion) + ')';
  const a = d.archivo;
  if (!a) return 'Adjunta el soporte en PDF';
  if (a.tipo !== 'application/pdf' && !/\.pdf$/i.test(a.nombre)) return 'El soporte debe ser un archivo PDF';
  if (a.tamano > 10 * 1024 * 1024) return 'El PDF supera los 10 MB';
  if (a.cabecera !== '%PDF-') return 'El archivo no parece ser un PDF válido';
  return null;
}
/** ¿El ORFEO ya está en otro requerimiento de la vigencia? (DEMO_or_loaded de la 2.x). */
export const orfeoRepetido = (v: string, existentes: readonly Pick<Requerimiento, 'orfeo_salida'>[]) =>
  existentes.some(r => r.orfeo_salida === v);

/** Ruta del PDF en el depósito soportes: el radicado sin tildes ni símbolos (closeReq de la 2.x). */
export function rutaSoporte(r: Pick<Requerimiento, 'radicado' | 'vigencia'>, ahora: number): string {
  const seguro = String(r.radicado)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(0, 60);
  return `${r.vigencia}/${seguro}_${ahora}.pdf`;
}

// ---------- Alertas y escalamiento (vAlertas y waLink) ----------
/** Requerimientos en rojo (los más urgentes primero), cuántos vencidos y cuántos sin escalar. */
export function alertas(lista: readonly RequerimientoVivo[]) {
  const rojos = lista.filter(r => r.sem === 'rojo').sort((a, b) => a.dias - b.dias);
  return { rojos, vencidos: rojos.filter(r => r.venc), pendientes: rojos.filter(r => !r.escalado_at) };
}
/** Mensaje y enlaces de WhatsApp y correo de una alerta (waLink). */
export function mensajeAlerta(
  r: RequerimientoVivo,
  celular: string,
  correoDependencia: string,
  fechaCorta: (f: string) => string
) {
  const msg =
    `Cordial saludo. Se informa que el requerimiento ${r.radicado} del ente ${r.ente_n}, a cargo de ${r.dep_n}, ` +
    (r.dias < 0
      ? `se encuentra vencido desde el ${fechaCorta(r.fecha_limite)}. `
      : `vence el ${fechaCorta(r.fecha_limite)} (${textoDias(r.dias).toLowerCase()}). `) +
    `Asunto: ${r.asunto} Se solicita dar respuesta de manera prioritaria y registrar el radicado ORFEO de salida en el sistema Control de Entes.`;
  return {
    msg,
    wa: 'https://wa.me/' + celular + '?text=' + encodeURIComponent(msg),
    mail:
      'mailto:' +
      encodeURIComponent(correoDependencia) +
      '?subject=' +
      encodeURIComponent('Alerta de cumplimiento ' + r.radicado) +
      '&body=' +
      encodeURIComponent(msg)
  };
}
/** Enlace al correo de Control Disciplinario para un vencido. */
export const enlaceDisciplinario = (correo: string, r: Pick<Requerimiento, 'radicado'>, msg: string) =>
  'mailto:' +
  correo +
  '?subject=' +
  encodeURIComponent('Requerimiento vencido ' + r.radicado) +
  '&body=' +
  encodeURIComponent(msg);
