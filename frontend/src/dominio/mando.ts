// Centro de mando del Alcalde. Copia de la 2.x: src/js/12-centro-de-mando.js (monthsList, windowStatsByOrg, vMando,
// renderBrief, buildTreemap, paintTreemap, renderTmDet y queueData). Paridad comprobada en
// pruebas/paridad-mando.test.ts.
import { porcentaje1, semaforoHistorico, UMBRALES } from './cumplimiento';
import { MESES, dependenciasDelHistorico, estadisticas } from './expediente';
import { NIVELES_PRINCIPALES } from './directorio';
import type { RadicadoHistorico } from './historico';

const PRINCIPAL: readonly string[] = NIVELES_PRINCIPALES;
const dos = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

export type Ventana = 3 | 6 | 12;
export const VENTANAS: readonly Ventana[] = [3, 6, 12];
export const textoVentana = (v: Ventana) =>
  v === 12 ? 'los últimos 12 meses' : 'los últimos ' + v + ' meses';
/** Ventana guardada en el navegador (ce_ventana, igual que la 2.x); 6 meses si no hay una válida. */
export const ventanaGuardada = (s: string | null): Ventana =>
  ([3, 6, 12] as number[]).includes(Number(s)) ? (Number(s) as Ventana) : 6;

export interface MesTablero {
  key: string;
  /** Último día del mes. */
  end: string;
  label: string;
}

