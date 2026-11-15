// Planes de mejoramiento · importación (entrega 3 de la F3): lectura del plan en Excel (PM_01 de la CGSC, Formularios
// 14 y 14.1 de la CGR) y del informe final en PDF de la CGSC. Copia fiel de src/js/19-planes-de-mejoramiento.js de la
// 2.x (pmMapHeader, pmParseSheet, pmParseWorkbook, pmPdfLineas, pmParseInformePdf, pmImpCheck y la carga de pmDoImport).
// Aquí no se usa el navegador: las hojas llegan ya convertidas en filas (SheetJS) y el PDF en trozos de texto (pdf.js).
import { formatoCorto } from './fechas';
import { textoCorto } from './actividad';
import { claveOrganismo } from './directorio';
import { organismoOficial } from './excel-control/lectura';
import { FORMATOS, fechaPlan, llave, numero, numTxt, pctTxt, txt, type Hallazgo, type Plan } from './planes';

export type Fila = readonly unknown[];
export interface HojaPlan {
  nombre: string;
  filas: readonly Fila[];
}
/** Trozo de texto de pdf.js con su posición (pmLeerPdf). */
export interface TrozoPdf {
  s: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface DependenciaImp {
  id: number;
  nombre: string;
}
export interface AvisoImp {
  /** r: rojo, y: amarillo, b: azul (informativo). */
  n: 'r' | 'y' | 'b';
  t: string;
}
export interface AccionImp {
  fila: number;
  accion: string;
  proposito: string;
  actividad: string;
  meta: string;
  unidad_medida: string;
  cantidadRaw: unknown;
  cantidad: number;
  fuente_verificacion: string;
  lugar_verificacion: string;
  finiRaw: unknown;
  fini: string | null;
  ffinRaw: unknown;
  ffin: string | null;
  responsable: string;
  dependencia_id: number | null;
  avance: number | null;
  fecha_corte: string | null;
  sinCorte?: boolean;
  descripcion_avance: string;
  obs_ci: string;
}
export interface HallazgoImp {
  numero: string;
  numeroOrig: string;
  descripcion: string;
  causa: string;
  efecto: string;
  connotaciones: string[];
  macroproceso: string;
  cuantia: number | null;
  fila: number;
  dependencia?: string;
  dependencia_id?: number | null;
  acciones: AccionImp[];
}
export interface PlanImp {
  formato: string;
  contraloria: string;
  entidad: string;
  nit: string;
  representante_legal: string;
  ordenador_gasto: string;
  ejercicio: string;
  tipo_ejercicio: string;
  modalidad: string;
  vigencia_pvcft: string;
  periodo_auditado: string;
  numero_informe: string;
  radicado_orfeo: string;
  fecha_informe: string | null;
  fecha_suscripcion: string;
  estado: string;
  observaciones: string;
  direccion_tecnica?: string;
}
export interface Importacion {
  archivo: string;
  hoja: string;
  formato: string;
  plan: PlanImp;
  hall: HallazgoImp[];
  avisos: AvisoImp[];
  feval: string | null;
  fevalRaw: unknown;
  desdePdf?: boolean;
}
/** Planes y hallazgos ya registrados (para avisar causas recurrentes y planes repetidos). */
export interface Previos {
  planes: readonly Pick<Plan, 'id' | 'formato' | 'ejercicio' | 'fecha_suscripcion'>[];
  hallazgos: readonly Pick<Hallazgo, 'plan_id' | 'numero' | 'causa'>[];
}

const contraloriaDe = (f: string) => (FORMATOS[f] ?? (FORMATOS.OTRO as { contraloria: string })).contraloria;

/** pmConnOf: connotaciones nombradas en un texto. */
export function connotacionesDe(v: unknown): string[] {
  const k = llave(v);
  const out: string[] = [];
  (
    [
      ['administrativ', 'administrativa'],
      ['disciplinari', 'disciplinaria'],
      ['fiscal', 'fiscal'],
      ['penal', 'penal'],
      ['sancionatori', 'sancionatoria']
    ] as const
  ).forEach(([w, c]) => {
    if (k.includes(w)) out.push(c);
  });
  return out;
}

// ---------- dependencia responsable a partir de textos libres ----------
/** pmDepMatch: dependencia mencionada en un texto ("Nora Mondragón – Secretaria de Gobierno"). */
export function depEnTexto(
  t: unknown,
  deps: readonly DependenciaImp[],
  soloNombreCompleto = false
): number | null {
  const k = ' ' + claveOrganismo(t == null ? '' : String(t)) + ' ';
  if (k.trim().length < 4) return null;
  let best: DependenciaImp | null = null,
    bl = 0;
  deps.forEach(d => {
    const dk = claveOrganismo(d.nombre);
    if (dk.length >= 6 && k.includes(' ' + dk + ' ') && dk.length > bl) {
      best = d;
      bl = dk.length;
    }
  });
  if (best) return (best as DependenciaImp).id;
  if (soloNombreCompleto) return null;
  // nombre corto: "Planeación", "Gobierno" (sin "Secretaría de", "Departamento Administrativo de")
  deps.forEach(d => {
    const core = claveOrganismo(d.nombre)
      .replace(
        /^(secretaria|departamento administrativo|unidad administrativa especial|uae|direccion|oficina)( distrital)?( de| del| para la| para el)? /,
        ''
      )
      .trim();
    if (core.length >= 6 && k.includes(' ' + core + ' ') && core.length > bl) {
      best = d;
      bl = core.length;
    }
  });
  return best ? (best as DependenciaImp).id : null;
}
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'para']);
/** pmDepSigla: DAGMA, DATIC, DAPM, UAESPM… o la sigla entre paréntesis del nombre. */
export function depPorSigla(t: unknown, deps: readonly DependenciaImp[]): number | null {
  const s =
    ' ' +
    String(t || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ') +
    ' ';
  const hits = deps.filter(d => {
    const pal = claveOrganismo(d.nombre)
      .split(' ')
      .filter(w => w && !CONECTORES.has(w));
    const sigla = pal
      .map(w => w[0])
      .join('')
      .toUpperCase();
    const entre = (/\(([A-Za-z]{4,})\)/.exec(d.nombre) || [])[1];
    return (
      (sigla.length >= 4 && s.includes(' ' + sigla + ' ')) ||
      (!!entre && s.includes(' ' + entre.toUpperCase() + ' '))
    );
  });
  return hits.length === 1 ? (hits[0] as DependenciaImp).id : null;
}
/** pmDepCabeza: «tipo + primera palabra» cuando es única («Secretaría del Deporte»). */
export function depPorCabeza(t: unknown, deps: readonly DependenciaImp[]): number | null {
  const k = ' ' + claveOrganismo(t == null ? '' : String(t)) + ' ';
  const cab = (d: DependenciaImp) => {
    const w = claveOrganismo(d.nombre).split(' ');
    const i = w.findIndex(
      (x, n) => n > 0 && CONECTORES.has(x) && !!w[n + 1] && !CONECTORES.has(w[n + 1] as string)
    );
    return i > 0 ? w.slice(0, i + 2).join(' ') : null;
  };
  const cabezas = deps
    .map(d => [d, cab(d)] as const)
    .filter((x): x is readonly [DependenciaImp, string] => !!x[1]);
  const hits = cabezas.filter(
    ([, c]) => k.includes(' ' + c + ' ') && cabezas.filter(y => y[1] === c).length === 1
  );
  return hits.length === 1 ? (hits[0] as readonly [DependenciaImp, string])[0].id : null;
}
/** pmDepImport: nombre completo, sigla, cabeza y al final el nombre corto (en el responsable y en el lugar). */
export function depImportada(resp: string, lugar: string, deps: readonly DependenciaImp[]): number | null {
  return (
    depEnTexto(resp, deps, true) ||
    depEnTexto(lugar, deps, true) ||
    depPorSigla(resp, deps) ||
    depPorSigla(lugar, deps) ||
    depPorCabeza(resp, deps) ||
    depPorCabeza(lugar, deps) ||
    depEnTexto(resp, deps) ||
    depEnTexto(lugar, deps)
  );
}
/** pmDepSugerida: con las mismas reglas que unifican los organismos del Excel de control. */
export function depSugerida(textos: readonly unknown[], deps: readonly DependenciaImp[]): number | null {
  for (const t of textos) {
    if (!txt(t)) continue;
    const id = depEnTexto(t, deps);
    if (id) return id;
    const c = organismoOficial(String(t));
    if (c) {
      const d = deps.find(x => claveOrganismo(x.nombre) === claveOrganismo(c[0]));
      if (d) return d.id;
    }
  }
  return null;
}

// ---------- encabezados ----------
/** PM_COLS: encabezados reconocidos (en orden: los más específicos primero). */
const COLUMNAS: readonly (readonly [string, RegExp])[] = [
  ['plavi', /puntaje logrado por las actividades vencidas/],
  ['plai', /puntaje logrado/],
  ['paavi', /puntaje atribuido/],
  ['pctcgr', /porcentaje de avance fisico/],
  ['avfis', /avance fisico/],
  ['pct', /(porcentaje|%) (de )?avance|^avance (%|porcentual)|^% avance/],
  ['descav', /descripcion del avance/],
  ['fcorte', /fecha de corte/],
  ['numero', /codigo (del )?hallazgo|^(n|no|nro|numero)? ?(de )?hallazgo( no| n)?$/],
  ['descripcion', /descripcion (de la condicion|del hallazgo|hallazgo)|^condicion/],
  ['causa', /^causa/],
  ['efecto', /^efecto/],
  ['connotacion', /connotacion/],
  ['macro', /macroproceso|criterio/],
  ['actividad', /descripcion de las actividades|^actividad(es)?$/],
  ['accion', /^accion|^acciones/],
  ['proposito', /proposito/],
  ['unidad', /unidad de medida/],
  ['cantidad', /cantidad/],
  ['meta', /^metas?$/],
  ['fuente', /fuente de verificacion/],
  ['lugar', /lugar de verificacion/],
  ['fini', /fecha (de )?inicio|fecha (de )?iniciacion/],
  ['ffin', /fecha (de )?terminacion|fecha (de )?finalizacion|fecha (de )?fin\b|fecha limite/],
  ['plazo', /plazo/],
  ['responsable', /responsable/],
  ['obsci', /^observaciones? (daci|de la daci|oci|control interno|de control interno)/],
  ['dirtec', /^direccion tecnica/],
  ['obs', /^observacion/],
  ['consec', /^(no|n|item|consecutivo)$/]
];
/** PM_COD: numeración oficial de las columnas del PM_01 CGSC, (6) a (18). */
const CODIGOS: Readonly<Record<string, string>> = {
  6: 'numero',
  7: 'descripcion',
  8: 'connotacion',
  9: 'macro',
  10: 'accion',
  11: 'meta',
  12: 'fuente',
  13: 'lugar',
  14: 'ffin',
  15: 'responsable',
  16: 'descav',
  17: 'fcorte',
  18: 'pct'
};
export type MapaColumnas = Record<string, number>;
/** pmMapHeader. */
export function mapearEncabezado(fila: Fila): MapaColumnas {
  const map: MapaColumnas = {};
  fila.forEach((cell, ci) => {
    const raw = llave(cell);
    if (!raw) return;
    const cod = (raw.match(/\((\d{1,2})\)\s*$/) || [])[1];
    const t = raw
      .replace(/\(\d{1,2}\)/g, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hit = COLUMNAS.find(([k, re]) => !(k in map) && re.test(t));
    if (hit) map[hit[0]] = ci;
    else if (cod && CODIGOS[cod] && !((CODIGOS[cod] as string) in map)) map[CODIGOS[cod] as string] = ci;
  });
  return map;
}
/** pmCausaDe: "Lo anterior, causado por la falta de …, lo cual genera …" → "La falta de …". */
export function causaDe(des: unknown): string {
  const m =
    /lo anterior,?\s*(?:es\s+)?(?:causado|ocasionado|originado|generado|debido)\s+(?:por|a)\s+([\s\S]+?)(?:,\s*lo cual\b|,\s*lo que\b|\.\s|$)/i.exec(
      txt(des)
    );
  if (!m) return '';
  const c = (m[1] as string)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,]+$/, '');
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : '';
}
/** pmEfectoDe. */
export function efectoDe(des: unknown): string {
  const m =
    /,\s*lo cual (?:genera|ocasiona|conlleva|puede generar|genera un|afecta)\s+([\s\S]+?)(?:,\s*(?:que|configur)|\.\s|$)/i.exec(
      txt(des)
    );
  if (!m) return '';
  const e = (m[1] as string)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,]+$/, '');
  return e ? e.charAt(0).toUpperCase() + e.slice(1) : '';
}

