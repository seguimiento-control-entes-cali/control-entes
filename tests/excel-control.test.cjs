/* Pruebas del lector de los Excel de control (src/js/20-carga-excel.js): `node tests/excel-control.test.cjs`.
   Reproducen las reglas de etl/clean.py con casos sintéticos (sin datos reales).
   La comparación completa contra el ETL con los Excel reales se hace con tests/paridad-etl.cjs (ver docs). */
const assert = require('assert');
const X = require('xlsx');
const R = require('./cargar-app.cjs')(['ceFecha', 'ceOrganismos', 'cePyStr', 'ceIdStr', 'ceEntero', 'ceLeerLibro', 'ceClasificar', 'ceCorte', 'ceHabiles']);
let n = 0;
const ok = () => n++;
const num = (v, f) => ({ n: v, f, raw: f ? String(v) + (Number.isInteger(v) ? '.0' : '') : String(v) });

// fechas como las lee pdate()
assert.strictEqual(R.ceFecha('15-ene-2025').d, '2025-01-15'); ok();
assert.strictEqual(R.ceFecha('3/2/25').d, '2025-02-03'); ok();
assert.strictEqual(R.ceFecha('31/02/2025').d, null); ok();
assert.strictEqual(R.ceFecha('pendiente').malo, 'pendiente'); ok();
assert.strictEqual(R.ceFecha({ d: '2026-03-01', h: '00:00:00' }).d, '2026-03-01'); ok();

// texto de Python: enteros, decimales y números grandes
assert.strictEqual(R.cePyStr(num(1, true)), '1.0'); ok();
assert.strictEqual(R.cePyStr(num(10, false)), '10'); ok();
assert.strictEqual(R.cePyStr({ n: 2.02600603404158e17, f: true, raw: '2.02600603404158E17' }), '2.02600603404158e+17'); ok();
assert.strictEqual(R.ceIdStr(num(20252000000521, true)), '20252000000521'); ok();
assert.strictEqual(R.ceEntero(' 10 '), 10); ok();
assert.strictEqual(R.ceEntero('N/A'), null); ok();

// unificación de organismos
const o = t => R.ceOrganismos(t).map(x => x[0]);
assert.deepStrictEqual(o('Despacho Alcalde, Secretaría de Salud y Secretaría de Educación'), ['Oficina de la Secretaría Privada y Despacho del Alcalde', 'Secretaría de Salud Pública', 'Secretaría de Educación']); ok();
assert.deepStrictEqual(o('Subsecretaría de Equidad de Género'), ['Secretaría de Bienestar Social']); ok();           // subunidad con padre
assert.deepStrictEqual(o('Inspección de Policía Comuna 3'), ['Secretaría de Seguridad y Justicia']); ok();
assert.deepStrictEqual(o('DAGMA'), ['Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)']); ok();
assert.strictEqual(R.ceOrganismos('Oficina Nueva XYZ')[0][1], 'Sin clasificar'); ok();

// días hábiles en (a, b] con festivos
assert.strictEqual(R.ceHabiles('2026-07-03', '2026-07-14'), 6); ok();   // 6,7,8,9,10 y 14 (el 13 es festivo)
assert.strictEqual(R.ceHabiles('2026-07-14', '2026-07-03'), -6); ok();

// libro sintético en formato 2026: lectura, oportunidad y calidad
const aoa = [[], ['Control de Requerimientos'], [], [], ['INFORMACIÓN OFICIO'],
  ['No. Orden', 'Número de Radicado Ente', 'Ente Externo de Control', 'Número radicación en ORFEO', 'Fecha radicación', 'Clase de Requerimiento', 'Organismo a quien va dirigido', 'Asunto del Requerimiento', 'Dias hábiles con que cuenta', 'Fecha máxima de respuesta', 'No. ORFEO de la respuesta', 'Fecha de respuesta', 'Estado de la solicitud', 'Observaciones'],
  [1, 'OF-1', 'Contraloría', '202641730100000001', new Date(2026, 6, 1), 'Solicitud', 'Secretaría de Salud', 'Asunto uno', 5, new Date(2026, 6, 8), '202641430100000001', new Date(2026, 6, 7), 'Cerrado', ''],
  [2, 'OF-2', 'Procuraduría', '202641730100000002', new Date(2026, 6, 1), 'Solicitud', 'Educación', 'Asunto dos', 5, new Date(2026, 6, 8), '202641430100000002', new Date(2026, 6, 10), 'Cerrado', ''],
  [3, 'OF-3', 'Personería', '202641730100000003', new Date(2026, 6, 1), 'Solicitud', 'Movilidad', 'Asunto tres', 5, new Date(2026, 6, 8), '', '', 'Abierto', ''],
  [4, 'OF-4', 'Personería', '202641730100000004', new Date(2026, 6, 1), 'Informativo', 'Movilidad', 'Asunto cuatro', '', '', '', '', 'Cerrado', ''],
  [5, 'OF-5', 'Contraloría', '202641730100000005', new Date(2026, 6, 1), 'Solicitud', 'Cultura', 'Asunto cinco', 5, '32/13/2026', '', '', 'Cerrado', '']];
const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
const wb0 = X.utils.book_new(); X.utils.book_append_sheet(wb0, ws, 'CONTROL');
const wb = X.read(X.write(wb0, { type: 'buffer', bookType: 'xlsx', cellDates: false }), { type: 'buffer', cellNF: true, bookFiles: true });
const L = R.ceLeerLibro(X, wb, 'Control de Requerimientos Vigencia 2026.xlsx');
assert.strictEqual(L.vigencia, 2026); ok();
assert.strictEqual(L.control.length, 5); ok();
const { filas, calidad } = R.ceClasificar(L.registros, '2026-07-31');
const op = filas.map(f => f.oportunidad);
assert.deepStrictEqual(op, ['A tiempo', 'Tardía', 'Sin respuesta (vencida)', 'No requiere respuesta', 'Pendiente en término']); ok();
assert.strictEqual(filas[1].retraso_dias_habiles, 2); ok();               // 9 y 10 de julio
assert.strictEqual(filas[2].retraso_dias_habiles, 15); ok();              // del 8 al 31 de julio, sin el 20 de julio
assert.strictEqual(filas[0].organismo, 'Secretaría de Salud Pública'); ok();
assert.ok(calidad.some(q => q.tipo === 'Fecha máxima ilegible' && q.fila_excel === 11)); ok();
assert.ok(calidad.some(q => q.tipo === 'Cerrado sin respuesta' && q.fila_excel === 11)); ok();
// encabezados cambiados: la carga se detiene con un mensaje claro
const aoa2 = aoa.map(r => r.slice()); aoa2[5][9] = 'Fecha límite';
const wbx = X.utils.book_new(); X.utils.book_append_sheet(wbx, X.utils.aoa_to_sheet(aoa2), 'CONTROL');
assert.throws(() => R.ceLeerLibro(X, X.read(X.write(wbx, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true, bookFiles: true }), 'Vigencia 2026.xlsx'), /cambió de columnas/); ok();

console.log(`OK: ${n} verificaciones del lector de los Excel de control`);
