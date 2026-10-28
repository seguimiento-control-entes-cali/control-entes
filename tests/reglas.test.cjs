/* Pruebas de las reglas de negocio. Sin dependencias: `node tests/reglas.test.cjs` (o `npm test`).
   Validan el código real de src/js/ (ver tests/cargar-app.cjs). */
const assert = require('assert');
const cargarApp = require('./cargar-app.cjs');
const R = cargarApp(['SEMP', 'semOf', 'statsOf', 'normPhone', 'fmtPhone', 'maskPII', 'shortTxt', 'pct1', 'orgKey', 'fullName',
  'temasAuto', 'idsOf', 'famOf', 'nrmTxt']);
let n = 0; const ok = (m) => { n++; };

// --- semáforo (verde < 20 %, amarillo 20 % a 39,9 %, rojo desde 40 %, "muestra" con pocos evaluados)
assert.strictEqual(R.semOf(5, 0.9), 'muestra'); ok();
assert.strictEqual(R.semOf(20, 0.19), 'verde'); ok();
assert.strictEqual(R.semOf(20, 0.20), 'amarillo'); ok();
assert.strictEqual(R.semOf(20, 0.399), 'amarillo'); ok();
assert.strictEqual(R.semOf(20, 0.40), 'rojo'); ok();

// --- estadísticas (opo: 0 a tiempo, 1 tardía, 2 sin respuesta, 3 pendiente en término)
{
  const s = R.statsOf([{ opo: 0 }, { opo: 0 }, { opo: 1, ret: 4 }, { opo: 2 }, { opo: 3 }]);
  assert.strictEqual(s.ev, 4); ok();
  assert.strictEqual(s.inc, 2); ok();
  assert.strictEqual(s.tasa, 0.5); ok();
}
assert.strictEqual(R.pct1(0.396), '39,6%'); ok();

// --- celulares para WhatsApp
assert.strictEqual(R.normPhone('300 123 4567'), '573001234567'); ok();
assert.strictEqual(R.normPhone('+57 300-123-4567'), '573001234567'); ok();
assert.strictEqual(R.normPhone('12345'), ''); ok();
assert.strictEqual(R.normPhone('6021234567'), ''); ok();

// --- datos personales enmascarados en asuntos
assert.ok(!/12\.345\.678/.test(R.maskPII('Radicado SINPROC 999999 de 2024 PERSONA C.C. 12.345.678'))); ok();
assert.ok(R.maskPII('C.C. 12.345.678').includes('[documento reservado]')); ok();

// --- directorio: emparejamiento dependencia ↔ responsable y nombre completo
assert.strictEqual(R.orgKey('  SECRETARIA   de educacion '), R.orgKey('Secretaría de Educación')); ok();
assert.strictEqual(R.orgKey('Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)'), R.orgKey('Departamento Administrativo de Gestion del Medio Ambiente')); ok();
assert.notStrictEqual(R.orgKey('Secretaría de Salud Pública'), R.orgKey('Secretaría de Educación')); ok();
assert.strictEqual(R.fullName('Ana María Pérez'), true); ok();
assert.strictEqual(R.fullName('Ana'), false); ok();

// --- cruce de información: temas
const T = s => (R.temasAuto(s)[0] || { k: 'sin' }).k;
assert.strictEqual(T('Solicitud de información proceso contractual Secretaría de Cultura Auditoría de Cumplimiento'), 'contractual'); ok();
assert.strictEqual(T('Remisión Informe Preliminar Actuación Especial de Fiscalización (AEF/DF) Denuncia Fiscal N° 999-2025'), 'fiscal'); ok();
assert.strictEqual(T('SOLICITUD DE INFORMACIÓN EXPEDIENTE E- 2024- 333333 IUCD- 2024-4444444'), 'disciplinario'); ok();
assert.strictEqual(T('SEGUIMIENTO DERECHO DE PETICION RAD. No. 20259990000001'), 'peticion'); ok();
assert.strictEqual(T('ACCIÓN DEFENSORIAL EN FAVOR DE LA SEÑORA'), 'ddhh'); ok();
assert.strictEqual(T('Solicitud de información'), 'sin'); ok();   // sin palabras suficientes: no se adivina

