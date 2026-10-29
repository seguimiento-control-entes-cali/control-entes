/* Pruebas del módulo de planes de mejoramiento: `node tests/planes.test.cjs` (o `npm test`).
   Validan el código real de src/js/19-planes-de-mejoramiento.js: fechas, números, dependencias,
   lectura de Excel PM_01 CGSC y Formularios 14/14.1 CGR, cálculos del Formulario 14.1 y la exportación
   (que se vuelve a leer para comprobar que no se pierde nada). Requiere `npm install` (paquete xlsx). */
const assert = require('assert');
const X = require('xlsx');
const cargarApp = require('./cargar-app.cjs');
const R = cargarApp(['S', 'PM', 'pmRes', 'pmPresentacion', 'pmCortes', 'pmInformes', 'pmProrRequisitos', 'pmNombreSIA', 'crc32', 'zipCrear', 'pmAccionesBajo100', 'pmReqSugerido', 'pmCalCgsc', 'pmCalAcc', 'pmAccIssues', 'pmConnPM01', 'pmCausaDe', 'pmParseInformePdf', 'pmSugerencias', 'pmEfectoDe', 'pmFecha', 'pmNum', 'pmConnOf', 'pmDepMatch', 'pmSemanas', 'pmPct', 'pmIndic',
  'pmParseWorkbook', 'pmImpCheck', 'pmSheetPM01', 'pmSheetsF14', 'pmMapHeader', 'pmEstado']);
let n = 0; const ok = () => { n++; };
const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
const isoD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

R.S.deps = [
  { id: 1, nombre: 'Secretaría de Gobierno' },
  { id: 2, nombre: 'Departamento Administrativo de Planeación' },
  { id: 3, nombre: 'Secretaría de Bienestar Social' },
  { id: 4, nombre: 'Secretaría de Paz y Cultura Ciudadana' },
  { id: 5, nombre: 'Secretaría de Desarrollo Económico' },
  { id: 6, nombre: 'Departamento Administrativo de Hacienda' }
];

// --- fechas en todas las formas en que llegan en los Excel
const F = R.pmFecha;
assert.strictEqual(F('30/06/2022'), '2022-06-30'); ok();
assert.strictEqual(F('30/jun/2022'), '2022-06-30'); ok();
assert.strictEqual(F('06/ene/2022'), '2022-01-06'); ok();
assert.strictEqual(F('15 diciembre del 2022'), '2022-12-15'); ok();
assert.strictEqual(F('30 de junio de 2022'), '2022-06-30'); ok();
assert.strictEqual(F('Junio 30 de 2022'), '2022-06-30'); ok();
assert.strictEqual(F('2022-06-30'), '2022-06-30'); ok();
assert.strictEqual(F('30-6-22'), '2022-06-30'); ok();
assert.strictEqual(F(44742), '2022-06-30'); ok();            // número de serie de Excel
assert.strictEqual(F('31/02/2022'), null); ok();              // fecha imposible
assert.strictEqual(F('sin fecha'), null); ok();
assert.strictEqual(F(''), null); ok();

// --- números con coma o punto decimal y porcentajes
assert.strictEqual(R.pmNum('1.234,5'), 1234.5); ok();
assert.strictEqual(R.pmNum('1,234.5'), 1234.5); ok();
assert.strictEqual(R.pmNum('0,5'), 0.5); ok();
assert.strictEqual(R.pmNum('100%'), 100); ok();
assert.ok(isNaN(R.pmNum('cien'))); ok();

// --- connotaciones y dependencias reconocidas en el texto del responsable
assert.deepStrictEqual(R.pmConnOf('Administrativa - Disciplinaria'), ['administrativa', 'disciplinaria']); ok();
assert.deepStrictEqual(R.pmConnOf('Administrativo / Fiscal / Penal'), ['administrativa', 'fiscal', 'penal']); ok();
assert.deepStrictEqual(R.pmConnOf('Sancionatorio'), ['sancionatoria']); ok();
assert.strictEqual(R.pmDepMatch('Nora Yaneth Mondragón Ortiz - Secretaría de Gobierno'), 1); ok();
assert.strictEqual(R.pmDepMatch('Claudia Posso Gómez Jefe de Unidad de Apoyo a la Gestión Departamento Administrativo de Planeación Municipal'), 2); ok();
assert.strictEqual(R.pmDepMatch('William Ferney Ortiz Franco - jefe de unidad de apoyo - Secretaría de Bienestar Social'), 3); ok();
assert.strictEqual(R.pmDepMatch('Omar Fajid Pedraza - Secretaría de Paz y Cultura Ciudadana'), 4); ok();
assert.strictEqual(R.pmDepMatch('Juan Pérez, contratista'), null); ok();

// --- cálculo del Formulario 14.1 (mismas fórmulas de la plantilla oficial de la CGR)
{
  const a1 = { id: 'a1', fecha_inicio: '2025-01-01', fecha_fin: '2025-03-26', cantidad: 10, avance: 5, fecha_corte: '2025-03-01' }; // 12 semanas, vencida
  const a2 = { id: 'a2', fecha_inicio: '2025-01-01', fecha_fin: '2025-12-31', cantidad: 100, avance: 100, fecha_corte: '2025-05-01' }; // en término
  const a3 = { id: 'a3', fecha_inicio: '2025-01-01', fecha_fin: '2025-02-26', cantidad: 2, avance: 3, fecha_corte: '2025-02-20' };  // 8 semanas, supera meta
  R.PM.av = [];
  assert.strictEqual(R.pmSemanas(a1), 12); ok();
  assert.strictEqual(R.pmPct(a3), 1); ok();                      // tope del 100 %
  const i = R.pmIndic([a1, a2, a3], '2025-06-30');
  // PLAI = 12×0,5 + 52×1 + 8×1 = 66; PBEA = 12 + 52 + 8 = 72; PLAVI = 6 + 8 = 14; PAAVI = 20
  assert.ok(Math.abs(i.plai - 66) < 1e-9); ok();
  assert.ok(Math.abs(i.pbea - 72) < 1e-9); ok();
  assert.ok(Math.abs(i.cpm - 14 / 20) < 1e-9); ok();
  assert.ok(Math.abs(i.ap - 66 / 72) < 1e-9); ok();
  // a la fecha de evaluación solo cuenta lo validado hasta esa fecha
  const j = R.pmIndic([a1], '2025-02-01');
  assert.strictEqual(j.plai, 0); ok();
  assert.strictEqual(j.cpm, null); ok();                           // sin metas vencidas: no se inventa un 0 %
}

