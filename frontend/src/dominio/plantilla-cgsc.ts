// Formato PM_01 CGSC con el DISEÑO OFICIAL: se parte de la plantilla de la Contraloría (plantillas/, preparada con
// scripts/preparar-plantilla-cgsc.mjs) y solo se escriben los datos. Así el archivo conserva estilos, logo,
// comentarios, listas desplegables y protección, que SheetJS no sabe escribir.
// Los valores salen de hojaPM01 (planes-exportar.ts), que ya los pone en las mismas celdas de la plantilla.
import type * as XLSX from 'xlsx';

type SheetJS = typeof XLSX;
type Hoja = XLSX.WorkSheet;

/** Estilos (índices de cellXfs) de las filas de datos de la plantilla (fila 13), columnas B a S. */
const ESTILO_FILA: Record<number, number> = {
  1: 30, // B N° hallazgo
  2: 33, // C descripción
  3: 64, // D connotación
  4: 28, // E macroproceso
  5: 33, // F acción
  6: 33, // G meta
  7: 33, // H fuente
  8: 33, // I lugar
  9: 10, // J fecha de terminación (dd/mm/aaaa)
  10: 10, // K responsable
  11: 33, // L avance
  12: 15, // M cumplimiento
  13: 15, // N efectividad
  14: 29, // O estado
  15: 16, // P dirección técnica
  16: 16, // Q observación seguimiento
  17: 10 // R fecha de corte (dd/mm/aaaa); S (% de avance) usa un estilo nuevo con formato 0%
};
/** Anchos de la plantilla (A … S), para calcular el alto de cada fila. */
const ANCHO = [1, 13, 53, 25, 34, 34, 11, 18, 15, 15, 32, 38, 16, 16, 23, 21, 42, 30, 12];
/** Celdas de la cabecera que llevan datos del plan. */
const CABECERA = ['D5', 'B6', 'D7', 'B8', 'E8'];
/** Fórmulas de la plantilla: se deja la fórmula y se guarda el valor calculado (Excel recalcula al abrir). */
const FORMULAS = ['W5', 'Y5', 'W7', 'Y7', 'X8', 'Y8', 'M8', 'M9', 'N9', 'X9'];

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numFila = (ref: string) => Number(/\d+$/.exec(ref)?.[0]);
/** Primer grupo de una expresión, o '' si no coincide. */
const grupo = (re: RegExp, t: string) => re.exec(t)?.[1] ?? '';
const numCol = (ref: string) =>
  grupo(/^([A-Z]+)/, ref)
    .split('')
    .reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Contenido XML de una celda con su valor (texto en línea, número o fórmula con su resultado). */
function celdaXml(ref: string, s: number | null, c: XLSX.CellObject | undefined): string {
  const est = s == null ? '' : ` s="${s}"`;
  if (!c || c.v == null || c.v === '') return `<c r="${ref}"${est}/>`;
  if (c.f) {
    const t = typeof c.v === 'string' ? ' t="str"' : '';
    return `<c r="${ref}"${est}${t}><f>${esc(c.f)}</f><v>${esc(String(c.v))}</v></c>`;
  }
  if (typeof c.v === 'number') return `<c r="${ref}"${est}><v>${c.v}</v></c>`;
  return `<c r="${ref}"${est} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`;
}

