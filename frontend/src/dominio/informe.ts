// Informe ejecutivo. Copia de la 2.x: src/js/16-informe-ejecutivo.js (reportModel, narrative, semBg, semTxt, la huella
// de vInforme, logInforme y el nombre del archivo de rpPdf) y la acción rpCsv de 18-acciones.js. Paridad comprobada en
// pruebas/paridad-informe.test.ts.
import type { Notificacion } from './actividad';
import { porcentaje1, type SemaforoHistorico } from './cumplimiento';
import { NIVELES_PRINCIPALES, nombreCorto } from './directorio';
import { estadisticas, MESES, type EstadisticasDependencia } from './expediente';
import { PILDORA_OPORTUNIDAD, type RadicadoHistorico } from './historico';

const PRINCIPAL: readonly string[] = NIVELES_PRINCIPALES;
const dos = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nf = (n: number) => n.toLocaleString('es-CO');

/** Colores de los gráficos del informe (paleta pastel sobre fondo blanco). */
export const PALETA = {
  ok: '#4FB57C',
  tar: '#F2B230',
  sin: '#E0566B',
  ink: '#13203A',
  soft: '#55627A',
  line: '#DDE3EC',
  brand: '#0B3D91',
  blue: '#2F66C9'
} as const;
export const fondoSemaforo = (s: SemaforoHistorico) =>
  ({ rojo: '#f9d3d9', amarillo: '#fdecbd', verde: '#d3eedd', muestra: '#e6e9ec' })[s];
export const textoSemaforo = (s: SemaforoHistorico) =>
  s === 'muestra' ? 'MUESTRA INSUFICIENTE' : s.toUpperCase();

/** Nombres de las plantillas de notificación (TPL de src/js/14-notificaciones.js). */
export const PLANTILLAS: Readonly<Record<string, string>> = {
  vencidos: 'Requerimientos sin respuesta (vencidos)',
  preventivo: 'Recordatorio preventivo (por vencer)',
  desempeno: 'Resumen de desempeño',
  reconocimiento: 'Reconocimiento por buen cumplimiento'
};

export interface OpcionesInforme {
  /** 'todas' o el año. */
  vig: string;
  /** Dependencia ('' = todas). */
  org: string;
  casos: boolean;
}
export interface DependenciaInforme extends EstadisticasDependencia {
  name: string;
}
export interface PuntoInforme {
  label: string;
  short: string;
  ev: number;
  inc: number;
  v: number | null;
}
export interface Ventana {
  ev: number;
  inc: number;
  t: number | null;
}
export interface ModeloInforme {
  org: string;
  rows: RadicadoHistorico[];
  st: EstadisticasDependencia;
  orgs: DependenciaInforme[];
  entes: [string, number][];
  pts: PuntoInforme[];
  q1: Ventana;
  q0: Ventana;
  critical: RadicadoHistorico[];
  semCount: Record<SemaforoHistorico, number>;
  nots: Notificacion[];
  pend: number;
  corte: string;
}

/**
 * reportModel de la 2.x. `filas` ya viene limitada al alcance del usuario (hrows); `org` es la dependencia propia del
 * secretario o enlace, o la elegida en el filtro.
 */