// --- lector PM_01 CGSC: celdas combinadas, columnas numeradas, % como fracción, fechas en texto
function libroPM01() {
  const aoa = [
    ['CONTRALORÍA GENERAL DE SANTIAGO DE CALI'],
    ['FORMATO PM_01 CGSC - PLAN'],
    ['Entidad auditada (1): Distrito Especial de Santiago de Cali'],
    ['Nombre del ejercicio de fiscalización (2): Auditoría de Cumplimiento al Proceso de Contratación vigencia 2020 a junio 30 de 2021'],
    ['Tipo de ejercicio de fiscalización (3):', '', '', '', '', '', '', '', '', '', 'Auditoría de cumplimiento'],
    ['Fecha de suscripción (4): 06/ene/2022', '', '', '', '', '', '', '', '', '', 'Vigencia PVCFT (5)', 2021],
    ['FORMULACIÓN DEL PLAN DE MEJORAMIENTO', '', '', '', '', '', '', '', '', '', 'AVANCE DEL PLAN DE MEJORAMIENTO'],
    ['N° hallazgo (6)', 'Descripción de la condición y causa del hallazgo (7)', 'Connotación del hallazgo (8)', 'Macroproceso, criterio u otro (9)', 'Acción de Correctiva (10)', 'Meta (11)', 'Fuente de verificación (12)', 'Lugar de verificación (13)', 'Fecha terminación de la Actividad (14)', 'Responsable (Nombre y Cargo) (15)', 'Descripción del avance de la acción (16)', 'Fecha de Corte del Avance (17)', '% de Avance (18)'],
    ['(6)', '(7)', '(8)', '(9)', '(10)', '(11)', '(12)', '(13)', '(14)', '(15)', '(16)', '(17)', '(18)'],
    ['Hallazgo No 1 AGEI Especial a la contratación', 'Publicación extemporánea en SECOP II. Se elaboró sin control.', 'Administrativa - Disciplinaria', 'Criterio de evaluación', 'Capacitar a los supervisores', '100% de supervisores', 'Actas', 'Secretaría de Gobierno', '30/jun/2022', 'Nora Mondragón - Secretaría de Gobierno', 'Se capacitó a todos', '30/jun/2022', 1],
    ['', '', '', '', 'Realizar el cierre de expedientes', '100% de expedientes', 'Expedientes', 'Archivo', '30 de junio de 2022', 'Nora Mondragón - Secretaría de Gobierno', 'Cierre al 100%', '30/06/2022', 1],
    ['2', 'Debilidades en el análisis del sector', 'Administrativa', 'Criterio de evaluación', 'Capacitar en análisis del sector', 'Dos capacitaciones', 'Listados', 'DAPM', 44742, 'Claudia Posso - Departamento Administrativo de Planeación', 'Se hicieron 2', 44926, 0.5],
    ['3', 'Contratista sin experiencia acreditada', 'Fiscal', '', 'Verificar requisitos habilitantes', '100% de procesos', 'Expedientes', 'Archivo', '15 diciembre del 2022', 'Persona sin dependencia reconocible', '', '', ''],
    [],
    ['', 'JORGE IVÁN OSPINA GÓMEZ'],
    ['', 'Nombre y firma del Representante Legal del Sujeto de Vigilancia de Control Fiscal']
  ];
  const ws = X.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 9, c: 0 }, e: { r: 10, c: 0 } }, { s: { r: 9, c: 1 }, e: { r: 10, c: 1 } }, { s: { r: 9, c: 2 }, e: { r: 10, c: 2 } }, { s: { r: 9, c: 3 }, e: { r: 10, c: 3 } }];
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'PM_01');
  return X.read(X.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
}
{
  const imp = R.pmParseWorkbook(X, libroPM01(), 'pm01.xlsx');
  assert.strictEqual(imp.formato, 'PM_01_CGSC'); ok();
  assert.strictEqual(imp.plan.fecha_suscripcion, '2022-01-06'); ok();
  assert.ok(imp.plan.ejercicio.startsWith('Auditoría de Cumplimiento al Proceso')); ok();
  assert.strictEqual(imp.plan.tipo_ejercicio, 'Auditoría de cumplimiento'); ok();
  assert.strictEqual(imp.plan.vigencia_pvcft, '2021'); ok();
  assert.strictEqual(imp.hall.length, 3); ok();                       // la fila combinada no crea otro hallazgo
  assert.strictEqual(imp.hall[0].numero, '1'); ok();                  // "Hallazgo No 1 AGEI…" → 1
  assert.strictEqual(imp.hall[0].acciones.length, 2); ok();           // el texto "Se elaboró" no corta la lectura
  assert.deepStrictEqual(imp.hall[0].connotaciones, ['administrativa', 'disciplinaria']); ok();
  const a = imp.hall[0].acciones[0];
  assert.strictEqual(a.ffin, '2022-06-30'); ok();
  assert.strictEqual(a.dependencia_id, 1); ok();
  assert.strictEqual(a.avance, 100); ok();                             // 1 (100 %) → 100 de 100
  assert.strictEqual(a.fecha_corte, '2022-06-30'); ok();
  assert.strictEqual(imp.hall[0].acciones[1].ffin, '2022-06-30'); ok();
  const b = imp.hall[1].acciones[0];
  assert.strictEqual(b.ffin, '2022-06-30'); ok();                       // número de serie
  assert.strictEqual(b.avance, 50); ok();
  assert.strictEqual(b.dependencia_id, 2); ok();
  assert.strictEqual(imp.hall[2].acciones[0].ffin, '2022-12-15'); ok();
  assert.strictEqual(imp.hall[2].acciones[0].dependencia_id, null); ok();
  R.PM.planes = [];
  const k = R.pmImpCheck(imp);
  assert.strictEqual(k.err.length, 0, JSON.stringify(k.err)); ok();
  assert.strictEqual(k.nAcc, 4); ok();
  assert.strictEqual(k.nAv, 3); ok();
  assert.ok(k.warn.some(w => w.n === 'r' && /dependencia/.test(w.t))); ok();   // avisa la dependencia no reconocida
  // si la fecha de suscripción queda vacía, la importación se bloquea
  const imp2 = R.pmParseWorkbook(X, libroPM01(), 'pm01.xlsx');
  imp2.plan.fecha_suscripcion = '';
  assert.ok(R.pmImpCheck(imp2).err.some(e => /suscripción/.test(e))); ok();
  // un plan ya existente no se importa dos veces
  R.PM.planes = [{ formato: 'PM_01_CGSC', ejercicio: imp.plan.ejercicio, fecha_suscripcion: '2022-01-06' }];
  assert.ok(R.pmImpCheck(imp).err.some(e => /Ya existe un plan/.test(e))); ok();
  R.PM.planes = [];
}

