// Formato de Calidad MEDE01.05.02.P019.F002 «Herramientas análisis de causas para planes de mejoramiento por proceso».
// La dependencia lo diligencia en la app (se guarda en pm_hallazgos.causa_detalle, script 28) y la app lo exporta
// llenando el formato oficial (plantillas/MEDE01.05.02.P019.F002_base.xlsx, preparado con
// scripts/preparar-formato-causas.mjs): cada pestaña conserva su diseño (encabezado con logo, bordes, espina).
import type * as XLSX from 'xlsx';

type SheetJS = typeof XLSX;

export const CATEGORIAS_ESPINA = [
  ['materiales', 'Materiales'],
  ['mano_obra', 'Mano de obra'],
  ['maquinaria', 'Maquinaria'],
  ['medio_ambiente', 'Medio ambiente'],
  ['metodo', 'Método'],
  ['medicion', 'Medición']
] as const;
export type CategoriaEspina = (typeof CATEGORIAS_ESPINA)[number][0];

export const METODOS_CAUSA = [
  ['cinco_porques', '5 porqués'],
  ['espina_pescado', 'Causa-efecto (espina de pescado)'],
  ['arbol_problema', 'Árbol de problemas'],
  ['otro', 'Otro']
] as const;

/** Lo que se diligencia en las 4 pestañas del formato (todo opcional: se llena lo que use el equipo). */
export interface DetalleCausas {
  macroproceso?: string;
  macroproceso_codigo?: string;
  proceso?: string;
  proceso_codigo?: string;
  subproceso?: string;
  subproceso_codigo?: string;
  /** Lluvia de ideas: hasta 3 participantes */
  participantes?: string[];
  /** Descripción de la no conformidad (el hallazgo) */
  no_conformidad?: string;
  /** Lluvia de ideas: hasta 7 ideas, con la nota si se descartó o está duplicada */
  lluvia?: { idea: string; descartada?: string }[];
  causa_raiz_lluvia?: string;
  /** Causa-efecto: hasta 2 causas por categoría */
  espina?: Partial<Record<CategoriaEspina, string[]>>;
  /** 5 porqués: hasta 8 filas */
  cinco_porques?: { problema: string; porques: string[]; resultado: string }[];
  /** Árbol de problemas: hasta 8 filas */
  arbol?: { problema: string; causa: string; subcausa: string; efecto: string }[];
}

/** Límites del formato (filas y casillas que trae impresas). */
export const LIMITES_FORMATO = {
  participantes: 3,
  lluvia: 7,
  espina: 2,
  cinco_porques: 8,
  arbol: 8
} as const;

/** Celda → valor, por pestaña (archivo de la hoja dentro del .xlsx). */
type Mapa = Record<string, string | number>;

const ESPINA: Record<CategoriaEspina, [string, string]> = {
  // La causa va en la celda justo encima de cada línea amarilla (quedan arriba de las filas 18, 19, 21 y 22)
  materiales: ['B17', 'B18'],
  mano_obra: ['C17', 'C18'],
  maquinaria: ['D17', 'D18'],
  medio_ambiente: ['B20', 'B21'],
  metodo: ['C20', 'C21'],
  medicion: ['D20', 'D21']
};

const t = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Qué escribir en cada pestaña. Se exporta para las pruebas. */
export function celdasFormato(d: DetalleCausas): Record<1 | 2 | 3 | 4, Mapa> {
  const cab = (filaInicio: number, colValor: string, colCodigo: string, conEtiqueta: boolean): Mapa => {
    const m: Mapa = {};
    const filas: [string | undefined, string | undefined][] = [
      [d.macroproceso, d.macroproceso_codigo],
      [d.proceso, d.proceso_codigo],
      [d.subproceso, d.subproceso_codigo]
    ];
    filas.forEach(([v, cod], i) => {
      const r = filaInicio + i;
      if (t(v)) m[colValor + r] = t(v);
      // En el árbol el código va en la misma celda de la etiqueta «CODIGO:»
      if (t(cod)) m[colCodigo + r] = conEtiqueta ? 'CODIGO: ' + t(cod) : t(cod);
    });
    return m;
  };

  const h1: Mapa = cab(3, 'C', 'E', false);
  (d.participantes ?? []).slice(0, LIMITES_FORMATO.participantes).forEach((p, i) => {
    if (t(p)) h1['A' + (9 + i)] = t(p);
  });
  if (t(d.no_conformidad)) h1['D9'] = t(d.no_conformidad);
  (d.lluvia ?? []).slice(0, LIMITES_FORMATO.lluvia).forEach((l, i) => {
    if (!t(l.idea) && !t(l.descartada)) return;
    h1['A' + (14 + i)] = i + 1;
    if (t(l.idea)) h1['B' + (14 + i)] = t(l.idea);
    if (t(l.descartada)) h1['D' + (14 + i)] = t(l.descartada);
  });
  if (t(d.causa_raiz_lluvia)) h1['A23'] = t(d.causa_raiz_lluvia);

  const h2: Mapa = cab(10, 'B', 'E', false);
  if (t(d.no_conformidad)) h2['E19'] = t(d.no_conformidad);
  for (const [cat] of CATEGORIAS_ESPINA)
    (d.espina?.[cat] ?? []).slice(0, LIMITES_FORMATO.espina).forEach((c, i) => {
      const ref = ESPINA[cat][i];
      if (ref && t(c)) h2[ref] = t(c);
    });

  const h3: Mapa = cab(10, 'B', 'F', false);
  (d.cinco_porques ?? []).slice(0, LIMITES_FORMATO.cinco_porques).forEach((f, i) => {
    const r = 16 + i;
    if (t(f.problema)) h3['A' + r] = t(f.problema);
    (f.porques ?? []).slice(0, 5).forEach((p, j) => {
      if (t(p)) h3['BCDEF'.charAt(j) + r] = t(p);
    });
    if (t(f.resultado)) h3['G' + r] = t(f.resultado);
  });

  const h4: Mapa = cab(10, 'B', 'D', true);
  (d.arbol ?? []).slice(0, LIMITES_FORMATO.arbol).forEach((f, i) => {
    const r = 16 + i;
    if (t(f.problema)) h4['A' + r] = t(f.problema);
    if (t(f.causa)) h4['B' + r] = t(f.causa);
    if (t(f.subcausa)) h4['C' + r] = t(f.subcausa);
    if (t(f.efecto)) h4['D' + r] = t(f.efecto);
  });
  return { 1: h1, 2: h2, 3: h3, 4: h4 };
}

