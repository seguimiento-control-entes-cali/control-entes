// Histórico de radicados 2024-2026 (Excel consolidados). Copia de la 2.x: src/js/10-historico-y-directorio-datos.js
// (OPO_NAMES, histFromDb, habilesEntre, aplicarCierre, scopeOrg, maskPII) y src/js/09-cumplimiento-e-historico.js
// (OPO_PILL, histFiltered, renderHist, histCsv). Paridad comprobada en pruebas/paridad-historico.test.ts.
import { claveOrganismo } from './directorio';
import { esHabil } from './dias-habiles';
import { formatoCorto, sumarDias, type FechaISO } from './fechas';
import type { Rol } from './roles';

/** Oportunidad de la respuesta, en el mismo orden de la 2.x (el número es el índice). */
export const NOMBRE_OPORTUNIDAD = [
  'A tiempo',
  'Tardía',
  'Sin respuesta (vencida)',
  'Pendiente en término',
  'Respondida (sin fecha para medir)',
  'No requiere respuesta'
] as const;
export const PILDORA_OPORTUNIDAD: readonly (readonly ['verde' | 'amarillo' | 'rojo' | 'neutral', string])[] =
  [
    ['verde', 'A TIEMPO'],
    ['amarillo', 'TARDÍA'],
    ['rojo', 'SIN RESPUESTA'],
    ['neutral', 'PENDIENTE'],
    ['neutral', 'SIN FECHA'],
    ['neutral', 'NO REQUIERE']
  ];

/** Píldora (color y texto) de un estado de oportunidad. */
export function pildoraDe(opo: number): readonly ['verde' | 'amarillo' | 'rojo' | 'neutral', string] {
  return PILDORA_OPORTUNIDAD[opo] ?? ['neutral', '—'];
}

/** Una fila del histórico con los mismos campos cortos de la 2.x (HIST.rows). */
export interface RadicadoHistorico {
  i: number;
  v: number;
  rad: string | null;
  ente: string;
  orfE: string | null;
  rec: FechaISO | null;
  org: string;
  niv: string;
  asu: string | null;
  term: number | null;
  fmax: FechaISO | null;
  orfR: string | null;
  fresp: FechaISO | null;
  /** 1 sí, 0 no, 2 no aplica. */
  resp: 0 | 1 | 2;
  /** Índice de NOMBRE_OPORTUNIDAD. */
  opo: number;
  ret: number | null;
  tiem: number | null;
  cerradaApp?: boolean;
}

/** Fila tal como llega de public.historico_requerimientos. */
export interface FilaHistoricoBD {
  vigencia: number;
  radicacion_ente: string | null;
  ente: string | null;
  orfeo_entrada: string | null;
  fecha_recibo: string | null;
  organismo: string;
  tipo_organismo: string | null;
  asunto: string | null;
  termino_dias_habiles: number | null;
  fecha_maxima: string | null;
  orfeo_respuesta: string | null;
  fecha_respuesta: string | null;
  respondio: string | null;
  oportunidad: string;
  retraso_dias_habiles: number | null;
  dias_habiles_responder: number | null;
}

/** histFromDb de la 2.x: convierte las filas de la base y calcula la fecha de corte. */
export function desdeBaseDeDatos(lista: readonly FilaHistoricoBD[]): {
  filas: RadicadoHistorico[];
  corte: string;
} {
  const filas = lista.map((r, i) => ({
    i,
    v: r.vigencia,
    rad: r.radicacion_ente,
    ente: r.ente || '—',
    orfE: r.orfeo_entrada,
    rec: r.fecha_recibo,
    org: r.organismo,
    niv: r.tipo_organismo || '',
    asu: r.asunto,
    term: r.termino_dias_habiles,
    fmax: r.fecha_maxima,
    orfR: r.orfeo_respuesta,
    fresp: r.fecha_respuesta,
    resp: (r.respondio === 'Sí' ? 1 : r.respondio === 'No' ? 0 : 2) as 0 | 1 | 2,
    opo: Math.max(0, (NOMBRE_OPORTUNIDAD as readonly string[]).indexOf(r.oportunidad)),
    ret: r.retraso_dias_habiles,
    tiem: r.dias_habiles_responder
  }));
  return { filas, corte: fechaDeCorte(filas) };
}