// --- cruce de información: identificadores (el mismo contrato escrito distinto produce la misma llave)
const I = s => R.idsOf(s).map(x => x.k + ':' + x.v).sort();
assert.deepStrictEqual(I('Contrato No. 4999.010.26.1.083-2022'), ['contrato:4999.010.26.1.83-2022']); ok();
assert.deepStrictEqual(I('contratos No. 4999.010.26.1.083 - 22 suscritos'), ['contrato:4999.010.26.1.83-2022']); ok();
assert.deepStrictEqual(I('contrato 4999.010.26.1.83 de 2022'), ['contrato:4999.010.26.1.83-2022']); ok();
assert.deepStrictEqual(I('contrato 4999.010.27.1.012 sin año'), []); ok();            // sin año no se usa para cruzar
assert.deepStrictEqual(I('EXPEDIENTE IUS E- 2023-111111 IUCD- 2023-2222222'), ['expediente_pgn:E-2023-111111', 'ius:IUC-D-2023-2222222', 'ius:IUS-E-2023-111111']); ok();
assert.deepStrictEqual(I('llamar al 3001234567'), []); ok();                          // un celular no es un radicado
assert.strictEqual(R.famOf('Procuraduría Provincial de Cali'), 'Procuraduría'); ok();
assert.strictEqual(R.famOf('Contraloría General de la República'), 'Contraloría'); ok();

// --- directorio: lo que se lee de Supabase debe conservar el correo (si no, al guardar se borraría)
{
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '10-historico-y-directorio-datos.js'), 'utf8');
  const lectura = src.slice(src.indexOf("sb.from('directorio').select"), src.indexOf('async function saveDirRow'));
  assert.ok(/correo:\s*x\.correo/.test(lectura), 'loadDir debe mapear el correo del directorio'); ok();
}

// --- cierres hechos en la app sobre casos del histórico (supabase/12)
{
  const A = require('./cargar-app.cjs')(['aplicarCierre', 'habilesEntre', 'rowKey']);
  assert.strictEqual(A.habilesEntre('2026-10-09', '2026-10-13'), 1); ok();   // viernes a martes: el lunes 12 es festivo (Día de la Raza), solo cuenta el martes
  const r1 = { v: 2026, orfE: '2026417301', rad: 'OFICIO 1', org: 'Secretaría de Movilidad', fmax: '2026-10-10', rec: '2026-10-01', opo: 2 };
  A.aplicarCierre(r1, '2026-10-09', '202641430100009991');
  assert.strictEqual(r1.opo, 0); assert.strictEqual(r1.resp, 1); ok();      // respondido antes del plazo: a tiempo
  const r2 = { fmax: '2026-10-09', rec: '2026-10-01', opo: 2 };
  A.aplicarCierre(r2, '2026-10-13', '202641430100009992');
  assert.strictEqual(r2.opo, 1); assert.strictEqual(r2.ret, 1); ok();       // después del plazo: tardía con 1 día hábil (el 12 de octubre es festivo)
  assert.strictEqual(A.rowKey(r1), '2026|2026417301|OFICIO 1|Secretaría de Movilidad'); ok(); // misma clave que hist_key en SQL
  assert.strictEqual(A.rowKey({ v: 2025, org: 'X' }), '2025|||X'); ok();    // vacíos como coalesce(...,'') en SQL
}

// --- días hábiles con festivos de Colombia (Ley 51 de 1983 y Ley 2578 de 2026)
{
  const F = require('./cargar-app.cjs')(['festivosCO', 'sumarHabiles', 'esHabil']);
  assert.strictEqual(F.festivosCO(2026).size, 19); ok();                    // 19 festivos desde 2026
  assert.ok(F.festivosCO(2026).has('2026-07-13')); ok();                   // Virgen de Chiquinquirá, trasladado al lunes
  assert.ok(!F.festivosCO(2025).has('2025-07-14')); ok();                  // antes de la Ley 2578 no existía
  assert.ok(F.festivosCO(2026).has('2026-04-02') && F.festivosCO(2026).has('2026-04-03')); ok(); // Jueves y Viernes Santo
  assert.strictEqual(F.sumarHabiles('2026-07-03', 10), '2026-07-21'); ok(); // salta el 13 y el 20 de julio
  assert.strictEqual(F.sumarHabiles('2026-12-23', 3), '2026-12-29'); ok();  // salta el 25 de diciembre y el fin de semana
  assert.ok(!F.esHabil(new Date(2026, 9, 12))); ok();
}

console.log(`OK: ${n} verificaciones de reglas de negocio, directorio y cruce de información`);