// ---------- informe final en PDF ----------
/** pmPdfLineas: trozos de pdf.js → líneas de texto en orden de lectura. */
export function lineasPdf(paginas: readonly (readonly TrozoPdf[])[]): { t: string; pag: number }[] {
  const out: { t: string; pag: number }[] = [];
  paginas.forEach((items, pi) => {
    const filas: { y: number; items: TrozoPdf[] }[] = [];
    items
      .filter(it => it.s !== '')
      .forEach(it => {
        const tol = Math.max(2, (it.h || 10) * 0.4);
        let f = filas.find(r => Math.abs(r.y - it.y) <= tol);
        if (!f) filas.push((f = { y: it.y, items: [] }));
        f.items.push(it);
      });
    filas.sort((a, b) => b.y - a.y);
    filas.forEach(f => {
      f.items.sort((a, b) => a.x - b.x);
      let t = '',
        fin: number | null = null;
      f.items.forEach(it => {
        if (fin !== null && it.x - fin > 1.5 && !/\s$/.test(t) && !/^\s/.test(it.s)) t += ' ';
        t += it.s;
        fin = it.x + (it.w || 0);
      });
      t = t.replace(/\s+/g, ' ').trim();
      if (t) out.push({ t, pag: pi + 1 });
    });
  });
  return out;
}
const RUIDO_PDF =
  /^informe final\b|^p[aá]gina \d+ de \d+$|contraloriacali|centro administrativo municipal|^\(57\)|^www\.|^\d{1,3}$/i;
