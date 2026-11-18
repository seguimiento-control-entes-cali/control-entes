// Prepara la plantilla base del Formato PM_01 CGSC que usa la app al exportar (diseño idéntico al oficial).
// Parte de la plantilla que entrega la Contraloría General de Santiago de Cali (FORMATO_202001_PM_CGSC plantilla.xlsx)
// y deja el diseño intacto (estilos, logo, comentarios, listas desplegables, protección), pero:
//   1. quita la hoja oculta «Ppto» (presupuesto, ajena al plan de mejoramiento);
//   2. borra de los metadatos los nombres de personas (autor, última modificación, impresión);
//   3. quita calcChain y pide recalcular al abrir (la app escribe los datos y Excel recalcula las fórmulas);
//   4. abre la hoja en A1.
// Los valores de ejemplo (filas 12 en adelante) los reemplaza la app al exportar.
//   node scripts/preparar-plantilla-cgsc.mjs "<ruta de la plantilla oficial>.xlsx"
// Escribe plantillas/FORMATO_202001_PM_CGSC_base.xlsx (dentro de frontend/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(AQUI, '..', 'plantillas', 'FORMATO_202001_PM_CGSC_base.xlsx');
const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) {
  console.error(
    'Indique la ruta de la plantilla oficial: node scripts/preparar-plantilla-cgsc.mjs "<archivo>.xlsx"'
  );
  process.exit(1);
}
const { CFB } = XLSX;
const z = CFB.read(fs.readFileSync(origen), { type: 'buffer' });
/** Entrada del zip por su ruta interna (CFB guarda «Root Entry/xl/…»). */
const entrada = p => {
  const i = z.FullPaths.findIndex(x => x.endsWith('/' + p));
  return i < 0 ? null : z.FileIndex[i];
};
const leer = p => Buffer.from(entrada(p).content).toString('utf8');
const escribir = (p, t) => {
  const e = entrada(p);
  e.content = Buffer.from(t, 'utf8');
  e.size = e.content.length;
};
const borrar = p => CFB.utils.cfb_del(z, z.FullPaths[z.FullPaths.findIndex(x => x.endsWith('/' + p))]);

// 1. Hoja «Ppto»
let wb = leer('xl/workbook.xml');
const ppto = /<sheet name="Ppto"[^>]*r:id="(rId\d+)"\/>/.exec(wb);
if (!ppto) throw new Error('La plantilla no trae la hoja Ppto: revise que sea la oficial.');
let rels = leer('xl/_rels/workbook.xml.rels');
const destinoPpto = new RegExp(`<Relationship Id="${ppto[1]}"[^>]*Target="([^"]+)"/>`).exec(rels)[1];
wb = wb.replace(ppto[0], '');
rels = rels.replace(new RegExp(`<Relationship Id="${ppto[1]}"[^>]*/>`), '');
let tipos = leer('[Content_Types].xml');
tipos = tipos.replace(new RegExp(`<Override PartName="/xl/${destinoPpto}"[^>]*/>`), '');
borrar('xl/' + destinoPpto);

// 3. calcChain fuera; recalcular al abrir
rels = rels.replace(/<Relationship Id="rId\d+" Type="[^"]*calcChain" Target="calcChain.xml"\/>/, '');
tipos = tipos.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, '');
if (entrada('xl/calcChain.xml')) borrar('xl/calcChain.xml');
wb = wb.replace(
  /<calcPr([^>]*?)\/>/,
  (m, a) => `<calcPr${a.replace(/ fullCalcOnLoad="\d"/, '')} fullCalcOnLoad="1"/>`
);
escribir('xl/workbook.xml', wb);
escribir('xl/_rels/workbook.xml.rels', rels);
escribir('[Content_Types].xml', tipos);

// 2. Metadatos sin nombres de personas
escribir(
  'docProps/core.xml',
  leer('docProps/core.xml')
    .replace(
      /<dc:creator>[^<]*<\/dc:creator>/,
      '<dc:creator>Contraloría General de Santiago de Cali</dc:creator>'
    )
    .replace(
      /<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/,
      '<cp:lastModifiedBy>Control de Entes</cp:lastModifiedBy>'
    )
    .replace(/<cp:lastPrinted>[^<]*<\/cp:lastPrinted>/, '')
);
escribir(
  'docProps/app.xml',
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Excel</Application></Properties>'
);

// 4. Abrir en A1
escribir(
  'xl/worksheets/sheet1.xml',
  leer('xl/worksheets/sheet1.xml')
    .replace(/(<sheetView [^>]*?)topLeftCell="[A-Z]+\d+"/, '$1topLeftCell="A1"')
    .replace(/<selection [^>]*\/>/, '<selection activeCell="B12" sqref="B12"/>')
);

if (entrada('Sh33tJ5')) borrar('Sh33tJ5');
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
const prueba = XLSX.read(fs.readFileSync(DESTINO), { type: 'buffer' });
console.log(
  `Plantilla base lista: ${path.relative(process.cwd(), DESTINO)} · hojas: ${prueba.SheetNames.join(' | ')}`
);
