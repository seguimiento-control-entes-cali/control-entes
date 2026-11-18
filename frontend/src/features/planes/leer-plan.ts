// Lectura del plan en Excel y del informe final en PDF (pmAoa, pmXlsx, pmPdfJs y pmLeerPdf de la 2.x). Aquí solo se
// convierten los archivos en filas o en trozos de texto; la interpretación está en dominio/planes-importar.
// SheetJS 0.20.3 (vendor/npm) y pdf.js 3.11.174 (los mismos archivos de vendor/web que publica la 2.x) se cargan solo
// al elegir un archivo.
import pdfUrl from '../../../../vendor/web/pdf.min.js?url';
import pdfWorkerUrl from '../../../../vendor/web/pdf.worker.min.js?url';
import type { Fila, HojaPlan, TrozoPdf } from '../../dominio/planes-importar';
import { cargarSheetJS } from '../configuracion/leer-excel';

type SheetJS = typeof import('xlsx');
type HojaXlsx = import('xlsx').WorkSheet;

/** pmAoa: rellena las celdas combinadas con el valor de su celda superior izquierda y devuelve las filas. */
export function filasDeHoja(X: SheetJS, ws: HojaXlsx): Fila[] {
  (ws['!merges'] || []).forEach(m => {
    const tl = ws[X.utils.encode_cell(m.s)] as object | undefined;
    if (!tl) return;
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) {
        const a = X.utils.encode_cell({ r, c });
        if (a !== X.utils.encode_cell(m.s)) ws[a] = { ...tl };
      }
  });
  return X.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '', blankrows: true });
}
/** Hojas del libro como filas, con el mismo modo de lectura de la 2.x (sin convertir fechas). */
export async function leerLibroExcel(bytes: ArrayBuffer): Promise<HojaPlan[]> {
  const X = await cargarSheetJS();
  const wb = X.read(new Uint8Array(bytes), { type: 'array', cellDates: false });
  return wb.SheetNames.map(n => ({ nombre: n, filas: filasDeHoja(X, wb.Sheets[n] as HojaXlsx) }));
}

interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(o: { data: Uint8Array; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(i: number): Promise<{
        getTextContent(): Promise<{
          items: { str: string; transform: number[]; width: number; height: number }[];
        }>;
      }>;
    }>;
  };
}
let pdfjs: Promise<PdfJs> | null = null;
interface Guion {
  src: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
}
/** El navegador (se toma de globalThis para no depender de los tipos del DOM en las pruebas). */
const navegador = () =>
  globalThis as unknown as {
    pdfjsLib?: PdfJs;
    document: { createElement(t: 'script'): Guion; head: { appendChild(n: Guion): void } };
  };
/** pmPdfJs: carga pdf.js una vez (con su worker). */
function cargarPdfJs(): Promise<PdfJs> {
  const w = navegador();
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  if (pdfjs) return pdfjs;
  pdfjs = new Promise<PdfJs>((ok, no) => {
    const sc = w.document.createElement('script');
    sc.src = pdfUrl;
    sc.onload = () => {
      if (!w.pdfjsLib) return no(new Error('No se pudo iniciar el lector de PDF'));
      w.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      ok(w.pdfjsLib);
    };
    sc.onerror = () => {
      pdfjs = null;
      no(
        new Error('No se pudo cargar el lector de PDF. Revisa la conexión a internet e inténtalo de nuevo.')
      );
    };
    w.document.head.appendChild(sc);
  });
  return pdfjs;
}
/** pmLeerPdf: texto de cada página con su posición, para rearmar las líneas. */
export async function leerPdf(bytes: ArrayBuffer): Promise<TrozoPdf[][]> {
  const lib = await cargarPdfJs();
  // isEvalSupported: false cierra CVE-2024-4367 (un PDF malicioso podía ejecutar código en pdf.js 3.x)
  const doc = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const paginas: TrozoPdf[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    paginas.push(
      tc.items.map(it => ({
        s: it.str,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
        w: it.width,
        h: it.height
      }))
    );
  }
  return paginas;
}