/** ¿Tiene algo diligenciado? */
export const formatoConDatos = (d: DetalleCausas | null | undefined) =>
  !!d && Object.values(celdasFormato(d)).some(m => Object.keys(m).length > 0);

// ---------- escritura en el XML de la hoja, conservando el estilo de cada celda ----------
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numCol = (letras: string) => letras.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const partes = (ref: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return { col: m?.[1] ?? 'A', fila: Number(m?.[2] ?? 1) };
};
function celda(ref: string, s: string | undefined, v: string | number) {
  const est = s ? ` s="${s}"` : '';
  return typeof v === 'number'
    ? `<c r="${ref}"${est}><v>${v}</v></c>`
    : `<c r="${ref}"${est} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

/** Escribe el valor en la celda: si existe conserva su estilo; si no, la crea en su fila en el orden correcto. */
export function ponerValor(xml: string, ref: string, v: string | number): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>.*?</c>)`, 's');
  const m = re.exec(xml);
  if (m) return xml.replace(re, celda(ref, /\ss="(\d+)"/.exec(m[1] ?? '')?.[1], v));
  const { col, fila } = partes(ref);
  const reFila = new RegExp(`<row r="${fila}"([^>]*?)(?:/>|>(.*?)</row>)`, 's');
  const f = reFila.exec(xml);
  if (!f) {
    // Sin fila: se agrega antes de la siguiente fila mayor (o al final de sheetData)
    const nueva = `<row r="${fila}">${celda(ref, undefined, v)}</row>`;
    const siguiente = [...xml.matchAll(/<row r="(\d+)"/g)].find(x => Number(x[1]) > fila);
    return siguiente?.index != null
      ? xml.slice(0, siguiente.index) + nueva + xml.slice(siguiente.index)
      : xml.replace('</sheetData>', nueva + '</sheetData>');
  }
  const cuerpo = f[2] ?? '';
  const celdas = cuerpo.match(/<c r="[A-Z]+\d+"[^>]*?(?:\/>|>.*?<\/c>)/gs) ?? [];
  const pos = celdas.findIndex(c => numCol(partes(/r="([A-Z]+\d+)"/.exec(c)?.[1] ?? 'A1').col) > numCol(col));
  const nuevas = [...celdas];
  nuevas.splice(pos < 0 ? nuevas.length : pos, 0, celda(ref, undefined, v));
  return xml.replace(reFila, `<row r="${fila}"${f[1] ?? ''}>${nuevas.join('')}</row>`);
}

/**
 * Llena el formato oficial y devuelve el .xlsx.
 * @param base bytes de plantillas/MEDE01.05.02.P019.F002_base.xlsx
 */
export function llenarFormatoCausas(X: SheetJS, base: Uint8Array, d: DetalleCausas): Uint8Array {
  const z = X.CFB.read(base, { type: 'array' });
  const entrada = (p: string) => {
    const e = z.FileIndex[z.FullPaths.findIndex((x: string) => x.endsWith('/' + p))];
    if (!e) throw new Error('El formato de análisis de causas está incompleto: falta ' + p);
    return e;
  };
  const mapas = celdasFormato(d);
  for (const n of [1, 2, 3, 4] as const) {
    const p = `xl/worksheets/sheet${n}.xml`;
    const e = entrada(p);
    let xml = new TextDecoder().decode(e.content as Uint8Array);
    for (const [ref, v] of Object.entries(mapas[n])) xml = ponerValor(xml, ref, v);
    e.content = new TextEncoder().encode(xml) as unknown as typeof e.content;
    e.size = (e.content as Uint8Array).length;
  }
  const salida = X.CFB.write(z, { type: 'array', fileType: 'zip', compression: true }) as unknown;
  return salida instanceof Uint8Array ? salida : new Uint8Array(salida as ArrayLike<number>);
}

/** Nombre del archivo: código del formato + hallazgo. */
export const nombreFormatoCausas = (numeroHallazgo: string) =>
  `MEDE01.05.02.P019.F002_analisis_causas_hallazgo_${String(numeroHallazgo).replace(/[^A-Za-z0-9-]+/g, '_')}.xlsx`;