// --- plantilla oficial vacía de la CGR (si está disponible): se reconoce pero no trae acciones
{
  const fs = require('fs'), path = require('path');
  const f = path.join(__dirname, 'fixtures', 'plantilla_cgr_f14.xls');
  if (fs.existsSync(f)) {
    const wb = X.readFile(f);
    assert.throws(() => R.pmParseWorkbook(X, wb, 'plantilla.xls'), /no trae acciones/); ok();
    const ws = wb.Sheets[wb.SheetNames[1]];
    const rows = X.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const m = R.pmMapHeader(rows[11]);
    ['numero', 'descripcion', 'causa', 'efecto', 'accion', 'proposito', 'actividad', 'unidad', 'cantidad', 'fini', 'ffin', 'avfis', 'obs']
      .forEach(key => assert.ok(key in m, 'falta la columna ' + key));
    ok();
  }
}

// --- exportación F14/F14.1 y lectura de vuelta (ida y vuelta sin pérdidas)
{
  const fin1 = new Date(hoy); fin1.setDate(fin1.getDate() - 30);
  const fin2 = new Date(hoy); fin2.setDate(fin2.getDate() + 60);
  const ini = new Date(hoy); ini.setDate(ini.getDate() - 100);
  const plan = { id: 'P', formato: 'F14_CGR', entidad: 'Distrito Especial de Santiago de Cali', nit: '890.399.011-3', representante_legal: 'Alcalde', periodo_auditado: '2024', modalidad: 'Auditoría financiera y de gestión', ejercicio: 'Auditoría financiera', fecha_suscripcion: isoD(ini) };
  R.PM.planes = [];
  R.PM.hall = [{ id: 'H1', plan_id: 'P', numero: 'H1-2024', descripcion: 'Diferencias contables', causa: 'Falta de conciliación', efecto: 'Riesgo de error', connotaciones: ['administrativa'], orden: 1 }];
  R.PM.acc = [
    { id: 'A1', plan_id: 'P', hallazgo_id: 'H1', dependencia_id: 6, accion: 'Conciliar mensualmente', proposito: 'Consistencia', actividad: 'Conciliaciones firmadas', unidad_medida: 'Conciliaciones', cantidad: 6, fecha_inicio: isoD(ini), fecha_fin: isoD(fin1), avance: 3, fecha_corte: isoD(fin1), orden: 1 },
    { id: 'A2', plan_id: 'P', hallazgo_id: 'H1', dependencia_id: 6, accion: 'Ajustar instructivo', proposito: '', actividad: 'Instructivo adoptado', unidad_medida: 'Instructivo', cantidad: 1, fecha_inicio: isoD(ini), fecha_fin: isoD(fin2), avance: 0, fecha_corte: null, orden: 2 }
  ];
  R.PM.av = [{ accion_id: 'A1', estado: 'validado', fecha_corte: isoD(fin1), cantidad: 3, descripcion: 'Tres conciliaciones', revisado_at: '2025' }];
  const corte = isoD(hoy);
  const [w1, w2] = R.pmSheetsF14(X, plan, corte);
  // celdas clave en las mismas posiciones de la plantilla oficial
  assert.strictEqual(w2.S11.v > 40000, true); ok();                          // fecha de evaluación en S11
  assert.strictEqual(w2.M14.f, '(+L14-K14)/7'); ok();
  assert.strictEqual(w2.O14.f, 'IF(N14/J14>1,1,+N14/J14)'); ok();
  assert.strictEqual(w2.Q14.f, 'IF(L14<=$S$11,P14,0)'); ok();
  assert.strictEqual(w2.R14.f, 'IF($S$11>=L14,M14,0)'); ok();
  assert.strictEqual(w1.M14.f, '(+L14-K14)/7'); ok();
  const ind = R.pmIndic(R.PM.acc, corte);
  // los valores calculados que trae el archivo coinciden con los de la app
  const cells = Object.keys(w2).filter(k => w2[k] && w2[k].f && /^IF\(Q/.test(w2[k].f));
  assert.strictEqual(cells.length, 1); ok();
  assert.ok(Math.abs(w2[cells[0]].v - ind.cpm) < 1e-9); ok();
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, w1, 'Informe Plan de mejoramiento ');
  X.utils.book_append_sheet(wb, w2, 'Avance Plan de Mejoramiento');
  const back = R.pmParseWorkbook(X, X.read(X.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }), 'f14.xlsx');
  assert.strictEqual(back.formato, 'F14_CGR'); ok();
  assert.strictEqual(back.hoja, 'Avance Plan de Mejoramiento'); ok();
  assert.strictEqual(back.plan.fecha_suscripcion, isoD(ini)); ok();
  assert.strictEqual(back.plan.nit, '890.399.011-3'); ok();
  assert.strictEqual(back.feval, corte); ok();
  assert.strictEqual(back.hall.length, 1); ok();
  assert.strictEqual(back.hall[0].acciones.length, 2); ok();
  assert.strictEqual(back.hall[0].acciones[0].cantidad, 6); ok();
  assert.strictEqual(back.hall[0].acciones[0].avance, 3); ok();
  assert.strictEqual(back.hall[0].acciones[0].fini, isoD(ini)); ok();
  assert.strictEqual(back.hall[0].acciones[1].ffin, isoD(fin2)); ok();
  assert.strictEqual(back.hall[0].acciones[0].dependencia_id, 6); ok();
  // PM_01 exportado y leído de vuelta
  plan.formato = 'PM_01_CGSC'; plan.vigencia_pvcft = '2025'; plan.tipo_ejercicio = 'Auditoría de cumplimiento';
  const wbp = X.utils.book_new(); X.utils.book_append_sheet(wbp, R.pmSheetPM01(X, plan, corte), 'PM_01 CGSC');
  const bp = R.pmParseWorkbook(X, X.read(X.write(wbp, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }), 'pm.xlsx');
  assert.strictEqual(bp.formato, 'PM_01_CGSC'); ok();
  assert.strictEqual(bp.plan.fecha_suscripcion, isoD(ini)); ok();
  assert.strictEqual(bp.plan.vigencia_pvcft, '2025'); ok();
  assert.strictEqual(bp.hall.length, 1); ok();
  assert.strictEqual(bp.hall[0].acciones.length, 2); ok();
  assert.strictEqual(bp.hall[0].acciones[0].avance, 50); ok();           // 3 de 6 = 50 %
  assert.strictEqual(bp.hall[0].acciones[0].fecha_corte, isoD(fin1)); ok();
  assert.strictEqual(bp.hall[0].acciones[1].avance, null); ok();         // sin avance validado: queda sin avance
  // formato PM_01 versión 2020: títulos y fórmulas de la plantilla de la Contraloría
  const wsp = wbp.Sheets[wbp.SheetNames[0]];
  assert.strictEqual(wsp.L11.v, 'CUMPLIMIENTO\n20%'); ok();
  assert.strictEqual(wsp.P11.v, 'Observaciones DACI'); ok();
  assert.strictEqual(wsp.L8.f, '+L9*0.2+M9*0.8'); ok();
  assert.strictEqual(wsp.L9.f, 'IF(COUNT(L12:L668)>0,AVERAGE(L12:L668)*100/2,0)'); ok();
  assert.ok(/^Administrativa/.test(wsp.C12.v)); ok();
}