const mayusculas = (t: string) => {
  const l = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  return l.length >= 6 && l.replace(/[^a-záéíóúñ]/g, '').length / l.length < 0.12;
};
const dos = (n: number) => String(n).padStart(2, '0');
const MESES: Readonly<Record<string, number>> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
};
type HallazgoPdf = HallazgoImp & { _cola?: string | null };
/** pmParseInformePdf: plan en formulación con los hallazgos del informe final (sin acciones). */
export function leerInformePdf(
  paginas: readonly (readonly TrozoPdf[])[],
  archivo: string,
  deps: readonly DependenciaImp[]
): Importacion {
  const lineas = lineasPdf(paginas).filter(l => !RUIDO_PDF.test(l.t));
  const T = lineas.map(l => l.t);
  const L = (i: number) => lineas[i] as { t: string; pag: number };
  const todo = T.join('\n');
  const kt = llave(todo);
  // la contraloría que firma el informe (otras pueden citarse en el texto)
  const formato = /contraloria general de santiago de cali|contraloria distrital/.test(kt)
    ? 'PM_01_CGSC'
    : /contraloria general de la republica/.test(kt)
      ? 'F14_CGR'
      : 'PM_01_CGSC';
  const avisos: AvisoImp[] = [];
  // portada: nombre de la actuación, número y fecha del informe
  const pag1 = lineas.filter(l => l.pag === 1).map(l => l.t);
  const iRad = pag1.findIndex(t => /^\d{3,4}(\.\d{2,3}){3,4}$/.test(t));
  const iTit = pag1.findIndex(t => /^(actuaci[oó]n|auditor[ií]a|informe de auditor|denuncia)/i.test(t));
  let ejercicio = '';
  if (iTit >= 0) {
    const fin = iRad > iTit ? iRad : Math.min(pag1.length, iTit + 3);
    ejercicio = pag1
      .slice(iTit, fin)
      .filter(t => !/^informe final$/i.test(t))
      .join(' ');
  }
  ejercicio = ejercicio
    .replace(/\s+/g, ' ')
    .replace(/N[ºo°]\s*(\d)/, 'Nº $1')
    .trim();
  const p1 = pag1.join(' ');
  const m1 = /(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i.exec(p1);
  const m2 = /([a-záéíóú]+) (\d{1,2}),? de (\d{4})/i.exec(p1);
  const mf: readonly string[] | null = m1 ?? (m2 ? ([m2[0], m2[2], m2[1], m2[3]] as string[]) : null);
  const mesF = mf ? MESES[llave(mf[2])] : undefined;
  const fecha_informe = mf && mesF ? `${mf[3]}-${dos(mesF)}-${dos(+(mf[1] as string))}` : null;
  // hallazgos: encabezado en mayúsculas que puede ocupar varias líneas; se omite la tabla de contenido
  const hall: HallazgoPdf[] = [];
  let depPrev: string | null = null;
  const finSeccion = /^\d+\.\s*(resumen|relaci[oó]n de hallazgos|anexos)\b/i;
  const inicioH = (t: string) => /^(\d+(?:\.\d+)*)\.?\s+hallazgo\b/i.test(t);
  for (let i = 0; i < T.length; i++) {
    if (!inicioH(T[i] as string)) continue;
    let j = i,
      enc = T[i] as string;
    let indice = /\s\d{1,3}$/.test(enc) || /\.{5,}/.test(enc);
    // índice con líneas de puntos: «3.1. Hallazgo … ........ 12», aunque el título no esté en mayúsculas
    for (let q = i + 1; !indice && q <= i + 3 && q < T.length && L(q).pag === L(i).pag; q++) {
      if (inicioH(T[q] as string)) break;
      if (/\.{5,}\s*\d{1,3}\s*$/.test(T[q] as string)) indice = true;
    }
    // el encabezado continúa en las líneas siguientes en mayúsculas, sin pasar a otra página
    while (
      j + 1 < T.length &&
      L(j + 1).pag === L(i).pag &&
      mayusculas(T[j + 1] as string) &&
      !inicioH(T[j + 1] as string) &&
      !finSeccion.test(T[j + 1] as string) &&
      enc.length < 400
    ) {
      enc += ' ' + T[++j];
      if (/\s\d{1,3}$/.test(T[j] as string)) indice = true;
    }
    if (indice || /\s\d{1,3}$/.test(enc)) {
      i = j;
      continue; // tabla de contenido: termina en número de página
    }
    // cuerpo hasta el siguiente hallazgo o el fin de la sección
    let k = j + 1;
    const cuerpo: string[] = [];
    while (k < T.length && !inicioH(T[k] as string) && !finSeccion.test(T[k] as string))
      cuerpo.push(T[k++] as string);
    // dependencia: línea en mayúsculas justo antes del encabezado; si no hay, la del hallazgo anterior
    let dep: string | null = null;
    for (let b = i - 1; b >= Math.max(0, i - 3); b--) {
      if (!mayusculas(T[b] as string)) break;
      if (organismoOficial(T[b] as string)) {
        dep = T[b] as string;
        break;
      }
    }
    if (dep) depPrev = dep;
    else dep = depPrev;
    // la última línea en mayúsculas del cuerpo anterior pudo ser la dependencia de este hallazgo: se quita
    const ant = hall[hall.length - 1];
    if (ant && dep && ant._cola === dep)
      ant.descripcion = ant.descripcion.replace(
        new RegExp('\\s*' + dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'),
        ''
      );
    const ke = llave(enc);
    const conn = ['administrativa'];
    if (/disciplinari/.test(ke)) conn.push('disciplinaria');
    if (/fiscal/.test(ke.replace(/denuncia fiscal/g, ''))) conn.push('fiscal');
    if (/penal/.test(ke)) conn.push('penal');
    if (/sancionatori/.test(ke)) conn.push('sancionatoria');
    if (/otra incidencia|otras incidencias|otro hallazgo/.test(ke)) conn.push('otra');
    const num =
      (/n\s*[°ºo.]*\s*(\d+)/i.exec(enc.replace(/^\d+(?:\.\d+)*\.?\s+/, '')) || [])[1] ||
      String(hall.length + 1);
    const titulo = enc
      .replace(/^\d+(?:\.\d+)*\.?\s+/, '')
      .split(/\s+[–-]\s+|\s*[–]\s*/)
      .map(x => x.trim())
      .filter(x => x && !/^hallazgo\b/i.test(x) && !/^con presunta incidencia/i.test(x))
      .join(' - ');
    const texto = cuerpo.join(' ').replace(/\s+/g, ' ').trim();
    const iContra = texto.search(/lo anterior,?\s*contravin|contraviniendo lo establecido/i);
    const condicion = (
      iContra > 0 ? texto.slice(0, iContra) : (texto.split(/lo anterior,?\s*(?:es\s+)?causado/i)[0] as string)
    ).trim();
    const causa = causaDe(texto);
    const efecto = efectoDe(texto);
    let cuantia: number | null = null;
    if (conn.includes('fiscal')) {
      const mq = /(?:detrimento|da[ñn]o patrimonial|cuant[ií]a)[^$]{0,120}\$\s?([\d.]+(?:,\d+)?)/i.exec(
        texto
      );
      // también «… por $7.854.441, conllevando a un detrimento …» (la cifra antes de la palabra)
      const mr = mq || /\$\s?([\d.]+(?:,\d+)?)[^$]{0,80}(?:detrimento|da[ñn]o patrimonial)/i.exec(texto);
      if (mr) cuantia = Number((mr[1] as string).replace(/\./g, '').replace(',', '.'));
    }
    const ultima = cuerpo[cuerpo.length - 1] || '';
    hall.push({
      numero: num,
      numeroOrig: num,
      descripcion: (titulo ? titulo + '. ' : '') + condicion,
      causa,
      efecto,
      connotaciones: conn,
      macroproceso: '',
      cuantia,
      fila: L(i).pag,
      dependencia: dep || '',
      dependencia_id: dep ? depSugerida([dep], deps) : null,
      acciones: [],
      _cola: mayusculas(ultima) ? ultima : null
    });
    i = k - 1;
  }
  hall.forEach(h => delete h._cola);
  if (!hall.length)
    throw new Error(
      'No se encontraron hallazgos en el PDF. Debe ser un informe con texto (no escaneado) y con encabezados del tipo "3.1 HALLAZGO ADMINISTRATIVO N° 1 …".'
    );
  // relación de hallazgos del propio informe: sirve de control
  const mRel = /administrativos?\s+(\d+)\s/i.exec(todo.slice(todo.search(/relaci[oó]n de hallazgos/i) + 1));
  if (mRel && +(mRel[1] as string) !== hall.length)
    avisos.push({
      n: 'r',
      t: `El informe dice ${mRel[1]} hallazgos administrativos y se leyeron ${hall.length}. Revise que no falte ninguno.`
    });
  hall.forEach(h => {
    if (!h.causa)
      avisos.push({
        n: 'y',
        t: `Hallazgo ${h.numero}: no se encontró la causa en el texto; escríbala antes de formular las acciones.`
      });
    if (!h.dependencia_id)
      avisos.push({ n: 'y', t: `Hallazgo ${h.numero}: no se reconoció la dependencia responsable.` });
  });
  const plan: PlanImp = {
    formato,
    contraloria: contraloriaDe(formato),
    entidad: 'Distrito Especial de Santiago de Cali',
    nit: '',
    representante_legal: '',
    ordenador_gasto: '',
    ejercicio: ejercicio || txt(archivo).replace(/\.pdf$/i, ''),
    tipo_ejercicio: (/^(actuaci[oó]n especial|auditor[ií]a [a-záéíóú]+)/i.exec(ejercicio) || [
      ''
    ])[0] as string,
    modalidad: '',
    vigencia_pvcft: ((/vigencia (\d{4})/i.exec(ejercicio) || [])[1] || '').trim(),
    periodo_auditado: '',
    numero_informe: iRad >= 0 ? (pag1[iRad] as string) : '',
    radicado_orfeo: '',
    fecha_informe,
    fecha_suscripcion: '',
    estado: 'formulacion',
    observaciones:
      'Hallazgos leídos del informe final ' +
      archivo +
      '. Plan en formulación: falta definir las acciones de mejora.'
  };
  avisos.unshift({
    n: 'b',
    t: 'Se creará el plan en formulación, con los hallazgos y sin acciones. Las acciones se agregan después (con sugerencias según la causa) y la fecha de suscripción se actualiza al firmarlo.'
  });
  return { archivo, hoja: 'PDF', formato, plan, hall, avisos, feval: null, fevalRaw: null, desdePdf: true };
}

// ---------- plan en Excel ----------
interface FilaDatos {
  fila: number;
  g: (k: string) => unknown;
  acc: string;
}
interface HojaLeida {
  name: string;
  map: MapaColumnas;
  meta: Record<string, unknown>;
  data: FilaDatos[];
  texto: string;
  hr: number;
}
/** pmParseSheet: ubica la fila de encabezados, los metadatos de arriba y las filas de datos. */
export function leerHoja(filas: readonly Fila[], name: string): HojaLeida | null {
  const rows = filas;
  let hr = -1,
    map: MapaColumnas | null = null,
    best = 0;
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const m = mapearEncabezado(rows[r] as Fila),
      n = Object.keys(m).length;
    if (('accion' in m || 'actividad' in m) && n > best && n >= 4) {
      best = n;
      hr = r;
      map = m;
    }
  }
  if (hr < 0 || !map) return null;
  const M = map;
  // metadatos del encabezado
  const meta: Record<string, unknown> = {};
  const LBL: readonly (readonly [string, RegExp])[] = [
    ['entidad', /^entidad( auditada)?\b/],
    ['nit', /^nit\b/],
    ['representante_legal', /^representante legal/],
    ['ejercicio', /^nombre (del ejercicio|de la actuacion)/],
    ['tipo_ejercicio', /^tipo de (ejercicio|actuacion)/],
    ['fecha_suscripcion', /^fecha de suscripcion/],
    ['vigencia_pvcft', /^vigencia pvcft|^vigencia pvcf|^vigencia/],
    ['periodo_auditado', /^periodo fiscal/],
    ['modalidad', /^modalidad de auditoria/],
    ['fecha_eval', /^fecha de evaluacion/]
  ];
  const isLabel = (s: unknown) =>
    LBL.some(([, re]) =>
      re.test(
        llave(s)
          .replace(/\(\d+\)/g, '')
          .trim()
      )
    );
  const texto: string[] = [];
  for (let r = 0; r < hr; r++) {
    const row = rows[r] as Fila;
    row.forEach((cell, ci) => {
      const raw = txt(cell);
      if (!raw) return;
      texto.push(raw);
      const k = llave(raw)
        .replace(/\(\d+\)/g, '')
        .trim();
      const lb = LBL.find(([key, re]) => !(key in meta) && re.test(k));
      if (!lb) return;
      let v: unknown = '';
      const ix = raw.indexOf(':');
      if (ix >= 0) v = txt(raw.slice(ix + 1));
      if (!v) {
        for (let c = ci + 1; c < row.length; c++) {
          const x = row[c];
          if (x === '' || x == null) continue;
          if (isLabel(x)) break;
          v = x;
          break;
        }
      }
      if (v !== '' && v != null) meta[lb[0]] = v;
    });
  }
  // filas de datos
  const data: FilaDatos[] = [];
  let vacias = 0;
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r] as Fila;
    const g = (k: string) => (k in M ? row[M[k] as number] : '');
    const all = row.map(txt).filter(Boolean);
    if (!all.length) {
      if (++vacias >= 8) break;
      continue;
    }
    vacias = 0;
    const acc = txt(g('accion')) || txt(g('actividad'));
    // totales y firmas (también cuando su celda combinada cubre la columna de la acción)
    const k0 = llave(all[0]);
    const pie =
      /^totales?\b/.test(k0) || /\b(firma del representante|nombre y firma|elaboro|convenciones)\b/.test(k0);
    if (pie && (!acc || llave(acc) === k0 || !fechaPlan(g('ffin')))) break;
    // segunda fila de un encabezado combinado
    if (Object.keys(mapearEncabezado(row)).length >= 4) continue;
    if (!acc && !txt(g('descripcion'))) continue;
    if (/^\(?\d{1,2}\)?$/.test(acc)) continue; // fila con la numeración de columnas
    data.push({ fila: r + 1, g, acc });
  }
  // filas finales sin acción (firmas, nombres, notas al pie) no son hallazgos
  while (data.length && !(data[data.length - 1] as FilaDatos).acc) data.pop();
  return { name, map: M, meta, data, texto: texto.join(' '), hr };
}

