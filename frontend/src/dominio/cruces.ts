// Cruces entre entes de control. Copia de la 2.x: src/js/11-cruces-y-temas.js (cruceData, casoDe, inScope,
// cruceAlertCount, filtros de vCruces) y la acción cxCsv de 18-acciones.js. Paridad en pruebas/paridad-cruces.test.ts.
// - Cruce exacto: el mismo identificador citado por entes de familias distintas.
// - Reiteración: el mismo identificador, pero de una sola familia de entes (no se muestra en la pantalla).
// - Mismo tema: dos o más familias piden a la misma dependencia sobre un tema sustantivo en 90 días.
import { ocultarDatosPersonales, PILDORA_OPORTUNIDAD, type RadicadoHistorico } from './historico';
import {
  familiaDe,
  fechaDe,
  idsDe,
  llaveFila,
  mostrarId,
  normalizarTexto,
  NOMBRE_TEMA,
  temasAuto,
  TEMAS_SUSTANTIVOS,
  type Identificador,
  type TemaDetectado
} from './temas';

/** Tema corregido a mano (tabla tema_manual), por llave de fila. */
export interface TemaManual {
  tema: string;
  usuario: string | null;
  ts: string;
}
/** Revisión de un cruce (tabla cruce_revision), por clave del cruce. */
export interface RevisionCruce {
  estado: 'confirmado' | 'descartado';
  nota: string;
  usuario: string | null;
  ts: string;
}

export interface InfoFila {
  auto: TemaDetectado[];
  man: boolean;
  /** Tema principal: el manual o, si no hay, el automático más fuerte; 'sin' si ninguno. */
  prim: string;
  temas: string[];
  ids: Identificador[];
  fam: string;
}

export interface Caso {
  tipo: 'exacto' | 'reiteracion' | 'tematico';
  clave: string;
  ids: Identificador[];
  rows: RadicadoHistorico[];
  fams: string[];
  entes: string[];
  orgs: string[];
  temas: string[];
  /** Solo en "mismo tema". */
  org: string;
  tema: string;
  desde: string;
  hasta: string;
  abierto: boolean;
}

export interface DatosCruce {
  info: Map<number, InfoFila>;
  casos: Caso[];
  reit: Caso[];
  conc: Caso[];
}