/* ---------- causa dentro de la descripción (informes de la CGSC) ---------- */
assert.strictEqual(
  R.pmCausaDe('Se pagó sin contrato. Lo anterior, causado por la falta de vigilancia del supervisor, lo cual genera un hecho cumplido.'),
  'La falta de vigilancia del supervisor'
); ok();
assert.strictEqual(R.pmCausaDe('Lo anterior causado por la falta de un análisis cuantitativo. Fin'), 'La falta de un análisis cuantitativo'); ok();
assert.strictEqual(R.pmCausaDe('Descripción sin causa explícita.'), ''); ok();

/* ---------- informe final en PDF (texto como lo entrega pdf.js) ---------- */
{
  const pag = lineas => {
    let y = 760;
    return lineas.map(t => ({ s: t, x: 72, y: (y -= 20), w: t.length * 5, h: 10 }));
  };
  const paginas = [
    pag(['ACTUACIÓN ESPECIAL DE FISCALIZACIÓN (AEF/DF)', 'DENUNCIA FISCAL Nº 1, VIGENCIA 2026', '1700.19.01.26.001', 'INFORME FINAL', 'SANTIAGO DE CALI - D.E.', '3 DE MARZO DE 2026']),
    pag(['TABLA DE CONTENIDO', '3.1 HALLAZGO ADMINISTRATIVO N° 1 – PAGO DOBLE - CON INCIDENCIA FISCAL 5']),
    pag([
      'Informe Final Actuación Especial de Fiscalización',
      'Página 5 de 9',
      'SECRETARÍA DE MOVILIDAD',
      '3.1 HALLAZGO ADMINISTRATIVO N° 1 – CON PRESUNTA INCIDENCIA FISCAL Y',
      'DISCIPLINARIA - PAGO DOBLE DE UNA FACTURA',
      'Se pagó dos veces la factura 12, generando un presunto detrimento patrimonial por $1.500.000 en la vigencia.',
      'Lo anterior, causado por la falta de control en la tesorería, lo cual genera un daño patrimonial.',
      '4. RESUMEN CONTRATOS EVALUADOS'
    ])
  ];
  const r = R.pmParseInformePdf(paginas, 'informe.pdf');
  assert.strictEqual(r.hall.length, 1); ok();                                   // la tabla de contenido no cuenta
  const h = r.hall[0];
  assert.strictEqual(h.numero, '1'); ok();
  assert.deepStrictEqual(h.connotaciones, ['administrativa', 'disciplinaria', 'fiscal']); ok();
  assert.strictEqual(h.cuantia, 1500000); ok();
  assert.strictEqual(h.causa, 'La falta de control en la tesorería'); ok();
  assert.strictEqual(h.efecto, 'Un daño patrimonial'); ok();
  assert.strictEqual(h.dependencia, 'SECRETARÍA DE MOVILIDAD'); ok();
  assert.ok(/^PAGO DOBLE DE UNA FACTURA\. Se pagó dos veces/.test(h.descripcion)); ok();
  assert.strictEqual(r.plan.numero_informe, '1700.19.01.26.001'); ok();
  assert.strictEqual(r.plan.fecha_informe, '2026-03-03'); ok();
  assert.strictEqual(r.plan.estado, 'formulacion'); ok();
  assert.strictEqual(r.plan.formato, 'PM_01_CGSC'); ok();
  assert.ok(/DENUNCIA FISCAL Nº 1, VIGENCIA 2026/.test(r.plan.ejercicio)); ok();
}
/* ---------- plantillas de acciones según la causa ---------- */
{
  const temas = h => R.pmSugerencias(h).map(g => g.tema);
  assert.strictEqual(temas({ causa: 'Falta de vigilancia presupuestal del supervisor al tramitar el pago sin registro presupuestal' })[0], 'Pagos y respaldo presupuestal'); ok();
  assert.ok(temas({ causa: 'Falta de un análisis comparativo cuantitativo del mercado' }).includes('Planeación contractual y estudio del mercado')); ok();
  assert.deepStrictEqual(temas({ causa: 'Situación sin categoría conocida' }), ['Acción general']); ok();
}