/** pmParseWorkbook. */
export function leerLibroPlan(
  libro: readonly HojaPlan[],
  archivo: string,
  deps: readonly DependenciaImp[],
  previos: Previos
): Importacion {
  const hojas = libro.map(h => leerHoja(h.filas, h.nombre)).filter((h): h is HojaLeida => !!h);
  if (!hojas.length)
    throw new Error(
      'No se encontró la tabla del plan: el archivo debe tener la fila de encabezados con las columnas del hallazgo y de la acción.'
    );
  // la hoja PM_02 (papel de trabajo de evaluación de la CGSC) acompaña al PM_01 pero no es el plan: si hay una hoja
  // PM_01 con acciones, se usa esa. Luego, la hoja con más filas; ante empate, la que trae avance (F14.1)
  const esPm02 = (h: HojaLeida) =>
    /pm 02|papel de trabajo pt 03/.test(llave(h.name + ' ' + String(h.texto || '').slice(0, 400))) ? 1 : 0;
  const conAvance = (h: HojaLeida) => ('avfis' in h.map || 'pct' in h.map ? 1 : 0);
  const hayPm01 = hojas.some(h => !esPm02(h) && h.data.length);
  hojas.sort(
    (a, b) =>
      (hayPm01 ? esPm02(a) - esPm02(b) : 0) || b.data.length - a.data.length || conAvance(b) - conAvance(a)
  );
  const H = hojas[0] as HojaLeida;
  if (!H.data.length)
    throw new Error('La hoja «' + H.name + '» tiene encabezados pero no trae acciones diligenciadas.');
  // El Formulario 14.1 no trae el área responsable: se toma del Formulario 14 del mismo libro
  const respOtra: Record<string, string> = {};
  if (!('responsable' in H.map))
    hojas.slice(1).forEach(o => {
      if ('responsable' in o.map)
        o.data.forEach(d => {
          const k = llave(d.g('numero')) + '|' + llave(d.acc);
          if (!(k in respOtra)) respOtra[k] = txt(d.g('responsable'));
        });
    });
  const kt = llave(H.texto);
  const formato =
    'avfis' in H.map ||
    'proposito' in H.map ||
    'unidad' in H.map ||
    /formulario no 14|contraloria general de la republica/.test(kt)
      ? 'F14_CGR'
      : 'connotacion' in H.map || /pm 01|contraloria general de santiago de cali/.test(kt)
        ? 'PM_01_CGSC'
        : 'OTRO';
  const m = H.meta,
    avisos: AvisoImp[] = [];
  const fs = fechaPlan(m.fecha_suscripcion);
  const plan: PlanImp = {
    formato,
    contraloria: contraloriaDe(formato),
    entidad: txt(m.entidad) || 'Distrito Especial de Santiago de Cali',
    nit: txt(m.nit),
    representante_legal: txt(m.representante_legal),
    ordenador_gasto: '',
    ejercicio: txt(m.ejercicio) || (formato === 'F14_CGR' ? txt(m.modalidad) : ''),
    tipo_ejercicio: txt(m.tipo_ejercicio) || (formato === 'F14_CGR' ? txt(m.modalidad) : ''),
    modalidad: txt(m.modalidad),
    vigencia_pvcft: txt(m.vigencia_pvcft).replace(/\.0$/, ''),
    periodo_auditado: txt(m.periodo_auditado).replace(/\.0$/, ''),
    numero_informe: '',
    radicado_orfeo: '',
    fecha_informe: null,
    fecha_suscripcion: fs || '',
    estado: 'en_ejecucion',
    observaciones: 'Importado del archivo ' + archivo
  };
  if (!fs)
    avisos.push({ n: 'y', t: 'El archivo no trae una fecha de suscripción reconocible: escríbela abajo.' });
  if (!plan.ejercicio)
    avisos.push({
      n: 'y',
      t: 'El archivo no trae el nombre del ejercicio de fiscalización: escríbelo abajo.'
    });
  const fevalRaw = m.fecha_eval,
    feval = fechaPlan(fevalRaw);
  // % de avance del PM_01: 0..1 o 0..100
  let escala = 1;
  if (formato !== 'F14_CGR' && 'pct' in H.map) {
    const nums = H.data.map(d => numero(d.g('pct'))).filter(v => !isNaN(v));
    const conPct = H.data.some(d => /%/.test(String(d.g('pct'))));
    if (nums.length && !conPct && Math.max(...nums) <= 1) escala = 100;
  }
  const hall: HallazgoImp[] = [],
    porNum: Record<string, HallazgoImp> = {};
  let cur: HallazgoImp | null = null;
  H.data.forEach(d => {
    const g = d.g;
    let num = txt(g('numero')).replace(/\.0$/, '');
    if (num.length > 20) {
      // celda con texto largo ("Hallazgo No 7 AGEI Especial…"): se toma el número
      const mm = num.match(
        /^(?:hallazgo\s*)?(?:n(?:o|ro|um(?:ero)?)?\s*[.°º]*\s*)?(\d+[a-z]?(?:[.-]\d+)*)\b/i
      );
      if (mm) num = mm[1] as string;
    } else num = num.replace(/^hallazgo\s*(n[°ºo.]*\s*)?/i, '');
    const des = txt(g('descripcion'));
    if (!num && !des && cur) {
      // fila que continúa el hallazgo anterior
    } else if (!cur || num !== cur.numeroOrig || (des && des !== cur.descripcion)) {
      if (!num) num = cur && des === cur.descripcion ? cur.numeroOrig : 'S/N-' + (hall.length + 1);
      let num2 = num;
      if (porNum[num2] && (porNum[num2] as HallazgoImp).descripcion !== des) {
        let k = 2;
        while (porNum[num + ' (' + k + ')']) k++;
        num2 = num + ' (' + k + ')';
        avisos.push({
          n: 'y',
          t: `Fila ${d.fila}: el número de hallazgo «${num}» se repite con otra descripción; se registró como «${num2}».`
        });
      }
      if (porNum[num2] && (porNum[num2] as HallazgoImp).descripcion === des)
        cur = porNum[num2] as HallazgoImp;
      else {
        cur = {
          numero: num2,
          numeroOrig: num,
          descripcion: des,
          causa: txt(g('causa')) || causaDe(des),
          efecto: txt(g('efecto')),
          connotaciones: connotacionesDe(g('connotacion')),
          macroproceso: txt(g('macro')),
          cuantia: null,
          fila: d.fila,
          acciones: []
        };
        porNum[num2] = cur;
        hall.push(cur);
      }
    }
    const h = cur as HallazgoImp;
    const accion = txt(g('accion')) || txt(g('actividad'));
    if (!accion) return;
    const resp = txt(g('responsable')) || respOtra[llave(g('numero')) + '|' + llave(accion)] || '';
    const prev = h.acciones[h.acciones.length - 1];
    // acción en celdas combinadas que abarcan varias filas: es la misma acción
    if (
      prev &&
      prev.accion === accion &&
      prev.meta === txt(g('meta')) &&
      prev.responsable === resp &&
      txt(prev.ffinRaw) === txt(g('ffin')) &&
      txt(prev.actividad) === txt(g('actividad'))
    )
      return;
    const a: AccionImp = {
      fila: d.fila,
      accion,
      proposito: txt(g('proposito')),
      actividad: txt(g('actividad')),
      meta: txt(g('meta')),
      unidad_medida: formato === 'F14_CGR' ? txt(g('unidad')) : 'Porcentaje',
      cantidadRaw: g('cantidad'),
      cantidad: formato === 'F14_CGR' ? numero(g('cantidad')) : 100,
      fuente_verificacion: txt(g('fuente')),
      lugar_verificacion: txt(g('lugar')),
      finiRaw: g('fini'),
      fini: fechaPlan(g('fini')),
      ffinRaw: g('ffin'),
      ffin: fechaPlan(g('ffin')),
      responsable: resp,
      dependencia_id: depImportada(resp, txt(g('lugar')), deps),
      avance: null,
      fecha_corte: null,
      descripcion_avance: txt(g('descav')) || txt(g('obs')),
      obs_ci: txt(g('obsci'))
    };
    if (!plan.direccion_tecnica && txt(g('dirtec'))) plan.direccion_tecnica = txt(g('dirtec'));
    // dependencia: si el nombre exacto no aparece, se reconoce por el lugar, el responsable o el título del hallazgo
    if (!a.dependencia_id)
      a.dependencia_id = depSugerida([a.lugar_verificacion, resp, txt(h.descripcion).split('\n')[0]], deps);
    if (formato === 'F14_CGR' && 'avfis' in H.map) {
      const v = numero(g('avfis'));
      if (!isNaN(v) && txt(g('avfis')) !== '') {
        a.avance = v;
        a.fecha_corte = feval;
        a.sinCorte = !feval;
      }
    } else if ('pct' in H.map && txt(g('pct')) !== '') {
      const v = numero(g('pct'));
      if (!isNaN(v)) {
        a.avance = Math.round(v * escala * 100) / 100;
        a.fecha_corte = fechaPlan(g('fcorte'));
        a.sinCorte = !a.fecha_corte;
      }
    }
    // PM_01 versión 2020 exportado por la app: el avance validado va en la descripción del avance
    const mAv = /\(Avance validado ([\d.,]+)\s*%\s*con corte (\d{2}\/\d{2}\/\d{4})\)/.exec(
      a.descripcion_avance
    );
    if (mAv) {
      if (a.avance == null) {
        a.avance = numero(mAv[1]);
        a.fecha_corte = fechaPlan(mAv[2]);
        a.sinCorte = !a.fecha_corte;
      }
      a.descripcion_avance = a.descripcion_avance.replace(mAv[0], '').trim();
    }
    h.acciones.push(a);
  });
  // causas repetidas: en este plan o en planes ya registrados → sugerir una acción transversal
  const clave = (c: unknown) => llave(c).slice(0, 120);
  const vistas: Record<string, string[]> = {};
  hall.forEach(h => {
    const k = clave(h.causa);
    if (k.length < 30) return;
    (vistas[k] = vistas[k] || []).push(h.numero);
  });
  Object.values(vistas).forEach(nums => {
    if (nums.length > 1)
      avisos.push({
        n: 'y',
        t: `Los hallazgos ${nums.join(' y ')} tienen la misma causa. Considere una acción transversal (por ejemplo, una circular o un control común) además de las acciones de cada dependencia.`
      });
  });
  hall.forEach(h => {
    const k = clave(h.causa);
    if (k.length < 30) return;
    const prev = previos.hallazgos.find(x => clave(x.causa) === k);
    if (prev) {
      const pl = previos.planes.find(x => x.id === prev.plan_id);
      avisos.push({
        n: 'y',
        t: `El hallazgo ${h.numero} repite la causa del hallazgo ${prev.numero}${pl ? ' del plan «' + txt(pl.ejercicio).slice(0, 60) + '»' : ''}: es un hallazgo recurrente.`
      });
    }
  });
  const obsCi: string[] = [];
  hall.forEach(h => h.acciones.forEach(a => a.obs_ci && obsCi.push(`Hallazgo ${h.numero}: ${a.obs_ci}`)));
  if (obsCi.length)
    avisos.push({
      n: 'y',
      t: `El archivo trae ${obsCi.length} observación(es) de Control Interno sobre la formulación de las acciones. Quedan en cada acción como pendientes, para marcarlas como atendidas cuando se verifique el ajuste.`
    });
  return { archivo, hoja: H.name, formato, plan, hall, avisos, feval, fevalRaw };
}