const diasEntreFechas = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** cruceData de la 2.x. */
export function datosCruce(
  filas: readonly RadicadoHistorico[],
  temaManual: Readonly<Record<string, TemaManual>>
): DatosCruce {
  const info = new Map<number, InfoFila>();
  for (const r of filas) {
    const auto = temasAuto(r.asu),
      man = temaManual[llaveFila(r)];
    const prim = man ? man.tema : (auto[0]?.k ?? 'sin');
    info.set(r.i, {
      auto,
      man: !!man,
      prim,
      temas: man ? [man.tema, ...auto.map(x => x.k).filter(k => k !== man.tema)] : auto.map(x => x.k),
      ids: idsDe(r.asu),
      fam: familiaDe(r.ente)
    });
  }
  const de = (r: RadicadoHistorico) => info.get(r.i) as InfoFila;

  // Casos: requerimientos unidos por un mismo identificador (conjuntos disjuntos)
  const par = new Map<number, number>();
  const find = (x0: number) => {
    let x = x0;
    while (par.get(x) !== x) {
      par.set(x, par.get(par.get(x) as number) as number);
      x = par.get(x) as number;
    }
    return x;
  };
  for (const r of filas) par.set(r.i, r.i);
  const idx = new Map<string, number[]>();
  for (const r of filas)
    for (const x of de(r).ids) {
      const k = x.k + ':' + x.v;
      if (!idx.has(k)) idx.set(k, []);
      (idx.get(k) as number[]).push(r.i);
    }
  idx.forEach(L => L.slice(1).forEach(j => par.set(find(j), find(L[0] as number))));
  const comp = new Map<number, RadicadoHistorico[]>();
  for (const r of filas) {
    if (!de(r).ids.length) continue;
    const c = find(r.i);
    if (!comp.has(c)) comp.set(c, []);
    (comp.get(c) as RadicadoHistorico[]).push(r);
  }
  const casos: Caso[] = [];
  comp.forEach(L => {
    if (L.length < 2) return;
    const shared = [...idx.entries()]
      .filter(([, I]) => I.length > 1 && I.some(i => L.some(r => r.i === i)))
      .map(([k]) => {
        const p = k.indexOf(':');
        return { k: k.slice(0, p), v: k.slice(p + 1) };
      });
    const fams = [...new Set(L.map(r => de(r).fam))];
    const sorted = L.slice().sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)));
    const clave = 'ID|' + shared.map(x => x.k + ':' + x.v).sort()[0];
    casos.push({
      tipo: fams.length >= 2 ? 'exacto' : 'reiteracion',
      clave,
      ids: shared,
      rows: sorted,
      fams,
      entes: [...new Set(L.map(r => r.ente))],
      orgs: [...new Set(L.map(r => r.org))],
      temas: [...new Set(L.map(r => de(r).prim).filter(k => k !== 'sin'))],
      org: '',
      tema: '',
      desde: fechaDe(sorted[0] as RadicadoHistorico),
      hasta: fechaDe(sorted[sorted.length - 1] as RadicadoHistorico),
      abierto: L.some(r => r.opo === 2 || r.opo === 3)
    });
  });

  // Mismo tema: misma dependencia + mismo tema sustantivo + 2 o más familias en 90 días
  const g = new Map<string, RadicadoHistorico[]>();
  for (const r of filas) {
    const p = de(r).prim;
    if (!TEMAS_SUSTANTIVOS.includes(p) || !fechaDe(r)) continue;
    const k = r.org + '\u0001' + p;
    if (!g.has(k)) g.set(k, []);
    (g.get(k) as RadicadoHistorico[]).push(r);
  }
  const conc: Caso[] = [];
  g.forEach((L, k) => {
    L.sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)));
    let a = 0;
    while (a < L.length) {
      let b = a;
      while (
        b + 1 < L.length &&
        diasEntreFechas(fechaDe(L[a] as RadicadoHistorico), fechaDe(L[b + 1] as RadicadoHistorico)) <= 90
      )
        b++;
      const W = L.slice(a, b + 1),
        fams = [...new Set(W.map(r => de(r).fam))];
      if (fams.length >= 2) {
        const [org = '', tema = ''] = k.split('\u0001');
        conc.push({
          tipo: 'tematico',
          clave: 'TM|' + org + '|' + tema + '|' + fechaDe(W[0] as RadicadoHistorico),
          ids: [],
          org,
          tema,
          rows: W,
          fams,
          entes: [...new Set(W.map(r => r.ente))],
          orgs: [org],
          temas: [tema],
          desde: fechaDe(W[0] as RadicadoHistorico),
          hasta: fechaDe(W[W.length - 1] as RadicadoHistorico),
          abierto: W.some(r => r.opo === 2 || r.opo === 3)
        });
        a = b + 1;
      } else a++;
    }
  });
  const ord = (x: Caso, y: Caso) => Number(y.abierto) - Number(x.abierto) || y.hasta.localeCompare(x.hasta);
  return {
    info,
    casos: casos.filter(c => c.tipo === 'exacto').sort(ord),
    reit: casos.filter(c => c.tipo === 'reiteracion').sort(ord),
    conc: conc.sort(ord)
  };
}

/** Cruce exacto en el que está un requerimiento (casoDe de la 2.x). */
export const casoDe = (d: DatosCruce, r: RadicadoHistorico) =>
  d.casos.find(c => c.rows.some(x => x.i === r.i));

/** Un secretario o enlace solo ve los cruces que tocan su dependencia (inScope de la 2.x). */
export const enAlcance = (c: Caso, org: string | null) => !org || c.rows.some(r => r.org === org);

const noDescartado = (c: Caso, rev: Readonly<Record<string, RevisionCruce>>) =>
  rev[c.clave]?.estado !== 'descartado';

/** Cruces y alertas abiertos y no descartados (cruceAlertCount de la 2.x; insignia del menú). */
export function alertasCruces(
  d: DatosCruce,
  rev: Readonly<Record<string, RevisionCruce>>,
  org: string | null
): number {
  return d.casos.concat(d.conc).filter(c => c.abierto && enAlcance(c, org) && noDescartado(c, rev)).length;
}