/* ---------- calificación de la CGSC (fórmulas del formato PM_01: L9, M9 y L8) ---------- */
{
  R.PM.av = [];
  const ev = '2026-12-31';
  const A = (o) => Object.assign({ id: 'x' + Math.random(), cantidad: 100, avance: 0, fecha_corte: null, fecha_fin: '2026-12-15' }, o);
  // dos acciones calificadas a mano: cumplimiento 2 y 1 → promedio 1,5 → 75; efectividad 2 y 0 → 1 → 50
  const k = R.pmCalCgsc([A({ cal_cumplimiento: 2, cal_efectividad: 2 }), A({ cal_cumplimiento: 1, cal_efectividad: 0 })], ev);
  assert.strictEqual(k.C, 75); ok();
  assert.strictEqual(k.E, 50); ok();
  assert.strictEqual(k.T, 75 * 0.2 + 50 * 0.8); ok();                     // 55
  assert.strictEqual(k.concepto, 'No cumple'); ok();
  const k2 = R.pmCalCgsc([A({ cal_cumplimiento: 2, cal_efectividad: 2 }), A({ cal_cumplimiento: 2, cal_efectividad: 2 })], ev);
  assert.strictEqual(k2.T, 100); ok();
  assert.strictEqual(k2.concepto, 'Cumple'); ok();
  // sugerencia automática del cumplimiento con el avance validado
  assert.strictEqual(R.pmCalAcc(A({ avance: 100, fecha_corte: '2026-12-01' }), ev).c, 2); ok();   // meta cumplida
  assert.strictEqual(R.pmCalAcc(A({ avance: 40, fecha_corte: '2026-12-01' }), ev).c, 0); ok();    // vencida sin cumplir: 0 (Res. 24.043, art. 12)
  assert.strictEqual(R.pmCalAcc(A({}), ev).c, 0); ok();                                           // vencida sin avance
  assert.strictEqual(R.pmCalAcc(A({ fecha_fin: '2027-03-01' }), ev).c, null); ok();               // en término: no se califica
  assert.strictEqual(R.pmCalAcc(A({ cal_cumplimiento: 2, cal_efectividad: 2 }), ev).estado, 'C'); ok();
  assert.strictEqual(R.pmCalAcc(A({ cal_cumplimiento: 2, cal_efectividad: 1 }), ev).estado, 'A'); ok();
  // un plan sin acciones calificables no tiene concepto
  assert.strictEqual(R.pmCalCgsc([A({ fecha_fin: '2027-03-01' })], ev).concepto, null); ok();
}
/* ---------- validaciones de formulación ---------- */
{
  const plan = { formato: 'PM_01_CGSC', fecha_suscripcion: '2026-06-16' };
  const bien = { accion: 'Implementar una lista de chequeo', meta: '100 % de los pagos', cantidad: 100, fuente_verificacion: 'Listas firmadas', fecha_fin: '2026-12-15' };
  assert.deepStrictEqual(R.pmAccIssues(bien, plan), []); ok();
  assert.strictEqual(R.pmAccIssues({ ...bien, accion: 'Lista de chequeo para pagos' }, plan).length, 1); ok();   // sin verbo
  assert.strictEqual(R.pmAccIssues({ ...bien, fuente_verificacion: '' }, plan).length, 1); ok();
  assert.ok(/supera seis \(6\) meses/.test(R.pmAccIssues({ ...bien, fecha_fin: '2027-01-20' }, plan).join(' '))); ok();
  assert.strictEqual(R.pmAccIssues({ ...bien, meta: 'Mejorar los controles', cantidad: null }, plan).length, 1); ok();
}
/* ---------- connotación con los valores de la lista del formato ---------- */
assert.strictEqual(R.pmConnPM01({ connotaciones: ['administrativa', 'fiscal', 'disciplinaria'] }), 'Administrativa fiscal y disciplinaria'); ok();
assert.strictEqual(R.pmConnPM01({ connotaciones: ['administrativa'] }), 'Administrativa'); ok();