/** Reemplaza una celda existente de la plantilla conservando su estilo. */
function ponerCelda(xml: string, ref: string, c: XLSX.CellObject | undefined): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>.*?</c>)`, 's');
  const m = re.exec(xml);
  if (!m) return xml;
  const s = /\ss="(\d+)"/.exec(m[1] ?? '');
  return xml.replace(re, celdaXml(ref, s ? Number(s[1]) : null, c));
}

/** Alto aproximado de una fila según el texto más largo (la plantilla fija 18 puntos por fila). */
function alto(textos: { c: number; t: string }[]): number {
  let lineas = 1;
  for (const { c, t } of textos) {
    const cabe = Math.max(4, (ANCHO[c] ?? 12) * 1.15);
    const n = t.split('\n').reduce((s, l) => s + Math.max(1, Math.ceil(l.length / cabe)), 0);
    lineas = Math.max(lineas, n);
  }
  return Math.max(18, Math.min(409, Math.round(lineas * 12.5 + 4)));
}

/** Agrega a styles.xml un estilo igual a «base» con otro formato de número; devuelve su índice. */
function estiloConFormato(estilos: string, base: number, numFmtId: number): { xml: string; id: number } {
  const bloque = /<cellXfs count="\d+">(.*?)<\/cellXfs>/s.exec(estilos);
  const cuerpo = bloque?.[1] ?? '';
  const xfs = cuerpo.match(/<xf [^>]*?(?:\/>|>.*?<\/xf>)/gs) ?? [];
  const modelo = xfs[base];
  if (!bloque || !modelo) throw new Error('La plantilla del Formato PM_01 no tiene los estilos esperados.');
  const nuevo = modelo
    .replace(/numFmtId="\d+"/, `numFmtId="${numFmtId}"`)
    .replace(/<xf /, '<xf applyNumberFormat="1" ');
  const limpio = nuevo.replace(/(applyNumberFormat="1" .*?) applyNumberFormat="1"/, '$1');
  const id = xfs.length;
  const xml = estilos.replace(bloque[0], `<cellXfs count="${id + 1}">${cuerpo}${limpio}</cellXfs>`);
  return { xml, id };
}

/**
 * Llena la plantilla oficial con la hoja que arma hojaPM01 y devuelve el .xlsx listo para descargar.
 * @param base bytes de plantillas/FORMATO_202001_PM_CGSC_base.xlsx
 */
export function llenarPlantillaPM01(X: SheetJS, base: Uint8Array, ws: Hoja): Uint8Array {
  const z = X.CFB.read(base, { type: 'array' });
  const indice = (p: string) => z.FullPaths.findIndex((x: string) => x.endsWith('/' + p));
  const entrada = (p: string) => {
    const e = z.FileIndex[indice(p)];
    if (!e) throw new Error('La plantilla del Formato PM_01 está incompleta: falta ' + p);
    return e;
  };
  const leer = (p: string) => new TextDecoder().decode(entrada(p).content as Uint8Array);
  const escribir = (p: string, t: string) => {
    const e = entrada(p);
    e.content = new TextEncoder().encode(t) as unknown as typeof e.content;
    e.size = (e.content as Uint8Array).length;
  };

  // Estilo para el % de avance (columna S): el de la fila de datos con formato 0 %
  const est = estiloConFormato(leer('xl/styles.xml'), 15, 9);
  escribir('xl/styles.xml', est.xml);

  let hoja = leer('xl/worksheets/sheet1.xml');
  for (const ref of [...CABECERA, ...FORMULAS]) hoja = ponerCelda(hoja, ref, ws[ref] as XLSX.CellObject);

  // Filas 12 en adelante: fuera las de la plantilla, salvo el cuadro «Rangos de calificación» (T a Y, filas 12-14)
  const conservar = new Map<number, string[]>();
  hoja = hoja.replace(/<row r="(\d+)"[^>]*?(?:\/>|>(.*?)<\/row>)/gs, (fila, n: string, cuerpo?: string) => {
    const r = Number(n);
    if (r < 12) return fila;
    if (r <= 14 && cuerpo)
      conservar.set(
        r,
        (cuerpo.match(/<c r="[A-Z]+\d+"[^>]*?(?:\/>|>.*?<\/c>)/gs) ?? []).filter(
          c => numCol(grupo(/r="([A-Z]+\d+)"/, c)) >= 19
        )
      );
    return '';
  });

  // Filas nuevas con los datos (de la hoja que arma hojaPM01). Las firmas empiezan en la fila de la raya.
  const rango = X.utils.decode_range(ws['!ref'] ?? 'A1:A1');
  const valor = (r: number, c: number) =>
    (ws[X.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined)?.v;
  let firmas = rango.e.r + 1;
  for (let r = 11; r <= rango.e.r; r++)
    if (typeof valor(r, 1) === 'string' && /^_{5,}/.test(valor(r, 1) as string)) {
      firmas = r;
      break;
    }
  const filas: string[] = [];
  for (let r = 11; r <= rango.e.r; r++) {
    const delPlan = r < firmas;
    const celdas: string[] = [];
    const textos: { c: number; t: string }[] = [];
    for (let c = 1; c <= 18; c++) {
      const ref = X.utils.encode_cell({ r, c });
      const cel = ws[ref] as XLSX.CellObject | undefined;
      if (!delPlan && (cel?.v == null || cel.v === '')) continue;
      celdas.push(celdaXml(ref, delPlan ? (c === 18 ? est.id : (ESTILO_FILA[c] ?? 16)) : null, cel));
      if (typeof cel?.v === 'string') textos.push({ c, t: cel.v });
    }
    const n = r + 1;
    const extra = conservar.get(n) ?? [];
    if (!celdas.length && !extra.length) continue;
    filas.push(
      `<row r="${n}" spans="1:25" ht="${delPlan ? alto(textos) : 18}" customHeight="1">${celdas.join('')}${extra.join('')}</row>`
    );
  }
  for (const n of [12, 13, 14])
    if (!filas.some(f => f.startsWith(`<row r="${n}"`)) && conservar.get(n)?.length)
      filas.push(
        `<row r="${n}" spans="1:25" ht="18" customHeight="1">${(conservar.get(n) ?? []).join('')}</row>`
      );
  filas.sort((a, b) => Number(grupo(/r="(\d+)"/, a)) - Number(grupo(/r="(\d+)"/, b)));
  hoja = hoja.replace('</sheetData>', filas.join('') + '</sheetData>');

  // Uniones: las de la cabecera de la plantilla + rangos de calificación + las de cada hallazgo
  const propias = (ws['!merges'] ?? []).filter(m => m.s.r >= 11).map(m => X.utils.encode_range(m));
  hoja = hoja.replace(/<mergeCells count="\d+">(.*?)<\/mergeCells>/s, (_t, cuerpo: string) => {
    const deLaPlantilla = (cuerpo.match(/<mergeCell ref="([^"]+)"\/>/g) ?? [])
      .map(m => grupo(/ref="([^"]+)"/, m))
      .filter(
        ref => numFila(ref.split(':')[0] ?? '') < 12 || ['U12:V12', 'U13:V13', 'U14:V14'].includes(ref)
      );
    const todas = [...deLaPlantilla, ...propias];
    return `<mergeCells count="${todas.length}">${todas.map(r => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`;
  });
  // Formatos condicionales sobrantes de la plantilla (filas 12 en adelante)
  hoja = hoja.replace(
    /<conditionalFormatting sqref="([A-Z]+)(\d+)[^"]*">.*?<\/conditionalFormatting>/gs,
    (cf, _c, f: string) => (Number(f) >= 12 ? '' : cf)
  );
  hoja = hoja.replace(/<dimension ref="[^"]+"\/>/, `<dimension ref="A1:Y${Math.max(14, rango.e.r + 1)}"/>`);
  escribir('xl/worksheets/sheet1.xml', hoja);

  const salida = X.CFB.write(z, { type: 'array', fileType: 'zip', compression: true }) as unknown;
  return salida instanceof Uint8Array ? salida : new Uint8Array(salida as ArrayLike<number>);
}
