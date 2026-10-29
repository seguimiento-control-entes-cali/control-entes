/* Compara dos versiones de SheetJS (xlsx) con los Excel reales, antes de cambiar la librería de la app.
   Uso:
     node tests/comparar-versiones-xlsx.cjs --vieja <carpeta de la librería> --nueva <carpeta de la librería>
          --control "<carpeta con los Excel de control>" --planes "<carpeta con los Excel de planes>" [--nombres]
   (cada carpeta de librería es la que contiene su package.json, p. ej. node_modules/xlsx)
   Compara, con las dos versiones y en dos zonas horarias (UTC y America/Bogota):
     1. Excel de control: todo lo que lee la app (ceLeerLibro + ceClasificar) y los números crudos del XML.
     2. Excel de planes: el resultado completo de pmParseWorkbook (plan, hallazgos y acciones).
     3. Exportaciones F14/F14.1, PM_01, PM_02 y PM_01 avance, armadas con los planes reales y con un plan
        inventado que fuerza NaN; cuenta las celdas distintas y muestra cómo queda cada celda que recibe NaN.
   Solo lectura: no modifica los Excel, no escribe archivos (las exportaciones se arman en memoria), no usa internet
   ni Supabase. Solo imprime conteos, rutas de campos y direcciones de celda: ningún valor de los Excel. Con
   --nombres muestra el nombre de cada archivo; sin él, «archivo 1, 2…». */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ZONAS = ['UTC', 'America/Bogota'];
const ES_EXCEL = /\.xlsx?$/i;
const arg = n => {
  const i = process.argv.indexOf('--' + n);
  return i < 0 ? null : process.argv[i + 1];
};

/* ---------- proceso principal: repite la comparación en cada zona horaria ---------- */
if (!process.argv.includes('--hijo')) {
  const faltan = ['vieja', 'nueva', 'control', 'planes'].filter(k => !arg(k) || !fs.existsSync(arg(k)));
  if (faltan.length) {
    console.error('Falta o no existe: --' + faltan.join(', --'));
    console.error(
      'Uso: node tests/comparar-versiones-xlsx.cjs --vieja <lib> --nueva <lib> --control "<carpeta>" --planes "<carpeta>" [--nombres]'
    );
    process.exit(2);
  }
  let fallas = 0;
  for (const TZ of ZONAS) {
    console.log(`\n================ Zona horaria ${TZ} ================`);
    const r = spawnSync(process.execPath, [__filename, '--hijo', ...process.argv.slice(2)], {
      env: { ...process.env, TZ },
      stdio: 'inherit'
    });
    if (r.status !== 0) fallas++;
  }
  console.log(
    fallas ? `\nResultado: HAY diferencias entre las dos versiones (en ${fallas} zona(s)).` : '\nResultado: sin diferencias entre las dos versiones en ninguna zona horaria.'
  );
  process.exit(fallas ? 1 : 0);
}