/* ---------- oficio de remisión sugerido ---------- */
{
  R.S.reqs = [
    { id: 'r1', estado: 'abierto', asunto: 'Remisión Informe Final Actuación Especial de Fiscalización (AEF/DF) Denuncia Fiscal No. 896-2025' },
    { id: 'r2', estado: 'abierto', asunto: 'Solicitud de información contratos 2025' },
    { id: 'r3', estado: 'abierto', asunto: 'Remisión Informe Final Auditoría de Cumplimiento 12 de 2026' }
  ];
  assert.strictEqual(R.pmReqSugerido({ ejercicio: 'ACTUACIÓN ESPECIAL DE FISCALIZACIÓN (AEF/DF) DENUNCIA FISCAL Nº 896, VIGENCIA 2025' }).id, 'r1'); ok();
  assert.strictEqual(R.pmReqSugerido({ ejercicio: 'Denuncia Fiscal 896-2025' }).id, 'r1'); ok();
  assert.strictEqual(R.pmReqSugerido({ ejercicio: 'Auditoría de cumplimiento 12', vigencia_pvcft: '2026' }).id, 'r3'); ok();
  assert.strictEqual(R.pmReqSugerido({ ejercicio: 'Auditoría financiera 77 de 2024' }), null); ok();
  R.S.reqs = [];
}