// ---------- revisión antes de importar ----------
export interface RevisionImp {
  err: string[];
  warn: AvisoImp[];
  nAcc: number;
  nAv: number;
}
/** pmImpCheck: valida lo importado con los datos del plan tal como quedaron en el formulario. */
export function revisarImportacion(imp: Importacion, previos: Previos, hoy: string): RevisionImp {
  const err: string[] = [],
    warn = imp.avisos.slice(),
    p = imp.plan;
  if (!txt(p.contraloria)) err.push('Indica la contraloría.');
  if (txt(p.ejercicio).length < 4) err.push('Escribe el nombre del ejercicio de fiscalización.');
  if (!fechaPlan(p.fecha_suscripcion)) {
    if (imp.desdePdf)
      warn.push({
        n: 'y',
        t: `Sin fecha de suscripción: se registrará provisionalmente la del informe (${formatoCorto(p.fecha_informe || hoy)}).`
      });
    else err.push('Indica la fecha de suscripción del plan.');
  }
  const dup = previos.planes.find(
    x =>
      x.formato === p.formato &&
      llave(x.ejercicio) === llave(p.ejercicio) &&
      x.fecha_suscripcion === p.fecha_suscripcion
  );
  if (dup)
    err.push(
      'Ya existe un plan con el mismo formato, ejercicio y fecha de suscripción. Si quieres reemplazarlo, elimina primero el plan anterior.'
    );
  let nAcc = 0,
    nAv = 0;
  imp.hall.forEach(h => {
    if (txt(h.descripcion).length < 4)
      err.push(`Fila ${h.fila}: el hallazgo ${h.numero} no tiene descripción.`);
    if (!h.acciones.length && !imp.desdePdf)
      err.push(`Fila ${h.fila}: el hallazgo ${h.numero} no tiene acciones.`);
    if (imp.desdePdf && !h.dependencia_id)
      warn.push({
        n: 'y',
        t: `Hallazgo ${h.numero}: elija la dependencia responsable (también se puede después).`
      });
    h.acciones.forEach(a => {
      nAcc++;
      const ini = a.fini || (fechaPlan(p.fecha_suscripcion) ? p.fecha_suscripcion : null);
      if (!a.ffin)
        err.push(`Fila ${a.fila}: fecha de terminación no reconocida («${txt(a.ffinRaw) || 'vacía'}»).`);
      if (imp.formato === 'F14_CGR' && !a.fini)
        warn.push({
          n: 'y',
          t: `Fila ${a.fila}: sin fecha de iniciación reconocible; se usa la fecha de suscripción.`
        });
      if (a.ffin && ini && a.ffin < ini)
        err.push(
          `Fila ${a.fila}: la fecha de terminación (${formatoCorto(a.ffin)}) es anterior a la de inicio (${formatoCorto(ini)}).`
        );
      if (!(a.cantidad > 0))
        err.push(
          `Fila ${a.fila}: la cantidad de la meta no es un número mayor que cero («${txt(a.cantidadRaw) || 'vacía'}»).`
        );
      if (imp.formato === 'F14_CGR' && !a.unidad_medida)
        warn.push({ n: 'y', t: `Fila ${a.fila}: sin unidad de medida; se registrará como «Unidades».` });
      if (!a.dependencia_id)
        warn.push({
          n: 'r',
          t: `Fila ${a.fila}: no se reconoció la dependencia responsable («${textoCorto(a.responsable || 'vacío', 70)}»). Asígnala en la tabla.`
        });
      if (a.avance != null) {
        if (a.sinCorte)
          warn.push({
            n: 'y',
            t: `Fila ${a.fila}: trae avance pero no fecha de corte; ese avance no se importa.`
          });
        else if ((a.fecha_corte as string) > hoy)
          warn.push({
            n: 'y',
            t: `Fila ${a.fila}: la fecha de corte del avance es futura; ese avance no se importa.`
          });
        else nAv++;
        if (a.avance > a.cantidad)
          warn.push({
            n: 'y',
            t: `Fila ${a.fila}: el avance (${numTxt(a.avance)}) supera la meta (${numTxt(a.cantidad)}); para los indicadores cuenta como 100%.`
          });
      }
    });
  });
  return { err, warn, nAcc, nAv };
}