/* ---------- proceso hijo ---------- */
const Xv = require(path.resolve(arg('vieja')));
const Xn = require(path.resolve(arg('nueva')));
const R = require('./cargar-app.cjs')([
  'S', 'PM', 'ceLeerLibro', 'ceClasificar', 'ceCorte', 'ceNumerosCrudos',
  'pmParseWorkbook', 'pmSheetsF14', 'pmSheetPM01', 'pmSheetPM02', 'pmSheetAvanceSemestral'
]);
const conNombres = process.argv.includes('--nombres');
const listar = dir => fs.readdirSync(dir).filter(f => ES_EXCEL.test(f) && !f.startsWith('~$')).sort();
const etiqueta = (f, i) => (conNombres ? f : `archivo ${i + 1} (${path.extname(f).toLowerCase()})`);
const igual = (a, b) => a === b || (Number.isNaN(a) && Number.isNaN(b)) || JSON.stringify(a) === JSON.stringify(b);
function aplanar(o, pre = '', out = {}) {
  if (typeof o === 'function') return out;
  if (o && typeof o === 'object' && !(o instanceof Date)) {
    if (Array.isArray(o)) o.forEach((v, i) => aplanar(v, pre + '[' + i + ']', out));
    else Object.keys(o).forEach(k => aplanar(o[k], pre ? pre + '.' + k : k, out));
  } else out[pre] = o instanceof Date ? 'Date:' + o.toISOString() : o;
  return out;
}
/* diferencias entre dos objetos: cuenta por ruta del campo, con los índices reemplazados por [] */
function difObjetos(a, b, cuenta) {
  const A = aplanar(a),
    B = aplanar(b);
  let n = 0;
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)]))
    if (!igual(A[k], B[k])) {
      n++;
      const g = k.replace(/\[\d+\]/g, '[]');
      cuenta[g] = (cuenta[g] || 0) + 1;
    }
  return n;
}
const imprimir = (titulo, cuenta) =>
  Object.entries(cuenta)
    .sort((x, y) => y[1] - x[1])
    .forEach(([k, n]) => console.log(`    ${titulo} ${k}: ${n}`));
let hayDif = false;
console.log(`Versiones: vieja ${Xv.version} · nueva ${Xn.version}`);

/* ===== 1. Excel de control ===== */
{
  const dir = arg('control'),
    archivos = listar(dir);
  console.log(`\n1. Excel de control: ${archivos.length} archivo(s)`);
  const leer = (X, f) => X.read(fs.readFileSync(path.join(dir, f)), { type: 'buffer', cellNF: true, bookFiles: true });
  const regs = { v: [], n: [] },
    crudos = { v: 0, n: 0 },
    errores = { v: [], n: [] };
  archivos.forEach((f, i) => {
    for (const [k, X] of [['v', Xv], ['n', Xn]]) {
      try {
        const wb = leer(X, f);
        const idx = wb.SheetNames.indexOf('CONTROL');
        if (idx >= 0) crudos[k] += R.ceNumerosCrudos(wb, idx).size;
        regs[k] = regs[k].concat(R.ceLeerLibro(X, wb, f).registros);
      } catch (e) {
        errores[k].push(etiqueta(f, i) + ': ' + e.message.slice(0, 80));
      }
    }
  });
  if (errores.v.length || errores.n.length) {
    console.log(`   Errores de lectura: ${errores.v.length} (vieja), ${errores.n.length} (nueva)`);
    if (JSON.stringify(errores.v) !== JSON.stringify(errores.n)) hayDif = true;
  }
  console.log(`   Números crudos leídos del XML (ceNumerosCrudos): ${crudos.v} (vieja), ${crudos.n} (nueva)`);
  if (crudos.v !== crudos.n) hayDif = true;
  const corte = R.ceCorte(regs.v);
  const fv = R.ceClasificar(regs.v, corte).filas,
    fn = R.ceClasificar(regs.n, corte).filas;
  const clave = f => f.vigencia + '|' + f.hoja_excel + '|' + f.fila_excel;
  const M = new Map(fn.map(f => [clave(f), f]));
  const cuenta = {};
  let distintas = 0,
    solo = 0;
  for (const a of fv) {
    const b = M.get(clave(a));
    if (!b) {
      solo++;
      continue;
    }
    M.delete(clave(a));
    if (difObjetos(a, b, cuenta)) distintas++;
  }
  solo += M.size;
  console.log(`   Registros: ${fv.length} (vieja), ${fn.length} (nueva). Distintos: ${distintas}. En una sola versión: ${solo}.`);
  imprimir('columna', cuenta);
  if (distintas || solo || fv.length !== fn.length) hayDif = true;
}