/** Cuántos de la lista están abiertos y no descartados (abiertos de vCruces). */
export const abiertosSinDescartar = (l: readonly Caso[], rev: Readonly<Record<string, RevisionCruce>>) =>
  l.filter(c => c.abierto && noDescartado(c, rev)).length;

export type PestanaCruces = 'exactos' | 'tematicos' | 'temas' | 'sin';
export interface FiltroCruces {
  tab: PestanaCruces;
  tema: string;
  fam: string;
  org: string;
  vig: string;
  q: string;
}
export const POR_PAGINA_CRUCES = 40;

/** Requerimientos de las pestañas Temas y Sin clasificar, del más reciente al más antiguo (vCruces de la 2.x). */
export function filtrarTemas(
  base: readonly RadicadoHistorico[],
  d: DatosCruce,
  f: FiltroCruces,
  org: string | null,
  conBusqueda = true
): RadicadoHistorico[] {
  const qk = conBusqueda ? normalizarTexto(f.q) : '';
  return base
    .filter(r => {
      const x = d.info.get(r.i) as InfoFila;
      return (
        (f.tab === 'sin' ? x.prim === 'sin' : !f.tema || x.prim === f.tema) &&
        (!f.fam || x.fam === f.fam) &&
        (!f.vig || String(r.v) === f.vig) &&
        (org || !f.org || r.org === f.org) &&
        (!qk || normalizarTexto(r.asu + ' ' + r.rad + ' ' + r.orfE).includes(qk))
      );
    })
    .sort((a, b) => fechaDe(b).localeCompare(fechaDe(a)));
}

/** Conteo por tema principal y familia de ente (matriz de la pestaña Temas). */
export function matrizTemas(
  base: readonly RadicadoHistorico[],
  d: DatosCruce,
  fams: readonly string[],
  claves: readonly string[]
) {
  const M: Record<string, Record<string, number>> = {};
  for (const k of claves) M[k] = Object.fromEntries(fams.map(f => [f, 0]));
  for (const r of base) {
    const x = d.info.get(r.i) as InfoFila;
    const fila = M[x.prim];
    if (fila && x.fam in fila) fila[x.fam] = (fila[x.fam] ?? 0) + 1;
  }
  return M;
}

/** Filas del CSV temas_y_cruces.csv, con encabezado (cxCsv de la 2.x: no aplica la búsqueda de texto). */
export function filasCsvCruces(lista: readonly RadicadoHistorico[], d: DatosCruce): unknown[][] {
  return [
    [
      'Vigencia',
      'Fecha recibo',
      'Ente',
      'Familia del ente',
      'Dependencia',
      'N.º radicación ente',
      'ORFEO entrada',
      'Asunto',
      'Tema principal',
      'Otros temas',
      'Clasificación',
      'Identificadores citados',
      'Cruce exacto con otros entes',
      'Oportunidad'
    ],
    ...lista.map(r => {
      const x = d.info.get(r.i) as InfoFila,
        cs = casoDe(d, r);
      return [
        r.v,
        fechaDe(r),
        r.ente,
        x.fam,
        r.org,
        r.rad,
        r.orfE,
        ocultarDatosPersonales(r.asu),
        NOMBRE_TEMA[x.prim],
        x.temas
          .slice(1)
          .map(k => NOMBRE_TEMA[k])
          .join(' / '),
        x.man ? 'Manual' : 'Automática',
        x.ids.map(mostrarId).join(' / '),
        cs ? cs.fams.join(' + ') : '',
        PILDORA_OPORTUNIDAD[r.opo]?.[1]
      ];
    })
  ];
}

/** Quién puede corregir temas y revisar cruces (canClasif de la 2.x; la base lo exige además por RLS). */
export const puedeClasificar = (rol: string) => ['admin', 'alcalde', 'control_interno'].includes(rol);

/** Valor que se guarda al elegir un tema: vacío si coincide con el automático (se borra la corrección). */
export function temaAGuardar(asunto: unknown, elegido: string): string {
  const auto = temasAuto(asunto)[0]?.k ?? 'sin';
  return elegido === auto ? '' : elegido;
}