/** monthsList de la 2.x: un mes por cada mes entre el primer vencimiento evaluado y el corte. */
export function mesesTablero(filas: readonly RadicadoHistorico[], corte: string): MesTablero[] {
  const f = filas
    .filter(r => r.fmax && r.opo <= 2)
    .map(r => r.fmax as string)
    .sort();
  if (!f.length) return [];
  const minV = Math.min(...filas.map(r => r.v)),
    primero = f[0] as string,
    ultimo = f[f.length - 1] as string;
  const a = (primero.slice(0, 7) < minV + '-01' ? minV + '-01' : primero).slice(0, 7),
    b = (corte || ultimo).slice(0, 7),
    out: MesTablero[] = [];
  let [y, m] = a.split('-').map(Number) as [number, number];
  const [y2, m2] = b.split('-').map(Number) as [number, number];
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push({ key: y + '-' + dos(m), end: isoLocal(new Date(y, m, 0)), label: MESES[m - 1] + ' ' + y });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/** Fin de la ventana para un mes: el último día del mes, sin pasar del corte. */
export const finVentana = (mes: MesTablero, corte: string) => (mes.end > corte && corte ? corte : mes.end);

/** windowStatsByOrg de la 2.x: a tiempo e incumplidos por dependencia en la ventana móvil (el inicio no se incluye). */
export function estadisticasVentana(
  filas: readonly RadicadoHistorico[],
  finIso: string,
  ventana: Ventana
): Map<string, { ok: number; inc: number }> {
  const d = new Date(finIso + 'T00:00:00');
  d.setMonth(d.getMonth() - ventana);
  const inicio = isoLocal(d);
  const m = new Map<string, { ok: number; inc: number }>();
  for (const r of filas) {
    if (!r.fmax || r.opo > 2 || r.fmax <= inicio || r.fmax > finIso || !PRINCIPAL.includes(r.niv)) continue;
    let o = m.get(r.org);
    if (!o) {
      o = { ok: 0, inc: 0 };
      m.set(r.org, o);
    }
    if (r.opo === 0) o.ok++;
    else o.inc++;
  }
  return m;
}

/** Orden de las teclas (buildTreemap): de mayor a menor incumplimiento; sin muestra (menos de 3) al final. */
export function ordenTablero(
  filas: readonly RadicadoHistorico[],
  ws: Map<string, { ok: number; inc: number }>
) {
  const rank = (o: string) => {
    const x = ws.get(o) ?? { ok: 0, inc: 0 },
      ev = x.ok + x.inc;
    return ev < 3 ? -1 : x.inc / ev;
  };
  return dependenciasDelHistorico(filas).sort((a, b) => rank(b) - rank(a) || a.localeCompare(b, 'es'));
}

export type ColorTecla = 'rojo' | 'amarillo' | 'verde' | 'gris';
export interface Tecla {
  org: string;
  sem: ColorTecla;
  ev: number;
  inc: number;
  tasa: number;
  num: string;
  sub: string;
  title: string;
}
export interface Tablero {
  teclas: Tecla[];
  rojo: number;
  amarillo: number;
  verde: number;
  gris: number;
}

/** paintTreemap de la 2.x: color, cifra y conteos de cada tecla (con 3 o más casos ya se asigna color). */
export function pintarTablero(
  orden: readonly string[],
  ws: Map<string, { ok: number; inc: number }>
): Tablero {
  const t: Tablero = { teclas: [], rojo: 0, amarillo: 0, verde: 0, gris: 0 };
  for (const org of orden) {
    const o = ws.get(org) ?? { ok: 0, inc: 0 },
      ev = o.ok + o.inc,
      tasa = ev ? o.inc / ev : 0;
    const s = semaforoHistorico(Math.max(ev, UMBRALES.min), tasa);
    const sem: ColorTecla = ev < 3 || s === 'muestra' ? 'gris' : s;
    t[sem]++;
    t.teclas.push({
      org,
      sem,
      ev,
      inc: o.inc,
      tasa,
      num: ev ? porcentaje1(tasa) : '—',
      sub: ev ? o.inc + ' de ' + ev : 'Sin casos',
      title:
        org +
        (ev ? `: ${o.inc} de ${ev} con incumplimiento (${porcentaje1(tasa)})` : ': sin casos en el periodo')
    });
  }
  return t;
}

/** Titular del tablero (cmdHead): [texto principal, complemento]. */
export function titularTablero(rojo: number, amarillo: number): [string, string] {
  return rojo
    ? [
        `${rojo} ${rojo === 1 ? 'dependencia' : 'dependencias'} en rojo`,
        amarillo ? ` y ${amarillo} en riesgo` : ''
      ]
    : amarillo
      ? ['Ninguna dependencia en rojo', ` y ${amarillo} en riesgo`]
      : ['Ninguna dependencia en rojo', ' ni en riesgo'];
}

export const etiquetaMes = (mes: MesTablero, ventana: Ventana) =>
  mes.label.charAt(0).toUpperCase() + mes.label.slice(1) + ' · ventana de ' + ventana + ' meses';

export const NOMBRE_COLOR: Readonly<Record<ColorTecla, string>> = {
  rojo: 'En rojo',
  amarillo: 'En amarillo',
  verde: 'En verde',
  gris: 'Sin muestra suficiente'
};

/** Vigencias del Centro de mando (por defecto solo 2026, igual que la 2.x). */
export const VIGENCIAS_MANDO = [2026, 2025, 2024] as const;

/** Cifras de la cabecera y de los tres botones (vMando). */
export function cifrasMando(filas: readonly RadicadoHistorico[], vigencias: readonly number[]) {
  const all = filas.filter(r => PRINCIPAL.includes(r.niv));
  const g = estadisticas(all);
  return {
    g,
    venc: all.filter(r => r.opo === 2 && vigencias.includes(r.v)).length,
    pend: all.filter(r => r.opo === 3).length
  };
}

/** Cinta "En seguimiento": 14 por vencer más próximos y 10 vencidos con más retraso. */
export function cintaSeguimiento(filas: readonly RadicadoHistorico[], vigencias: readonly number[]) {
  const all = filas.filter(r => PRINCIPAL.includes(r.niv));
  return all
    .filter(r => r.opo === 3 && r.fmax)
    .sort((a, b) => String(a.fmax).localeCompare(String(b.fmax)))
    .slice(0, 14)
    .concat(
      all
        .filter(r => r.opo === 2 && vigencias.includes(r.v))
        .sort((a, b) => (b.ret ?? 0) - (a.ret ?? 0))
        .slice(0, 10)
    );
}

export interface FilaCola {
  org: string;
  venc: number;
  pend: number;
  maxRet: number;
}
/** queueData de la 2.x: dependencias con requerimientos sin respuesta o por vencer en las vigencias elegidas. */
export function colaAccion(filas: readonly RadicadoHistorico[], vigencias: readonly number[]): FilaCola[] {
  const m = new Map<string, FilaCola>();
  for (const r of filas) {
    if (!PRINCIPAL.includes(r.niv) || !vigencias.includes(r.v) || (r.opo !== 2 && r.opo !== 3)) continue;
    let o = m.get(r.org);
    if (!o) {
      o = { org: r.org, venc: 0, pend: 0, maxRet: 0 };
      m.set(r.org, o);
    }
    if (r.opo === 2) {
      o.venc++;
      o.maxRet = Math.max(o.maxRet, r.ret ?? 0);
    } else o.pend++;
  }
  return [...m.values()].sort((a, b) => b.venc - a.venc || b.pend - a.pend);
}

/** Ente con más requerimientos sin respuesta en las vigencias elegidas (renderBrief). */
export function enteConMasSinRespuesta(
  filas: readonly RadicadoHistorico[],
  vigencias: readonly number[]
): [string, number] | undefined {
  const porEnte: Record<string, number> = {};
  for (const r of filas)
    if (r.opo === 2 && vigencias.includes(r.v) && PRINCIPAL.includes(r.niv))
      porEnte[r.ente] = (porEnte[r.ente] ?? 0) + 1;
  return Object.entries(porEnte).sort((a, b) => b[1] - a[1])[0];
}
