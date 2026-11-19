// Prepara la base del formato de Calidad MEDE01.05.02.P019.F002 «Herramientas análisis de causas para planes de
// mejoramiento por proceso» (4 pestañas: lluvia de ideas, causa-efecto, 5 porqués y árbol de problemas). La app lo
// llena con lo que diligencia la dependencia y conserva el diseño oficial (encabezado con logo, bordes, espina).
// Solo quita datos personales: autor y última modificación, la ruta de la carpeta donde se guardó, y abre en la
// primera pestaña. No cambia celdas, estilos ni dibujos.
//   node scripts/preparar-formato-causas.mjs "<ruta del formato oficial>.xlsx"
// Escribe plantillas/MEDE01.05.02.P019.F002_base.xlsx (dentro de frontend/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DESTINO = path.join(AQUI, '..', 'plantillas', 'MEDE01.05.02.P019.F002_base.xlsx');
const origen = process.argv[2];
if (!origen || !fs.existsSync(origen)) {
  console.error(
    'Indique la ruta del formato oficial: node scripts/preparar-formato-causas.mjs "<archivo>.xlsx"'
  );
  process.exit(1);
}
const { CFB } = XLSX;
const z = CFB.read(fs.readFileSync(origen), { type: 'buffer' });
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

const wb = leer('xl/workbook.xml');
if (!/name="Lluvia de ideas"/.test(wb) || !/name="Árbol de problemas"/.test(wb))
  throw new Error('No parece el formato MEDE01.05.02.P019.F002: faltan sus pestañas.');
escribir(
  'xl/workbook.xml',
  wb
    .replace(
      /<mc:AlternateContent[^>]*><mc:Choice Requires="x15"><x15ac:absPath[^>]*\/><\/mc:Choice><\/mc:AlternateContent>/,
      ''
    )
    .replace(/ activeTab="\d+"/, '')
);
escribir(
  'docProps/core.xml',
  leer('docProps/core.xml')
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator>Alcaldía de Santiago de Cali</dc:creator>')
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
// Cada pestaña sin celda seleccionada de otra pestaña (solo la primera queda activa)
for (let i = 1; i <= 4; i++) {
  const p = `xl/worksheets/sheet${i}.xml`;
  if (entrada(p)) escribir(p, leer(p).replace(/ tabSelected="1"/, i === 1 ? ' tabSelected="1"' : ''));
}
const marca = z.FullPaths.findIndex(x => x.endsWith('/Sh33tJ5'));
if (marca >= 0) CFB.utils.cfb_del(z, z.FullPaths[marca]);
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, CFB.write(z, { type: 'buffer', fileType: 'zip', compression: true }));
const prueba = XLSX.read(fs.readFileSync(DESTINO), { type: 'buffer' });
console.log(
  `Formato base listo: ${path.relative(process.cwd(), DESTINO)} · pestañas: ${prueba.SheetNames.join(' | ')}`
);