/* ===== 2. Excel de planes ===== */
const planesLeidos = [];
{
  const dir = arg('planes'),
    todos = fs.readdirSync(dir),
    archivos = listar(dir);
  console.log(`\n2. Excel de planes: ${archivos.length} archivo(s) de Excel (${todos.length - archivos.length} otros archivos, como PDF, no usan SheetJS y no se comparan)`);
  const leer = (X, f) => X.read(fs.readFileSync(path.join(dir, f)), { type: 'buffer', cellDates: false });
  const cuenta = {};
  archivos.forEach((f, i) => {
    let a, b, ea, eb;
    try {
      a = R.pmParseWorkbook(Xv, leer(Xv, f), f);
    } catch (e) {
      ea = e.message;
    }
    try {
      b = R.pmParseWorkbook(Xn, leer(Xn, f), f);
    } catch (e) {
      eb = e.message;
    }
    const et = etiqueta(f, i);
    if (ea || eb) {
      const mismo = ea === eb;
      console.log(`   ${et}: no se importa (${mismo ? 'mismo mensaje en las dos versiones' : 'MENSAJES DISTINTOS'})`);
      if (!mismo) hayDif = true;
      return;
    }
    const n = difObjetos(a, b, cuenta);
    const acc = a.hall.reduce((s, h) => s + h.acciones.length, 0);
    console.log(`   ${et}: ${a.formato}, ${a.hall.length} hallazgo(s), ${acc} acción(es) · campos distintos: ${n}`);
    if (n) hayDif = true;
    planesLeidos.push({ et, imp: a });
  });
  imprimir('campo', cuenta);
}

