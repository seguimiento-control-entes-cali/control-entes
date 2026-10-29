/* Comprueba si la zona horaria cambia lo que la app lee de los Excel de control reales.
   Uso:   node tests/comparar-zonas-excel.cjs "<carpeta con los Excel de control>"
   Lee cada .xlsx / .xls de la carpeta (sin entrar en subcarpetas) con el mismo lector y las mismas opciones de la app
   (src/js/20-carga-excel.js), una vez con TZ=UTC y otra con TZ=America/Bogota, y compara todas las columnas de cada
   registro. Además cuenta las celdas con formato de fecha cuyo número de serie cae a menos de un minuto ANTES de la
   medianoche: es la huella de una fecha escrita con el defecto de SheetJS (en Bogotá queda 16 s antes, en el día
   anterior). Esa huella queda en el archivo, así que no aparece al comparar zonas: hay que buscarla aparte.
   Solo lectura: no modifica los Excel, no escribe archivos, no se conecta a internet ni a Supabase. Los datos viajan
   solo en memoria entre dos procesos de este mismo computador. Solo imprime conteos (archivos, registros, filas que
   difieren y en qué columna): ningún valor de los Excel aparece en pantalla. */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ZONAS = ['UTC', 'America/Bogota'];
const ES_EXCEL = /\.xlsx?$/i;

/* ---------- proceso hijo: lee la carpeta en su zona horaria y devuelve los registros por la salida estándar ---------- */
if (process.argv[2] === '--hijo') {
  const X = require('xlsx');
  const R = require('./cargar-app.cjs')(['ceLeerLibro', 'ceCorte', 'ceClasificar']);
  const carpeta = process.argv[3],
    corteDado = process.argv[4] || '';
  const archivos = fs.readdirSync(carpeta).filter(f => ES_EXCEL.test(f) && !f.startsWith('~$')).sort();
  let regs = [];
  const errores = [],
    casiMedianoche = {};
  for (const f of archivos) {
    let wb;
    try {
      wb = X.read(fs.readFileSync(path.join(carpeta, f)), { type: 'buffer', cellNF: true, bookFiles: true });
      regs = regs.concat(R.ceLeerLibro(X, wb, f).registros);
    } catch (e) {
      errores.push(f);
    }
    if (!wb) continue;
    for (const hoja of wb.SheetNames) {
      const ws = wb.Sheets[hoja];
      for (const ref of Object.keys(ws)) {
        const c = ws[ref];
        if (ref[0] === '!' || !c || c.t !== 'n' || !c.z || !X.SSF.is_date(c.z)) continue;
        const falta = Math.ceil(c.v) - c.v; // fracción de día que falta para la medianoche
        if (falta > 0 && falta < 60 / 86400) {
          const k = f + ' · hoja ' + hoja + ' · columna ' + X.utils.encode_col(X.utils.decode_cell(ref).c);
          casiMedianoche[k] = (casiMedianoche[k] || 0) + 1;
        }
      }
    }
  }
  const corte = corteDado || R.ceCorte(regs);
  const { filas } = R.ceClasificar(regs, corte);
  process.stdout.write(JSON.stringify({ archivos, errores, corte, corteFila: R.ceCorte(regs), filas, casiMedianoche }));
  process.exit(0);
}

/* ---------- proceso principal ---------- */
const carpeta = process.argv[2];
if (!carpeta || !fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) {
  console.error('Uso: node tests/comparar-zonas-excel.cjs "<carpeta con los Excel de control>"');
  process.exit(2);
}
const leer = (TZ, corte) => {
  const r = spawnSync(process.execPath, [__filename, '--hijo', carpeta, corte || ''], {
    env: { ...process.env, TZ },
    maxBuffer: 1024 * 1024 * 1024,
    encoding: 'utf8'
  });
  if (r.status !== 0) {
    console.error(`No se pudo leer la carpeta con TZ=${TZ}.`);
    process.exit(2);
  }
  return JSON.parse(r.stdout);
};
// misma fecha de corte en las dos lecturas (la que resulta en UTC), para comparar solo la lectura de las fechas
const A = leer(ZONAS[0]);
const B = leer(ZONAS[1], A.corte);

console.log(`Carpeta: ${A.archivos.length} archivo(s) de Excel.`);
if (A.errores.length || B.errores.length)
  console.log(`Archivos que no son Excel de control o no se pudieron leer: ${A.errores.length} (UTC), ${B.errores.length} (Bogotá).`);
console.log(`Registros leídos: ${A.filas.length} con ${ZONAS[0]}, ${B.filas.length} con ${ZONAS[1]}.`);
console.log(`Fecha de corte calculada desde los datos: ${A.corteFila === B.corteFila ? 'igual' : 'DISTINTA'} en las dos zonas.`);

const clave = f => f.vigencia + '|' + f.hoja_excel + '|' + f.fila_excel;
const mapaB = new Map(B.filas.map(f => [clave(f), f]));
const porColumna = {};
let distintas = 0,
  soloUna = 0;
for (const a of A.filas) {
  const b = mapaB.get(clave(a));
  if (!b) {
    soloUna++;
    continue;
  }
  mapaB.delete(clave(a));
  const cols = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
    k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)
  );
  if (cols.length) distintas++;
  cols.forEach(k => (porColumna[k] = (porColumna[k] || 0) + 1));
}
soloUna += mapaB.size;

console.log(`Filas que difieren entre las dos zonas: ${distintas}.`);
if (soloUna) console.log(`Filas que aparecen en una sola de las dos lecturas: ${soloUna}.`);
Object.entries(porColumna)
  .sort((x, y) => y[1] - x[1])
  .forEach(([k, n]) => console.log(`  columna ${k}: ${n} fila(s)`));
const ok = !distintas && !soloUna && A.filas.length === B.filas.length && A.corteFila === B.corteFila;
console.log(ok ? 'Resultado: la zona horaria NO cambia la lectura de estos archivos.' : 'Resultado: HAY diferencias por zona horaria.');

const huellas = Object.entries(A.casiMedianoche);
const totalHuellas = huellas.reduce((s, [, n]) => s + n, 0);
console.log(`\nCeldas de fecha a menos de un minuto antes de la medianoche (posible fecha corrida al día anterior): ${totalHuellas}.`);
huellas.sort().forEach(([k, n]) => console.log(`  ${k}: ${n} celda(s)`));
process.exit(ok && !totalHuellas ? 0 : 1);