// ---------- lo que se envía a pm_importar ----------
export interface AccionCarga {
  dependencia_id: number | null;
  responsable: string;
  accion: string;
  proposito: string;
  actividad: string;
  meta: string;
  unidad_medida: string;
  cantidad: number;
  fuente_verificacion: string;
  lugar_verificacion: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  avance: number | null;
  fecha_corte: string | null;
  descripcion_avance: string;
  obs_ci: string;
}
export interface HallazgoCarga {
  numero: string;
  descripcion: string;
  causa: string;
  efecto: string;
  connotaciones: string[];
  cuantia: number | null;
  macroproceso: string;
  dependencia_id: number | null;
  dependencia_texto: string;
  acciones: AccionCarga[];
}
export interface CargaPlan {
  archivo: string;
  plan: PlanImp & { ente_id: number | null };
  hallazgos: HallazgoCarga[];
}
/**
 * La carga de pmDoImport (sin el oficio de remisión sugerido ni la fecha de radicación del informe, que llegan con la
 * entrega 4: en la 2.x solo se envían si están instalados los scripts 19 y 20).
 */
export function cargaImportacion(
  imp: Importacion,
  entes: readonly { id: number; nombre: string }[],
  hoy: string
): CargaPlan {
  const p = imp.plan;
  const en = entes.find(x => llave(x.nombre) === llave(p.contraloria));
  return {
    archivo: imp.archivo,
    plan: {
      ...p,
      fecha_suscripcion: p.fecha_suscripcion || (imp.desdePdf ? p.fecha_informe || hoy : p.fecha_suscripcion),
      ente_id: en ? en.id : null
    },
    hallazgos: imp.hall.map(h => ({
      numero: h.numero,
      descripcion: h.descripcion,
      causa: h.causa,
      efecto: h.efecto,
      connotaciones: h.connotaciones,
      cuantia: h.cuantia,
      macroproceso: h.macroproceso,
      dependencia_id: h.dependencia_id || null,
      dependencia_texto: h.dependencia || '',
      acciones: h.acciones.map(a => {
        const ok = a.avance != null && !!a.fecha_corte && a.fecha_corte <= hoy;
        return {
          dependencia_id: a.dependencia_id || null,
          responsable: a.responsable,
          accion: a.accion,
          proposito: a.proposito,
          actividad: a.actividad,
          meta: a.meta,
          unidad_medida: a.unidad_medida || 'Unidades',
          cantidad: a.cantidad,
          fuente_verificacion: a.fuente_verificacion,
          lugar_verificacion: a.lugar_verificacion,
          fecha_inicio: a.fini || p.fecha_suscripcion,
          fecha_fin: a.ffin,
          avance: ok ? a.avance : null,
          fecha_corte: ok ? a.fecha_corte : null,
          descripcion_avance: ok ? a.descripcion_avance : '',
          obs_ci: a.obs_ci || ''
        };
      })
    }))
  };
}
/** Avance en % para la tabla de la ventana de importación. */
export const avanceImpTxt = (a: Pick<AccionImp, 'avance' | 'cantidad'>) =>
  a.avance == null ? '—' : pctTxt(Math.min(1, a.avance / (a.cantidad || 1)));