/* ===== 3. Exportaciones ===== */
{
  const hoy = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
  /* plan como lo guarda la app al importar (19-planes-de-mejoramiento.js, armado del payload) */
  const aPM = (imp, id) => {
    const plan = { ...imp.plan, id, formato: imp.formato };
    const hall = [],
      acc = [];
    imp.hall.forEach((h, i) => {
      const hid = id + '-H' + i;
      hall.push({ id: hid, plan_id: id, numero: h.numero, descripcion: h.descripcion, causa: h.causa, efecto: h.efecto, connotaciones: h.connotaciones, orden: i + 1 });
      h.acciones.forEach((a, j) =>
        acc.push({
          id: hid + '-A' + j, plan_id: id, hallazgo_id: hid, dependencia_id: a.dependencia_id || null, responsable: a.responsable,
          accion: a.accion, proposito: a.proposito, actividad: a.actividad, meta: a.meta, unidad_medida: a.unidad_medida || 'Unidades',
          cantidad: a.cantidad, fecha_inicio: a.fini || plan.fecha_suscripcion, fecha_fin: a.ffin, avance: a.avance ?? null,
          fecha_corte: a.fecha_corte || null, orden: j + 1
        })
      );
    });
    return { plan, hall, acc };
  };
  /* plan inventado con los casos que hoy producen NaN: sin fecha de suscripción, acción sin fechas ni cantidad */
  const sintetico = {
    plan: { id: 'SINT', formato: 'F14_CGR', entidad: 'Entidad inventada', ejercicio: 'Auditoría inventada', vigencia_pvcft: '2025' },
    hall: [{ id: 'SINT-H', plan_id: 'SINT', numero: '1', descripcion: 'Hallazgo inventado', causa: '', efecto: '', connotaciones: ['administrativa'], orden: 1 }],
    acc: [
      { id: 'SINT-A1', plan_id: 'SINT', hallazgo_id: 'SINT-H', accion: 'Acción sin fechas ni cantidad', unidad_medida: 'Informe', orden: 1 },
      { id: 'SINT-A2', plan_id: 'SINT', hallazgo_id: 'SINT-H', accion: 'Acción con cantidad cero', unidad_medida: 'Informe', cantidad: 0, fecha_inicio: '2026-01-01', fecha_fin: '2026-06-30', orden: 2 }
    ]
  };
  const casos = [{ et: 'plan inventado con NaN', datos: sintetico }, ...planesLeidos.map((p, i) => ({ et: p.et, datos: aPM(p.imp, 'P' + i) }))];
  const FORMATOS = [
    ['F14', X => R.pmSheetsF14(X, R.PM.planes[0], hoy)],
    ['PM_01', X => [R.pmSheetPM01(X, R.PM.planes[0], hoy)]],
    ['PM_02', X => [R.pmSheetPM02(X, R.PM.planes[0], hoy)]],
    ['PM_01 avance', X => [R.pmSheetAvanceSemestral(X, R.PM.planes[0], hoy)]]
  ];
  console.log(`\n3. Exportaciones (corte ${hoy}): ${casos.length} plan(es) × ${FORMATOS.length} formatos`);
  const generar = (X, datos, fn) => {
    R.PM.planes = [datos.plan];
    R.PM.hall = datos.hall;
    R.PM.acc = datos.acc;
    R.PM.av = [];
    const hojas = fn(X);
    const nan = [];
    hojas.forEach((ws, h) =>
      Object.keys(ws).forEach(ref => {
        const c = ws[ref];
        if (ref[0] !== '!' && c && typeof c.v === 'number' && Number.isNaN(c.v)) nan.push(h + ':' + ref);
      })
    );
    const wb = X.utils.book_new();
    hojas.forEach((ws, h) => X.utils.book_append_sheet(wb, ws, 'Hoja' + (h + 1)));
    return { buf: X.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true }), nan };
  };
  const describe = c => (!c ? 'vacía' : c.t === 'e' ? 'error ' + (c.w || '?') : c.t === 'n' ? (Number.isNaN(c.v) ? 'número NaN' : 'número') : 'tipo ' + c.t);
  for (const caso of casos)
    for (const [fmt, fn] of FORMATOS) {
      let gv, gn;
      try {
        gv = generar(Xv, caso.datos, fn);
        gn = generar(Xn, caso.datos, fn);
      } catch (e) {
        console.log(`   ${caso.et} · ${fmt}: no se pudo generar (${e.message.slice(0, 60)})`);
        continue;
      }
      /* las dos salidas se leen con la misma librería (la nueva) para comparar solo lo que se escribió */
      const lv = Xn.read(gv.buf, { type: 'buffer', cellNF: true }),
        ln = Xn.read(gn.buf, { type: 'buffer', cellNF: true });
      const cuenta = {};
      let n = 0;
      lv.SheetNames.forEach(h => {
        const A = lv.Sheets[h] || {},
          B = ln.Sheets[h] || {};
        for (const ref of new Set([...Object.keys(A), ...Object.keys(B)])) {
          if (ref[0] === '!') {
            if (!igual(A[ref], B[ref])) cuenta[h + ' ' + ref] = (cuenta[h + ' ' + ref] || 0) + 1;
            continue;
          }
          const a = A[ref] || {},
            b = B[ref] || {};
          ['t', 'v', 'f', 'z'].forEach(p => {
            if (!igual(a[p], b[p])) {
              n++;
              const k = `${h} columna ${ref.replace(/\d+$/, '')} (${p})`;
              cuenta[k] = (cuenta[k] || 0) + 1;
            }
          });
        }
      });
      const nanTxt = gv.nan.length || gn.nan.length ? ` · celdas con NaN: ${gv.nan.length} (vieja), ${gn.nan.length} (nueva)` : '';
      console.log(`   ${caso.et} · ${fmt}: diferencias de celda: ${n}${nanTxt}`);
      imprimir('  ', cuenta);
      if (n || Object.keys(cuenta).length) hayDif = true;
      const refs = [...new Set([...gv.nan, ...gn.nan])];
      refs.forEach(x => {
        const [h, ref] = x.split(':'),
          hoja = 'Hoja' + (+h + 1);
        console.log(`      NaN en ${hoja}!${ref}: vieja → ${describe(lv.Sheets[hoja][ref])} · nueva → ${describe(ln.Sheets[hoja][ref])}`);
      });
    }
}
process.exit(hayDif ? 1 : 0);