/* ---------- Resoluciones Reglamentarias CGSC 24.043 y 24.003 ---------- */
{
  const P = o => Object.assign({ id: 'p1', formato: 'PM_01_CGSC', resolucion: '', estado: 'en_ejecucion', fecha_suscripcion: '2026-06-16' }, o);
  // resolución aplicable (art. 19 y 20 de la 24.043)
  assert.strictEqual(R.pmRes(P({})), '24.043'); ok();
  assert.strictEqual(R.pmRes(P({ fecha_suscripcion: '2025-01-01' })), '24.043'); ok();
  assert.strictEqual(R.pmRes(P({ fecha_suscripcion: '2024-12-31' })), '24.003'); ok();
  assert.strictEqual(R.pmRes(P({ fecha_suscripcion: '2024-01-24' })), '24.003'); ok();
  assert.strictEqual(R.pmRes(P({ fecha_suscripcion: '2024-01-23' })), 'anterior'); ok();
  assert.strictEqual(R.pmRes(P({ fecha_suscripcion: '2026-06-16', resolucion: '24.003' })), '24.003'); ok();   // fijada a mano
  assert.strictEqual(R.pmRes(P({ formato: 'F14_CGR' })), ''); ok();                                            // la CGR no aplica
  // art. 7: 15 días hábiles desde la radicación del informe (festivos: 8 y 15 de junio de 2026)
  R.PM.pror = []; R.PM.inf = []; R.S.reqs = [];
  const pres = R.pmPresentacion(P({ estado: 'formulacion', fecha_radicacion_informe: '2026-05-25' }));
  assert.strictEqual(pres.limite, '2026-06-17'); ok();
  assert.strictEqual(R.pmPresentacion(P({ fecha_radicacion_informe: '2026-05-25', fecha_suscripcion: '2026-06-16' })).tarde, false); ok();
  assert.strictEqual(R.pmPresentacion(P({ fecha_radicacion_informe: '2026-05-25', fecha_suscripcion: '2026-06-18' })).tarde, true); ok();
  // art. 11: cortes 30-jun y 31-dic; 15 días hábiles después (festivos 13-jul-2026 por la Ley 2578 de 2026,
  // 20-jul-2026, 1 y 11 de enero de 2027)
  assert.deepStrictEqual(R.pmCortes(P({}), '2027-02-01'), ['2026-06-30', '2026-12-31', '2027-06-30']); ok();
  const inf = R.pmInformes(P({}), '2027-02-01');
  assert.strictEqual(inf[0].vence, '2026-07-23'); ok();
  assert.strictEqual(inf[1].vence, '2027-01-25'); ok();
  assert.strictEqual(inf[0].estado, 'vencido'); ok();
  assert.strictEqual(inf[2].estado, 'futuro'); ok();
  R.PM.inf = [{ plan_id: 'p1', corte: '2026-06-30', fecha_envio: '2026-07-20' }];
  assert.strictEqual(R.pmInformes(P({}), '2027-02-01')[0].estado, 'presentado'); ok();
  R.PM.inf = [{ plan_id: 'p1', corte: '2026-06-30', fecha_envio: '2026-07-24' }];
  assert.strictEqual(R.pmInformes(P({}), '2027-02-01')[0].estado, 'tarde'); ok();
  R.PM.inf = [];
  assert.deepStrictEqual(R.pmCortes(P({ estado: 'formulacion' }), '2027-02-01'), []); ok();
  // art. 16: prórroga de una acción
  const acc = { id: 'a1', plan_id: 'p1', cantidad: 10, avance: 6, fecha_inicio: '2026-06-16', fecha_fin: '2026-12-15' };
  const q = (f, a) => R.pmProrRequisitos('accion', { a: a || acc }, f).map(x => x.ok);
  assert.deepStrictEqual(q({ fecha_solicitud: '2026-11-20', fecha_nueva: '2027-02-08' }), [true, true, true, true]); ok();   // 30 % de 182 días = 55
  assert.strictEqual(q({ fecha_solicitud: '2026-11-20', fecha_nueva: '2027-02-09' })[2], false); ok();                    // excede el 30 %
  assert.strictEqual(q({ fecha_solicitud: '2026-11-25', fecha_nueva: '2027-01-31' })[3], false); ok();                    // 13 días hábiles: tarde
  assert.strictEqual(q({ fecha_solicitud: '2026-11-20', fecha_nueva: '2027-01-31' }, { ...acc, avance: 5 })[1], false); ok(); // 50 % no es «más de la mitad»
  R.PM.pror = [{ accion_id: 'a1', estado: 'concedida' }];
  assert.strictEqual(q({ fecha_solicitud: '2026-11-20', fecha_nueva: '2027-01-31' })[0], false); ok();                    // una sola vez
  R.PM.pror = [{ accion_id: 'a1', estado: 'negada' }];
  assert.strictEqual(q({ fecha_solicitud: '2026-11-20', fecha_nueva: '2027-01-31' })[0], true); ok();                     // la negada no cuenta
  R.PM.pror = [];
  // art. 15: prórroga de presentación (máximo 5 días hábiles, pedida con 5 días hábiles de antelación)
  const qp = f => R.pmProrRequisitos('presentacion', { p: P({}), venc: '2026-06-17' }, f).map(x => x.ok);
  assert.deepStrictEqual(qp({ fecha_solicitud: '2026-06-09', fecha_nueva: '2026-06-24' }), [true, true, true]); ok();
  assert.strictEqual(qp({ fecha_solicitud: '2026-06-11', fecha_nueva: '2026-06-24' })[1], false); ok();   // 4 días hábiles de antelación
  assert.strictEqual(qp({ fecha_solicitud: '2026-06-09', fecha_nueva: '2026-06-25' })[2], false); ok();   // más de 5 días hábiles
  // nombre del anexo para el SIA Contralorías: igual al del plan real 896-2025
  assert.strictEqual(
    R.pmNombreSIA(P({ ejercicio: 'ACTUACIÓN ESPECIAL DE FISCALIZACIÓN (AEF/DF) DENUNCIA FISCAL Nº 896, VIGENCIA 2025', tipo_ejercicio: 'ACTUACIÓN ESPECIAL' })),
    'FORMATO_202001_PM_CGSC_202606_AEFDF_896_2025.xlsx'
  ); ok();
  assert.strictEqual(R.pmNombreSIA(P({ ejercicio: 'Auditoría de cumplimiento 12 de 2026' }), { avance: true, corte: '2026-12-31' }), 'FORMATO_202001_PM_CGSC_202612_AC_12_2026_AVANCE.xlsx'); ok();
  // plazo máximo de la acción (art. 5): 6 meses en la 24.043; 1 año en la 24.003
  const ac = { accion: 'Elaborar la guía', meta: '1 guía', cantidad: 1, fuente_verificacion: 'Guía publicada', fecha_inicio: '2026-06-16' };
  assert.strictEqual(R.pmAccIssues({ ...ac, fecha_fin: '2026-12-16' }, P({})).length, 0); ok();
  assert.strictEqual(R.pmAccIssues({ ...ac, fecha_fin: '2026-12-17' }, P({})).length, 1); ok();
  assert.strictEqual(R.pmAccIssues({ ...ac, fecha_fin: '2025-05-01' }, P({ fecha_suscripcion: '2024-06-01' })).length, 0); ok();
  assert.strictEqual(R.pmAccIssues({ ...ac, fecha_fin: '2025-06-02' }, P({ fecha_suscripcion: '2024-06-01' })).length, 1); ok();
  assert.strictEqual(R.pmAccIssues({ ...ac, fecha_fin: '2027-02-08', fecha_fin_original: '2026-12-15' }, P({})).length, 0); ok(); // la prórroga no cuenta
  // «otra» incidencia (art. 2) en la lista del formato
  assert.strictEqual(R.pmConnPM01({ connotaciones: ['administrativa', 'otra'] }), 'Otra'); ok();
  // acciones con menos de 100 puntos (art. 12, par. 5)
  R.PM.planes = [P({})]; R.PM.av = [];
  R.PM.acc = [
    { id: 'x1', plan_id: 'p1', cantidad: 1, avance: 1, fecha_fin: '2026-12-15', cal_cumplimiento: 2, cal_efectividad: 2 },
    { id: 'x2', plan_id: 'p1', cantidad: 1, avance: 1, fecha_fin: '2026-12-15', cal_cumplimiento: 2, cal_efectividad: 0 },
    { id: 'x3', plan_id: 'p1', cantidad: 1, avance: 0, fecha_fin: '2027-12-15' }
  ];
  R.PM.eval = '2027-01-31';
  assert.deepStrictEqual(R.pmAccionesBajo100(R.PM.planes[0]).map(a => a.id), ['x2']); ok();
  R.PM.planes = []; R.PM.acc = []; R.PM.eval = null;
  // respaldo de archivos: CRC-32 estándar y ZIP válido
  assert.strictEqual(R.crc32(new TextEncoder().encode('123456789')), 0xcbf43926); ok();
}

