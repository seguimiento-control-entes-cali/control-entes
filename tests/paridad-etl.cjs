/* Comparación completa del lector de la app contra el ETL en Python, con los Excel reales (datos privados).
   Uso:
     python etl/run_etl.py --2024 A.xlsx --2025 B.xlsx --2026 C.xlsx --salida datos_privados
     node tests/paridad-etl.cjs A.xlsx B.xlsx C.xlsx datos_privados/historico_requerimientos.csv
   Compara registro por registro (vigencia, hoja y fila del Excel) todas las columnas que se cargan en Supabase.
   Nota: con pandas 3 el ETL escribe "nan" en ORFEO de respuesta cuando la celda está vacía (y por eso cuenta
   como respondidos algunos casos "Cerrado" sin ORFEO). La app no tiene ese error: esas filas se informan aparte. */
const X = require('xlsx'), fs = require('fs'), path = require('path');
const R = require('./cargar-app.cjs')(['ceLeerLibro', 'ceCorte', 'ceClasificar']);
const args = process.argv.slice(2), csvPath = args.pop();
if (!args.length || !csvPath) { console.error('Uso: node tests/paridad-etl.cjs <excel...> <historico_requerimientos.csv>'); process.exit(2); }
let regs = [];
for (const f of args) { const L = R.ceLeerLibro(X, X.read(fs.readFileSync(f), { type: 'buffer', cellNF: true, bookFiles: true }), path.basename(f).replace(/_/g, ' ')); regs = regs.concat(L.registros); }
const { filas } = R.ceClasificar(regs, R.ceCorte(regs));
function parseCSV(s) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c; } if (f || row.length) { row.push(f); rows.push(row); } return rows; }
const csv = parseCSV(fs.readFileSync(csvPath, 'utf8')), H = csv[0], ref = csv.slice(1).map(r => Object.fromEntries(H.map((h, i) => [h, r[i]])));
const key = r => r.vigencia + '|' + r.hoja_excel + '|' + r.fila_excel, M = new Map(ref.map(r => [key(r), r]));
let iguales = 0, nanPandas = 0, otras = [];
for (const r of filas) {
  const o = M.get(key(r)); if (!o) { otras.push(['solo en la app', key(r)]); continue; } M.delete(key(r));
  const difs = H.filter(h => (r[h] == null ? '' : String(r[h])) !== o[h]);
  if (!difs.length) iguales++; else if (o.orfeo_respuesta === 'nan') nanPandas++; else otras.push([key(r), difs.join(', ')]);
}
for (const k of M.keys()) otras.push(['solo en el ETL', k]);
console.log(`Registros: app ${filas.length}, ETL ${ref.length}. Iguales: ${iguales}. Con "nan" de pandas: ${nanPandas}. Otras diferencias: ${otras.length}`);
otras.slice(0, 20).forEach(x => console.log('  ', x.join(' · ')));
process.exit(otras.length ? 1 : 0);