/** La fecha más reciente entre recibos y respuestas (corte de los datos). */
export function fechaDeCorte(filas: readonly RadicadoHistorico[]): string {
  let corte = '';
  for (const r of filas) for (const d of [r.fresp, r.rec]) if (d && d > corte) corte = d;
  return String(corte).slice(0, 10);
}

/** Días hábiles entre dos fechas, sin contar la inicial (habilesEntre de la 2.x). */
export function habilesEntre(a: FechaISO, b: FechaISO): number {
  let d = String(a).slice(0, 10),
    n = 0;
  const f = String(b).slice(0, 10);
  while (d < f) {
    d = sumarDias(d, 1);
    if (esHabil(d)) n++;
  }
  return n;
}

/** Llave que une un radicado del histórico con su cierre hecho en la app (rowKey de la 2.x). */
export const llaveRadicado = (r: Pick<RadicadoHistorico, 'v' | 'orfE' | 'rad' | 'org'>) =>
  [r.v, r.orfE || '', r.rad || '', r.org].join('|');

/** aplicarCierre de la 2.x: un cierre registrado en la app actualiza la respuesta del radicado del histórico. */
export function aplicarCierre(r: RadicadoHistorico, fecha: FechaISO, orfeo: string): RadicadoHistorico {
  const n: RadicadoHistorico = { ...r, fresp: fecha, orfR: orfeo, resp: 1, cerradaApp: true };
  if (r.fmax) {
    n.opo = fecha <= r.fmax ? 0 : 1;
    n.ret = n.opo === 1 ? habilesEntre(r.fmax, fecha) : null;
  } else n.opo = 4;
  if (r.rec) n.tiem = habilesEntre(r.rec, fecha);
  return n;
}

/** Aplica los cierres de la app (solo a radicados sin respuesta o pendientes, como la 2.x). */
export function aplicarCierres(
  filas: readonly RadicadoHistorico[],
  cierres: readonly { hist_key: string; fecha_cierre: string; orfeo_salida: string }[]
): RadicadoHistorico[] {
  const m = new Map(cierres.map(c => [c.hist_key, c]));
  return filas.map(r => {
    const c = m.get(llaveRadicado(r));
    return c && (r.opo === 2 || r.opo === 3)
      ? aplicarCierre(r, String(c.fecha_cierre).slice(0, 10), c.orfeo_salida)
      : r;
  });
}

/**
 * Organismo que ve un secretario o un enlace (scopeOrg de la 2.x): el nombre de su dependencia escrito como en el
 * histórico. null = ve todo (supervisión). Sin dependencia: un valor que no coincide con ninguna fila.
 */
export function alcanceOrganismo(
  rol: Rol,
  nombreDependencia: string | null,
  filas: readonly RadicadoHistorico[]
) {
  if (rol !== 'secretario' && rol !== 'enlace') return null;
  if (!nombreDependencia) return '\u0000sin-dependencia';
  const k = claveOrganismo(nombreDependencia);
  return filas.find(r => claveOrganismo(r.org) === k)?.org ?? nombreDependencia;
}

export interface FiltroHistorico {
  q: string;
  vig: string;
  ente: string;
  org: string;
  opo: string;
}
/** histFiltered de la 2.x. */
export function filtrarHistorico(
  filas: readonly RadicadoHistorico[],
  f: FiltroHistorico
): RadicadoHistorico[] {
  const q = f.q.toLowerCase().trim();
  return filas.filter(
    r =>
      (f.vig === 'todas' || r.v === +f.vig) &&
      (!f.ente || r.ente === f.ente) &&
      (!f.org || r.org === f.org) &&
      (f.opo === '' || r.opo === +f.opo) &&
      (!q ||
        [r.rad, r.orfE, r.orfR, r.asu, r.org, r.ente].some(x =>
          String(x || '')
            .toLowerCase()
            .includes(q)
        ))
  );
}