/* ---------- correcciones del lector 2.6.1 (informe y plan inventados) ---------- */
{
  const pag = lineas => {
    let y = 760;
    return lineas.map(t => ({ s: t, x: 72, y: (y -= 20), w: t.length * 5, h: 10 }));
  };
  const paginas = [
    pag(['AUDITORÍA DE CUMPLIMIENTO DE PRUEBA', '1700.19.02.26.099', 'INFORME FINAL', 'Santiago de Cali, marzo 3, de 2026']),
    pag([
      'TABLA DE CONTENIDO',
      // índice con línea de puntos en la línea siguiente (título en minúsculas)
      '3.1. Hallazgo administrativo N° 1 – Pago sin soporte',
      '........................................ 7',
      // índice con línea de puntos en la misma línea
      '3.2. Hallazgo administrativo N° 2 – Archivo incompleto ............ 8'
    ]),
    pag([
      'SECRETARÍA DE TURISMO',
      // número con punto final: «3.1. HALLAZGO»
      '3.1. HALLAZGO ADMINISTRATIVO N° 1 – CON PRESUNTA INCIDENCIA FISCAL - PAGO SIN SOPORTE',
      // la cifra aparece antes de la palabra «detrimento»
      'Se giraron recursos por valor de $7.854.441, conllevando a un detrimento patrimonial en la vigencia.',
      'Lo anterior, causado por debilidades en la supervisión, lo cual genera un riesgo para los recursos.',
      '4. RESUMEN DE HALLAZGOS'
    ])
  ];
  const r = R.pmParseInformePdf(paginas, 'informe-prueba.pdf');
  assert.strictEqual(r.plan.fecha_informe, '2026-03-03'); ok();               // «marzo 3, de 2026»
  assert.strictEqual(r.hall.length, 1); ok();                                 // los dos renglones del índice no cuentan
  assert.strictEqual(r.hall[0].numero, '1'); ok();
  assert.ok(/^PAGO SIN SOPORTE\. Se giraron recursos/.test(r.hall[0].descripcion)); ok();
  assert.deepStrictEqual(r.hall[0].connotaciones, ['administrativa', 'fiscal']); ok();
  assert.strictEqual(r.hall[0].cuantia, 7854441); ok();
  assert.strictEqual(r.hall[0].dependencia, 'SECRETARÍA DE TURISMO'); ok();
  // fecha «mes día de año» sin coma
  const r2 = R.pmParseInformePdf(
    [
      pag(['AUDITORÍA DE PRUEBA', 'octubre 15 de 2026']),
      pag(['3.1 HALLAZGO ADMINISTRATIVO N° 1 – INVENTARIO DESACTUALIZADO', 'El inventario de prueba no estaba al día.'])
    ],
    'otro.pdf'
  );
  assert.strictEqual(r2.plan.fecha_informe, '2026-10-15'); ok();
}
{
  /* fin de tabla: una fila «TOTALES» con texto en la columna de la acción pero sin fecha de terminación cierra
     la tabla, y lo que venga después no se lee como acción */
  const ini = new Date(hoy); ini.setDate(ini.getDate() - 100);
  const fin = new Date(hoy); fin.setDate(fin.getDate() + 60);
  const plan = { id: 'Q', formato: 'PM_01_CGSC', entidad: 'Entidad de prueba', ejercicio: 'Auditoría de prueba', fecha_suscripcion: isoD(ini), vigencia_pvcft: '2025', tipo_ejercicio: 'Auditoría de cumplimiento' };
  R.PM.hall = [{ id: 'HQ', plan_id: 'Q', numero: '1', descripcion: 'Hallazgo de prueba', causa: 'Causa de prueba', efecto: 'Efecto de prueba', connotaciones: ['administrativa'], orden: 1 }];
  R.PM.acc = [
    { id: 'Q1', plan_id: 'Q', hallazgo_id: 'HQ', dependencia_id: 1, accion: 'Primera acción de prueba', proposito: '', actividad: 'Actividad uno', unidad_medida: 'Informe', cantidad: 1, fecha_inicio: isoD(ini), fecha_fin: isoD(fin), avance: 0, fecha_corte: null, orden: 1 },
    { id: 'Q2', plan_id: 'Q', hallazgo_id: 'HQ', dependencia_id: 1, accion: 'Segunda acción de prueba', proposito: '', actividad: 'Actividad dos', unidad_medida: 'Informe', cantidad: 1, fecha_inicio: isoD(ini), fecha_fin: isoD(fin), avance: 0, fecha_corte: null, orden: 2 }
  ];
  R.PM.av = [];
  const aoa = X.utils.sheet_to_json(R.pmSheetPM01(X, plan, isoD(hoy)), { header: 1, defval: '', raw: true });
  const hr = aoa.findIndex(row => Object.keys(R.pmMapHeader(row)).length >= 4);
  const m = R.pmMapHeader(aoa[hr]);
  const ult = aoa.reduce((u, row, i) => (i > hr && String(row[m.accion] || '').includes('acción de prueba') ? i : u), -1);
  const totales = new Array(aoa[hr].length).fill('');
  totales[0] = 'TOTALES';
  totales[m.accion] = 'Resumen de las acciones del plan';
  const despues = aoa[ult].slice();
  despues[m.accion] = 'Acción escrita después de los totales';
  aoa.splice(ult + 1, 0, totales, despues);
  const wbq = X.utils.book_new(); X.utils.book_append_sheet(wbq, X.utils.aoa_to_sheet(aoa), 'PM_01 CGSC');
  const bq = R.pmParseWorkbook(X, X.read(X.write(wbq, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' }), 'plan-prueba.xlsx');
  const textos = bq.hall.flatMap(h => h.acciones.map(a => a.accion));
  assert.deepStrictEqual(textos, ['Primera acción de prueba', 'Segunda acción de prueba']); ok();
  R.PM.hall = []; R.PM.acc = [];
}

console.log(`OK: ${n} verificaciones del módulo de planes de mejoramiento`);