export function modeloInforme(
  filas: readonly RadicadoHistorico[],
  corte: string,
  op: Pick<OpcionesInforme, 'vig'> & { org: string },
  notificaciones: readonly Notificacion[] = []
): ModeloInforme {
  const org = op.org;
  const rows = filas.filter(
    r => (op.vig === 'todas' || r.v === +op.vig) && PRINCIPAL.includes(r.niv) && (!org || r.org === org)
  );
  const st = estadisticas(rows);
  const by = new Map<string, RadicadoHistorico[]>();
  for (const r of rows) {
    let a = by.get(r.org);
    if (!a) {
      a = [];
      by.set(r.org, a);
    }
    a.push(r);
  }
  const orgs = [...by.entries()]
    .map(([name, l]) => ({ name, ...estadisticas(l) }))
    .filter(o => o.ev > 0)
    .sort((a, b) => b.inc - a.inc || b.tasa - a.tasa);
  const ente: Record<string, number> = {};
  for (const r of rows) if (r.opo === 1 || r.opo === 2) ente[r.ente] = (ente[r.ente] ?? 0) + 1;
  const entes = Object.entries(ente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const byM: Record<string, { ev: number; inc: number }> = {};
  for (const r of rows) {
    if (!r.fmax || r.opo > 2) continue;
    const k = r.fmax.slice(0, 7);
    const o = (byM[k] = byM[k] ?? { ev: 0, inc: 0 });
    o.ev++;
    if (r.opo > 0) o.inc++;
  }
  const pts = Object.keys(byM)
    .sort()
    .slice(-24)
    .map(k => {
      const o = byM[k] as { ev: number; inc: number },
        [y = '', m = ''] = k.split('-'),
        mes = MESES[+m - 1] ?? '';
      return {
        label: cap(mes) + ' ' + y,
        short: mes.slice(0, 3) + ' ' + y.slice(2),
        ev: o.ev,
        inc: o.inc,
        v: o.ev >= 3 ? o.inc / o.ev : null
      };
    });
  const cd = new Date(corte + 'T00:00:00'),
    d1 = isoLocal(new Date(cd.getTime() - 90 * 864e5)),
    d2 = isoLocal(new Date(cd.getTime() - 180 * 864e5));
  const win = (a: string, b: string): Ventana => {
    let ok = 0,
      inc = 0;
    for (const r of rows) {
      if (!r.fmax || r.opo > 2 || r.fmax <= a || r.fmax > b) continue;
      if (r.opo === 0) ok++;
      else inc++;
    }
    return { ev: ok + inc, inc, t: ok + inc ? inc / (ok + inc) : null };
  };
  const q1 = win(d1, corte),
    q0 = win(d2, d1);
  const critical = rows
    .filter(r => r.opo === 2)
    .sort((a, b) => (b.ret ?? 0) - (a.ret ?? 0))
    .slice(0, 15);
  const semCount: Record<SemaforoHistorico, number> = { rojo: 0, amarillo: 0, verde: 0, muestra: 0 };
  for (const o of orgs) semCount[o.sem]++;
  const nots = notificaciones.filter(n => !org || n.org === org).slice(0, 8);
  return {
    org,
    rows,
    st,
    orgs,
    entes,
    pts,
    q1,
    q0,
    critical,
    semCount,
    nots,
    pend: rows.filter(r => r.opo === 3).length,
    corte
  };
}

/** narrative de la 2.x: los párrafos del resumen ejecutivo. */
export function narrativa(m: ModeloInforme, vig: string): string[] {
  const s = m.st,
    out: string[] = [],
    per = vig === 'todas' ? 'las vigencias 2024, 2025 y 2026' : 'la vigencia ' + vig,
    who = m.org || 'las dependencias del Distrito';
  out.push(
    `En ${per} se evaluaron ${nf(s.ev)} requerimientos de entes de control atendidos por ${who}. De ellos, ${nf(s.ok)} (${porcentaje1(s.ev ? s.ok / s.ev : 0)}) se respondieron dentro del término, ${nf(s.tar)} (${porcentaje1(s.ev ? s.tar / s.ev : 0)}) fuera del término y ${nf(s.sin)} (${porcentaje1(s.ev ? s.sin / s.ev : 0)}) permanecen sin respuesta registrada y con el término vencido. La tasa de incumplimiento es ${porcentaje1(s.tasa)}, que corresponde a semáforo ${textoSemaforo(s.sem).toLowerCase()}.`
  );
  if (!m.org && m.orgs.length) {
    const t3 = m.orgs
      .slice(0, 3)
      .map(o => `${o.name} (${o.inc} incumplimientos, ${porcentaje1(o.tasa)})`)
      .join('; ');
    out.push(
      `Las dependencias con mayor número de incumplimientos son: ${t3}. Hay ${m.semCount.rojo} dependencia(s) en semáforo rojo, ${m.semCount.amarillo} en amarillo y ${m.semCount.verde} en verde.`
    );
  }
  if (m.q1.t != null && m.q0.t != null) {
    const d = (m.q1.t - m.q0.t) * 100,
      w = Math.abs(d).toFixed(1).replace('.', ',');
    out.push(
      `En los últimos tres meses la tasa de incumplimiento fue ${porcentaje1(m.q1.t)} frente a ${porcentaje1(m.q0.t)} del trimestre anterior: ${Math.abs(d) < 0.5 ? 'se mantiene estable' : d < 0 ? 'mejora en ' + w + ' puntos porcentuales' : 'empeora en ' + w + ' puntos porcentuales'}.`
    );
  }
  const e0 = m.entes[0];
  if (e0) out.push(`El ente de control con más requerimientos incumplidos es ${e0[0]} (${e0[1]} casos).`);
  if (s.sin || m.pend)
    out.push(
      `Hay ${nf(s.sin)} requerimiento(s) sin respuesta registrada y ${nf(m.pend)} por vencer. Se recomienda priorizar su atención y notificar a los responsables.`
    );
  return out;
}

/** Texto sobre el que se calcula la huella SHA-256 de los datos del informe (vInforme). */
export const textoHuella = (rows: readonly RadicadoHistorico[]) =>
  rows.map(r => [r.v, r.rad ?? '', r.org, r.opo, r.fmax ?? '', r.fresp ?? ''].join('|')).join('\n');

/** Vigencias tal como se registran en la tabla informes (logInforme). */
export const vigenciasRegistro = (vig: string) => (vig === 'todas' ? '2024, 2025, 2026' : String(vig));

/** Nombre del PDF (rpPdf): Informe_Ejecutivo_Cumplimiento_<corte>[_<dependencia>]. */
export const nombrePdf = (corte: string, org: string) =>
  'Informe_Ejecutivo_Cumplimiento_' +
  (corte || '') +
  (org ? '_' + nombreCorto(org).replace(/\W+/g, '_') : '');

/** Archivo y filas del botón "Datos (CSV)" (rpCsv). */
export const archivoCsvInforme = (corte: string) => 'informe_datos_' + (corte || '') + '.csv';
export function filasCsvInforme(rows: readonly RadicadoHistorico[]): unknown[][] {
  return [
    [
      'Vigencia',
      'Dependencia',
      'Ente',
      'N.º radicación ente',
      'Fecha máxima',
      'Fecha respuesta',
      'ORFEO respuesta',
      'Oportunidad',
      'Retraso (días hábiles)'
    ],
    ...rows.map(r => [
      r.v,
      r.org,
      r.ente,
      r.rad,
      r.fmax,
      r.fresp,
      r.orfR,
      (PILDORA_OPORTUNIDAD[r.opo] ?? ['', ''])[1],
      r.ret
    ])
  ];
}
