// Lectura del archivo Excel con SheetJS (2.x: ceNumerosCrudos, ceCelda y ceFilas de src/js/20-carga-excel.js).
// Convierte las hojas CONTROL y NO RESPUESTA en celdas con la misma semántica de Python/openpyxl; el resto de la
// lectura y la clasificación están en dominio/excel-control. SheetJS se carga solo al abrir un archivo.
import type { Celda, Hoja } from '../../dominio/excel-control/lectura';

type SheetJS = typeof import('xlsx');
type Libro = import('xlsx').WorkBook;
type HojaXlsx = import('xlsx').WorkSheet;

let sheetjs: Promise<SheetJS> | null = null;
/** SheetJS 0.20.3 (la misma versión de la 2.x, desde vendor/npm), cargado una sola vez. */
export const cargarSheetJS = () => (sheetjs ??= import('xlsx'));

const dos = (n: number) => String(n).padStart(2, '0');
const isoLocal = (d: Date) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

/**
 * Texto crudo de cada celda numérica, leído del XML del archivo (ceNumerosCrudos): openpyxl distingue "1" (entero) de
 * "1.0" (decimal) y esa diferencia cambia cómo Python escribe el valor como texto.
 */
function numerosCrudos(wb: Libro, idx: number): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const libro = wb as Libro & {
      Directory?: { sheets?: string[] };
      files?: Record<string, { content: Uint8Array }>;
    };
    const path = (libro.Directory?.sheets?.[idx] ?? '').replace(/^\//, '');
    const f = libro.files && (libro.files[path] ?? libro.files['/' + path]);
    if (!f) return out;
    // TextDecoder existe en el navegador y en Node; se toma de globalThis para no depender de los tipos del DOM
    const { TextDecoder: Decodificador } = globalThis as unknown as {
      TextDecoder: new (c: string) => { decode(b: Uint8Array): string };
    };
    const xml = new Decodificador('utf-8').decode(f.content);
    const re = /<c r="([A-Z]+[0-9]+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      if (/\bt="(s|str|inlineStr|b|e|d)"/.test(m[2] ?? '') || !m[3]) continue;
      const v = /<v>([^<]*)<\/v>/.exec(m[3]);
      if (v) out.set(m[1] as string, v[1] as string);
    }
  } catch {
    // Sin el XML de la hoja se usa el valor numérico (la 2.x solo lo anotaba en la consola del navegador)
  }
  return out;
}

const limpiarTexto = (s: string): Celda => {
  const t = s
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t === '' || t === '-' ? null : t;
};

/** ceCelda: una celda de SheetJS como texto, número (con su texto crudo) o fecha. */
function celda(X: SheetJS, ws: HojaXlsx, crudos: Map<string, string>, r: number, c: number): Celda {
  const ref = X.utils.encode_cell({ r, c }),
    cell = ws[ref] as import('xlsx').CellObject | undefined;
  if (!cell || cell.v == null) return null;
  if (cell.t === 's' || cell.t === ('str' as string)) return limpiarTexto(String(cell.v));
  if (cell.t === 'b') return cell.v ? 'True' : 'False';
  if (cell.t === 'e') return limpiarTexto(cell.w || '#N/A');
  if (cell.t === 'd' && cell.v instanceof Date) return { d: isoLocal(cell.v), h: '00:00:00' };
  if (cell.t === 'n') {
    const n = cell.v as number;
    if (cell.z && X.SSF.is_date(cell.z)) {
      const p = X.SSF.parse_date_code(n);
      if (p && p.y)
        return {
          d: p.y + '-' + dos(p.m) + '-' + dos(p.d),
          h: dos(p.H || 0) + ':' + dos(p.M || 0) + ':' + dos(Math.floor(p.S || 0))
        };
    }
    const raw = crudos.get(ref) || String(n);
    return { n, f: /[.eE]/.test(raw), raw };
  }
  return limpiarTexto(String(cell.v));
}

/** ceFilas: la hoja completa como filas de celdas (al menos 16 columnas); null si el libro no la tiene. */
export function hojaComoCeldas(X: SheetJS, wb: Libro, nombre: string): Hoja | null {
  const idx = wb.SheetNames.indexOf(nombre);
  if (idx < 0) return null;
  const ws = wb.Sheets[nombre] as HojaXlsx,
    crudos = numerosCrudos(wb, idx);
  if (!ws['!ref']) return [];
  const rg = X.utils.decode_range(ws['!ref']),
    ncol = Math.max(rg.e.c + 1, 16),
    filas: Celda[][] = [];
  for (let r = 0; r <= rg.e.r; r++) {
    const fila: Celda[] = [];
    for (let c = 0; c < ncol; c++) fila.push(celda(X, ws, crudos, r, c));
    filas.push(fila);
  }
  return filas;
}

/** Lee un archivo como lo hace la 2.x (cellNF y bookFiles para conocer los formatos y el XML de cada hoja). */
export async function leerArchivoExcel(datos: ArrayBuffer) {
  const X = await cargarSheetJS();
  const wb = X.read(new Uint8Array(datos), { type: 'array', cellNF: true, bookFiles: true });
  return {
    control: hojaComoCeldas(X, wb, 'CONTROL'),
    noRespuesta: hojaComoCeldas(X, wb, 'NO RESPUESTA')
  };
}