export const POR_PAGINA = 100;

export const textoRespondio = (v: number) => (v === 1 ? 'Sí' : v === 0 ? 'No' : '—');
export const textoTardia = (opo: number) =>
  opo === 5 ? '—' : opo === 1 ? 'Sí' : opo === 0 || opo === 2 ? 'No' : '—';

/** Oculta cédulas y nombres de particulares en el asunto (maskPII de la 2.x, Ley 1581 de 2012). */
export function ocultarDatosPersonales(s0: string | null | undefined): string {
  let s = String(s0 == null ? '' : s0);
  s = s.replace(
    /\b(?:C\.?\s?C\.?|c[eé]dula|PPT|T\.?\s?I\.?|NUIP)\s*[:.]?\s*(?:No\.?|N[°º.]|#)?\s*[:.]?\s*[\d.-]{5,}/gi,
    '[documento reservado]'
  );
  const TRIG =
    /^(favor|peticionari[oa]|se[ñn]or[a]?|sr[a]?|estudiantes?|joven|ni[ñn][oa]|menor|ciudadan[oa]|accionante|solicitante|quejos[oa]|denunciante|usuari[oa]|paciente|se[ñn]or\(a\))$/i;
  const NAME = /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'.-]+$/,
    CONN = /^(de|del|la|las|los|y|e)$/i;
  const parts = s.split(/(\s+)/),
    out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const w = parts[i] as string,
      bare = w.replace(/[:.,;()]/g, '');
    out.push(w);
    i++;
    if (w.trim() && TRIG.test(bare)) {
      let j = i,
        names = 0,
        last = -1;
      while (j < parts.length) {
        const t = parts[j] as string;
        if (!t.trim()) {
          j++;
          continue;
        }
        const tb = t.replace(/[,;:]$/, '');
        if (names === 0 && CONN.test(tb) && /^favor$/i.test(bare)) {
          j++;
          continue;
        }
        if (NAME.test(tb) && !/^(Contralor|Personer|Procurad|Defensor|Alcald|Secretar)/i.test(tb)) {
          names++;
          last = j;
          j++;
          if (names >= 6 || /[,;]$/.test(t)) break;
          continue;
        }
        if (names > 0 && CONN.test(tb) && j + 1 < parts.length) {
          j++;
          continue;
        }
        break;
      }
      if (names > 0) {
        out.push(' [nombre reservado]');
        i = last + 1;
      }
    }
  }
  return out.join('').replace(/(\[nombre reservado\])\s*[\d.-]{6,}\.*/g, '$1');
}

/** Filas del CSV historico_requerimientos.csv (acción histCsv de la 2.x). */
export function filasCsvHistorico(lista: readonly RadicadoHistorico[]): unknown[][] {
  return [
    [
      'Vigencia',
      'N.º radicación ente',
      'Ente',
      'ORFEO entrada',
      'Fecha recibo',
      'Organismo',
      'Asunto',
      'Término (días hábiles)',
      'Fecha máxima',
      'ORFEO respuesta',
      'Fecha respuesta',
      '¿Respondió?',
      '¿Tardía?',
      'Oportunidad',
      'Retraso (días hábiles)'
    ],
    ...lista.map(r => [
      r.v,
      r.rad,
      r.ente,
      r.orfE,
      r.rec,
      r.org,
      ocultarDatosPersonales(r.asu),
      r.term,
      r.fmax,
      r.orfR,
      r.fresp,
      r.resp === 1 ? 'Sí' : r.resp === 0 ? 'No' : 'No aplica',
      r.opo === 1 ? 'Sí' : r.opo === 5 ? 'No aplica' : 'No',
      pildoraDe(r.opo)[1],
      r.ret
    ])
  ];
}

export { formatoCorto };
