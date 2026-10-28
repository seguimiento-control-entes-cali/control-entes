/**
 * src/js/19-planes-de-mejoramiento.js
 * Planes de mejoramiento de las contralorías: formulación (plan → hallazgos → acciones), reporte y validación de
 * avances con soporte, indicadores de cumplimiento y avance (metodología del Formulario 14.1 de la CGR),
 * importación de Excel (PM_01 CGSC y Formularios 14/14.1 CGR) y exportación en esos mismos formatos.
 * Depende de: 02 (utilidades), 03 (S, rol), 04 (db, DEMO, demoAudit, dbErr), 06 (toast, openModal, render),
 *             10 (contactsOf, normPhone, normMail, logNotif, shortOrg, orgKey). Supabase: supabase/13_planes_mejoramiento.sql
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   PLANES DE MEJORAMIENTO
   ===================================================================== */
const PM = {
  planes: [],
  hall: [],
  acc: [],
  av: [],
  ok: false,
  err: '',
  errMsg: '',
  plan: null,
  tab: 'acciones',
  f: { ctl: '', q: '' },
  fa: { est: '', dep: '', q: '' },
  eval: null,
  imp: null,
  abiertos: {}
};
/* Días antes del vencimiento en que una acción pasa a "próxima a vencer" */
const PM_ALERTA_DIAS = 30;
const PM_FMT = {
  PM_01_CGSC: {
    corto: 'CGSC',
    nombre: 'Formato PM_01 CGSC',
    contraloria: 'Contraloría General de Santiago de Cali'
  },
  F14_CGR: {
    corto: 'CGR',
    nombre: 'Formularios 14 y 14.1',
    contraloria: 'Contraloría General de la República'
  },
  OTRO: { corto: 'Otro', nombre: 'Otro formato', contraloria: '' }
};
const PM_CONN = {
  administrativa: 'Administrativa',
  disciplinaria: 'Disciplinaria',
  fiscal: 'Fiscal',
  penal: 'Penal',
  sancionatoria: 'Sancionatoria',
  otra: 'Otra incidencia'
};
const PM_TIPOS = [
  'Auditoría financiera y de gestión',
  'Auditoría de cumplimiento',
  'Auditoría de desempeño',
  'Actuación especial de fiscalización',
  'Otra'
];
const PM_EST = { formulacion: 'En formulación', en_ejecucion: 'En ejecución', cerrado: 'Cerrado' };
const PM_AV_EST = { reportado: 'Por validar', validado: 'Validado', devuelto: 'Devuelto' };
const PM_XLSX_URL = 'vendor/xlsx.full.min.js'; /* SheetJS 0.18.5, publicado en vendor/ */

const pmCanEdit = () => canRole(['admin', 'control_interno']);
const pmScoped = () => ['secretario', 'enlace'].includes(rol());
const pmMyDep = () => (S.profile || {}).dependencia_id || null;
const pmHoy = () => iso(today0());
const pmDep = id => S.deps.find(d => String(d.id) === String(id)) || null;
const pmDepN = id => (pmDep(id) || {}).nombre || '';
const pmPlanOf = id => PM.planes.find(p => p.id === id) || null;
const pmHallOf = id => PM.hall.find(h => h.id === id) || null;
const pmAccOf = id => PM.acc.find(a => a.id === id) || null;
const pmPctTxt = v => (v == null ? '—' : (Math.round(v * 1000) / 10).toLocaleString('es-CO') + '%');
const pmNumTxt = v => Number(v || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
/* Meta en palabras + cantidad ("100% de supervisores capacitados" o "6 Conciliaciones") */
function pmMetaTxt(a) {
  const pct = pmKey(a.unidad_medida).startsWith('porcent'),
    q = pct ? pmNumTxt(a.cantidad) + '%' : pmNumTxt(a.cantidad) + ' ' + (a.unidad_medida || '');
  if (!pmTxt(a.meta)) return q;
  return pct && Number(a.cantidad) === 100 ? pmTxt(a.meta) : pmTxt(a.meta) + ' · ' + q;
}
const pmCanReport = a =>
  !!a && (pmCanEdit() || (pmScoped() && pmMyDep() && String(a.dependencia_id) === String(pmMyDep())));

/* ---------- cálculo (Formulario 14.1 CGR) ----------
   Plazo (semanas) = (fecha fin − fecha inicio) / 7
   % avance        = mín(1, avance físico / cantidad de la meta)
   PLAI  = plazo × % avance                 (puntaje logrado por la actividad)
   PLAVI = PLAI si fecha fin ≤ fecha de evaluación, si no 0
   PAAVI = plazo si fecha fin ≤ fecha de evaluación, si no 0
   Cumplimiento (CPM) = Σ PLAVI / Σ PAAVI       Avance (AP) = Σ PLAI / Σ plazo           */
function pmSemanas(a) {
  if (!a.fecha_inicio || !a.fecha_fin) return 0;
  return Math.max(0, Math.round((parseD(a.fecha_fin) - parseD(a.fecha_inicio)) / 86400000) / 7);
}
function pmPct(a, cant) {
  const c = Number(a.cantidad) || 0,
    v = cant == null ? Number(a.avance) || 0 : Number(cant) || 0;
  return c > 0 ? Math.min(1, Math.max(0, v / c)) : 0;
}
/* Último avance VALIDADO con fecha de corte hasta la fecha indicada */
function pmAvAl(a, corte) {
  const l = PM.av
    .filter(v => v.accion_id === a.id && v.estado === 'validado' && v.fecha_corte <= corte)
    .sort(
      (x, y) =>
        String(y.fecha_corte).localeCompare(String(x.fecha_corte)) ||
        String(y.revisado_at || '').localeCompare(String(x.revisado_at || ''))
    );
  if (l.length) return l[0];
  if (a.fecha_corte && a.fecha_corte <= corte)
    return { cantidad: a.avance, fecha_corte: a.fecha_corte, descripcion: '' };
  return null;
}
function pmIndic(list, fev) {
  const o = { n: list.length, pbea: 0, pbec: 0, plai: 0, plavi: 0 };
  list.forEach(a => {
    const av = pmAvAl(a, fev),
      p = pmPct(a, av ? av.cantidad : 0),
      s = pmSemanas(a);
    o.pbea += s;
    o.plai += s * p;
    if (a.fecha_fin <= fev) {
      o.pbec += s;
      o.plavi += s * p;
    }
  });
  o.cpm = o.pbec ? o.plavi / o.pbec : null;
  o.ap = o.pbea ? o.plai / o.pbea : list.length ? 0 : null;
  return o;
}
/* Estado de una acción hoy */
function pmEstado(a) {
  const p = pmPct(a),
    d = daysUntil(a.fecha_fin);
  if (p >= 1) return { k: 'cumplida', pill: 'verde', txt: 'Cumplida', d };
  if (d < 0) return { k: 'vencida', pill: 'rojo', txt: 'Vencida', d };
  if (d <= PM_ALERTA_DIAS)
    return { k: 'proxima', pill: 'amarillo', txt: d === 0 ? 'Vence hoy' : `Vence en ${d} d`, d };
  return { k: 'termino', pill: 'neutral', txt: 'En término', d };
}
const pmPend = a => PM.av.find(v => v.accion_id === a.id && v.estado === 'reportado') || null;
function pmUltimo(a) {
  return (
    PM.av
      .filter(v => v.accion_id === a.id)
      .sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')))[0] || null
  );
}
function pmCounts(list) {
  const o = { n: list.length, cumplida: 0, vencida: 0, proxima: 0, termino: 0, pend: 0, dev: 0, sinDep: 0 };
  list.forEach(a => {
    o[pmEstado(a).k]++;
    if (pmPend(a)) o.pend++;
    const u = pmUltimo(a);
    if (u && u.estado === 'devuelto') o.dev++;
    if (!a.dependencia_id) o.sinDep++;
  });
  return o;
}
function pmBadge() {
  if (!PM.ok || !rol()) return 0;
  if (pmCanEdit()) return PM.av.filter(v => v.estado === 'reportado').length;
  if (pmScoped())
    return PM.acc.filter(a => {
      const e = pmEstado(a).k;
      return (e === 'vencida' || e === 'proxima') && !pmPend(a);
    }).length;
  return 0;
}

/* ---------- utilidades de lectura ---------- */
const pmTxt = v =>
  String(v == null ? '' : v)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
const pmKey = s =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, ' ')
    .replace(/[^a-z0-9%()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const PM_MESES = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9,
  set: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  jan: 1,
  apr: 4,
  aug: 8,
  dec: 12
};
function pmIsoOk(y, m, d) {
  if (y < 100) y += 2000;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  if (d > new Date(y, m, 0).getDate()) return null;
  return y + '-' + pad(m) + '-' + pad(d);
}
/* Fecha desde Excel o texto: número de serie, 30/06/2022, 2022-06-30, 30/jun/2022, "30 de junio de 2022",
   "15 diciembre del 2022", "junio 30 de 2022". Devuelve AAAA-MM-DD o null. */
function pmFecha(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return pmIsoOk(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    const d = new Date(Math.round((v - 25569) * 86400000));
    return pmIsoOk(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = pmKey(v).replace(/[()]/g, ' ');
  let m = s.match(/(\d{4}) (\d{1,2}) (\d{1,2})/);
  if (m) return pmIsoOk(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2}) (\d{1,2}) (\d{2,4})/);
  if (m) return pmIsoOk(+m[3], +m[2], +m[1]);
  m = s.match(/(\d{1,2}) (?:de )?([a-z]{3,})\.? (?:de |del )?(\d{2,4})/);
  if (m && PM_MESES[m[2].slice(0, 3)]) return pmIsoOk(+m[3], PM_MESES[m[2].slice(0, 3)], +m[1]);
  m = s.match(/([a-z]{3,}) (\d{1,2}) (?:de |del )?(\d{4})/);
  if (m && PM_MESES[m[1].slice(0, 3)]) return pmIsoOk(+m[3], PM_MESES[m[1].slice(0, 3)], +m[2]);
  return null;
}
function pmNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v == null ? '' : v)
    .replace(/[%\s$]/g, '')
    .trim();
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
}
function pmConnOf(v) {
  const k = pmKey(v),
    out = [];
  [
    ['administrativ', 'administrativa'],
    ['disciplinari', 'disciplinaria'],
    ['fiscal', 'fiscal'],
    ['penal', 'penal'],
    ['sancionatori', 'sancionatoria']
  ].forEach(([w, c]) => {
    if (k.includes(w)) out.push(c);
  });
  return out;
}
/* Dependencia mencionada en un texto ("Nora Mondragón – Secretaria de Gobierno") */
function pmDepMatch(txt) {
  const k = ' ' + orgKey(txt) + ' ';
  if (k.trim().length < 4) return null;
  let best = null,
    bl = 0;
  S.deps.forEach(d => {
    const dk = orgKey(d.nombre);
    if (dk.length >= 6 && k.includes(' ' + dk + ' ') && dk.length > bl) {
      best = d;
      bl = dk.length;
    }
  });
  if (best) return best.id;
  /* nombre corto: "Planeación", "Gobierno" (sin "Secretaría de", "Departamento Administrativo de") */
  S.deps.forEach(d => {
    const core = orgKey(d.nombre)
      .replace(
        /^(secretaria|departamento administrativo|unidad administrativa especial|uae|direccion|oficina)( distrital)?( de| del| para la| para el)? /,
        ''
      )
      .trim();
    if (core.length >= 6 && k.includes(' ' + core + ' ') && core.length > bl) {
      best = d;
      bl = core.length;
    }
  });
  return best ? best.id : null;
}

/* =====================================================================
   DATOS
   ===================================================================== */
async function pmAll(table, order) {
  let from = 0,
    out = [];
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .order(order)
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    out = out.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}
function pmDemoStore() {
  if (DEMO.pm) return DEMO.pm;
  if (ES_PRIVADA) {
    try {
      const j = JSON.parse(lsGet('ce_pm') || 'null');
      if (j && Array.isArray(j.planes)) return (DEMO.pm = j);
    } catch (e) {}
    return (DEMO.pm = { planes: [], hall: [], acc: [], av: [] });
  }
  return (DEMO.pm = pmDemoSeed());
}
function pmDemoSave() {
  if (ES_PRIVADA && DEMO.pm) lsSet('ce_pm', JSON.stringify(DEMO.pm));
}
function pmDemoSeed() {
  const st = { planes: [], hall: [], acc: [], av: [] };
  const deps = S.deps.filter(d => HIST.rows.some(r => r.org === d.nombre)).slice(0, 4);
  const dep = i => (deps[i % Math.max(1, deps.length)] || {}).id || null;
  const now = new Date().toISOString();
  const mk = (pfx, o) => ({
    id: pfx + Math.random().toString(36).slice(2, 10),
    created_at: now,
    updated_at: now,
    ...o
  });
  const p1 = mk('p', {
    formato: 'PM_01_CGSC',
    ente_id: null,
    contraloria: PM_FMT.PM_01_CGSC.contraloria,
    entidad: 'Distrito Especial de Santiago de Cali',
    nit: '',
    representante_legal: 'Representante legal (ejemplo)',
    ordenador_gasto: 'Ordenador del gasto (ejemplo)',
    ejercicio: 'Auditoría de cumplimiento a la contratación (DATOS DE EJEMPLO)',
    tipo_ejercicio: 'Auditoría de cumplimiento',
    modalidad: '',
    vigencia_pvcft: String(new Date().getFullYear() - 1),
    periodo_auditado: '',
    numero_informe: 'EJEMPLO-001',
    radicado_orfeo: '',
    fecha_informe: addDays(-260),
    fecha_suscripcion: addDays(-240),
    estado: 'en_ejecucion',
    observaciones: 'Plan ficticio para conocer el módulo.'
  });
  const p2 = mk('p', {
    ...p1,
    id: 'p' + Math.random().toString(36).slice(2, 10),
    formato: 'F14_CGR',
    contraloria: PM_FMT.F14_CGR.contraloria,
    nit: '890.399.011-3',
    ordenador_gasto: '',
    ejercicio: 'Auditoría financiera y de gestión a recursos del SGP (DATOS DE EJEMPLO)',
    tipo_ejercicio: 'Auditoría financiera y de gestión',
    modalidad: 'Auditoría financiera y de gestión',
    vigencia_pvcft: '',
    periodo_auditado: String(new Date().getFullYear() - 1),
    numero_informe: 'EJEMPLO-CGR-002',
    fecha_informe: addDays(-120),
    fecha_suscripcion: addDays(-100)
  });
  st.planes.push(p1, p2);
  const H = (p, numero, descripcion, conn, orden) => {
    const h = mk('h', {
      plan_id: p.id,
      numero,
      descripcion,
      causa: '',
      efecto: '',
      connotaciones: conn,
      cuantia: null,
      macroproceso: 'Gestión contractual',
      orden
    });
    st.hall.push(h);
    return h;
  };
  const A = (p, h, o) => {
    const a = mk('a', {
      plan_id: p.id,
      hallazgo_id: h.id,
      responsable: '',
      proposito: '',
      actividad: '',
      unidad_medida: 'Porcentaje',
      cantidad: 100,
      fuente_verificacion: 'Expedientes contractuales',
      lugar_verificacion: 'Archivo de gestión',
      fecha_inicio: p.fecha_suscripcion,
      avance: 0,
      fecha_corte: null,
      orden: st.acc.length + 1,
      ...o
    });
    st.acc.push(a);
    return a;
  };
  const V = (a, o) =>
    st.av.push(
      mk('v', {
        accion_id: a.id,
        plan_id: a.plan_id,
        dependencia_id: a.dependencia_id,
        radicado_orfeo: '',
        soporte_path: null,
        soporte_hash: null,
        observacion: '',
        reportado_email: 'enlace@cali.gov.co',
        revisado_email: o.estado === 'validado' ? 'control.interno@cali.gov.co' : '',
        revisado_at: o.estado === 'validado' ? now : null,
        ...o
      })
    );
  const h1 = H(
    p1,
    '1',
    'Publicación extemporánea en SECOP II de documentos del proceso contractual (ejemplo).',
    ['administrativa', 'disciplinaria'],
    1
  );
  const a1 = A(p1, h1, {
    dependencia_id: dep(0),
    accion: 'Capacitar a supervisores en publicación oportuna en SECOP II',
    meta: '100% de supervisores capacitados',
    fecha_fin: addDays(-60),
    avance: 100,
    fecha_corte: addDays(-70)
  });
  V(a1, {
    fecha_corte: addDays(-70),
    cantidad: 100,
    descripcion: 'Se capacitó a la totalidad de supervisores (acta y listado de asistencia).',
    estado: 'validado'
  });
  const a2 = A(p1, h1, {
    dependencia_id: dep(0),
    accion: 'Implementar lista de chequeo de publicación por proceso',
    meta: '100% de procesos con lista de chequeo',
    fecha_fin: addDays(-15),
    avance: 60,
    fecha_corte: addDays(-40)
  });
  V(a2, {
    fecha_corte: addDays(-40),
    cantidad: 60,
    descripcion: 'Lista de chequeo aplicada en 6 de 10 procesos revisados.',
    estado: 'validado'
  });
  const h2 = H(
    p1,
    '2',
    'Debilidades en el análisis del sector y estudios de mercado (ejemplo).',
    ['administrativa'],
    2
  );
  const a3 = A(p1, h2, {
    dependencia_id: dep(1),
    accion: 'Ajustar el procedimiento de análisis del sector',
    meta: 'Procedimiento actualizado y socializado',
    fecha_fin: addDays(18),
    avance: 50,
    fecha_corte: addDays(-30)
  });
  V(a3, {
    fecha_corte: addDays(-30),
    cantidad: 50,
    descripcion: 'Borrador del procedimiento en revisión jurídica.',
    estado: 'validado'
  });
  V(a3, {
    fecha_corte: addDays(-2),
    cantidad: 80,
    descripcion: 'Procedimiento aprobado en comité; falta socializar.',
    estado: 'reportado'
  });
  const h3 = H(
    p1,
    '3',
    'Informes de supervisión sin evidencia de seguimiento al plan de mejoramiento (ejemplo).',
    ['administrativa', 'sancionatoria'],
    3
  );
  A(p1, h3, {
    dependencia_id: dep(2),
    accion: 'Publicar los informes de avance en el aplicativo de la contraloría',
    meta: '2 informes semestrales publicados',
    unidad_medida: 'Informes',
    cantidad: 2,
    fecha_fin: addDays(140)
  });
  const h4 = H(
    p2,
    'H1-2025',
    'Diferencias entre la ejecución presupuestal y los registros contables (ejemplo).',
    ['administrativa', 'fiscal'],
    1
  );
  const a5 = A(p2, h4, {
    dependencia_id: dep(3),
    accion: 'Conciliar mensualmente presupuesto y contabilidad',
    proposito: 'Asegurar la consistencia de la información financiera',
    actividad: 'Elaborar conciliaciones mensuales firmadas',
    meta: '',
    unidad_medida: 'Conciliaciones',
    cantidad: 6,
    fecha_fin: addDays(80),
    avance: 3,
    fecha_corte: addDays(-10)
  });
  V(a5, {
    fecha_corte: addDays(-10),
    cantidad: 3,
    descripcion: 'Se elaboraron las conciliaciones de los tres primeros meses.',
    estado: 'validado'
  });
  A(p2, h4, {
    dependencia_id: dep(1),
    accion: 'Ajustar el instructivo de cierre presupuestal',
    actividad: 'Actualizar y adoptar el instructivo',
    meta: '',
    unidad_medida: 'Instructivo',
    cantidad: 1,
    fecha_fin: addDays(-5)
  });
  return st;
}
function pmDemoView(st) {
  if (!pmScoped()) return st;
  const dep = String(pmMyDep());
  const acc = st.acc.filter(a => String(a.dependencia_id) === dep);
  const hid = new Set(acc.map(a => a.hallazgo_id)),
    pid = new Set(acc.map(a => a.plan_id));
  return {
    planes: st.planes.filter(p => pid.has(p.id)),
    hall: st.hall.filter(h => hid.has(h.id)),
    acc,
    av: st.av.filter(v => String(v.dependencia_id) === dep)
  };
}
async function pmLoad() {
  PM.err = '';
  PM.errMsg = '';
  try {
    if (S.demo || !sb) {
      const st = pmDemoView(pmDemoStore());
      PM.planes = st.planes.map(x => ({ ...x }));
      PM.hall = st.hall.map(x => ({ ...x }));
      PM.acc = st.acc.map(x => ({ ...x }));
      PM.av = st.av.map(x => ({ ...x }));
      PM.tras = pmScoped() ? [] : (pmDemoStore().tras || []).map(x => ({ ...x }));
      PM.trasOk = true;
      PM.v19 = true;
      PM.pror = pmScoped() ? [] : (pmDemoStore().pror || []).map(x => ({ ...x }));
      PM.inf = pmScoped() ? [] : (pmDemoStore().inf || []).map(x => ({ ...x }));
      PM.docs = pmScoped() ? [] : (pmDemoStore().docs || []).map(x => ({ ...x }));
      PM.v20 = true;
    } else {
      const [p, h, a, v] = await Promise.all([
        pmAll('pm_planes', 'fecha_suscripcion'),
        pmAll('pm_hallazgos', 'orden'),
        pmAll('pm_acciones', 'orden'),
        pmAll('pm_avances', 'created_at')
      ]);
      PM.planes = p;
      PM.hall = h;
      PM.acc = a;
      PM.av = v;
      if (typeof VP !== 'undefined' && VP.real)
        Object.assign(PM, pmDemoView({ planes: p, hall: h, acc: a, av: v }));
      /* ¿está instalado el script 19 (calificación CGSC, observaciones de Control Interno, oficio)? */
      if (PM.v19 === undefined) {
        const { error } = await sb.from('pm_planes').select('direccion_tecnica').limit(1);
        PM.v19 = !error;
      }
      /* traslados (supabase/18): solo los ven el Despacho y Control Interno */
      try {
        PM.tras = pmScoped() ? [] : await pmAll('pm_traslados', 'created_at');
        PM.trasOk = true;
      } catch (e) {
        PM.tras = [];
        PM.trasOk = false;
      }
      /* supabase/20: prórrogas, informes semestrales y archivo documental */
      try {
        if (pmScoped()) {
          PM.pror = [];
          PM.inf = [];
          PM.docs = [];
          const { error } = await sb.from('pm_prorrogas').select('id').limit(1);
          PM.v20 = !error;
        } else {
          [PM.pror, PM.inf, PM.docs] = await Promise.all([
            pmAll('pm_prorrogas', 'created_at'),
            pmAll('pm_informes_avance', 'created_at'),
            pmAll('archivo_documentos', 'created_at')
          ]);
          PM.v20 = true;
        }
      } catch (e) {
        PM.pror = [];
        PM.inf = [];
        PM.docs = [];
        PM.v20 = false;
      }
    }
    PM.ok = true;
  } catch (e) {
    PM.ok = false;
    PM.planes = [];
    PM.hall = [];
    PM.acc = [];
    PM.av = [];
    const m = e && e.message ? e.message : String(e);
    PM.err = /pm_planes|relation|does not exist|schema cache|not find/i.test(m) ? 'falta' : 'error';
    PM.errMsg = m;
  }
  if (PM.plan && !pmPlanOf(PM.plan)) PM.plan = null;
}
async function pmRefresh() {
  await pmLoad();
  renderNav();
  if (S.view === 'planes') render();
}
const pmUser = () => (S.user || {}).email || 'sistema';
function pmBlockIfAvances(kind, id) {
  const st = DEMO.pm;
  const accIds =
    kind === 'acc'
      ? [id]
      : kind === 'hall'
        ? st.acc.filter(a => a.hallazgo_id === id).map(a => a.id)
        : st.acc.filter(a => a.plan_id === id).map(a => a.id);
  if (st.av.some(v => accIds.includes(v.accion_id)))
    throw new Error(
      kind === 'acc'
        ? 'La acción tiene avances reportados: no se puede eliminar'
        : kind === 'hall'
          ? 'El hallazgo tiene acciones con avances reportados: no se puede eliminar'
          : 'El plan tiene avances reportados: no se puede eliminar'
    );
}
const PM_TABLA = {
  plan: 'pm_planes',
  hall: 'pm_hallazgos',
  acc: 'pm_acciones',
  tras: 'pm_traslados',
  pror: 'pm_prorrogas',
  inf: 'pm_informes_avance',
  doc: 'archivo_documentos'
};
const PM_LISTA = {
  plan: 'planes',
  hall: 'hall',
  acc: 'acc',
  tras: 'tras',
  pror: 'pror',
  inf: 'inf',
  doc: 'docs'
};
async function pmSave(kind, o, id) {
  if (!pmCanEdit()) throw new Error('Tu rol no puede modificar planes de mejoramiento');
  const tabla = PM_TABLA[kind];
  if (S.demo || !sb) {
    const st = pmDemoStore();
    if (!st[PM_LISTA[kind]]) st[PM_LISTA[kind]] = [];
    const list = st[PM_LISTA[kind]];
    if (kind === 'hall' && list.some(h => h.plan_id === o.plan_id && h.numero === o.numero && h.id !== id))
      throw new Error('Ya existe un hallazgo con el número ' + o.numero + ' en este plan');
    const now = new Date().toISOString();
    if (id) {
      const t = list.find(x => x.id === id),
        antes = { ...t };
      Object.assign(t, o, { updated_at: now });
      await demoAudit(tabla, 'UPDATE', id, t, pmUser(), diff(antes, t));
    } else {
      const t = {
        ...o,
        id: kind[0] + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        created_at: now,
        updated_at: now
      };
      if (kind === 'acc') Object.assign(t, { avance: 0, fecha_corte: null });
      list.push(t);
      await demoAudit(tabla, 'INSERT', t.id, t, pmUser());
      id = t.id;
    }
    pmDemoSave();
    return id;
  }
  if (id) {
    const { error } = await sb.from(tabla).update(o).eq('id', id);
    if (error) throw pmErr(error);
    return id;
  }
  const { data, error } = await sb.from(tabla).insert(o).select('id').single();
  if (error) throw pmErr(error);
  return data.id;
}
async function pmDelete(kind, id) {
  if (!pmCanEdit()) throw new Error('Tu rol no puede eliminar');
  if (S.demo || !sb) {
    pmBlockIfAvances(kind, id);
    pmDemoPapelera(kind, id);
    const st = pmDemoStore();
    if (kind === 'hall') st.acc = st.acc.filter(a => a.hallazgo_id !== id);
    st[PM_LISTA[kind]] = (st[PM_LISTA[kind]] || []).filter(x => x.id !== id);
    if (kind === 'hall') st.tras = (st.tras || []).filter(x => x.hallazgo_id !== id);
    await demoAudit(PM_TABLA[kind], 'DELETE', id, { id }, pmUser());
    pmDemoSave();
    return;
  }
  const { error } = await sb.from(PM_TABLA[kind]).delete().eq('id', id);
  if (error) throw pmErr(error);
}
async function pmEliminarPlan(id) {
  if (!pmCanEdit()) throw new Error('Solo el Super administrador o Control Interno eliminan planes');
  if (S.demo || !sb) {
    const st = pmDemoStore();
    if (st.av.some(v => v.plan_id === id && !/^Importado del archivo/.test(v.observacion || '')))
      throw new Error('El plan tiene avances reportados por las dependencias: no se puede eliminar');
    pmDemoPapelera('plan', id);
    st.av = st.av.filter(v => v.plan_id !== id);
    st.acc = st.acc.filter(a => a.plan_id !== id);
    st.hall = st.hall.filter(h => h.plan_id !== id);
    ['tras', 'pror', 'inf'].forEach(k => (st[k] = (st[k] || []).filter(x => x.plan_id !== id)));
    st.planes = st.planes.filter(p => p.id !== id);
    await demoAudit('pm_planes', 'DELETE', id, { id }, pmUser());
    pmDemoSave();
    return;
  }
  const { error } = await sb.rpc('pm_eliminar_plan', { p_id: id });
  if (error) throw pmErr(error);
}
async function pmReportar(o, file) {
  const a = pmAccOf(o.accion_id);
  if (!pmCanReport(a)) throw new Error('Solo puedes reportar avances de las acciones de tu dependencia');
  let path = null,
    hash = null;
  if (file) hash = await sha256Hex(await file.arrayBuffer());
  if (S.demo || !sb) {
    const st = pmDemoStore();
    if (st.av.some(v => v.accion_id === a.id && v.estado === 'reportado'))
      throw new Error('Esta acción ya tiene un avance pendiente de validar');
    const now = new Date().toISOString();
    const v = {
      id: 'v' + Date.now().toString(36),
      accion_id: a.id,
      plan_id: a.plan_id,
      dependencia_id: a.dependencia_id,
      fecha_corte: o.fecha_corte,
      cantidad: o.cantidad,
      descripcion: o.descripcion,
      radicado_orfeo: o.radicado_orfeo || '',
      soporte_path: file ? file.name : null,
      soporte_hash: hash,
      estado: 'reportado',
      observacion: '',
      reportado_email: pmUser(),
      revisado_email: '',
      revisado_at: null,
      created_at: now
    };
    st.av.push(v);
    await demoAudit('pm_avances', 'INSERT', v.id, v, pmUser());
    pmDemoSave();
    if (o.validar && pmCanEdit()) await pmRevisar(v.id, 'validado', 'Registrado y validado por ' + pmUser());
    return { hash };
  }
  if (file) {
    path = `pm/${a.plan_id}/${a.id}_${Date.now()}.pdf`;
    const up = await sb.storage
      .from('soportes')
      .upload(path, file, { contentType: 'application/pdf', upsert: false });
    if (up.error) throw new Error('No se pudo subir el PDF: ' + up.error.message);
  }
  const { error } = await sb.rpc('pm_reportar_avance', {
    p_accion: a.id,
    p_fecha: o.fecha_corte,
    p_cantidad: o.cantidad,
    p_descripcion: o.descripcion,
    p_orfeo: o.radicado_orfeo || '',
    p_path: path,
    p_hash: hash,
    p_validar: !!(o.validar && pmCanEdit())
  });
  if (error) {
    if (path) await sb.storage.from('soportes').remove([path]);
    throw pmErr(error);
  }
  return { hash };
}
async function pmRevisar(id, estado, obs) {
  if (!pmCanEdit()) throw new Error('Solo el Super administrador o Control Interno validan avances');
  if (S.demo || !sb) {
    const st = pmDemoStore(),
      v = st.av.find(x => x.id === id);
    if (!v) throw new Error('El avance no existe');
    if (v.estado !== 'reportado') throw new Error('Este avance ya fue revisado');
    if (estado === 'devuelto' && pmTxt(obs).length < 5)
      throw new Error('Indica a la dependencia por qué se devuelve el avance');
    const antes = { ...v };
    Object.assign(v, {
      estado,
      observacion: pmTxt(obs),
      revisado_email: pmUser(),
      revisado_at: new Date().toISOString()
    });
    await demoAudit('pm_avances', 'UPDATE', id, v, pmUser(), diff(antes, v));
    if (estado === 'validado') {
      const a = st.acc.find(x => x.id === v.accion_id),
        last = st.av
          .filter(x => x.accion_id === a.id && x.estado === 'validado')
          .sort(
            (x, y) =>
              String(y.fecha_corte).localeCompare(String(x.fecha_corte)) ||
              String(y.revisado_at).localeCompare(String(x.revisado_at))
          )[0];
      const ant = { ...a };
      a.avance = last.cantidad;
      a.fecha_corte = last.fecha_corte;
      await demoAudit('pm_acciones', 'UPDATE', a.id, a, pmUser(), diff(ant, a));
    }
    pmDemoSave();
    return;
  }
  const { error } = await sb.rpc('pm_revisar_avance', {
    p_id: id,
    p_estado: estado,
    p_observacion: obs || ''
  });
  if (error) throw pmErr(error);
}
async function pmImportar(payload) {
  if (!pmCanEdit()) throw new Error('Solo el Super administrador o Control Interno importan planes');
  if (S.demo || !sb) {
    const st = pmDemoStore(),
      now = new Date().toISOString(),
      uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const plan = { ...payload.plan, id: uid('p'), created_at: now, updated_at: now };
    const hall = [],
      acc = [],
      av = [];
    payload.hallazgos.forEach((h, i) => {
      const hh = { ...h, id: uid('h'), plan_id: plan.id, orden: i + 1, created_at: now, updated_at: now };
      delete hh.acciones;
      hall.push(hh);
      h.acciones.forEach(a => {
        const aa = {
          ...a,
          id: uid('a'),
          plan_id: plan.id,
          hallazgo_id: hh.id,
          orden: acc.length + 1,
          avance: 0,
          fecha_corte: null,
          created_at: now,
          updated_at: now
        };
        delete aa.descripcion_avance;
        aa.obs_ci_estado = aa.obs_ci ? 'pendiente' : '';
        if (a.avance != null && a.fecha_corte) {
          aa.avance = a.avance;
          aa.fecha_corte = a.fecha_corte;
          av.push({
            id: uid('v'),
            accion_id: aa.id,
            plan_id: plan.id,
            dependencia_id: aa.dependencia_id,
            fecha_corte: a.fecha_corte,
            cantidad: a.avance,
            descripcion: a.descripcion_avance || 'Avance importado del archivo ' + payload.archivo,
            radicado_orfeo: '',
            soporte_path: null,
            soporte_hash: null,
            estado: 'validado',
            observacion: 'Importado del archivo ' + payload.archivo,
            reportado_email: pmUser(),
            revisado_email: pmUser(),
            revisado_at: now,
            created_at: now
          });
        }
        acc.push(aa);
      });
    });
    st.planes.push(plan);
    st.hall.push(...hall);
    st.acc.push(...acc);
    st.av.push(...av);
    await demoAudit(
      'pm_planes',
      'INSERT',
      plan.id,
      { ...plan, hallazgos: hall.length, acciones: acc.length, archivo: payload.archivo },
      pmUser()
    );
    pmDemoSave();
    return plan.id;
  }
  const { data, error } = await sb.rpc('pm_importar', { p: payload });
  if (error) throw pmErr(error);
  return data;
}
function pmErr(e) {
  const m = e && e.message ? e.message : String(e);
  if (/pm_hallazgos_numero_unq/.test(m)) return new Error('Ya existe un hallazgo con ese número en el plan');
  if (/pm_acciones_fechas_ok/.test(m))
    return new Error('La fecha de terminación no puede ser anterior a la de inicio');
  return dbErr(e);
}

/* =====================================================================
   VISTAS
   ===================================================================== */
function pmMeter(label, v, color, hint) {
  return `<div class="pm-meter"><div class="pm-meter-h"><span>${label}</span><b>${pmPctTxt(v)}</b></div><div class="bar"><span style="width:${v == null ? 0 : Math.round(v * 100)}%;background:${color}"></span></div>${hint ? `<div class="pm-meter-f">${hint}</div>` : ''}</div>`;
}
const pmCtl = p =>
  `<span class="pm-ctl ${p.formato === 'F14_CGR' ? 'cgr' : p.formato === 'PM_01_CGSC' ? 'cgsc' : ''}">${esc((PM_FMT[p.formato] || PM_FMT.OTRO).corto)}</span>`;
const pmConnChips = h =>
  (h.connotaciones || []).map(c => `<span class="pm-conn c-${c}">${esc(PM_CONN[c] || c)}</span>`).join('');

function vPlanes(c) {
  if (!PM.ok) {
    c.innerHTML =
      PM.err === 'falta'
        ? `<div class="card"><div class="empty"><i class="fa-solid fa-database"></i><b>El módulo de planes de mejoramiento aún no está instalado en la base de datos.</b><div style="margin-top:6px">Ejecuta el script <span class="mono">supabase/13_planes_mejoramiento.sql</span> en el SQL Editor de Supabase y vuelve a cargar la página.</div></div></div>`
        : `<div class="card"><div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>No se pudieron cargar los planes de mejoramiento.<div class="muted" style="margin-top:6px;font-size:.8rem">${esc(PM.errMsg)}</div><button class="btn sm" style="margin-top:12px" data-act="pmReload"><i class="fa-solid fa-rotate"></i> Reintentar</button></div></div>`;
    return;
  }
  if (PM.plan && pmPlanOf(PM.plan)) return pmPlanView(c, pmPlanOf(PM.plan));
  if (pmScoped()) return pmDepView(c);
  return pmOverview(c);
}

function pmOverview(c) {
  const hoy = pmHoy(),
    f = PM.f;
  const q = pmKey(f.q);
  const planes = PM.planes
    .filter(p => !f.ctl || (PM_FMT[p.formato] || PM_FMT.OTRO).corto === f.ctl)
    .filter(
      p => !q || pmKey([p.ejercicio, p.contraloria, p.numero_informe, p.tipo_ejercicio].join(' ')).includes(q)
    )
    .sort(
      (a, b) =>
        (a.estado === 'cerrado') - (b.estado === 'cerrado') ||
        String(b.fecha_suscripcion).localeCompare(String(a.fecha_suscripcion))
    );
  const pids = new Set(planes.map(p => p.id));
  const acc = PM.acc.filter(a => pids.has(a.plan_id));
  const cn = pmCounts(acc),
    ind = pmIndic(acc, hoy);
  const porVal = PM.av.filter(v => v.estado === 'reportado' && pids.has(v.plan_id)).length;
  const crit = acc
    .filter(a => ['vencida', 'proxima'].includes(pmEstado(a).k))
    .sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)));
  /* por dependencia */
  const byDep = {};
  acc.forEach(a => {
    const k = a.dependencia_id || 'sin';
    (byDep[k] = byDep[k] || []).push(a);
  });
  const depRows = Object.entries(byDep)
    .map(([k, l]) => ({ k, n: pmDepN(k) || 'Sin dependencia asignada', c: pmCounts(l), i: pmIndic(l, hoy) }))
    .sort(
      (a, b) => b.c.vencida - a.c.vencida || (a.i.cpm == null ? 1 : a.i.cpm) - (b.i.cpm == null ? 1 : b.i.cpm)
    );
  const ctls = [
    ['', 'Todas'],
    ['CGSC', 'Contraloría de Cali'],
    ['CGR', 'Contraloría General de la República']
  ];
  c.innerHTML = `
  <div class="card pm-hero">
    <div>
      <h2>Planes de mejoramiento</h2>
      <div class="sub">Formulación, avance y cumplimiento frente a la Contraloría General de Santiago de Cali (formato PM_01) y la Contraloría General de la República (Formularios 14 y 14.1).</div>
    </div>
    ${pmCanEdit() ? `<div class="pm-hero-b"><button class="btn primary" data-act="pmImport"><i class="fa-solid fa-file-import"></i> Importar Excel</button><button class="btn" data-act="pmNewPlan"><i class="fa-solid fa-plus"></i> Nuevo plan</button>${PM.v20 ? '<button class="btn" data-act="pmPapelera"><i class="fa-solid fa-trash-can-arrow-up"></i> Papelera</button>' : ''}</div>` : ''}
  </div>
  <div class="grid g-kpi" style="margin-bottom:14px">
    <div class="card kpi"><small>Planes</small><b>${nf(planes.length)}</b></div>
    <div class="card kpi"><small>Acciones</small><b>${nf(cn.n)}</b></div>
    <div class="card kpi g"><small>Cumplidas</small><b>${nf(cn.cumplida)}</b></div>
    <div class="card kpi r"><small>Vencidas sin cumplir</small><b>${nf(cn.vencida)}</b></div>
    <div class="card kpi y"><small>Vencen en ${PM_ALERTA_DIAS} días</small><b>${nf(cn.proxima)}</b></div>
    <div class="card kpi"><small>Avances por validar</small><b>${nf(porVal)}</b></div>
  </div>
  <div class="card" style="margin-bottom:14px">
    <div class="pm-ind">
      ${pmMeter('Cumplimiento de metas vencidas', ind.cpm, 'var(--sem-v)', ind.cpm == null ? 'Aún no hay metas vencidas a la fecha' : 'Σ PLAVI / Σ PAAVI · metodología Formulario 14.1 CGR')}
      ${pmMeter('Avance general de los planes', ind.ap, 'var(--neo, #4c8dff)', 'Σ PLAI / Σ plazo en semanas')}
    </div>
  </div>
  <div class="toolbar pm-filtros">
    <div class="seg">${ctls.map(([k, l]) => `<button data-act="pmCtl" data-k="${k}" class="${f.ctl === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <input id="pmQ" type="search" placeholder="Buscar plan, informe o contraloría" value="${esc(f.q)}" style="max-width:320px">
  </div>
  <div class="pm-plans">
    ${
      planes.length
        ? planes
            .map(p => {
              const l = PM.acc.filter(a => a.plan_id === p.id),
                k = pmCounts(l),
                i = pmIndic(l, hoy),
                nh = PM.hall.filter(h => h.plan_id === p.id).length,
                pv = PM.av.filter(v => v.plan_id === p.id && v.estado === 'reportado').length;
              return `<article class="card pm-plan" data-act="pmOpen" data-id="${esc(p.id)}" tabindex="0">
          <div class="pm-plan-h">${pmCtl(p)}<span class="pill ${p.estado === 'cerrado' ? 'verde' : 'neutral'}">${esc(PM_EST[p.estado] || p.estado)}</span></div>
          <h3>${esc(p.ejercicio)}</h3>
          <div class="sub">Suscrito el ${fmtD(p.fecha_suscripcion)} · ${nf(nh)} hallazgo${nh === 1 ? '' : 's'} · ${nf(l.length)} acci${l.length === 1 ? 'ón' : 'ones'}</div>
          ${pmMeter('Cumplimiento', i.cpm, 'var(--sem-v)')}${pmMeter('Avance', i.ap, 'var(--neo, #4c8dff)')}
          <div class="pm-chips">
            ${k.vencida ? `<span class="pm-chip r">${k.vencida} vencida${k.vencida === 1 ? '' : 's'}</span>` : ''}
            ${k.proxima ? `<span class="pm-chip y">${k.proxima} por vencer</span>` : ''}
            ${pv ? `<span class="pm-chip b">${pv} por validar</span>` : ''}
            ${k.cumplida ? `<span class="pm-chip g">${k.cumplida} cumplida${k.cumplida === 1 ? '' : 's'}</span>` : ''}
            ${k.sinDep ? `<span class="pm-chip">${k.sinDep} sin dependencia</span>` : ''}
          </div>
        </article>`;
            })
            .join('')
        : `<div class="card"><div class="empty"><i class="fa-solid fa-clipboard-list"></i>${PM.planes.length ? 'Ningún plan coincide con el filtro.' : pmCanEdit() ? 'Aún no hay planes de mejoramiento. Importa el Excel del plan (PM_01 o Formulario 14) o créalo con «Nuevo plan».' : 'Aún no hay planes de mejoramiento registrados.'}</div></div>`
    }
  </div>
  <div class="grid g-2 pm-g2" style="margin-top:14px">
    ${pmInformesHomeHtml()}
    <div class="card"><h3>Acciones que requieren atención</h3><div class="sub">Vencidas sin cumplir y las que vencen en los próximos ${PM_ALERTA_DIAS} días</div>
      ${
        crit.length
          ? `<div class="tbl-wrap"><table class="tbl" style="min-width:560px"><thead><tr><th>Acción</th><th>Dependencia</th><th>Termina</th><th>Avance</th><th></th></tr></thead><tbody>
          ${crit
            .slice(0, 15)
            .map(a => {
              const e = pmEstado(a);
              return `<tr class="click" data-act="pmOpenAcc" data-id="${esc(a.id)}"><td class="asunto">${esc(shortTxt(a.accion, 90))}</td><td>${esc(shortOrg(pmDepN(a.dependencia_id)) || '—')}</td><td style="white-space:nowrap">${fmtD(a.fecha_fin)}</td><td class="mono">${pmPctTxt(pmPct(a))}</td><td><span class="pill ${e.pill}">${e.txt}</span></td></tr>`;
            })
            .join(
              ''
            )}</tbody></table></div>${crit.length > 15 ? `<div class="muted" style="font-size:.76rem;margin-top:8px">Se muestran 15 de ${crit.length}.</div>` : ''}`
          : '<div class="empty"><i class="fa-solid fa-circle-check"></i>No hay acciones vencidas ni por vencer</div>'
      }
    </div>
    <div class="card"><h3>Cumplimiento por dependencia</h3><div class="sub">Acciones asignadas, vencidas sin cumplir y cumplimiento de metas vencidas</div>
      ${
        depRows.length
          ? depRows
              .map(
                r => `<div class="list-row pm-deprow"><div style="flex:1;min-width:0"><b>${esc(shortOrg(r.n) || r.n)}</b><div class="muted" style="font-size:.76rem">${r.c.n} acciones · ${r.c.cumplida} cumplidas${r.c.vencida ? ` · <span style="color:var(--redink)">${r.c.vencida} vencidas</span>` : ''}</div>
              <div class="bar" style="margin-top:6px"><span style="width:${r.i.cpm == null ? 0 : Math.round(r.i.cpm * 100)}%;background:${r.i.cpm == null ? 'transparent' : r.i.cpm >= 0.8 ? 'var(--sem-v)' : r.i.cpm >= 0.5 ? 'var(--sem-a)' : 'var(--sem-r)'}"></span></div></div>
              <div class="pm-deprow-r"><b class="mono">${pmPctTxt(r.i.cpm)}</b>${r.k !== 'sin' && canNotify() && (r.c.vencida || r.c.proxima) ? `<button class="btn sm" data-act="pmNotify" data-dep="${esc(r.k)}"><i class="fa-solid fa-paper-plane"></i> Notificar</button>` : ''}</div></div>`
              )
              .join('')
          : '<div class="empty"><i class="fa-solid fa-sitemap"></i>Sin acciones registradas</div>'
      }
    </div>
  </div>`;
  const qi = $('#pmQ');
  if (qi)
    qi.addEventListener('input', e => {
      PM.f.q = e.target.value;
      clearTimeout(PM.__t);
      PM.__t = setTimeout(() => {
        render();
        const n = $('#pmQ');
        if (n) {
          n.focus();
          n.setSelectionRange(n.value.length, n.value.length);
        }
      }, 250);
    });
}

/* =====================================================================
   CALIFICACIÓN DE LA CONTRALORÍA GENERAL DE SANTIAGO DE CALI (formato PM_01 / papel de trabajo PT 03-PF)
   Cada acción recibe 0, 1 o 2 en cumplimiento y en efectividad. Fórmulas del propio formato:
     Cumplimiento del plan = promedio(cumplimiento) × 100 / 2      (celda L9)
     Efectividad del plan  = promedio(efectividad) × 100 / 2       (celda M9)
     Calificación          = cumplimiento × 0,2 + efectividad × 0,8 (celda L8)
   Solo promedian las acciones calificadas (como AVERAGE en Excel). El cumplimiento se sugiere con los
   avances validados; la efectividad (¿la acción eliminó la causa?) la califica Control Interno.
   ===================================================================== */
const PM_CGSC_UMBRAL = 80;
const PM_CAL_TXT = { 0: 'No cumple', 1: 'Cumple parcialmente', 2: 'Cumple' };
function pmCumpSug(a, fev) {
  const av = pmAvAl(a, fev);
  const pct = av ? pmPct(a, av.cantidad) : 0;
  if (pct >= 1) return 2;
  if (a.fecha_fin && a.fecha_fin <= fev) return 0;
  return null; /* en término y sin terminar: todavía no se califica */
}
function pmCalAcc(a, fev) {
  const sug = pmCumpSug(a, fev);
  const c = a.cal_cumplimiento != null ? a.cal_cumplimiento : sug;
  const e = a.cal_efectividad != null ? a.cal_efectividad : null;
  return { c, e, sug, manual: a.cal_cumplimiento != null, estado: c === 2 && e === 2 ? 'C' : 'A' };
}
function pmCalCgsc(acc, fev) {
  const cs = [],
    es = [];
  let sinEf = 0;
  acc.forEach(a => {
    const r = pmCalAcc(a, fev);
    if (r.c != null) cs.push(r.c);
    if (r.e != null) es.push(r.e);
    else if (r.c != null) sinEf++;
  });
  const prom = l => (l.length ? (l.reduce((t, x) => t + x, 0) / l.length) * 50 : 0);
  const C = prom(cs),
    E = prom(es),
    T = C * 0.2 + E * 0.8;
  return {
    C,
    E,
    T,
    nC: cs.length,
    nE: es.length,
    sinEf,
    n: acc.length,
    concepto: cs.length ? (T >= PM_CGSC_UMBRAL ? 'Cumple' : 'No cumple') : null
  };
}
const pmPts = x =>
  (Math.round(x * 10) / 10).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function pmCgscHtml(p, acc, fev) {
  if (p.formato !== 'PM_01_CGSC' || !PM.v19) return '';
  const k = pmCalCgsc(acc, fev);
  const pill = k.concepto
    ? `<span class="pill ${k.concepto === 'Cumple' ? 'verde' : 'rojo'}">${k.concepto}</span>`
    : '<span class="pill neutral">Sin acciones para calificar</span>';
  return `<div class="pm-cgsc">
    <div class="pm-cgsc-h"><b>Calificación según la metodología de la CGSC</b><span class="muted">Formato PM_01 · cumplimiento 20 % + efectividad 80 % · al ${fmtD(fev)}</span></div>
    <div class="pm-cgsc-g">
      <div><small>Cumplimiento (20 %)</small><b class="mono">${pmPts(k.C)}</b><span class="muted">${k.nC} de ${k.n} acciones calificadas</span></div>
      <div><small>Efectividad (80 %)</small><b class="mono">${pmPts(k.E)}</b><span class="muted">${k.nE} calificadas${k.sinEf ? ` · <b style="color:var(--amberink,#b7791f)">${k.sinEf} por calificar</b>` : ''}</span></div>
      <div><small>Calificación total</small><b class="mono">${pmPts(k.T)}</b><span class="muted">de 100 puntos</span></div>
      <div><small>Concepto</small>${pill}<span class="muted">Cumple desde ${PM_CGSC_UMBRAL} puntos</span></div>
    </div>
    <div class="hint">El cumplimiento se sugiere con los avances validados (2 = meta cumplida; 1 = vencida con avance parcial; 0 = vencida sin avance). La efectividad la califica Control Interno: ¿la acción eliminó la causa del hallazgo?</div>
  </div>`;
}
function pmCalModal(a) {
  const fev = PM.eval || pmHoy();
  const r = pmCalAcc(a, fev);
  const pl = pmPlanOf(a.plan_id);
  const ri = pmResInfo(pl) || PM_RES['24.003'];
  const escala = ri.escala;
  const opt = (v, cur, txt) =>
    `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${txt}</option>`;
  openModal({
    title: 'Calificar acción · metodología CGSC',
    body: `<div class="muted" style="margin-bottom:10px">${esc(shortTxt(a.accion, 160))}</div>
      <div class="row2">
        ${pmF('pmCalC', 'Cumplimiento (20 %)', `<select id="pmCalC">${opt('', a.cal_cumplimiento == null ? '' : 'x', 'Automático' + (r.sug != null ? ` (sugerido: ${r.sug} · ${PM_CAL_TXT[r.sug]})` : ' (aún en término)'))}${escala.map(v => opt(v, a.cal_cumplimiento, v + ' · ' + PM_CAL_TXT[v])).join('')}</select>`, 'Se cumplió la meta en el plazo')}
        ${pmF('pmCalE', 'Efectividad (80 %)', `<select id="pmCalE">${opt('', a.cal_efectividad == null ? '' : 'x', 'Sin calificar')}${escala.map(v => opt(v, a.cal_efectividad, v + ' · ' + PM_CAL_TXT[v])).join('')}</select>`, 'La acción eliminó la causa del hallazgo')}
      </div>
      <div class="pm-note b" style="margin-top:4px">${esc(ri.nombre)}, artículo 12: ${
        escala.length === 2
          ? 'cada acción se califica con dos (2) si cumple o cero (0) si no cumple.'
          : 'cero (0) no cumple, uno (1) cumple parcialmente y dos (2) sí cumple. El uno (1) solo aplica a acciones a las que se les fijaron metas parciales.'
      }</div>
      <div class="hint">El estado de la acción queda «Cerrada (C)» cuando cumplimiento y efectividad son 2; si no, «Abierta (A)», como en el formato de la Contraloría.</div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmSaveCal" data-id="${esc(a.id)}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>`
  });
}
async function pmSaveCal(id) {
  const v = x => (x === '' ? null : +x);
  try {
    await pmSave(
      'acc',
      { cal_cumplimiento: v($('#pmCalC').value), cal_efectividad: v($('#pmCalE').value) },
      id
    );
    closeModal();
    toast('Calificación guardada');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* =====================================================================
   REVISIÓN DE CONTROL INTERNO A LA FORMULACIÓN
   Control Interno deja una observación en la acción; queda «pendiente» hasta que se ajusta la acción
   y se marca «atendida». El plan solo se aprueba y suscribe sin observaciones pendientes.
   ===================================================================== */
function pmObsModal(a) {
  openModal({
    title: 'Observación de Control Interno',
    body: `<div class="muted" style="margin-bottom:10px">${esc(shortTxt(a.accion, 160))}</div>
      ${pmF('pmObsT', 'Observación a la formulación *', pmTa('pmObsT', a.obs_ci, 4), 'Por ejemplo: ajustar la redacción, la meta no es medible, el plazo supera seis meses')}`,
    footer: `${a.obs_ci ? `<button class="btn" data-act="pmObsQuitar" data-id="${esc(a.id)}" style="margin-right:auto"><i class="fa-solid fa-eraser"></i> Quitar</button>` : ''}<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmObsGuardar" data-id="${esc(a.id)}"><i class="fa-solid fa-floppy-disk"></i> Guardar como pendiente</button>`
  });
}
async function pmObsGuardar(id, modo) {
  const o =
    modo === 'quitar'
      ? { obs_ci: '', obs_ci_estado: '', obs_ci_at: null }
      : modo === 'atendida'
        ? { obs_ci_estado: 'atendida', obs_ci_at: new Date().toISOString() }
        : { obs_ci: pmVal('pmObsT'), obs_ci_estado: 'pendiente', obs_ci_at: new Date().toISOString() };
  if (!modo && o.obs_ci.length < 4) return toast('Escriba la observación', 'err');
  try {
    await pmSave('acc', o, id);
    closeModal();
    toast(
      modo === 'atendida'
        ? 'Observación marcada como atendida'
        : modo === 'quitar'
          ? 'Observación quitada'
          : 'Observación registrada'
    );
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* =====================================================================
   VALIDACIONES DE FORMULACIÓN (lo que hace que la contraloría devuelva un plan)
   ===================================================================== */
function pmAccIssues(a, p) {
  const out = [];
  const acc = pmTxt(a.accion);
  const primera = pmKey(acc.split(/\s+/)[0] || '');
  if (acc && !/(ar|er|ir)$/.test(primera))
    out.push('La acción debería empezar con un verbo en infinitivo (implementar, elaborar, realizar…).');
  const meta = pmTxt(a.meta) + ' ' + (a.cantidad != null ? a.cantidad : '');
  if (!/\d|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|total/i.test(meta))
    out.push('La meta no es medible: incluya una cantidad o un porcentaje.');
  if (!pmTxt(a.fuente_verificacion))
    out.push('Falta la fuente de verificación (la evidencia que se entregará).');
  /* art. 5: 24.043 → seis (6) meses; 24.003 → un (1) año. Una prórroga concedida (art. 16) no cuenta. */
  const ri = pmResInfo(p);
  const max = ri && ri.plazoMeses;
  const base = (p && p.fecha_suscripcion) || a.fecha_inicio;
  const fin = a.fecha_fin_original || a.fecha_fin;
  if (max && base && fin && fin > pmMasMeses(base, max))
    out.push(
      `La fecha de terminación supera ${ri.plazoTxt} desde la suscripción (${ri.corta}; vence ${fmtD(fin)}).`
    );
  return out;
}

/* =====================================================================
   OFICIO DE LA CONTRALORÍA QUE REMITIÓ EL INFORME
   ===================================================================== */
function pmReqDe(p) {
  return p && p.requerimiento_id
    ? (S.reqs || []).find(r => String(r.id) === String(p.requerimiento_id))
    : null;
}
/* Sugiere el oficio por el número de la denuncia o actuación ("896-2025") y el número del informe */
function pmReqSugerido(p) {
  /* número de la actuación con su año, escrito de cualquiera de estas formas:
     "Denuncia Fiscal No. 896-2025", "DENUNCIA FISCAL Nº 896, VIGENCIA 2025", "896 de 2025" */
  const t = pmTxt(p.ejercicio) + ' ' + pmTxt(p.numero_informe) + ' ' + pmTxt(p.vigencia_pvcft);
  const anos = [...new Set(t.match(/\b20\d{2}\b/g) || [])];
  const nums = [...new Set((t.match(/\b\d{2,5}\b/g) || []).filter(n => !/^20\d{2}$/.test(n)))];
  const claves = [];
  /* pmKey quita los signos: "896-2025" y "896 de 2025" quedan como "8962025" y "896de2025" */
  nums.forEach(n => anos.forEach(a => claves.push(n + a, n + 'de' + a)));
  if (!claves.length) return null;
  const norm = x => ' ' + pmKey(x).replace(/\s+/g, '') + ' ';
  const cands = (S.reqs || []).filter(r => {
    if (!/informe final|plan de mejoramiento/i.test(r.asunto || '')) return false;
    const a = norm(r.asunto);
    return claves.some(k => a.includes(k));
  });
  return cands.sort((x, y) => (x.estado === 'abierto' ? 0 : 1) - (y.estado === 'abierto' ? 0 : 1))[0] || null;
}
function pmReqHtml(p) {
  if (!PM.v19) return '';
  const r = pmReqDe(p);
  if (!r) {
    const sug = pmCanEdit() ? pmReqSugerido(p) : null;
    return sug
      ? `<div class="pm-note b" style="margin-top:10px"><i class="fa-solid fa-link"></i> Posible oficio de remisión: <span class="mono">${esc(sug.radicado)}</span> · ${esc(shortTxt(sug.asunto, 90))}. <button class="btn sm" data-act="pmEnlazarReq" data-id="${esc(sug.id)}">Enlazar</button></div>`
      : '';
  }
  return `<div class="pm-req"><i class="fa-solid fa-envelope-open-text"></i><div><small>Oficio de remisión del informe</small><span><span class="mono">${esc(r.radicado)}</span> · ${esc(shortTxt(r.asunto, 90))}</span></div>${pill(r.estado === 'cerrado' ? 'verde' : r.sem)}<span class="muted">${r.estado === 'cerrado' ? 'Respondido' + (r.orfeo_salida ? ' con ' + esc(r.orfeo_salida) : '') : 'Límite ' + fmtD(r.fecha_limite) + ' · ' + diasTxt(r.dias)}</span><button class="btn sm" data-act="detail" data-id="${esc(r.id)}">Ver</button></div>`;
}
async function pmEnlazarReq(reqId) {
  const p = PM.planes.find(x => x.id === PM.plan);
  if (!p) return;
  try {
    await pmSave('plan', { requerimiento_id: reqId }, p.id);
    toast('Oficio enlazado al plan');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}

/* =====================================================================
   APROBAR Y SUSCRIBIR (plan en formulación → en ejecución)
   ===================================================================== */
function pmAprobarModal(p) {
  const hall = PM.hall.filter(h => h.plan_id === p.id),
    acc = PM.acc.filter(a => a.plan_id === p.id);
  const sinAcc = hall.filter(h => !acc.some(a => a.hallazgo_id === h.id));
  const pend = acc.filter(a => a.obs_ci_estado === 'pendiente');
  const avisos = acc
    .map(a => [a, pmAccIssues(a, { ...p, fecha_suscripcion: p.fecha_suscripcion })])
    .filter(x => x[1].length);
  const bloqueos = [];
  if (!acc.length) bloqueos.push('El plan no tiene acciones.');
  if (sinAcc.length) bloqueos.push(`Hallazgos sin acciones: ${sinAcc.map(h => h.numero).join(', ')}.`);
  if (pend.length) bloqueos.push(`${pend.length} observación(es) de Control Interno pendientes.`);
  const r = pmReqDe(p);
  openModal({
    title: 'Aprobar y suscribir el plan',
    body: `${bloqueos.length ? `<div class="pm-note r"><b>Antes de aprobar:</b><br>${bloqueos.map(esc).join('<br>')}</div>` : '<div class="pm-note g"><i class="fa-solid fa-circle-check"></i> Todos los hallazgos tienen acciones y no hay observaciones pendientes.</div>'}
      ${avisos.length ? `<div class="pm-note y" style="margin-top:8px"><b>Revise también (no impide aprobar):</b><br>${avisos.map(([a, l]) => `• ${esc(shortTxt(a.accion, 70))}: ${l.map(esc).join(' ')}`).join('<br>')}</div>` : ''}
      <div class="row2" style="margin-top:12px">
        ${pmF('pmApFs', 'Fecha de suscripción *', pmIn('pmApFs', pmHoy(), 'type="date"'))}
        ${pmF('pmApOrf', 'Radicado ORFEO con el que se envió el plan', pmIn('pmApOrf', p.radicado_orfeo, 'inputmode="numeric"'))}
      </div>
      ${r && r.estado === 'abierto' ? `<div class="hint">Al aprobar podrá registrar la respuesta del oficio <span class="mono">${esc(r.radicado)}</span> con este radicado.</div>` : ''}`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmAprobar" data-id="${esc(p.id)}"${bloqueos.length ? ' disabled' : ''}><i class="fa-solid fa-file-signature"></i> Aprobar y suscribir</button>`
  });
}
async function pmAprobar(id) {
  const p = PM.planes.find(x => x.id === id);
  const fs = pmVal('pmApFs'),
    orf = pmVal('pmApOrf').replace(/\D/g, '');
  if (!pmFecha(fs)) return toast('Indique la fecha de suscripción', 'err');
  try {
    await pmSave(
      'plan',
      { estado: 'en_ejecucion', fecha_suscripcion: fs, radicado_orfeo: orf || p.radicado_orfeo || '' },
      id
    );
    closeModal();
    toast('Plan aprobado y suscrito: queda en ejecución');
    await pmRefresh();
    const r = pmReqDe(PM.planes.find(x => x.id === id));
    if (
      r &&
      r.estado === 'abierto' &&
      canClose() &&
      confirm(`¿Registrar ahora la respuesta del oficio ${r.radicado} con el radicado del plan?`)
    ) {
      S.preselect = r.id;
      S.preselectOrfeo = orf;
      S.preselectFecha = fs;
      go('carga');
    }
  } catch (e) {
    toast(e.message, 'err');
  }
}

function pmCalLinea(a) {
  const p = PM.planes.find(x => x.id === a.plan_id);
  if (!p || p.formato !== 'PM_01_CGSC' || !PM.v19 || p.estado === 'formulacion') return '';
  const r = pmCalAcc(a, PM.eval || pmHoy());
  if (r.c == null && r.e == null) return '';
  return `<div class="pm-a-l pm-cal"><i class="fa-solid fa-scale-balanced"></i> CGSC · Cumplimiento <b>${r.c == null ? '—' : r.c}</b>${r.c != null && !r.manual ? ' <span class="muted">(sugerido)</span>' : ''} · Efectividad <b>${r.e == null ? '—' : r.e}</b> · Estado <b>${r.estado === 'C' ? 'Cerrada (C)' : 'Abierta (A)'}</b></div>`;
}
function pmAccRow(a, opts) {
  const e = pmEstado(a),
    p = pmPct(a),
    pend = pmPend(a),
    u = pmUltimo(a),
    h = pmHallOf(a.hallazgo_id);
  const dev = u && u.estado === 'devuelto' && !pend;
  const btns = [];
  if (pmCanReport(a) && !pend && (e.k !== 'cumplida' || pmCanEdit()))
    btns.push(
      `<button class="btn sm primary" data-act="pmReport" data-id="${esc(a.id)}"><i class="fa-solid fa-chart-line"></i> Reportar avance</button>`
    );
  if (pend && pmCanEdit())
    btns.push(
      `<button class="btn sm primary" data-act="pmReview" data-id="${esc(pend.id)}"><i class="fa-solid fa-clipboard-check"></i> Revisar avance</button>`
    );
  btns.push(
    `<button class="btn sm" data-act="pmHist" data-id="${esc(a.id)}"><i class="fa-solid fa-clock-rotate-left"></i> Historial</button>`
  );
  const plA = PM.planes.find(x => x.id === a.plan_id) || {};
  if (pmPuedeProrrogar(a))
    btns.push(
      `<button class="btn sm" data-act="pmProrAccion" data-id="${esc(a.id)}"><i class="fa-solid fa-calendar-plus"></i> Prórroga</button>`
    );
  if (pmCanEdit() && PM.v19 && plA.formato === 'PM_01_CGSC' && plA.estado !== 'formulacion')
    btns.push(
      `<button class="btn sm" data-act="pmCal" data-id="${esc(a.id)}"><i class="fa-solid fa-scale-balanced"></i> Calificar</button>`
    );
  if (pmCanEdit() && PM.v19 && !a.obs_ci && !(opts && opts.noEdit))
    btns.push(
      `<button class="icon-btn" data-act="pmObs" data-id="${esc(a.id)}" title="Observación de Control Interno" aria-label="Observación de Control Interno"><i class="fa-solid fa-user-shield"></i></button>`
    );
  if (pmCanEdit() && !(opts && opts.noEdit)) {
    btns.push(
      `<button class="icon-btn" data-act="pmEditAcc" data-id="${esc(a.id)}" title="Editar acción" aria-label="Editar acción"><i class="fa-solid fa-pen"></i></button>`
    );
    btns.push(
      `<button class="icon-btn" data-act="pmDelAcc" data-id="${esc(a.id)}" title="Eliminar acción" aria-label="Eliminar acción"><i class="fa-solid fa-trash"></i></button>`
    );
  }
  return `<div class="pm-a s-${e.k}" id="pmA-${esc(a.id)}">
    <div class="pm-a-main">
      ${opts && opts.ctx && h ? `<div class="pm-a-ctx">Hallazgo ${esc(h.numero)} · ${esc(shortTxt(h.descripcion, 110))}</div>` : ''}
      <b class="pm-a-t">${esc(a.accion)}</b>
      ${a.actividad && a.actividad !== a.accion ? `<div class="pm-a-l">Actividad: ${esc(a.actividad)}</div>` : ''}
      <div class="pm-a-l">Meta: ${esc(pmMetaTxt(a))}</div>
      <div class="pm-a-l"><i class="fa-solid fa-building-columns"></i> ${a.dependencia_id ? esc(pmDepN(a.dependencia_id)) : '<span style="color:var(--redink)">Sin dependencia asignada</span>'}${a.responsable ? ' · ' + esc(a.responsable) : ''}</div>
      ${a.fuente_verificacion ? `<div class="pm-a-l">Verificación: ${esc(a.fuente_verificacion)}${a.lugar_verificacion ? ' · ' + esc(a.lugar_verificacion) : ''}</div>` : ''}
      ${a.obs_ci ? `<div class="pm-note ${a.obs_ci_estado === 'atendida' ? 'g' : 'y'}"><i class="fa-solid fa-user-shield"></i> <b>Control Interno${a.obs_ci_estado === 'atendida' ? ' (atendida)' : ' (pendiente)'}:</b> ${esc(a.obs_ci)}${pmCanEdit() && a.obs_ci_estado === 'pendiente' ? ` <button class="btn sm" data-act="pmObsAtendida" data-id="${esc(a.id)}">Marcar atendida</button>` : ''}</div>` : ''}
      ${pmCalLinea(a)}
      ${PM.v20 ? pmProrLinea(a) : ''}
      ${pend ? `<div class="pm-note b"><i class="fa-solid fa-hourglass-half"></i> Avance de ${pmPctTxt(pmPct(a, pend.cantidad))} reportado el ${fmtTs(pend.created_at)}, pendiente de validación.</div>` : ''}
      ${dev ? `<div class="pm-note r"><i class="fa-solid fa-rotate-left"></i> Avance devuelto: ${esc(u.observacion || '')}</div>` : ''}
    </div>
    <div class="pm-a-side">
      <span class="pill ${e.pill}">${e.k === 'vencida' ? `Vencida hace ${-e.d} d` : e.txt}</span>
      <div class="pm-a-f">Inicio ${fmtD(a.fecha_inicio)} · Fin <b>${fmtD(a.fecha_fin)}</b></div>
      <div class="pm-a-p"><div class="bar"><span style="width:${Math.round(p * 100)}%;background:${p >= 1 ? 'var(--sem-v)' : e.k === 'vencida' ? 'var(--sem-r)' : 'var(--neo, #4c8dff)'}"></span></div><b class="mono">${pmPctTxt(p)}</b></div>
      <div class="pm-a-f">${a.fecha_corte ? 'Validado con corte ' + fmtD(a.fecha_corte) : 'Sin avance validado'}</div>
      <div class="pm-a-b">${btns.join('')}</div>
    </div>
  </div>`;
}

function pmDepView(c) {
  const acc = PM.acc.slice().sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)));
  const cn = pmCounts(acc),
    ind = pmIndic(acc, pmHoy());
  const dep = pmDepN(pmMyDep());
  if (!pmMyDep()) {
    c.innerHTML =
      '<div class="card"><div class="empty"><i class="fa-solid fa-circle-info"></i>Tu cuenta aún no tiene dependencia asignada. Pide al Super administrador que la asigne.</div></div>';
    return;
  }
  const byPlan = {};
  acc.forEach(a => (byPlan[a.plan_id] = byPlan[a.plan_id] || []).push(a));
  c.innerHTML = `
  <div class="card pm-hero"><div><h2>Mis acciones de mejora</h2><div class="sub">${esc(dep)} · acciones asignadas en los planes de mejoramiento suscritos con las contralorías. Reporta el avance con su soporte antes de la fecha de terminación.</div></div></div>
  <div class="grid g-kpi" style="margin-bottom:14px">
    <div class="card kpi"><small>Asignadas</small><b>${nf(cn.n)}</b></div>
    <div class="card kpi g"><small>Cumplidas</small><b>${nf(cn.cumplida)}</b></div>
    <div class="card kpi r"><small>Vencidas sin cumplir</small><b>${nf(cn.vencida)}</b></div>
    <div class="card kpi y"><small>Vencen en ${PM_ALERTA_DIAS} días</small><b>${nf(cn.proxima)}</b></div>
    <div class="card kpi"><small>En validación</small><b>${nf(cn.pend)}</b></div>
    <div class="card kpi r"><small>Devueltas para corregir</small><b>${nf(cn.dev)}</b></div>
  </div>
  <div class="card" style="margin-bottom:14px"><div class="pm-ind">${pmMeter('Cumplimiento de mis metas vencidas', ind.cpm, 'var(--sem-v)', ind.cpm == null ? 'Aún no hay metas vencidas' : '')}${pmMeter('Avance de mis acciones', ind.ap, 'var(--neo, #4c8dff)')}</div></div>
  ${
    acc.length
      ? Object.entries(byPlan)
          .map(([pid, l]) => {
            const p = pmPlanOf(pid) || {};
            return `<section class="card" style="margin-bottom:14px"><div class="pm-plan-h">${p.formato ? pmCtl(p) : ''}<span class="muted" style="font-size:.78rem">Suscrito el ${fmtD(p.fecha_suscripcion)}</span></div><h3 style="margin:6px 0 10px">${esc(p.ejercicio || 'Plan de mejoramiento')}</h3><div class="pm-acts">${l.map(a => pmAccRow(a, { ctx: true })).join('')}</div></section>`;
          })
          .join('')
      : '<div class="card"><div class="empty"><i class="fa-solid fa-champagne-glasses"></i>Tu dependencia no tiene acciones asignadas en planes de mejoramiento.</div></div>'
  }`;
}

function pmPlanView(c, p) {
  if (!PM.eval) PM.eval = pmHoy();
  const fev = PM.eval;
  const hall = PM.hall
    .filter(h => h.plan_id === p.id)
    .sort(
      (a, b) =>
        (a.orden || 0) - (b.orden || 0) ||
        String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true })
    );
  const accAll = PM.acc.filter(a => a.plan_id === p.id);
  const ind = pmIndic(accAll, fev),
    cn = pmCounts(accAll);
  const pend = PM.av.filter(v => v.plan_id === p.id && v.estado === 'reportado');
  const issues = pmCalidad(p, hall, accAll);
  const fa = PM.fa,
    q = pmKey(fa.q);
  const accOk = a =>
    (!fa.est ||
      (fa.est === 'sindep'
        ? !a.dependencia_id
        : fa.est === 'pend'
          ? !!pmPend(a)
          : pmEstado(a).k === fa.est)) &&
    (!fa.dep || String(a.dependencia_id) === fa.dep) &&
    (!q || pmKey([a.accion, a.actividad, a.meta, a.responsable].join(' ')).includes(q));
  const deps = [...new Set(accAll.map(a => a.dependencia_id).filter(Boolean))]
    .map(id => ({ id, nombre: pmDepN(id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const info = [
    ['Contraloría', p.contraloria],
    ['Formato', (PM_FMT[p.formato] || PM_FMT.OTRO).nombre],
    ['Tipo de ejercicio', p.tipo_ejercicio],
    [p.formato === 'F14_CGR' ? 'Modalidad de auditoría' : '', p.formato === 'F14_CGR' ? p.modalidad : ''],
    ['Fecha de suscripción', fmtD(p.fecha_suscripcion)],
    [
      p.formato === 'F14_CGR' ? 'Periodo fiscal' : 'Vigencia PVCFT',
      p.formato === 'F14_CGR' ? p.periodo_auditado : p.vigencia_pvcft
    ],
    ['Informe', p.numero_informe + (p.fecha_informe ? ' · ' + fmtD(p.fecha_informe) : '')],
    ['Radicado ORFEO', p.radicado_orfeo],
    ['Representante legal', p.representante_legal]
  ].filter(x => x[0] && x[1] && String(x[1]).trim() && x[1] !== '—');
  const tabs = [
    ['acciones', 'Hallazgos y acciones', accAll.length],
    ['validar', 'Por validar', pend.length],
    ['calidad', 'Calidad de datos', issues.length],
    ['historial', 'Historial de avances', PM.av.filter(v => v.plan_id === p.id).length]
  ];
  if (!pmScoped())
    tabs.push([
      'documentos',
      'Documentos',
      (PM.docs || []).filter(d => d.plan_id === p.id && !d.eliminado_at).length
    ]);
  let body = '';
  if (PM.tab === 'validar') body = pmTabValidar(pend);
  else if (PM.tab === 'calidad') body = pmTabCalidad(issues);
  else if (PM.tab === 'historial') body = pmTabHistorial(p);
  else if (PM.tab === 'documentos') body = pmTabDocumentos(p);
  else
    body = `<div class="toolbar pm-filtros">
      <select id="pmFEst"><option value="">Todos los estados</option>${[
        ['vencida', 'Vencidas sin cumplir'],
        ['proxima', 'Vencen en ' + PM_ALERTA_DIAS + ' días'],
        ['termino', 'En término'],
        ['cumplida', 'Cumplidas'],
        ['pend', 'Con avance por validar'],
        ['sindep', 'Sin dependencia asignada']
      ]
        .map(([k, l]) => `<option value="${k}"${fa.est === k ? ' selected' : ''}>${l}</option>`)
        .join('')}</select>
      <select id="pmFDep"><option value="">Todas las dependencias</option>${deps.map(d => `<option value="${esc(d.id)}"${String(d.id) === fa.dep ? ' selected' : ''}>${esc(shortOrg(d.nombre))}</option>`).join('')}</select>
      <input id="pmFQ" type="search" placeholder="Buscar en acciones" value="${esc(fa.q)}" style="max-width:260px">
      ${pmCanEdit() ? '<button class="btn sm" data-act="pmNewHall"><i class="fa-solid fa-plus"></i> Agregar hallazgo</button>' : ''}
    </div>
    ${
      hall.length
        ? hall
            .map(h => {
              const all = accAll
                .filter(a => a.hallazgo_id === h.id)
                .sort((a, b) => (a.orden || 0) - (b.orden || 0));
              const l = all.filter(accOk);
              if ((fa.est || fa.dep || q) && !l.length) return '';
              const open = PM.abiertos[h.id];
              return `<section class="card pm-h">
            <header class="pm-h-h"><span class="pm-num">Hallazgo ${esc(h.numero)}</span>${pmConnChips(h)}${h.cuantia ? `<span class="pm-conn c-fiscal">$ ${pmNumTxt(h.cuantia)}</span>` : ''}
              <span style="flex:1"></span>
              ${pmCanEdit() ? `<button class="btn sm" data-act="pmNewAcc" data-id="${esc(h.id)}"><i class="fa-solid fa-plus"></i> Acción</button><button class="icon-btn" data-act="pmEditHall" data-id="${esc(h.id)}" title="Editar hallazgo" aria-label="Editar hallazgo"><i class="fa-solid fa-pen"></i></button><button class="icon-btn" data-act="pmDelHall" data-id="${esc(h.id)}" title="Eliminar hallazgo" aria-label="Eliminar hallazgo"><i class="fa-solid fa-trash"></i></button>` : ''}
            </header>
            <div class="pm-desc${open ? ' open' : ''}">${esc(h.descripcion)}${h.causa ? `<div style="margin-top:6px"><b>Causa:</b> ${esc(h.causa)}</div>` : ''}${h.efecto ? `<div style="margin-top:6px"><b>Efecto:</b> ${esc(h.efecto)}</div>` : ''}${h.macroproceso ? `<div style="margin-top:6px"><b>Macroproceso / criterio:</b> ${esc(h.macroproceso)}</div>` : ''}</div>
            ${String(h.descripcion).length > 260 || h.causa || h.efecto ? `<button class="pm-more" data-act="pmMore" data-id="${esc(h.id)}">${open ? 'Ver menos' : 'Ver descripción completa'}</button>` : ''}
            ${h.dependencia_id || h.dependencia_texto ? `<div class="muted" style="font-size:.78rem;margin-top:4px"><i class="fa-solid fa-building-columns"></i> ${esc((S.deps.find(d => d.id === h.dependencia_id) || {}).nombre || h.dependencia_texto)}</div>` : ''}
            ${pmTrasHtml(h)}
            <div class="pm-acts">${l.length ? l.map(a => pmAccRow(a)).join('') : `<div class="muted" style="font-size:.82rem;padding:8px 0">Este hallazgo aún no tiene acciones.${pmCanEdit() ? ` <button class="btn sm" data-act="pmNewAcc" data-id="${esc(h.id)}"><i class="fa-solid fa-lightbulb"></i> Formular con sugerencias</button>` : ''}</div>`}</div>
          </section>`;
            })
            .join('') ||
          '<div class="card"><div class="empty"><i class="fa-solid fa-filter"></i>Ninguna acción coincide con el filtro</div></div>'
        : `<div class="card"><div class="empty"><i class="fa-solid fa-clipboard-list"></i>El plan aún no tiene hallazgos.${pmCanEdit() ? ' Usa «Agregar hallazgo».' : ''}</div></div>`
    }`;
  c.innerHTML = `
  <div class="toolbar pm-top">
    <button class="btn sm" data-act="pmBack"><i class="fa-solid fa-arrow-left"></i> Planes</button>
    <span style="flex:1"></span>
    <button class="btn sm" data-act="pmExport"><i class="fa-solid fa-file-excel"></i> Exportar formato</button>
    ${pmCanEdit() && p.estado === 'formulacion' && PM.v19 ? `<button class="btn sm primary" data-act="pmAprobarPlan"><i class="fa-solid fa-file-signature"></i> Aprobar y suscribir</button>` : ''}
    ${pmCanEdit() ? `<button class="btn sm" data-act="pmEditPlan"><i class="fa-solid fa-pen"></i> Editar plan</button>` : ''}
    ${pmCanEdit() ? `<button class="btn sm danger" data-act="pmDelPlan"><i class="fa-solid fa-trash"></i> Eliminar</button>` : ''}
  </div>
  <div class="card pm-head">
    <div class="pm-plan-h">${pmCtl(p)}<span class="pill ${p.estado === 'cerrado' ? 'verde' : 'neutral'}">${esc(PM_EST[p.estado] || p.estado)}</span></div>
    <h2>${esc(p.ejercicio)}</h2>
    <div class="pm-info">${info.map(([k, v]) => `<div><small>${esc(k)}</small><span>${esc(v)}</span></div>`).join('')}</div>
    <div class="pm-ind" style="margin-top:14px">
      ${pmMeter('Cumplimiento (CPM)', ind.cpm, 'var(--sem-v)', ind.cpm == null ? 'Sin metas vencidas a la fecha de evaluación' : `Σ PLAVI ${pmNumTxt(ind.plavi)} / Σ PAAVI ${pmNumTxt(ind.pbec)}`)}
      ${pmMeter('Avance del plan (AP)', ind.ap, 'var(--neo, #4c8dff)', `Σ PLAI ${pmNumTxt(ind.plai)} / Σ plazo ${pmNumTxt(ind.pbea)} semanas`)}
      <div class="field pm-fev"><label>Fecha de evaluación</label><input type="date" id="pmEval" value="${esc(fev)}" max="2100-12-31"><div class="hint">Usa el último avance validado hasta esta fecha</div></div>
    </div>
    ${pmCgscHtml(p, accAll, fev)}
    ${PM.v20 && pmCanEdit() && pmRes(p) && pmAccionesBajo100(p).length ? `<div class="pm-note y" style="margin-top:8px"><i class="fa-solid fa-copy"></i> ${pmAccionesBajo100(p).length} acción(es) calificadas con menos de 100 puntos: requieren un nuevo plan (art. 12, par. 5). <button class="btn sm" data-act="pmNuevoPlan">Crear nuevo plan</button></div>` : ''}
    ${pmReqHtml(p)}
    ${pmNormaHtml(p)}
    <div class="pm-chips" style="margin-top:10px">
      <span class="pm-chip">${hall.length} hallazgos</span><span class="pm-chip">${cn.n} acciones</span>
      ${cn.cumplida ? `<span class="pm-chip g">${cn.cumplida} cumplidas</span>` : ''}${cn.vencida ? `<span class="pm-chip r">${cn.vencida} vencidas sin cumplir</span>` : ''}${cn.proxima ? `<span class="pm-chip y">${cn.proxima} vencen en ${PM_ALERTA_DIAS} días</span>` : ''}${pend.length ? `<span class="pm-chip b">${pend.length} por validar</span>` : ''}
    </div>
  </div>
  <div class="seg pm-tabs">${tabs.map(([k, l, n]) => `<button data-act="pmTab" data-tab="${k}" class="${PM.tab === k ? 'on' : ''}">${l}${n ? ` <span class="cnt">${n}</span>` : ''}</button>`).join('')}</div>
  <div class="pm-body">${body}</div>`;
  const ev = $('#pmEval');
  if (ev)
    ev.addEventListener('change', e => {
      if (pmFecha(e.target.value)) {
        PM.eval = e.target.value;
        render();
      }
    });
  [
    ['#pmFEst', 'est'],
    ['#pmFDep', 'dep']
  ].forEach(([s, k]) => {
    const el = $(s);
    if (el)
      el.addEventListener('change', e => {
        PM.fa[k] = e.target.value;
        render();
      });
  });
  const fq = $('#pmFQ');
  if (fq)
    fq.addEventListener('input', e => {
      PM.fa.q = e.target.value;
      clearTimeout(PM.__t);
      PM.__t = setTimeout(() => {
        render();
        const n = $('#pmFQ');
        if (n) {
          n.focus();
          n.setSelectionRange(n.value.length, n.value.length);
        }
      }, 250);
    });
}
function pmTabValidar(list) {
  if (!list.length)
    return '<div class="card"><div class="empty"><i class="fa-solid fa-circle-check"></i>No hay avances pendientes de validación</div></div>';
  return `<div class="card"><div class="tbl-wrap"><table class="tbl" style="min-width:760px"><thead><tr><th>Acción</th><th>Dependencia</th><th>Corte</th><th>Avance reportado</th><th>Soporte</th><th></th></tr></thead><tbody>
  ${list
    .map(v => {
      const a = pmAccOf(v.accion_id) || {};
      return `<tr><td class="asunto">${esc(shortTxt(a.accion, 80))}<div class="muted" style="font-size:.74rem">${esc(shortTxt(v.descripcion, 120))}</div></td><td>${esc(shortOrg(pmDepN(v.dependencia_id)) || '—')}</td><td>${fmtD(v.fecha_corte)}</td><td class="mono">${pmNumTxt(v.cantidad)} de ${pmNumTxt(a.cantidad)} · ${pmPctTxt(pmPct(a, v.cantidad))}</td><td>${pmSoporte(v)}</td><td><button class="btn sm primary" data-act="pmReview" data-id="${esc(v.id)}">Revisar</button></td></tr>`;
    })
    .join('')}</tbody></table></div></div>`;
}
function pmSoporte(v) {
  const s = [];
  if (v.soporte_path)
    s.push(
      S.demo || !sb
        ? `<span class="muted" title="${esc(v.soporte_hash || '')}"><i class="fa-solid fa-file-pdf"></i> ${esc(shortTxt(v.soporte_path, 26))}</span>`
        : `<button class="btn sm" data-act="openPdf" data-path="${esc(v.soporte_path)}"><i class="fa-solid fa-file-pdf"></i> PDF</button>`
    );
  if (v.radicado_orfeo)
    s.push(`<span class="mono" style="font-size:.78rem">ORFEO ${esc(v.radicado_orfeo)}</span>`);
  return s.join(' ') || '<span class="muted">—</span>';
}
function pmTabHistorial(p) {
  const l = PM.av
    .filter(v => v.plan_id === p.id)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!l.length)
    return '<div class="card"><div class="empty"><i class="fa-solid fa-inbox"></i>Aún no se han reportado avances</div></div>';
  return `<div class="card"><div class="tbl-wrap"><table class="tbl" style="min-width:820px"><thead><tr><th>Registrado</th><th>Acción</th><th>Corte</th><th>Avance</th><th>Estado</th><th>Revisión</th><th>Soporte</th></tr></thead><tbody>
  ${l
    .map(v => {
      const a = pmAccOf(v.accion_id) || {};
      return `<tr><td style="white-space:nowrap">${fmtTs(v.created_at)}<div class="muted" style="font-size:.72rem">${esc(v.reportado_email || '')}</div></td><td class="asunto">${esc(shortTxt(a.accion, 70))}<div class="muted" style="font-size:.74rem">${esc(shortTxt(v.descripcion, 110))}</div></td><td>${fmtD(v.fecha_corte)}</td><td class="mono">${pmPctTxt(pmPct(a, v.cantidad))}</td><td><span class="pill ${v.estado === 'validado' ? 'verde' : v.estado === 'devuelto' ? 'rojo' : 'amarillo'}">${PM_AV_EST[v.estado]}</span></td><td style="font-size:.78rem">${v.revisado_at ? fmtTs(v.revisado_at) + '<div class="muted">' + esc(v.revisado_email || '') + '</div>' : '—'}${v.observacion ? `<div class="muted">${esc(shortTxt(v.observacion, 90))}</div>` : ''}</td><td>${pmSoporte(v)}</td></tr>`;
    })
    .join('')}</tbody></table></div></div>`;
}
/* Revisión de calidad de datos del plan: todo lo que impide medir o exportar correctamente */
function pmCalidad(p, hall, acc) {
  const out = [];
  const add = (nivel, txt, act, id) => out.push({ nivel, txt, act, id });
  if (!p.fecha_suscripcion) add('r', 'El plan no tiene fecha de suscripción', 'pmEditPlan', p.id);
  if (p.formato === 'F14_CGR' && !p.nit)
    add('y', 'Falta el NIT de la entidad (lo exige el Formulario 14)', 'pmEditPlan', p.id);
  if (!p.representante_legal)
    add('y', 'Falta el nombre del representante legal para las firmas del formato', 'pmEditPlan', p.id);
  hall.forEach(h => {
    if (!acc.some(a => a.hallazgo_id === h.id))
      add('r', `El hallazgo ${h.numero} no tiene acciones`, 'pmNewAcc', h.id);
    PM.acc
      .filter(a => a.hallazgo_id === h.id)
      .forEach(a => {
        const l = pmAccIssues(a, p);
        if (l.length)
          add(
            'y',
            `Hallazgo ${h.numero}: ${l[0]}${l.length > 1 ? ` (y ${l.length - 1} más)` : ''}`,
            'pmEditAcc',
            a.id
          );
        if (a.obs_ci_estado === 'pendiente')
          add('y', `Hallazgo ${h.numero}: observación de Control Interno pendiente`, 'pmEditAcc', a.id);
      });
    if (PM.trasOk) {
      const sinTras = pmIncidencias(h).filter(
        c => !(PM.tras || []).some(t => t.hallazgo_id === h.id && t.tipo === c)
      );
      if (sinTras.length)
        add(
          'y',
          `El hallazgo ${h.numero} tiene incidencia ${sinTras.join(', ')} sin traslado registrado`,
          'pmNewTras',
          h.id
        );
    }
    if (!(h.connotaciones || []).length && p.formato === 'PM_01_CGSC')
      add('y', `El hallazgo ${h.numero} no tiene connotación`, 'pmEditHall', h.id);
  });
  acc.forEach(a => {
    const h = pmHallOf(a.hallazgo_id) || {},
      n = `Hallazgo ${h.numero || '?'} · «${shortTxt(a.accion, 60)}»`;
    if (!a.dependencia_id)
      add('r', `${n}: sin dependencia asignada (nadie la ve ni la reporta)`, 'pmEditAcc', a.id);
    if (pmSemanas(a) === 0)
      add('y', `${n}: inicio y fin el mismo día, no pesa en los indicadores`, 'pmEditAcc', a.id);
    if (p.fecha_suscripcion && a.fecha_fin < p.fecha_suscripcion)
      add('r', `${n}: termina antes de la suscripción del plan`, 'pmEditAcc', a.id);
    if (!pmTxt(a.meta) && p.formato === 'PM_01_CGSC')
      add('y', `${n}: sin meta (columna 11 del PM_01)`, 'pmEditAcc', a.id);
    if (!pmTxt(a.fuente_verificacion)) add('y', `${n}: sin fuente de verificación`, 'pmEditAcc', a.id);
    if (p.formato === 'F14_CGR' && !pmTxt(a.actividad))
      add('y', `${n}: sin descripción de actividades (Formulario 14)`, 'pmEditAcc', a.id);
    if (pmEstado(a).k === 'vencida' && !pmPend(a))
      add('r', `${n}: vencida sin cumplir y sin avance en validación`, 'pmOpenAcc', a.id);
  });
  return out.sort((a, b) => (a.nivel === 'r' ? 0 : 1) - (b.nivel === 'r' ? 0 : 1));
}
function pmTabCalidad(issues) {
  if (!issues.length)
    return '<div class="card"><div class="empty"><i class="fa-solid fa-circle-check"></i>Los datos del plan están completos y consistentes</div></div>';
  return `<div class="card">${issues
    .map(
      i =>
        `<div class="list-row pm-issue ${i.nivel}"><i class="fa-solid ${i.nivel === 'r' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'}"></i><span style="flex:1">${esc(i.txt)}</span>${(i.act === 'pmOpenAcc' || pmCanEdit()) && i.act ? `<button class="btn sm" data-act="${i.act}" data-id="${esc(i.id)}">${i.act === 'pmOpenAcc' ? 'Ver' : i.act === 'pmNewAcc' ? 'Agregar acción' : 'Corregir'}</button>` : ''}</div>`
    )
    .join('')}</div>`;
}

/* =====================================================================
   FORMULARIOS
   ===================================================================== */
const pmF = (id, label, input, hint) =>
  `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
const pmIn = (id, v, extra) => `<input id="${id}" value="${esc(v == null ? '' : v)}" ${extra || ''}>`;
const pmTa = (id, v, rows) =>
  `<textarea id="${id}" rows="${rows || 3}">${esc(v == null ? '' : v)}</textarea>`;
const pmVal = id => pmTxt(($('#' + id) || {}).value);

function pmPlanModal(p) {
  const e = p || {
    formato: 'PM_01_CGSC',
    contraloria: PM_FMT.PM_01_CGSC.contraloria,
    entidad: 'Distrito Especial de Santiago de Cali',
    estado: 'en_ejecucion'
  };
  openModal({
    title: p ? 'Editar plan de mejoramiento' : 'Nuevo plan de mejoramiento',
    wide: true,
    body: `
      <div class="row2">
        ${pmF(
          'pmPFmt',
          'Formato',
          `<select id="pmPFmt">${Object.entries(PM_FMT)
            .map(
              ([k, v]) =>
                `<option value="${k}"${e.formato === k ? ' selected' : ''}>${v.nombre}${v.contraloria ? ' · ' + v.corto : ''}</option>`
            )
            .join('')}</select>`
        )}
        ${pmF('pmPCtl', 'Contraloría *', pmIn('pmPCtl', e.contraloria))}
      </div>
      ${pmF('pmPEje', 'Nombre del ejercicio de fiscalización (auditoría) *', pmTa('pmPEje', e.ejercicio, 2))}
      <div class="row2">
        ${pmF('pmPTipo', 'Tipo de ejercicio', `<select id="pmPTipo"><option value=""></option>${PM_TIPOS.map(t => `<option${e.tipo_ejercicio === t ? ' selected' : ''}>${t}</option>`).join('')}${e.tipo_ejercicio && !PM_TIPOS.includes(e.tipo_ejercicio) ? `<option selected>${esc(e.tipo_ejercicio)}</option>` : ''}</select>`)}
        ${pmF('pmPFs', 'Fecha de suscripción *', pmIn('pmPFs', e.fecha_suscripcion, 'type="date"'))}
      </div>
      <div class="row2">
        ${pmF('pmPVig', 'Vigencia PVCFT (PM_01)', pmIn('pmPVig', e.vigencia_pvcft, 'placeholder="Ej.: 2025"'))}
        ${pmF('pmPPer', 'Periodo fiscal auditado (CGR)', pmIn('pmPPer', e.periodo_auditado, 'placeholder="Ej.: 2024"'))}
      </div>
      <div class="row2">
        ${pmF('pmPMod', 'Modalidad de auditoría (CGR)', pmIn('pmPMod', e.modalidad))}
        ${pmF('pmPNit', 'NIT de la entidad', pmIn('pmPNit', e.nit, 'placeholder="890.399.011-3"'))}
      </div>
      <div class="row2">
        ${pmF('pmPInf', 'N.º del informe final', pmIn('pmPInf', e.numero_informe))}
        ${pmF('pmPFi', 'Fecha del informe final', pmIn('pmPFi', e.fecha_informe, 'type="date"'))}
      </div>
      <div class="row2">
        ${pmF('pmPOrf', 'Radicado ORFEO del informe o del plan', pmIn('pmPOrf', e.radicado_orfeo))}
        ${pmF(
          'pmPEst',
          'Estado',
          `<select id="pmPEst">${Object.entries(PM_EST)
            .map(([k, v]) => `<option value="${k}"${e.estado === k ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>`
        )}
      </div>
      ${
        PM.v19
          ? `<div class="row2">
        ${pmF(
          'pmPReq',
          'Oficio de remisión del informe',
          `<select id="pmPReq"><option value="">— Sin enlazar —</option>${(S.reqs || [])
            .filter(
              r =>
                /informe|plan de mejoramiento|auditor|fiscalizaci/i.test(r.asunto || '') ||
                String(r.id) === String(e.requerimiento_id)
            )
            .map(
              r =>
                `<option value="${esc(r.id)}"${String(r.id) === String(e.requerimiento_id) ? ' selected' : ''}>${esc(r.radicado)} · ${esc(shortTxt(r.asunto, 70))}</option>`
            )
            .join('')}</select>`,
          'Su plazo y su cierre se siguen desde el plan'
        )}
        ${pmF('pmPDir', 'Dirección técnica de la contraloría (PM_01)', pmIn('pmPDir', e.direccion_tecnica, 'placeholder="Ej.: Dirección Técnica ante la Administración Central"'))}
      </div>`
          : ''
      }
      ${
        PM.v20
          ? `<div class="row2">
        ${pmF(
          'pmPRes',
          'Resolución CGSC aplicable',
          `<select id="pmPRes"><option value="">Automática según la fecha de suscripción</option>${Object.entries(
            PM_RES
          )
            .map(
              ([k, v]) =>
                `<option value="${k}"${e.resolucion === k ? ' selected' : ''}>${esc(v.corta)}</option>`
            )
            .join('')}</select>`,
          'Res. 24.043: planes desde el 1-ene-2025 · Res. 24.003: del 24-ene al 31-dic-2024'
        )}
        ${pmF('pmPRad', 'Fecha de radicación del informe final', pmIn('pmPRad', e.fecha_radicacion_informe, 'type="date"'), 'Desde aquí corren los 15 días hábiles para presentar el plan (art. 7)')}
      </div>`
          : ''
      }
      ${pmF('pmPEnt', 'Entidad auditada', pmIn('pmPEnt', e.entidad))}
      <div class="row2">
        ${pmF('pmPRep', 'Representante legal (firma)', pmIn('pmPRep', e.representante_legal))}
        ${pmF('pmPOrd', 'Ordenador del gasto del punto de control (firma PM_01)', pmIn('pmPOrd', e.ordenador_gasto))}
      </div>
      ${pmF('pmPObs', 'Observaciones', pmTa('pmPObs', e.observaciones, 2))}`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmSavePlan" data-id="${p ? esc(p.id) : ''}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>`
  });
  $('#pmPFmt').addEventListener('change', ev => {
    const f = PM_FMT[ev.target.value];
    if (f && f.contraloria) $('#pmPCtl').value = f.contraloria;
  });
}
async function pmSavePlan(id) {
  const o = {
    formato: pmVal('pmPFmt'),
    contraloria: pmVal('pmPCtl'),
    ejercicio: pmVal('pmPEje'),
    tipo_ejercicio: pmVal('pmPTipo'),
    fecha_suscripcion: pmVal('pmPFs'),
    vigencia_pvcft: pmVal('pmPVig'),
    periodo_auditado: pmVal('pmPPer'),
    modalidad: pmVal('pmPMod'),
    nit: pmVal('pmPNit'),
    numero_informe: pmVal('pmPInf'),
    fecha_informe: pmVal('pmPFi') || null,
    radicado_orfeo: pmVal('pmPOrf'),
    estado: pmVal('pmPEst'),
    entidad: pmVal('pmPEnt') || 'Distrito Especial de Santiago de Cali',
    representante_legal: pmVal('pmPRep'),
    ordenador_gasto: pmVal('pmPOrd'),
    observaciones: pmVal('pmPObs')
  };
  if (PM.v19) {
    o.requerimiento_id = pmVal('pmPReq') || null;
    o.direccion_tecnica = pmVal('pmPDir');
  }
  if (PM.v20) {
    o.resolucion = pmVal('pmPRes');
    o.fecha_radicacion_informe = pmVal('pmPRad') || null;
    if (o.fecha_radicacion_informe && !pmFecha(o.fecha_radicacion_informe))
      return toast('La fecha de radicación del informe no es válida', 'err');
  }
  if (!o.contraloria) return toast('Indica la contraloría', 'err');
  if (o.ejercicio.length < 4) return toast('Escribe el nombre del ejercicio de fiscalización', 'err');
  if (!pmFecha(o.fecha_suscripcion)) return toast('Indica la fecha de suscripción del plan', 'err');
  if (o.fecha_informe && !pmFecha(o.fecha_informe)) return toast('La fecha del informe no es válida', 'err');
  if (id) {
    const fuera = PM.acc.filter(a => a.plan_id === id && a.fecha_fin < o.fecha_suscripcion).length;
    if (
      fuera &&
      !confirm(
        `${fuera} acción(es) terminan antes de la nueva fecha de suscripción. ¿Guardar de todas formas?`
      )
    )
      return;
  }
  const en = S.entes.find(x => pmKey(x.nombre) === pmKey(o.contraloria));
  if (en) o.ente_id = en.id;
  try {
    const nid = await pmSave('plan', o, id || null);
    closeModal();
    toast(id ? 'Plan actualizado' : 'Plan creado. Ahora agrega sus hallazgos y acciones.');
    PM.plan = nid;
    PM.tab = 'acciones';
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}
function pmHallModal(h, planId) {
  const e = h || { connotaciones: ['administrativa'] };
  openModal({
    title: h ? 'Editar hallazgo' : 'Agregar hallazgo',
    wide: true,
    body: `
      <div class="row2">
        ${pmF('pmHNum', 'N.º o código del hallazgo *', pmIn('pmHNum', e.numero))}
        ${pmF('pmHCua', 'Cuantía del presunto detrimento (si es fiscal)', pmIn('pmHCua', e.cuantia == null ? '' : e.cuantia, 'inputmode="decimal" placeholder="0"'))}
      </div>
      ${pmF('pmHDes', 'Descripción de la condición del hallazgo *', pmTa('pmHDes', e.descripcion, 4))}
      <div class="row2">${pmF('pmHCau', 'Causa', pmTa('pmHCau', e.causa, 2))}${pmF('pmHEfe', 'Efecto', pmTa('pmHEfe', e.efecto, 2))}</div>
      <div class="field"><label>Connotación</label><div class="pm-checks">${Object.entries(PM_CONN)
        .map(
          ([k, v]) =>
            `<label><input type="checkbox" class="pmHConn" value="${k}"${(e.connotaciones || []).includes(k) ? ' checked' : ''}> ${v}</label>`
        )
        .join('')}</div></div>
      ${pmF('pmHMac', 'Macroproceso, criterio u otro', pmIn('pmHMac', e.macroproceso))}`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmSaveHall" data-id="${h ? esc(h.id) : ''}" data-plan="${esc(planId)}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>`
  });
}
async function pmSaveHall(id, planId) {
  const cu = pmVal('pmHCua');
  const o = {
    plan_id: planId,
    numero: pmVal('pmHNum'),
    descripcion: pmVal('pmHDes'),
    causa: pmVal('pmHCau'),
    efecto: pmVal('pmHEfe'),
    connotaciones: [...document.querySelectorAll('.pmHConn:checked')].map(x => x.value),
    cuantia: cu ? pmNum(cu) : null,
    macroproceso: pmVal('pmHMac')
  };
  if (!o.numero) return toast('Indica el número del hallazgo', 'err');
  if (o.descripcion.length < 4) return toast('Describe el hallazgo', 'err');
  if (cu && (isNaN(o.cuantia) || o.cuantia < 0)) return toast('La cuantía debe ser un número', 'err');
  if (!id) o.orden = PM.hall.filter(h => h.plan_id === planId).length + 1;
  try {
    await pmSave('hall', o, id || null);
    closeModal();
    toast(id ? 'Hallazgo actualizado' : 'Hallazgo agregado');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}
/* =====================================================================
   PLANTILLAS DE ACCIONES DE MEJORA
   Según la causa del hallazgo se proponen acciones con meta, unidad, fuente de verificación y plazo
   medibles. Son un punto de partida: Control Interno y la dependencia las ajustan a su caso.
   ===================================================================== */
const PM_PLANTILLAS = [
  {
    id: 'pagos',
    tema: 'Pagos y respaldo presupuestal',
    re: /registro presupuestal|respaldo (contractual|presupuestal)|hecho cumplido|sin contrato|pago del canon|ordenador del gasto|vigilancia presupuestal/,
    acciones: [
      {
        accion:
          'Implementar una lista de chequeo previa a cada pago que verifique contrato perfeccionado, registro presupuestal, acta de inicio y periodo efectivamente ejecutado.',
        meta: 'Lista de chequeo aplicada en el 100 % de los pagos del periodo',
        unidad: 'Porcentaje',
        cantidad: 100,
        fuente: 'Lista de chequeo firmada por el supervisor en cada orden de pago',
        meses: 6
      },
      {
        accion:
          'Realizar una mesa de trabajo entre la supervisión y el área financiera para verificar que los pagos correspondan al periodo contratado.',
        meta: 'Una (1) mesa de trabajo con acta',
        unidad: 'Actas',
        cantidad: 1,
        fuente: 'Acta de reunión y listado de asistencia',
        meses: 3
      }
    ]
  },
  {
    id: 'supervision',
    tema: 'Supervisión de contratos',
    re: /supervis|interventor|seguimiento (al|del) contrato/,
    acciones: [
      {
        accion:
          'Capacitar a los supervisores y apoyos a la supervisión de la dependencia en sus deberes de vigilancia técnica, jurídica, financiera y presupuestal.',
        meta: '100 % de los supervisores de la dependencia capacitados',
        unidad: 'Porcentaje',
        cantidad: 100,
        fuente: 'Listados de asistencia y material de la capacitación',
        meses: 4
      },
      {
        accion: 'Expedir una circular con los lineamientos de supervisión y los requisitos previos al pago.',
        meta: 'Una (1) circular expedida y socializada',
        unidad: 'Documentos',
        cantidad: 1,
        fuente: 'Circular radicada en ORFEO y evidencia de socialización',
        meses: 2
      }
    ]
  },
  {
    id: 'planeacion',
    tema: 'Planeación contractual y estudio del mercado',
    re: /analisis (del )?(sector|mercado)|estudios? previos?|comparativ|cotizacion|planeacion contractual|estructurador/,
    acciones: [
      {
        accion:
          'Elaborar una matriz de análisis comparativo cuantitativo para los procesos de contratación, con criterios de evaluación y ponderación de las alternativas.',
        meta: 'Una (1) matriz adoptada y aplicada en los procesos del periodo',
        unidad: 'Documentos',
        cantidad: 1,
        fuente: 'Matriz aprobada y su aplicación en los expedientes contractuales',
        meses: 4
      },
      {
        accion:
          'Incluir en la lista de verificación de estudios previos el análisis cuantitativo del sector como requisito para continuar el proceso.',
        meta: 'Lista de verificación actualizada',
        unidad: 'Documentos',
        cantidad: 1,
        fuente: 'Lista de verificación actualizada en el sistema de gestión',
        meses: 3
      }
    ]
  },
  {
    id: 'documental',
    tema: 'Gestión documental y soportes',
    re: /expediente|archivo|soporte|documental|evidencia|secop/,
    acciones: [
      {
        accion:
          'Organizar y completar los expedientes con todos los soportes exigidos y publicar los documentos pendientes.',
        meta: '100 % de los expedientes revisados completos',
        unidad: 'Porcentaje',
        cantidad: 100,
        fuente: 'Inventario documental y verificación por muestreo',
        meses: 4
      },
      {
        accion: 'Establecer un control periódico de completitud de expedientes a cargo del área responsable.',
        meta: 'Un (1) control trimestral documentado',
        unidad: 'Informes',
        cantidad: 2,
        fuente: 'Informes de control trimestral',
        meses: 6
      }
    ]
  },
  {
    id: 'contable',
    tema: 'Información contable y financiera',
    re: /contab|conciliaci|estados financieros|inventario|cartera|depuracion/,
    acciones: [
      {
        accion:
          'Realizar conciliaciones mensuales entre las áreas involucradas y depurar las partidas identificadas.',
        meta: 'Conciliaciones mensuales realizadas',
        unidad: 'Actas',
        cantidad: 6,
        fuente: 'Actas de conciliación firmadas',
        meses: 6
      }
    ]
  },
  {
    id: 'metas',
    tema: 'Cumplimiento de metas y planes',
    re: /meta|plan de desarrollo|indicador|ejecucion (fisica|presupuestal)|cronograma/,
    acciones: [
      {
        accion:
          'Implementar un seguimiento mensual de metas físicas y financieras con alertas al jefe de la dependencia.',
        meta: 'Seis (6) informes de seguimiento',
        unidad: 'Informes',
        cantidad: 6,
        fuente: 'Informes de seguimiento mensual',
        meses: 6
      }
    ]
  }
];
const PM_PLANTILLA_GENERAL = {
  id: 'general',
  tema: 'Acción general',
  acciones: [
    {
      accion:
        'Actualizar el procedimiento relacionado con la causa del hallazgo e incluir un punto de control que evite que se repita.',
      meta: 'Procedimiento actualizado y socializado',
      unidad: 'Procedimientos',
      cantidad: 1,
      fuente: 'Procedimiento publicado en el sistema de gestión y evidencia de socialización',
      meses: 4
    }
  ]
};
function pmSugerencias(h) {
  const t = pmKey((h.causa || '') + ' ' + (h.descripcion || ''));
  const grupos = PM_PLANTILLAS.filter(g => g.re.test(t));
  return (grupos.length ? grupos : []).concat([PM_PLANTILLA_GENERAL]).slice(0, 4);
}
const pmMasMeses = (iso, m) => {
  const d = parseD(iso || pmHoy());
  d.setMonth(d.getMonth() + m);
  return iso_(d);
};
function iso_(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pmSugHtml(h) {
  const gs = pmSugerencias(h);
  let n = 0;
  PM.sug = [];
  return `<div class="pm-sug"><div class="pm-sug-h"><i class="fa-solid fa-lightbulb"></i> Sugerencias según la causa del hallazgo <span class="muted">(un punto de partida: ajústelas a su caso)</span></div>${gs
    .map(
      g =>
        `<div class="pm-sug-g"><b>${esc(g.tema)}</b>${g.acciones
          .map(x => {
            PM.sug.push(x);
            return `<div class="pm-sug-a"><span>${esc(x.accion)}<span class="muted"> · Meta: ${esc(x.meta)} · Plazo: ${x.meses} meses</span></span><button class="btn sm" data-act="pmUsarSug" data-i="${n++}">Usar</button></div>`;
          })
          .join('')}</div>`
    )
    .join('')}</div>`;
}
function pmUsarSug(i) {
  const x = (PM.sug || [])[i];
  if (!x) return;
  const set = (id, v) => {
    const el = $('#' + id);
    if (el) el.value = v;
  };
  set('pmAAcc', x.accion);
  set('pmAMeta', x.meta);
  set('pmAUni', x.unidad);
  set('pmACan', x.cantidad);
  set('pmAFue', x.fuente);
  const fi = pmVal('pmAFi') || pmHoy();
  set('pmAFf', pmMasMeses(fi, x.meses));
  toast('Sugerencia cargada: revise y ajuste antes de guardar');
}

/* =====================================================================
   TRASLADOS DE HALLAZGOS (disciplinario, fiscal, penal, sancionatorio)
   ===================================================================== */
const PM_TRAS_EST = {
  trasladado: 'Trasladado',
  en_indagacion: 'En indagación',
  en_investigacion: 'En investigación',
  archivado: 'Archivado',
  con_decision: 'Con decisión de fondo'
};
/* Destinos según la incidencia (Res. 24.043, art. 2): penal → Fiscalía; otra → DIAN, Ministerio de Salud,
   Superintendencias, ADRES, entre otras. Se puede escribir cualquier otro destino. */
const PM_TRAS_DESTINOS = [
  'Personería Distrital de Santiago de Cali',
  'Departamento Administrativo de Control Disciplinario Interno',
  'Procuraduría General de la Nación',
  'Fiscalía General de la Nación',
  'Contraloría General de Santiago de Cali (responsabilidad fiscal)',
  'Contraloría General de la República (responsabilidad fiscal)',
  'Dirección de Impuestos y Aduanas Nacionales (DIAN)',
  'Ministerio de Salud y Protección Social',
  'Superintendencia Nacional de Salud',
  'Superintendencia de Industria y Comercio',
  'Superintendencia de Servicios Públicos Domiciliarios',
  'Administradora de los Recursos del Sistema General de Seguridad Social en Salud (ADRES)'
];
const pmIncidencias = h =>
  (h.connotaciones || []).filter(c =>
    ['disciplinaria', 'fiscal', 'penal', 'sancionatoria', 'otra'].includes(c)
  );
function pmTrasHtml(h) {
  const inc = pmIncidencias(h);
  const lista = (PM.tras || []).filter(t => t.hallazgo_id === h.id);
  if (!inc.length && !lista.length) return '';
  if (!PM.trasOk)
    return `<div class="pm-tras"><span class="muted">Traslados: disponible al ejecutar el script <span class="mono">18_planes_pdf_y_traslados.sql</span>.</span></div>`;
  const falta = inc.filter(c => !lista.some(t => t.tipo === c));
  return `<div class="pm-tras"><div class="pm-tras-h"><b>Traslados</b>${falta.length ? `<span class="pm-chip y">Sin registrar: ${falta.map(esc).join(', ')}</span>` : '<span class="pm-chip g">Registrados</span>'}${pmCanEdit() ? `<button class="btn sm" data-act="pmNewTras" data-id="${esc(h.id)}"><i class="fa-solid fa-share-from-square"></i> Registrar traslado</button>` : ''}</div>${lista
    .map(
      t =>
        `<div class="pm-tras-r"><span class="pm-conn c-${esc(t.tipo)}">${esc(t.tipo)}</span><span>${esc(t.destino)}${t.radicado ? ` · <span class="mono">${esc(t.radicado)}</span>` : ''}${t.fecha ? ' · ' + fmtD(t.fecha) : ''}</span><span class="pm-chip">${esc(PM_TRAS_EST[t.estado] || t.estado)}</span>${pmCanEdit() ? `<button class="icon-btn" data-act="pmEditTras" data-id="${esc(t.id)}" title="Editar traslado" aria-label="Editar traslado"><i class="fa-solid fa-pen"></i></button>` : ''}</div>`
    )
    .join('')}</div>`;
}
function pmTrasModal(t, hallId) {
  const h = pmHallOf(t ? t.hallazgo_id : hallId);
  if (!h) return;
  const inc = pmIncidencias(h);
  const tipos = inc.length ? inc : ['disciplinaria', 'fiscal', 'penal', 'sancionatoria', 'otra'];
  const e = t || { tipo: tipos[0], estado: 'trasladado', fecha: pmHoy() };
  openModal({
    title: (t ? 'Editar traslado' : 'Registrar traslado') + ' · hallazgo ' + h.numero,
    body: `
      <div class="row2">
        ${pmF('pmTTipo', 'Incidencia *', `<select id="pmTTipo">${tipos.map(c => `<option value="${c}"${e.tipo === c ? ' selected' : ''}>${c}</option>`).join('')}</select>`)}
        ${pmF(
          'pmTEst',
          'Estado *',
          `<select id="pmTEst">${Object.entries(PM_TRAS_EST)
            .map(([k, v]) => `<option value="${k}"${e.estado === k ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>`
        )}
      </div>
      ${pmF('pmTDes', 'Trasladado a *', pmIn('pmTDes', e.destino, 'list="pmTDests"') + `<datalist id="pmTDests">${PM_TRAS_DESTINOS.map(d => `<option>${esc(d)}</option>`).join('')}</datalist>`)}
      <div class="row2">
        ${pmF('pmTRad', 'Radicado del traslado', pmIn('pmTRad', e.radicado, 'inputmode="numeric"'))}
        ${pmF('pmTFec', 'Fecha', pmIn('pmTFec', e.fecha, 'type="date"'))}
      </div>
      ${pmF('pmTObs', 'Observaciones', pmTa('pmTObs', e.observaciones, 2), 'Por ejemplo, el número del proceso abierto o la decisión tomada')}`,
    footer: `${t ? `<button class="btn" data-act="pmDelTras" data-id="${esc(t.id)}" style="margin-right:auto"><i class="fa-solid fa-trash"></i> Eliminar</button>` : ''}<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmSaveTras" data-id="${t ? esc(t.id) : ''}" data-hall="${esc(h.id)}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>`
  });
}
async function pmSaveTras(id, hallId) {
  const h = pmHallOf(hallId);
  if (!h) return;
  const o = {
    plan_id: h.plan_id,
    hallazgo_id: h.id,
    tipo: $('#pmTTipo').value,
    estado: $('#pmTEst').value,
    destino: pmVal('pmTDes'),
    radicado: pmVal('pmTRad'),
    fecha: pmVal('pmTFec') || null,
    observaciones: pmVal('pmTObs')
  };
  if (o.destino.length < 3) return toast('Indique a quién se trasladó', 'err');
  try {
    await pmSave('tras', o, id || null);
    closeModal();
    toast('Traslado guardado');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}
async function pmDelTras(id) {
  if (!confirm('¿Eliminar este traslado?')) return;
  try {
    await pmDelete('tras', id);
    closeModal();
    toast('Traslado eliminado');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function pmAccModal(a, hallId) {
  const h = pmHallOf(a ? a.hallazgo_id : hallId),
    p = pmPlanOf(h.plan_id);
  const e = a || {
    unidad_medida: 'Porcentaje',
    cantidad: 100,
    fecha_inicio: p.fecha_suscripcion || pmHoy(),
    dependencia_id: h.dependencia_id || null
  };
  const deps = S.deps
    .filter(d => d.activo !== false)
    .slice()
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  openModal({
    title: (a ? 'Editar acción' : 'Agregar acción') + ' · hallazgo ' + h.numero,
    wide: true,
    body: `
      ${a ? '' : pmSugHtml(h)}
      ${pmF('pmAAcc', (p.formato === 'F14_CGR' ? 'Acción de mejoramiento' : 'Acción correctiva') + ' *', pmTa('pmAAcc', e.accion, 2))}
      ${p.formato !== 'PM_01_CGSC' ? `<div class="row2">${pmF('pmAPro', 'Propósito de la acción de mejora', pmTa('pmAPro', e.proposito, 2))}${pmF('pmAAct', 'Descripción de las actividades', pmTa('pmAAct', e.actividad, 2))}</div>` : ''}
      ${pmF('pmAMeta', 'Meta', pmIn('pmAMeta', e.meta, 'placeholder="Ej.: 100% de los supervisores capacitados"'))}
      <div class="row2">
        ${pmF('pmAUni', 'Unidad de medida *', pmIn('pmAUni', e.unidad_medida, 'list="pmUnis"') + '<datalist id="pmUnis"><option>Porcentaje</option><option>Informes</option><option>Capacitaciones</option><option>Actas</option><option>Documentos</option><option>Procedimientos</option></datalist>')}
        ${pmF('pmACan', 'Cantidad de la meta *', pmIn('pmACan', e.cantidad, 'inputmode="decimal"'), 'Con «Porcentaje», use 100')}
      </div>
      <div class="row2">
        ${pmF('pmAFi', 'Fecha de inicio *', pmIn('pmAFi', e.fecha_inicio, 'type="date"'), 'PM_01 no tiene esta columna: por defecto es la fecha de suscripción')}
        ${pmF('pmAFf', 'Fecha de terminación *', pmIn('pmAFf', e.fecha_fin, 'type="date"'))}
      </div>
      <div class="row2">
        ${pmF('pmADep', 'Dependencia responsable *', `<select id="pmADep"><option value="">Seleccione…</option>${deps.map(d => `<option value="${esc(d.id)}"${String(d.id) === String(e.dependencia_id) ? ' selected' : ''}>${esc(d.nombre)}</option>`).join('')}</select>`)}
        ${pmF('pmARes', 'Responsable (nombre y cargo)', pmIn('pmARes', e.responsable))}
      </div>
      <div class="row2">
        ${pmF('pmAFue', 'Fuente de verificación', pmIn('pmAFue', e.fuente_verificacion))}
        ${pmF('pmALug', 'Lugar de verificación', pmIn('pmALug', e.lugar_verificacion))}
      </div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmSaveAcc" data-id="${a ? esc(a.id) : ''}" data-hall="${esc(h.id)}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>`
  });
}
async function pmSaveAcc(id, hallId) {
  const h = pmHallOf(hallId),
    p = pmPlanOf(h.plan_id);
  const o = {
    plan_id: h.plan_id,
    hallazgo_id: h.id,
    accion: pmVal('pmAAcc'),
    proposito: $('#pmAPro') ? pmVal('pmAPro') : (pmAccOf(id) || {}).proposito || '',
    actividad: $('#pmAAct') ? pmVal('pmAAct') : (pmAccOf(id) || {}).actividad || '',
    meta: pmVal('pmAMeta'),
    unidad_medida: pmVal('pmAUni'),
    cantidad: pmNum(pmVal('pmACan')),
    fecha_inicio: pmVal('pmAFi'),
    fecha_fin: pmVal('pmAFf'),
    dependencia_id: pmVal('pmADep') ? +pmVal('pmADep') || pmVal('pmADep') : null,
    responsable: pmVal('pmARes'),
    fuente_verificacion: pmVal('pmAFue'),
    lugar_verificacion: pmVal('pmALug')
  };
  if (o.accion.length < 4) return toast('Describe la acción', 'err');
  const avisosF = pmAccIssues(o, p);
  if (
    avisosF.length &&
    !confirm('Revise la formulación:\n\n• ' + avisosF.join('\n• ') + '\n\n¿Guardar de todas formas?')
  )
    return;
  if (!o.unidad_medida) return toast('Indica la unidad de medida', 'err');
  if (!(o.cantidad > 0)) return toast('La cantidad de la meta debe ser mayor que cero', 'err');
  if (!pmFecha(o.fecha_inicio) || !pmFecha(o.fecha_fin))
    return toast('Indica las fechas de inicio y de terminación', 'err');
  if (o.fecha_fin < o.fecha_inicio)
    return toast('La fecha de terminación no puede ser anterior a la de inicio', 'err');
  if (!o.dependencia_id)
    return toast('Asigna la dependencia responsable: sin ella nadie podrá reportar el avance', 'err');
  if (
    p.fecha_suscripcion &&
    o.fecha_fin < p.fecha_suscripcion &&
    !confirm('La acción termina antes de la suscripción del plan. ¿Guardar de todas formas?')
  )
    return;
  const prev = pmAccOf(id);
  if (
    prev &&
    Number(prev.avance) > o.cantidad &&
    !confirm('El avance validado supera la nueva cantidad de la meta. ¿Guardar de todas formas?')
  )
    return;
  if (!id) o.orden = PM.acc.filter(a => a.plan_id === h.plan_id).length + 1;
  try {
    await pmSave('acc', o, id || null);
    closeModal();
    toast(id ? 'Acción actualizada' : 'Acción agregada');
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}

function pmReportModal(a) {
  const h = pmHallOf(a.hallazgo_id) || {},
    u = pmUltimo(a);
  const pct = a.unidad_medida && pmKey(a.unidad_medida).startsWith('porcent');
  openModal({
    title: 'Reportar avance',
    wide: true,
    body: `
      <div class="pm-ctx"><small>Hallazgo ${esc(h.numero || '')}</small><b>${esc(a.accion)}</b><div class="muted">Meta: ${esc(pmMetaTxt(a))} · termina el ${fmtD(a.fecha_fin)}</div><div class="muted">Avance validado actual: <b>${pmNumTxt(a.avance)}</b> (${pmPctTxt(pmPct(a))})${a.fecha_corte ? ' con corte ' + fmtD(a.fecha_corte) : ''}</div></div>
      ${u && u.estado === 'devuelto' ? `<div class="pm-note r" style="margin:10px 0"><i class="fa-solid fa-rotate-left"></i> El último reporte fue devuelto: ${esc(u.observacion)}</div>` : ''}
      <div class="row2">
        ${pmF('pmVFc', 'Fecha de corte *', pmIn('pmVFc', pmHoy(), `type="date" max="${pmHoy()}"`))}
        ${pmF('pmVCan', `Avance acumulado a la fecha de corte * (${pct ? '0 a 100' : 'de ' + pmNumTxt(a.cantidad) + ' ' + esc(a.unidad_medida)})`, pmIn('pmVCan', '', 'inputmode="decimal" autocomplete="off"'), '<span id="pmVPct">Escribe el total logrado hasta la fecha, no solo lo de este periodo</span>')}
      </div>
      ${pmF('pmVDes', 'Descripción del avance de la acción *', pmTa('pmVDes', '', 4), 'Qué se hizo, con qué evidencia y dónde se puede verificar')}
      <div class="row2">
        ${pmF('pmVOrf', 'Radicado ORFEO del soporte', pmIn('pmVOrf', '', 'inputmode="numeric" placeholder="Ej.: 202641320100012345"'))}
        ${pmF('pmVPdf', 'Soporte en PDF (máx. 10 MB)', '<input id="pmVPdf" type="file" accept="application/pdf,.pdf">')}
      </div>
      <div class="hint" style="margin-top:-6px">Adjunte el PDF del soporte o indique el radicado ORFEO donde reposa: al menos uno de los dos es obligatorio.</div>
      ${pmCanEdit() ? '<label class="pm-checks" style="margin-top:12px"><input type="checkbox" id="pmVVal"> Validar de inmediato (lo registra Control Interno o el Super administrador)</label>' : ''}`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmSaveAv" data-id="${esc(a.id)}"><i class="fa-solid fa-paper-plane"></i> Enviar avance</button>`
  });
  const ci = $('#pmVCan');
  ci.addEventListener('input', () => {
    const v = pmNum(ci.value),
      el = $('#pmVPct');
    if (isNaN(v)) el.textContent = 'Escribe el total logrado hasta la fecha, no solo lo de este periodo';
    else {
      const p = Number(a.cantidad) > 0 ? v / Number(a.cantidad) : 0;
      el.innerHTML = `Equivale a <b>${pmPctTxt(Math.min(1, p))}</b> de la meta${p > 1 ? ' (supera la meta; para los indicadores cuenta como 100%)' : ''}${v < Number(a.avance) ? ' · <span style="color:var(--redink)">es menor que el avance ya validado</span>' : ''}`;
    }
  });
}
async function pmSaveAv(id, btn) {
  const a = pmAccOf(id);
  const o = {
    accion_id: id,
    fecha_corte: pmVal('pmVFc'),
    cantidad: pmNum(pmVal('pmVCan')),
    descripcion: pmVal('pmVDes'),
    radicado_orfeo: pmVal('pmVOrf').replace(/\s+/g, ''),
    validar: !!($('#pmVVal') && $('#pmVVal').checked)
  };
  const file = ($('#pmVPdf').files || [])[0] || null;
  if (!pmFecha(o.fecha_corte)) return toast('Indica la fecha de corte', 'err');
  if (o.fecha_corte > pmHoy()) return toast('La fecha de corte no puede ser futura', 'err');
  if (isNaN(o.cantidad) || o.cantidad < 0)
    return toast('El avance debe ser un número mayor o igual a cero', 'err');
  if (o.descripcion.length < 10) return toast('Describe el avance (mínimo 10 caracteres)', 'err');
  if (o.radicado_orfeo && !/^\d{10,20}$/.test(o.radicado_orfeo))
    return toast('El radicado ORFEO debe tener entre 10 y 20 dígitos', 'err');
  if (!file && !o.radicado_orfeo)
    return toast('Adjunta el PDF del soporte o indica el radicado ORFEO', 'err');
  if (file && file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name))
    return toast('El soporte debe ser un archivo PDF', 'err');
  if (file && file.size > 10 * 1024 * 1024) return toast('El PDF supera 10 MB', 'err');
  if (
    o.cantidad < Number(a.avance) &&
    !confirm('El avance acumulado es menor que el ya validado. ¿Enviarlo de todas formas?')
  )
    return;
  if (
    o.cantidad > Number(a.cantidad) &&
    !confirm('El avance supera la cantidad de la meta. ¿Enviarlo de todas formas?')
  )
    return;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';
  }
  try {
    await pmReportar(o, file);
    closeModal();
    toast(
      o.validar
        ? 'Avance registrado y validado'
        : 'Avance enviado. Queda pendiente de validación por Control Interno.'
    );
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar avance';
    }
  }
}
function pmReviewModal(v) {
  const a = pmAccOf(v.accion_id) || {},
    h = pmHallOf(a.hallazgo_id) || {};
  openModal({
    title: 'Revisar avance reportado',
    wide: true,
    body: `
      <div class="pm-ctx"><small>Hallazgo ${esc(h.numero || '')} · ${esc(pmDepN(a.dependencia_id))}</small><b>${esc(a.accion)}</b><div class="muted">Meta: ${esc(pmMetaTxt(a))} · termina el ${fmtD(a.fecha_fin)}</div></div>
      <div class="pm-info" style="margin:12px 0">
        <div><small>Fecha de corte</small><span>${fmtD(v.fecha_corte)}</span></div>
        <div><small>Avance acumulado</small><span>${pmNumTxt(v.cantidad)} · ${pmPctTxt(pmPct(a, v.cantidad))}</span></div>
        <div><small>Avance validado anterior</small><span>${pmNumTxt(a.avance)} · ${pmPctTxt(pmPct(a))}</span></div>
        <div><small>Reportado por</small><span>${esc(v.reportado_email || '—')} · ${fmtTs(v.created_at)}</span></div>
      </div>
      <div class="field"><label>Descripción del avance</label><div class="pm-quote">${esc(v.descripcion)}</div></div>
      <div class="field"><label>Soporte</label><div>${pmSoporte(v)}${v.soporte_hash ? `<div class="muted mono" style="font-size:.7rem;margin-top:4px">SHA-256 ${esc(v.soporte_hash)}</div>` : ''}</div></div>
      ${pmF('pmRObs', 'Observación de la revisión', pmTa('pmRObs', '', 3), 'Obligatoria si devuelve el avance: la dependencia la verá para corregir')}`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn danger" data-act="pmDoReview" data-id="${esc(v.id)}" data-estado="devuelto"><i class="fa-solid fa-rotate-left"></i> Devolver</button><button class="btn primary" data-act="pmDoReview" data-id="${esc(v.id)}" data-estado="validado"><i class="fa-solid fa-check"></i> Validar</button>`
  });
}
async function pmDoReview(id, estado) {
  const obs = pmVal('pmRObs');
  if (estado === 'devuelto' && obs.length < 5)
    return toast('Indica a la dependencia por qué se devuelve el avance', 'err');
  try {
    await pmRevisar(id, estado, obs);
    closeModal();
    toast(
      estado === 'validado'
        ? 'Avance validado: el indicador de la acción quedó actualizado'
        : 'Avance devuelto a la dependencia'
    );
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
  }
}
function pmHistModal(a) {
  const l = PM.av
    .filter(v => v.accion_id === a.id)
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  openModal({
    title: 'Historial de avances',
    wide: true,
    body: `<div class="pm-ctx"><b>${esc(a.accion)}</b><div class="muted">${esc(pmDepN(a.dependencia_id))} · meta ${pmNumTxt(a.cantidad)} ${esc(a.unidad_medida)} · termina el ${fmtD(a.fecha_fin)}</div></div>
    ${
      l.length
        ? `<div class="pm-tl">${l
            .map(
              v => `<div class="pm-tl-i ${v.estado}"><div class="pm-tl-h"><span class="pill ${v.estado === 'validado' ? 'verde' : v.estado === 'devuelto' ? 'rojo' : 'amarillo'}">${PM_AV_EST[v.estado]}</span><b class="mono">${pmPctTxt(pmPct(a, v.cantidad))}</b><span class="muted">corte ${fmtD(v.fecha_corte)} · ${fmtTs(v.created_at)}</span></div>
          <div>${esc(v.descripcion)}</div><div class="muted" style="font-size:.76rem;margin-top:4px">${esc(v.reportado_email || '')}${v.revisado_at ? ' · revisó ' + esc(v.revisado_email || '') + ' el ' + fmtTs(v.revisado_at) : ''}</div>${v.observacion ? `<div class="pm-note ${v.estado === 'devuelto' ? 'r' : 'b'}" style="margin-top:6px">${esc(v.observacion)}</div>` : ''}<div style="margin-top:6px">${pmSoporte(v)}</div></div>`
            )
            .join('')}</div>`
        : '<div class="empty"><i class="fa-solid fa-inbox"></i>Aún no hay avances reportados</div>'
    }`,
    footer: `${pmCanReport(a) && !pmPend(a) ? `<button class="btn primary" data-act="pmReport" data-id="${esc(a.id)}"><i class="fa-solid fa-chart-line"></i> Reportar avance</button>` : ''}<button class="btn" data-act="closeModal">Cerrar</button>`
  });
}

/* ---------- notificación a la dependencia ---------- */
function pmMsg(depId) {
  const l = PM.acc
    .filter(a => String(a.dependencia_id) === String(depId))
    .filter(a => ['vencida', 'proxima'].includes(pmEstado(a).k))
    .sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)));
  const venc = l.filter(a => pmEstado(a).k === 'vencida'),
    prox = l.filter(a => pmEstado(a).k === 'proxima');
  const linea = a => {
    const p = pmPlanOf(a.plan_id) || {},
      h = pmHallOf(a.hallazgo_id) || {};
    return `- ${(PM_FMT[p.formato] || PM_FMT.OTRO).corto}, hallazgo ${h.numero}: ${shortTxt(a.accion, 120)} (termina ${fmtD(a.fecha_fin)}; avance validado ${pmPctTxt(pmPct(a))})`;
  };
  return {
    n: l.length,
    txt:
      `Respetado(a) secretario(a) / director(a):\n\nLe informo el estado de las acciones de los planes de mejoramiento suscritos con las contralorías a cargo de ${pmDepN(depId)}, con corte al ${fmtD(pmHoy())}:\n` +
      (venc.length
        ? `\nAcciones vencidas sin cumplimiento total (${venc.length}):\n${venc.map(linea).join('\n')}\n`
        : '') +
      (prox.length
        ? `\nAcciones que vencen en los próximos ${PM_ALERTA_DIAS} días (${prox.length}):\n${prox.map(linea).join('\n')}\n`
        : '') +
      `\nLe solicito reportar el avance con su soporte en la aplicación Control de Entes (módulo Planes de mejoramiento), para su validación y posterior reporte a la contraloría.\n\nCordialmente,\nDespacho del Alcalde`
  };
}
function pmNotifyModal(depId) {
  const dn = pmDepN(depId),
    cts = contactsOf(dn),
    m = pmMsg(depId);
  const c0 = cts[0] || {};
  openModal({
    title: 'Notificar a ' + shortOrg(dn),
    wide: true,
    body: `
      ${cts.length > 1 ? pmF('pmNCt', 'Destinatario', `<select id="pmNCt">${cts.map((x, i) => `<option value="${i}">${esc(x.cargo || '')}: ${esc(x.nombre || 'sin nombre')}</option>`).join('')}</select>`) : `<div class="muted" style="margin-bottom:10px">Destinatario: <b style="color:var(--ink)">${esc(c0.nombre || 'sin responsable en el directorio')}</b>${c0.cargo ? ' · ' + esc(c0.cargo) : ''}</div>`}
      <div class="row2">
        ${pmF('pmNTel', 'Celular (WhatsApp)', pmIn('pmNTel', normPhone(c0.telefono) || '', 'inputmode="tel"'))}
        ${pmF('pmNMail', 'Correo institucional', pmIn('pmNMail', c0.correo || '', 'type="email"'))}
      </div>
      ${pmF('pmNMsg', 'Mensaje', pmTa('pmNMsg', m.txt, 12))}`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn" data-act="pmSendNotif" data-dep="${esc(depId)}" data-canal="correo"><i class="fa-solid fa-envelope"></i> Correo</button><button class="btn primary" data-act="pmSendNotif" data-dep="${esc(depId)}" data-canal="whatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>`
  });
  const sel = $('#pmNCt');
  if (sel)
    sel.addEventListener('change', () => {
      const x = cts[+sel.value] || {};
      $('#pmNTel').value = normPhone(x.telefono) || '';
      $('#pmNMail').value = x.correo || '';
    });
}
async function pmSendNotif(depId, canal) {
  const dn = pmDepN(depId),
    cts = contactsOf(dn),
    x = cts[$('#pmNCt') ? +$('#pmNCt').value : 0] || {};
  const msg = $('#pmNMsg').value.trim();
  if (!msg) return toast('El mensaje está vacío', 'err');
  const base = {
    ts: new Date().toISOString(),
    org: dn,
    nombre: x.nombre || '',
    tpl: 'Plan de mejoramiento',
    n: pmMsg(depId).n,
    usuario: pmUser(),
    mensaje: msg
  };
  if (canal === 'whatsapp') {
    const tel = normPhone($('#pmNTel').value);
    if (!tel) return toast('Ingresa un celular válido para abrir WhatsApp', 'err');
    window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    await logNotif({ ...base, tel });
  } else {
    const to = normMail($('#pmNMail').value);
    if (!to) return toast('Ingresa el correo institucional (@cali.gov.co) del destinatario', 'err');
    const su = 'Planes de mejoramiento · acciones pendientes · ' + shortOrg(dn);
    window.open(
      'https://mail.google.com/mail/?authuser=' +
        encodeURIComponent(REMITENTE) +
        '&view=cm&fs=1&tf=1&to=' +
        encodeURIComponent(to) +
        '&su=' +
        encodeURIComponent(su) +
        '&body=' +
        encodeURIComponent(msg),
      '_blank',
      'noopener'
    );
    await logNotif({ ...base, tel: '', correo: to, canal: 'correo' });
  }
  closeModal();
  toast('Notificación preparada y registrada en la bitácora');
}

/* =====================================================================
   EXCEL: lector (importación) y escritor (exportación)
   ===================================================================== */
let PM_XLSX = null;
const PM_PDFJS_URL = 'vendor/pdf.min.js'; /* pdf.js 3.11.174, publicado en vendor/ */
const PM_PDFJS_WORKER = 'vendor/pdf.worker.min.js';
let PM_PDF = null;
function pmPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (PM_PDF) return PM_PDF;
  PM_PDF = new Promise((ok, no) => {
    const sc = document.createElement('script');
    sc.src = PM_PDFJS_URL;
    sc.onload = () => {
      if (!window.pdfjsLib) return no(new Error('No se pudo iniciar el lector de PDF'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PM_PDFJS_WORKER;
      ok(window.pdfjsLib);
    };
    sc.onerror = () => {
      PM_PDF = null;
      no(
        new Error('No se pudo cargar el lector de PDF. Revisa la conexión a internet e inténtalo de nuevo.')
      );
    };
    document.head.appendChild(sc);
  });
  return PM_PDF;
}
/* Texto de cada página con su posición, para rearmar las líneas (pmPdfLineas) */
async function pmLeerPdf(file) {
  const lib = await pmPdfJs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const tc = await (await doc.getPage(i)).getTextContent();
    paginas.push(
      tc.items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height }))
    );
  }
  return paginas;
}
function pmXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (PM_XLSX) return PM_XLSX;
  PM_XLSX = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = PM_XLSX_URL;
    s.onload = () => (window.XLSX ? ok(window.XLSX) : no(new Error('No se pudo iniciar el lector de Excel')));
    s.onerror = () => {
      PM_XLSX = null;
      no(
        new Error('No se pudo cargar el lector de Excel. Revisa la conexión a internet e inténtalo de nuevo.')
      );
    };
    document.head.appendChild(s);
  });
  return PM_XLSX;
}
/* Encabezados reconocidos (en orden: los más específicos primero) */
const PM_COLS = [
  ['plavi', /puntaje logrado por las actividades vencidas/],
  ['plai', /puntaje logrado/],
  ['paavi', /puntaje atribuido/],
  ['pctcgr', /porcentaje de avance fisico/],
  ['avfis', /avance fisico/],
  ['pct', /(porcentaje|%) (de )?avance|^avance (%|porcentual)|^% avance/],
  ['descav', /descripcion del avance/],
  ['fcorte', /fecha de corte/],
  ['numero', /codigo (del )?hallazgo|^(n|no|nro|numero)? ?(de )?hallazgo( no| n)?$/],
  ['descripcion', /descripcion (de la condicion|del hallazgo|hallazgo)|^condicion/],
  ['causa', /^causa/],
  ['efecto', /^efecto/],
  ['connotacion', /connotacion/],
  ['macro', /macroproceso|criterio/],
  ['actividad', /descripcion de las actividades|^actividad(es)?$/],
  ['accion', /^accion|^acciones/],
  ['proposito', /proposito/],
  ['unidad', /unidad de medida/],
  ['cantidad', /cantidad/],
  ['meta', /^metas?$/],
  ['fuente', /fuente de verificacion/],
  ['lugar', /lugar de verificacion/],
  ['fini', /fecha (de )?inicio|fecha (de )?iniciacion/],
  ['ffin', /fecha (de )?terminacion|fecha (de )?finalizacion|fecha (de )?fin\b|fecha limite/],
  ['plazo', /plazo/],
  ['responsable', /responsable/],
  ['obsci', /^observaciones? (daci|de la daci|oci|control interno|de control interno)/],
  ['dirtec', /^direccion tecnica/],
  ['obs', /^observacion/],
  ['consec', /^(no|n|item|consecutivo)$/]
];
/* Numeración oficial de las columnas del PM_01 CGSC: (6) a (18) */
const PM_COD = {
  6: 'numero',
  7: 'descripcion',
  8: 'connotacion',
  9: 'macro',
  10: 'accion',
  11: 'meta',
  12: 'fuente',
  13: 'lugar',
  14: 'ffin',
  15: 'responsable',
  16: 'descav',
  17: 'fcorte',
  18: 'pct'
};
function pmAoa(X, ws) {
  /* Rellena las celdas combinadas con el valor de su celda superior izquierda */
  (ws['!merges'] || []).forEach(m => {
    const tl = ws[X.utils.encode_cell(m.s)];
    if (!tl) return;
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) {
        const a = X.utils.encode_cell({ r, c });
        if (a !== X.utils.encode_cell(m.s)) ws[a] = { ...tl };
      }
  });
  return X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
}
function pmMapHeader(row) {
  const map = {};
  row.forEach((cell, ci) => {
    const raw = pmKey(cell);
    if (!raw) return;
    const cod = (raw.match(/\((\d{1,2})\)\s*$/) || [])[1];
    const t = raw
      .replace(/\(\d{1,2}\)/g, ' ')
      .replace(/[()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const hit = PM_COLS.find(([k, re]) => !(k in map) && re.test(t));
    if (hit) map[hit[0]] = ci;
    else if (cod && PM_COD[cod] && !(PM_COD[cod] in map)) map[PM_COD[cod]] = ci;
  });
  return map;
}
/* Causa del hallazgo cuando viene dentro de la descripción, como en los informes de la CGSC:
   "Lo anterior, causado por la falta de …, lo cual genera …" → "La falta de …" */
function pmCausaDe(des) {
  const m =
    /lo anterior,?\s*(?:es\s+)?(?:causado|ocasionado|originado|generado|debido)\s+(?:por|a)\s+([\s\S]+?)(?:,\s*lo cual\b|,\s*lo que\b|\.\s|$)/i.exec(
      pmTxt(des)
    );
  if (!m) return '';
  const c = m[1]
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,]+$/, '');
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : '';
}
/* Dependencia a partir de textos libres (lugar de verificación, responsable, título del hallazgo),
   con las mismas reglas que unifican los organismos del Excel de control */
function pmDepSugerida(textos) {
  for (const t of textos) {
    if (!pmTxt(t)) continue;
    const id = pmDepMatch(t);
    if (id) return id;
    const c = typeof ceCanonUno === 'function' ? ceCanonUno(t) : null;
    if (c) {
      const d = S.deps.find(x => orgKey(x.nombre) === orgKey(c[0]));
      if (d) return d.id;
    }
  }
  return null;
}
/* =====================================================================
   LECTURA DEL INFORME FINAL EN PDF (formato de la Contraloría General de Santiago de Cali)
   El navegador extrae el texto con pdf.js; aquí se rearman las líneas y se ubican los hallazgos:
   "3.1 HALLAZGO ADMINISTRATIVO N° 1 – CON PRESUNTA INCIDENCIA DISCIPLINARIA - TÍTULO", la dependencia
   que lo encabeza, la condición, la causa ("Lo anterior, causado por…") y el efecto ("…lo cual genera…").
   El resultado es un plan en formulación, con los hallazgos listos y sin acciones.
   ===================================================================== */
/* páginas = [[{s, x, y, w, h}]] (texto de pdf.js) → líneas de texto en orden de lectura */
function pmPdfLineas(paginas) {
  const out = [];
  paginas.forEach((items, pi) => {
    const filas = [];
    items
      .filter(it => it.s !== '')
      .forEach(it => {
        const tol = Math.max(2, (it.h || 10) * 0.4);
        let f = filas.find(r => Math.abs(r.y - it.y) <= tol);
        if (!f) filas.push((f = { y: it.y, items: [] }));
        f.items.push(it);
      });
    filas.sort((a, b) => b.y - a.y);
    filas.forEach(f => {
      f.items.sort((a, b) => a.x - b.x);
      let t = '',
        fin = null;
      f.items.forEach(it => {
        if (fin !== null && it.x - fin > 1.5 && !/\s$/.test(t) && !/^\s/.test(it.s)) t += ' ';
        t += it.s;
        fin = it.x + (it.w || 0);
      });
      t = t.replace(/\s+/g, ' ').trim();
      if (t) out.push({ t, pag: pi + 1 });
    });
  });
  return out;
}
const PM_PDF_RUIDO =
  /^informe final\b|^p[aá]gina \d+ de \d+$|contraloriacali|centro administrativo municipal|^\(57\)|^www\.|^\d{1,3}$/i;
const pmMayus = t => {
  const l = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
  return l.length >= 6 && l.replace(/[^a-záéíóúñ]/g, '').length / l.length < 0.12;
};
function pmEfectoDe(des) {
  const m =
    /,\s*lo cual (?:genera|ocasiona|conlleva|puede generar|genera un|afecta)\s+([\s\S]+?)(?:,\s*(?:que|configur)|\.\s|$)/i.exec(
      pmTxt(des)
    );
  if (!m) return '';
  const e = m[1]
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,]+$/, '');
  return e ? e.charAt(0).toUpperCase() + e.slice(1) : '';
}
function pmParseInformePdf(paginas, fileName) {
  const lineas = pmPdfLineas(paginas).filter(l => !PM_PDF_RUIDO.test(l.t));
  const T = lineas.map(l => l.t);
  const todo = T.join('\n');
  const kt = pmKey(todo);
  /* la contraloría que firma el informe (otras pueden citarse en el texto) */
  const formato = /contraloria general de santiago de cali|contraloria distrital/.test(kt)
    ? 'PM_01_CGSC'
    : /contraloria general de la republica/.test(kt)
      ? 'F14_CGR'
      : 'PM_01_CGSC';
  const avisos = [];
  /* portada: nombre de la actuación, número y fecha del informe */
  const pag1 = lineas.filter(l => l.pag === 1).map(l => l.t);
  const iRad = pag1.findIndex(t => /^\d{3,4}(\.\d{2,3}){3,4}$/.test(t));
  const iTit = pag1.findIndex(t => /^(actuaci[oó]n|auditor[ií]a|informe de auditor|denuncia)/i.test(t));
  let ejercicio = '';
  if (iTit >= 0) {
    const fin = iRad > iTit ? iRad : Math.min(pag1.length, iTit + 3);
    ejercicio = pag1
      .slice(iTit, fin)
      .filter(t => !/^informe final$/i.test(t))
      .join(' ');
  }
  ejercicio = ejercicio
    .replace(/\s+/g, ' ')
    .replace(/N[ºo°]\s*(\d)/, 'Nº $1')
    .trim();
  const MES = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12
  };
  const mf = /(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i.exec(pag1.join(' '));
  const fecha_informe = mf && MES[pmKey(mf[2])] ? `${mf[3]}-${pad(MES[pmKey(mf[2])])}-${pad(+mf[1])}` : null;
  /* hallazgos: encabezado en mayúsculas que puede ocupar varias líneas; se omite la tabla de contenido */
  const hall = [];
  let depPrev = null;
  const finSeccion = /^\d+\.\s*(resumen|relaci[oó]n de hallazgos|anexos)\b/i;
  const inicioH = t => /^(\d+(?:\.\d+)*)\s+hallazgo\b/i.test(t);
  for (let i = 0; i < T.length; i++) {
    if (!inicioH(T[i])) continue;
    let j = i,
      enc = T[i];
    let indice = /\s\d{1,3}$/.test(T[i]);
    /* el encabezado continúa en las líneas siguientes en mayúsculas, sin pasar a otra página */
    while (
      j + 1 < T.length &&
      lineas[j + 1].pag === lineas[i].pag &&
      pmMayus(T[j + 1]) &&
      !inicioH(T[j + 1]) &&
      !finSeccion.test(T[j + 1]) &&
      enc.length < 400
    ) {
      enc += ' ' + T[++j];
      if (/\s\d{1,3}$/.test(T[j])) indice = true;
    }
    if (indice || /\s\d{1,3}$/.test(enc)) {
      i = j;
      continue; /* tabla de contenido: termina en número de página */
    }
    /* cuerpo hasta el siguiente hallazgo o el fin de la sección */
    let k = j + 1;
    const cuerpo = [];
    while (k < T.length && !inicioH(T[k]) && !finSeccion.test(T[k])) cuerpo.push(T[k++]);
    /* dependencia: línea en mayúsculas justo antes del encabezado; si no hay, la del hallazgo anterior */
    let dep = null;
    for (let b = i - 1; b >= Math.max(0, i - 3); b--) {
      if (!pmMayus(T[b])) break;
      const c = typeof ceCanonUno === 'function' ? ceCanonUno(T[b]) : null;
      if (c) {
        dep = T[b];
        break;
      }
    }
    if (dep) depPrev = dep;
    else dep = depPrev;
    /* la última línea en mayúsculas del cuerpo anterior pudo ser la dependencia de este hallazgo: se quita */
    if (hall.length && dep && hall[hall.length - 1]._cola === dep)
      hall[hall.length - 1].descripcion = hall[hall.length - 1].descripcion.replace(
        new RegExp('\\s*' + dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$'),
        ''
      );
    const ke = pmKey(enc);
    const conn = ['administrativa'];
    if (/disciplinari/.test(ke)) conn.push('disciplinaria');
    if (/fiscal/.test(ke.replace(/denuncia fiscal/g, ''))) conn.push('fiscal');
    if (/penal/.test(ke)) conn.push('penal');
    if (/sancionatori/.test(ke)) conn.push('sancionatoria');
    if (/otra incidencia|otras incidencias|otro hallazgo/.test(ke)) conn.push('otra');
    const num =
      (/n\s*[°ºo.]*\s*(\d+)/i.exec(enc.replace(/^\d+(?:\.\d+)*\s+/, '')) || [])[1] || String(hall.length + 1);
    const titulo = enc
      .replace(/^\d+(?:\.\d+)*\s+/, '')
      .split(/\s+[–-]\s+|\s*[–]\s*/)
      .map(x => x.trim())
      .filter(x => x && !/^hallazgo\b/i.test(x) && !/^con presunta incidencia/i.test(x))
      .join(' - ');
    const texto = cuerpo.join(' ').replace(/\s+/g, ' ').trim();
    const iContra = texto.search(/lo anterior,?\s*contravin|contraviniendo lo establecido/i);
    const condicion = (
      iContra > 0 ? texto.slice(0, iContra) : texto.split(/lo anterior,?\s*(?:es\s+)?causado/i)[0]
    ).trim();
    const causa = pmCausaDe(texto);
    const efecto = pmEfectoDe(texto);
    let cuantia = null;
    if (conn.includes('fiscal')) {
      const mq = /(?:detrimento|da[ñn]o patrimonial|cuant[ií]a)[^$]{0,120}\$\s?([\d.]+(?:,\d+)?)/i.exec(
        texto
      );
      if (mq) cuantia = Number(mq[1].replace(/\./g, '').replace(',', '.'));
    }
    hall.push({
      numero: num,
      numeroOrig: num,
      descripcion: (titulo ? titulo + '. ' : '') + condicion,
      causa,
      efecto,
      connotaciones: conn,
      macroproceso: '',
      cuantia,
      fila: lineas[i].pag,
      dependencia: dep || '',
      dependencia_id: dep ? pmDepSugerida([dep]) : null,
      acciones: [],
      _cola: pmMayus(cuerpo[cuerpo.length - 1] || '') ? cuerpo[cuerpo.length - 1] : null
    });
    i = k - 1;
  }
  hall.forEach(h => delete h._cola);
  if (!hall.length)
    throw new Error(
      'No se encontraron hallazgos en el PDF. Debe ser un informe con texto (no escaneado) y con encabezados del tipo "3.1 HALLAZGO ADMINISTRATIVO N° 1 …".'
    );
  /* relación de hallazgos del propio informe: sirve de control */
  const mRel = /administrativos?\s+(\d+)\s/i.exec(todo.slice(todo.search(/relaci[oó]n de hallazgos/i) + 1));
  if (mRel && +mRel[1] !== hall.length)
    avisos.push({
      n: 'r',
      t: `El informe dice ${mRel[1]} hallazgos administrativos y se leyeron ${hall.length}. Revise que no falte ninguno.`
    });
  hall.forEach(h => {
    if (!h.causa)
      avisos.push({
        n: 'y',
        t: `Hallazgo ${h.numero}: no se encontró la causa en el texto; escríbala antes de formular las acciones.`
      });
    if (!h.dependencia_id)
      avisos.push({ n: 'y', t: `Hallazgo ${h.numero}: no se reconoció la dependencia responsable.` });
  });
  const plan = {
    formato,
    contraloria: (PM_FMT[formato] || PM_FMT.OTRO).contraloria,
    entidad: 'Distrito Especial de Santiago de Cali',
    nit: '',
    representante_legal: '',
    ordenador_gasto: '',
    ejercicio: ejercicio || pmTxt(fileName).replace(/\.pdf$/i, ''),
    tipo_ejercicio: (/^(actuaci[oó]n especial|auditor[ií]a [a-záéíóú]+)/i.exec(ejercicio) || [''])[0],
    modalidad: '',
    vigencia_pvcft: ((/vigencia (\d{4})/i.exec(ejercicio) || [])[1] || '').trim(),
    periodo_auditado: '',
    numero_informe: iRad >= 0 ? pag1[iRad] : '',
    radicado_orfeo: '',
    fecha_informe,
    fecha_suscripcion: '',
    estado: 'formulacion',
    observaciones:
      'Hallazgos leídos del informe final ' +
      fileName +
      '. Plan en formulación: falta definir las acciones de mejora.'
  };
  avisos.unshift({
    n: 'b',
    t: 'Se creará el plan en formulación, con los hallazgos y sin acciones. Las acciones se agregan después (con sugerencias según la causa) y la fecha de suscripción se actualiza al firmarlo.'
  });
  return {
    archivo: fileName,
    hoja: 'PDF',
    formato,
    plan,
    hall,
    avisos,
    feval: null,
    fevalRaw: null,
    desdePdf: true
  };
}
function pmParseSheet(X, ws, name) {
  const rows = pmAoa(X, ws);
  let hr = -1,
    map = null,
    best = 0;
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const m = pmMapHeader(rows[r]),
      n = Object.keys(m).length;
    if (('accion' in m || 'actividad' in m) && n > best && n >= 4) {
      best = n;
      hr = r;
      map = m;
    }
  }
  if (hr < 0) return null;
  /* metadatos del encabezado */
  const meta = {};
  const LBL = [
    ['entidad', /^entidad( auditada)?\b/],
    ['nit', /^nit\b/],
    ['representante_legal', /^representante legal/],
    ['ejercicio', /^nombre (del ejercicio|de la actuacion)/],
    ['tipo_ejercicio', /^tipo de (ejercicio|actuacion)/],
    ['fecha_suscripcion', /^fecha de suscripcion/],
    ['vigencia_pvcft', /^vigencia pvcft|^vigencia pvcf|^vigencia/],
    ['periodo_auditado', /^periodo fiscal/],
    ['modalidad', /^modalidad de auditoria/],
    ['fecha_eval', /^fecha de evaluacion/]
  ];
  const isLabel = s =>
    LBL.some(([, re]) =>
      re.test(
        pmKey(s)
          .replace(/\(\d+\)/g, '')
          .trim()
      )
    );
  const texto = [];
  for (let r = 0; r < hr; r++) {
    const row = rows[r];
    row.forEach((cell, ci) => {
      const raw = pmTxt(cell);
      if (!raw) return;
      texto.push(raw);
      const k = pmKey(raw)
        .replace(/\(\d+\)/g, '')
        .trim();
      const lb = LBL.find(([key, re]) => !(key in meta) && re.test(k));
      if (!lb) return;
      let v = '';
      const ix = raw.indexOf(':');
      if (ix >= 0) v = pmTxt(raw.slice(ix + 1));
      if (!v) {
        for (let c = ci + 1; c < row.length; c++) {
          const x = row[c];
          if (x === '' || x == null) continue;
          if (isLabel(x)) break;
          v = x;
          break;
        }
      }
      if (v !== '' && v != null) meta[lb[0]] = v;
    });
  }
  /* filas de datos */
  const data = [];
  let vacias = 0;
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r];
    const g = k => (k in map ? row[map[k]] : '');
    const all = row.map(pmTxt).filter(Boolean);
    if (!all.length) {
      if (++vacias >= 8) break;
      continue;
    }
    vacias = 0;
    const acc = pmTxt(g('accion')) || pmTxt(g('actividad'));
    /* totales y firmas (también cuando su celda combinada cubre la columna de la acción) */
    const k0 = pmKey(all[0]);
    const pie =
      /^totales?\b/.test(k0) || /\b(firma del representante|nombre y firma|elaboro|convenciones)\b/.test(k0);
    if (pie && (!acc || pmKey(acc) === k0)) break;
    /* segunda fila de un encabezado combinado */
    if (Object.keys(pmMapHeader(row)).length >= 4) continue;
    if (!acc && !pmTxt(g('descripcion'))) continue;
    if (/^\(?\d{1,2}\)?$/.test(acc)) continue; /* fila con la numeración de columnas */
    data.push({ fila: r + 1, g, acc });
  }
  /* filas finales sin acción (firmas, nombres, notas al pie) no son hallazgos */
  while (data.length && !data[data.length - 1].acc) data.pop();
  return { name, map, meta, data, texto: texto.join(' '), hr };
}
function pmParseWorkbook(X, wb, fileName) {
  const hojas = wb.SheetNames.map(n => pmParseSheet(X, wb.Sheets[n], n)).filter(Boolean);
  if (!hojas.length)
    throw new Error(
      'No se encontró la tabla del plan: el archivo debe tener la fila de encabezados con las columnas del hallazgo y de la acción.'
    );
  /* la hoja PM_02 (papel de trabajo de evaluación de la CGSC) acompaña al PM_01 pero no es el plan:
     si hay una hoja PM_01 con acciones, se usa esa. Luego, la hoja con más filas; ante empate, la que trae
     avance (F14.1) */
  const esPm02 = h =>
    /pm 02|papel de trabajo pt 03/.test(pmKey(h.name + ' ' + String(h.texto || '').slice(0, 400)));
  const hayPm01 = hojas.some(h => !esPm02(h) && h.data.length);
  hojas.sort(
    (a, b) =>
      (hayPm01 ? esPm02(a) - esPm02(b) : 0) ||
      b.data.length - a.data.length ||
      ('avfis' in b.map || 'pct' in b.map) - ('avfis' in a.map || 'pct' in a.map)
  );
  const H = hojas[0];
  if (!H.data.length)
    throw new Error('La hoja «' + H.name + '» tiene encabezados pero no trae acciones diligenciadas.');
  /* El Formulario 14.1 no trae el área responsable: se toma del Formulario 14 del mismo libro */
  const respOtra = {};
  if (!('responsable' in H.map))
    hojas.slice(1).forEach(o => {
      if ('responsable' in o.map)
        o.data.forEach(d => {
          const k = pmKey(d.g('numero')) + '|' + pmKey(d.acc);
          if (!(k in respOtra)) respOtra[k] = pmTxt(d.g('responsable'));
        });
    });
  const kt = pmKey(H.texto);
  const formato =
    'avfis' in H.map ||
    'proposito' in H.map ||
    'unidad' in H.map ||
    /formulario no 14|contraloria general de la republica/.test(kt)
      ? 'F14_CGR'
      : 'connotacion' in H.map || /pm 01|contraloria general de santiago de cali/.test(kt)
        ? 'PM_01_CGSC'
        : 'OTRO';
  const m = H.meta,
    avisos = [];
  const fs = pmFecha(m.fecha_suscripcion);
  const plan = {
    formato,
    contraloria: (PM_FMT[formato] || PM_FMT.OTRO).contraloria,
    entidad: pmTxt(m.entidad) || 'Distrito Especial de Santiago de Cali',
    nit: pmTxt(m.nit),
    representante_legal: pmTxt(m.representante_legal),
    ordenador_gasto: '',
    ejercicio: pmTxt(m.ejercicio) || (formato === 'F14_CGR' ? pmTxt(m.modalidad) : ''),
    tipo_ejercicio: pmTxt(m.tipo_ejercicio) || (formato === 'F14_CGR' ? pmTxt(m.modalidad) : ''),
    modalidad: pmTxt(m.modalidad),
    vigencia_pvcft: pmTxt(m.vigencia_pvcft).replace(/\.0$/, ''),
    periodo_auditado: pmTxt(m.periodo_auditado).replace(/\.0$/, ''),
    numero_informe: '',
    radicado_orfeo: '',
    fecha_informe: null,
    fecha_suscripcion: fs || '',
    estado: 'en_ejecucion',
    observaciones: 'Importado del archivo ' + fileName
  };
  if (!fs)
    avisos.push({ n: 'y', t: 'El archivo no trae una fecha de suscripción reconocible: escríbela abajo.' });
  if (!plan.ejercicio)
    avisos.push({
      n: 'y',
      t: 'El archivo no trae el nombre del ejercicio de fiscalización: escríbelo abajo.'
    });
  const fevalRaw = m.fecha_eval,
    feval = pmFecha(fevalRaw);
  /* % de avance del PM_01: 0..1 o 0..100 */
  let escala = 1;
  if (formato !== 'F14_CGR' && 'pct' in H.map) {
    const nums = H.data.map(d => pmNum(d.g('pct'))).filter(v => !isNaN(v));
    const conPct = H.data.some(d => /%/.test(String(d.g('pct'))));
    if (nums.length && !conPct && Math.max(...nums) <= 1) escala = 100;
  }
  const hall = [],
    porNum = {};
  let cur = null;
  H.data.forEach(d => {
    const g = d.g;
    let num = pmTxt(g('numero')).replace(/\.0$/, '');
    if (num.length > 20) {
      /* celda con texto largo ("Hallazgo No 7 AGEI Especial…"): se toma el número */
      const mm = num.match(
        /^(?:hallazgo\s*)?(?:n(?:o|ro|um(?:ero)?)?\s*[.°º]*\s*)?(\d+[a-z]?(?:[.-]\d+)*)\b/i
      );
      if (mm) num = mm[1];
    } else num = num.replace(/^hallazgo\s*(n[°ºo.]*\s*)?/i, '');
    const des = pmTxt(g('descripcion'));
    if (!num && !des && cur) {
      /* fila que continúa el hallazgo anterior */
    } else if (!cur || num !== cur.numeroOrig || (des && des !== cur.descripcion)) {
      if (!num) num = cur && des === cur.descripcion ? cur.numeroOrig : 'S/N-' + (hall.length + 1);
      let numero = num;
      if (porNum[numero] && porNum[numero].descripcion !== des) {
        let k = 2;
        while (porNum[num + ' (' + k + ')']) k++;
        numero = num + ' (' + k + ')';
        avisos.push({
          n: 'y',
          t: `Fila ${d.fila}: el número de hallazgo «${num}» se repite con otra descripción; se registró como «${numero}».`
        });
      }
      if (porNum[numero] && porNum[numero].descripcion === des) cur = porNum[numero];
      else {
        cur = {
          numero,
          numeroOrig: num,
          descripcion: des,
          causa: pmTxt(g('causa')) || pmCausaDe(des),
          efecto: pmTxt(g('efecto')),
          connotaciones: pmConnOf(g('connotacion')),
          macroproceso: pmTxt(g('macro')),
          cuantia: null,
          fila: d.fila,
          acciones: []
        };
        porNum[numero] = cur;
        hall.push(cur);
      }
    }
    const accion = pmTxt(g('accion')) || pmTxt(g('actividad'));
    if (!accion) return;
    const resp = pmTxt(g('responsable')) || respOtra[pmKey(g('numero')) + '|' + pmKey(accion)] || '';
    const prev = cur.acciones[cur.acciones.length - 1];
    /* acción en celdas combinadas que abarcan varias filas: es la misma acción */
    if (
      prev &&
      prev.accion === accion &&
      prev.meta === pmTxt(g('meta')) &&
      prev.responsable === resp &&
      pmTxt(prev.ffinRaw) === pmTxt(g('ffin')) &&
      pmTxt(prev.actividad) === pmTxt(g('actividad'))
    )
      return;
    const a = {
      fila: d.fila,
      accion,
      proposito: pmTxt(g('proposito')),
      actividad: pmTxt(g('actividad')),
      meta: pmTxt(g('meta')),
      unidad_medida: formato === 'F14_CGR' ? pmTxt(g('unidad')) : 'Porcentaje',
      cantidadRaw: g('cantidad'),
      cantidad: formato === 'F14_CGR' ? pmNum(g('cantidad')) : 100,
      fuente_verificacion: pmTxt(g('fuente')),
      lugar_verificacion: pmTxt(g('lugar')),
      finiRaw: g('fini'),
      fini: pmFecha(g('fini')),
      ffinRaw: g('ffin'),
      ffin: pmFecha(g('ffin')),
      responsable: resp,
      dependencia_id: pmDepMatch(resp),
      avance: null,
      fecha_corte: null,
      descripcion_avance: pmTxt(g('descav')) || pmTxt(g('obs')),
      obs_ci: pmTxt(g('obsci'))
    };
    if (!plan.direccion_tecnica && pmTxt(g('dirtec'))) plan.direccion_tecnica = pmTxt(g('dirtec'));
    /* 3. dependencia: si el nombre exacto no aparece, se reconoce por el lugar, el responsable o el título del hallazgo */
    if (!a.dependencia_id)
      a.dependencia_id = pmDepSugerida([a.lugar_verificacion, resp, pmTxt(cur.descripcion).split('\n')[0]]);
    if (formato === 'F14_CGR' && 'avfis' in H.map) {
      const v = pmNum(g('avfis'));
      if (!isNaN(v) && pmTxt(g('avfis')) !== '') {
        a.avance = v;
        a.fecha_corte = feval;
        a.sinCorte = !feval;
      }
    } else if ('pct' in H.map && pmTxt(g('pct')) !== '') {
      const v = pmNum(g('pct'));
      if (!isNaN(v)) {
        a.avance = Math.round(v * escala * 100) / 100;
        a.fecha_corte = pmFecha(g('fcorte'));
        a.sinCorte = !a.fecha_corte;
      }
    }
    /* PM_01 versión 2020 exportado por la app: el avance validado va en la descripción del avance */
    const mAv = /\(Avance validado ([\d.,]+)\s*%\s*con corte (\d{2}\/\d{2}\/\d{4})\)/.exec(
      a.descripcion_avance
    );
    if (mAv) {
      if (a.avance == null) {
        a.avance = pmNum(mAv[1]);
        a.fecha_corte = pmFecha(mAv[2]);
        a.sinCorte = !a.fecha_corte;
      }
      a.descripcion_avance = a.descripcion_avance.replace(mAv[0], '').trim();
    }
    cur.acciones.push(a);
  });
  /* 5. causas repetidas: en este plan o en planes ya registrados → sugerir una acción transversal */
  const clave = c => pmKey(c).slice(0, 120);
  const vistas = {};
  hall.forEach(h => {
    const k = clave(h.causa);
    if (k.length < 30) return;
    (vistas[k] = vistas[k] || []).push(h.numero);
  });
  Object.values(vistas).forEach(nums => {
    if (nums.length > 1)
      avisos.push({
        n: 'y',
        t: `Los hallazgos ${nums.join(' y ')} tienen la misma causa. Considere una acción transversal (por ejemplo, una circular o un control común) además de las acciones de cada dependencia.`
      });
  });
  hall.forEach(h => {
    const k = clave(h.causa);
    if (k.length < 30) return;
    const prev = (PM.hall || []).find(x => clave(x.causa) === k);
    if (prev) {
      const pl = (PM.planes || []).find(x => x.id === prev.plan_id);
      avisos.push({
        n: 'y',
        t: `El hallazgo ${h.numero} repite la causa del hallazgo ${prev.numero}${pl ? ' del plan «' + pmTxt(pl.ejercicio).slice(0, 60) + '»' : ''}: es un hallazgo recurrente.`
      });
    }
  });
  const obsCi = [];
  hall.forEach(h => h.acciones.forEach(a => a.obs_ci && obsCi.push(`Hallazgo ${h.numero}: ${a.obs_ci}`)));
  if (obsCi.length) {
    avisos.push({
      n: 'y',
      t: `El archivo trae ${obsCi.length} observación(es) de Control Interno sobre la formulación de las acciones. Quedan en cada acción como pendientes, para marcarlas como atendidas cuando se verifique el ajuste.`
    });
  }
  return { archivo: fileName, hoja: H.name, formato, plan, hall, avisos, feval, fevalRaw };
}
/* Valida lo importado con los datos del plan tal como quedaron en el formulario */
function pmImpCheck(imp) {
  const err = [],
    warn = imp.avisos.slice(),
    p = imp.plan,
    hoy = pmHoy();
  if (!pmTxt(p.contraloria)) err.push('Indica la contraloría.');
  if (pmTxt(p.ejercicio).length < 4) err.push('Escribe el nombre del ejercicio de fiscalización.');
  if (!pmFecha(p.fecha_suscripcion)) {
    if (imp.desdePdf)
      warn.push({
        n: 'y',
        t: `Sin fecha de suscripción: se registrará provisionalmente la del informe (${fmtD(p.fecha_informe || hoy)}).`
      });
    else err.push('Indica la fecha de suscripción del plan.');
  }
  const dup = PM.planes.find(
    x =>
      x.formato === p.formato &&
      pmKey(x.ejercicio) === pmKey(p.ejercicio) &&
      x.fecha_suscripcion === p.fecha_suscripcion
  );
  if (dup)
    err.push(
      'Ya existe un plan con el mismo formato, ejercicio y fecha de suscripción. Si quieres reemplazarlo, elimina primero el plan anterior.'
    );
  let nAcc = 0,
    nAv = 0;
  imp.hall.forEach(h => {
    if (pmTxt(h.descripcion).length < 4)
      err.push(`Fila ${h.fila}: el hallazgo ${h.numero} no tiene descripción.`);
    if (!h.acciones.length && !imp.desdePdf)
      err.push(`Fila ${h.fila}: el hallazgo ${h.numero} no tiene acciones.`);
    if (imp.desdePdf && !h.dependencia_id)
      warn.push({
        n: 'y',
        t: `Hallazgo ${h.numero}: elija la dependencia responsable (también se puede después).`
      });
    h.acciones.forEach(a => {
      nAcc++;
      const ini = a.fini || (pmFecha(p.fecha_suscripcion) ? p.fecha_suscripcion : null);
      if (!a.ffin)
        err.push(`Fila ${a.fila}: fecha de terminación no reconocida («${pmTxt(a.ffinRaw) || 'vacía'}»).`);
      if (imp.formato === 'F14_CGR' && !a.fini)
        warn.push({
          n: 'y',
          t: `Fila ${a.fila}: sin fecha de iniciación reconocible; se usa la fecha de suscripción.`
        });
      if (a.ffin && ini && a.ffin < ini)
        err.push(
          `Fila ${a.fila}: la fecha de terminación (${fmtD(a.ffin)}) es anterior a la de inicio (${fmtD(ini)}).`
        );
      if (!(a.cantidad > 0))
        err.push(
          `Fila ${a.fila}: la cantidad de la meta no es un número mayor que cero («${pmTxt(a.cantidadRaw) || 'vacía'}»).`
        );
      if (imp.formato === 'F14_CGR' && !a.unidad_medida)
        warn.push({ n: 'y', t: `Fila ${a.fila}: sin unidad de medida; se registrará como «Unidades».` });
      if (!a.dependencia_id)
        warn.push({
          n: 'r',
          t: `Fila ${a.fila}: no se reconoció la dependencia responsable («${shortTxt(a.responsable || 'vacío', 70)}»). Asígnala en la tabla.`
        });
      if (a.avance != null) {
        if (a.sinCorte)
          warn.push({
            n: 'y',
            t: `Fila ${a.fila}: trae avance pero no fecha de corte; ese avance no se importa.`
          });
        else if (a.fecha_corte > hoy)
          warn.push({
            n: 'y',
            t: `Fila ${a.fila}: la fecha de corte del avance es futura; ese avance no se importa.`
          });
        else nAv++;
        if (a.avance > a.cantidad)
          warn.push({
            n: 'y',
            t: `Fila ${a.fila}: el avance (${pmNumTxt(a.avance)}) supera la meta (${pmNumTxt(a.cantidad)}); para los indicadores cuenta como 100%.`
          });
      }
    });
  });
  return { err, warn, nAcc, nAv };
}
function pmImportModal() {
  openModal({
    title: 'Importar plan de mejoramiento desde Excel',
    wide: true,
    body: `<div class="pm-drop">
      <i class="fa-solid fa-file-excel"></i>
      <b>Selecciona el plan en Excel (.xlsx, .xls) o el informe final en PDF</b>
      <div class="muted">Excel: formato PM_01 de la Contraloría General de Santiago de Cali o Formularios 14 / 14.1 de la Contraloría General de la República. PDF: el informe final con los hallazgos; se crea el plan en formulación para agregar las acciones con sugerencias.</div>
      <input type="file" id="pmImpFile" accept=".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
    </div>
    <div id="pmImpOut"></div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmDoImport" id="pmImpBtn" disabled><i class="fa-solid fa-file-import"></i> Importar</button>`
  });
  $('#pmImpFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    PM.impFile = f || null;
    if (!f) return;
    const out = $('#pmImpOut');
    out.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>Leyendo el archivo…</div>';
    try {
      if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
        PM.imp = pmParseInformePdf(await pmLeerPdf(f), f.name);
      } else {
        const X = await pmXlsx();
        const wb = X.read(new Uint8Array(await f.arrayBuffer()), { type: 'array', cellDates: false });
        PM.imp = pmParseWorkbook(X, wb, f.name);
      }
      pmImpRender();
    } catch (er) {
      PM.imp = null;
      out.innerHTML = `<div class="pm-note r"><i class="fa-solid fa-circle-exclamation"></i> ${esc(er.message)}</div>`;
      $('#pmImpBtn').disabled = true;
    }
  });
}
function pmImpRender() {
  const imp = PM.imp,
    p = imp.plan,
    out = $('#pmImpOut');
  const deps = S.deps.slice().sort((x, y) => x.nombre.localeCompare(y.nombre));
  const depOpts = sel =>
    `<option value="">— Sin asignar —</option>${deps.map(d => `<option value="${esc(d.id)}"${String(d.id) === String(sel) ? ' selected' : ''}>${esc(shortOrg(d.nombre))}</option>`).join('')}`;
  const acc = imp.hall.flatMap(h => h.acciones.map(a => ({ h, a })));
  out.innerHTML = `
    <div class="pm-imp-sum">
      <span class="pm-ctl ${imp.formato === 'F14_CGR' ? 'cgr' : imp.formato === 'PM_01_CGSC' ? 'cgsc' : ''}">${esc((PM_FMT[imp.formato] || PM_FMT.OTRO).nombre)}</span>
      <span class="muted">${imp.desdePdf ? 'Informe final en PDF' : 'Hoja «' + esc(imp.hoja) + '»'} · ${imp.hall.length} hallazgos · ${acc.length} acciones</span>
    </div>
    <div class="row2">
      ${pmF(
        'pmIFmt',
        'Formato',
        `<select id="pmIFmt">${Object.entries(PM_FMT)
          .map(([k, v]) => `<option value="${k}"${p.formato === k ? ' selected' : ''}>${v.nombre}</option>`)
          .join('')}</select>`
      )}
      ${pmF('pmICtl', 'Contraloría *', pmIn('pmICtl', p.contraloria))}
    </div>
    ${pmF('pmIEje', 'Nombre del ejercicio de fiscalización *', pmTa('pmIEje', p.ejercicio, 2))}
    <div class="row2">
      ${pmF('pmIFs', imp.desdePdf ? 'Fecha de suscripción (provisional)' : 'Fecha de suscripción *', pmIn('pmIFs', p.fecha_suscripcion, 'type="date"'), imp.desdePdf ? 'Si la deja vacía se usa la fecha del informe; actualícela al firmar el plan' : '')}
      ${pmF('pmITipo', 'Tipo de ejercicio', pmIn('pmITipo', p.tipo_ejercicio, 'list="pmTipos"') + `<datalist id="pmTipos">${PM_TIPOS.map(t => `<option>${t}</option>`).join('')}</datalist>`)}
    </div>
    <div class="row2">
      ${pmF('pmIInf', 'N.º del informe final', pmIn('pmIInf', p.numero_informe))}
      ${pmF('pmIRep', 'Representante legal', pmIn('pmIRep', p.representante_legal))}
    </div>
    ${imp.formato === 'F14_CGR' && imp.fevalRaw ? `<div class="hint" style="margin:-6px 0 10px">Fecha de evaluación del Formulario 14.1: ${imp.feval ? fmtD(imp.feval) : 'no reconocida («' + esc(pmTxt(imp.fevalRaw)) + '»)'}. Es la fecha de corte de los avances importados.</div>` : ''}
    ${
      imp.desdePdf
        ? `<div class="field"><label>Hallazgos leídos del informe y dependencia responsable</label>
      <div class="tbl-wrap pm-imp-tbl"><table class="tbl" style="min-width:720px"><thead><tr><th>Pág.</th><th>N.º</th><th>Hallazgo</th><th>Incidencia</th><th>Dependencia</th></tr></thead><tbody>
      ${imp.hall
        .map(
          (h, i) =>
            `<tr><td class="mono">${h.fila}</td><td class="mono">${esc(h.numero)}</td><td class="asunto">${esc(shortTxt(h.descripcion, 110))}${h.causa ? `<div class="muted" style="font-size:.72rem"><b>Causa:</b> ${esc(shortTxt(h.causa, 110))}</div>` : ''}</td><td>${pmConnChips(h)}</td><td><select class="pmIHDep" data-i="${i}">${depOpts(h.dependencia_id)}</select>${h.dependencia ? `<div class="muted" style="font-size:.7rem">${esc(shortTxt(h.dependencia, 50))}</div>` : ''}</td></tr>`
        )
        .join('')}</tbody></table></div></div>`
        : ''
    }
    <div class="field"${imp.desdePdf ? ' hidden' : ''}><label>Dependencia responsable de cada acción</label>
      <div class="pm-imp-all"><span class="muted" style="font-size:.78rem">Asignar a todas las que están sin asignar:</span><select id="pmIAll">${depOpts('')}</select></div>
      <div class="tbl-wrap pm-imp-tbl"><table class="tbl" style="min-width:720px"><thead><tr><th>Fila</th><th>Hallazgo</th><th>Acción</th><th>Termina</th><th>Avance</th><th>Dependencia</th></tr></thead><tbody>
      ${acc
        .map(
          ({ h, a }, i) =>
            `<tr><td class="mono">${a.fila}</td><td class="mono">${esc(h.numero)}</td><td class="asunto">${esc(shortTxt(a.accion, 80))}<div class="muted" style="font-size:.72rem">${esc(shortTxt(a.responsable, 70))}</div></td><td style="white-space:nowrap">${a.ffin ? fmtD(a.ffin) : `<span style="color:var(--redink)">${esc(pmTxt(a.ffinRaw) || '—')}</span>`}</td><td class="mono">${a.avance == null ? '—' : pmPctTxt(Math.min(1, a.avance / (a.cantidad || 1)))}</td><td><select class="pmIDep" data-i="${i}">${depOpts(a.dependencia_id)}</select></td></tr>`
        )
        .join('')}</tbody></table></div></div>
    <div id="pmIChk"></div>`;
  const sync = () => {
    p.formato = $('#pmIFmt').value;
    p.contraloria = pmVal('pmICtl');
    p.ejercicio = pmVal('pmIEje');
    p.fecha_suscripcion = pmVal('pmIFs');
    p.tipo_ejercicio = pmVal('pmITipo');
    p.numero_informe = pmVal('pmIInf');
    p.representante_legal = pmVal('pmIRep');
    document.querySelectorAll('.pmIHDep').forEach(s => {
      imp.hall[+s.dataset.i].dependencia_id = s.value ? +s.value || s.value : null;
    });
    document.querySelectorAll('.pmIDep').forEach(s => {
      const a = acc[+s.dataset.i].a;
      a.dependencia_id = s.value ? +s.value || s.value : null;
    });
    const k = pmImpCheck(imp);
    const rojo = k.warn.filter(w => w.n === 'r'),
      amar = k.warn.filter(w => w.n !== 'r');
    $('#pmIChk').innerHTML = `
      <div class="pm-imp-k">
        <span class="pm-chip">${imp.hall.length} hallazgos</span><span class="pm-chip">${k.nAcc} acciones</span><span class="pm-chip g">${k.nAv} avances a importar como validados</span>
        ${k.err.length ? `<span class="pm-chip r">${k.err.length} error(es)</span>` : '<span class="pm-chip g">Sin errores</span>'}${k.warn.length ? `<span class="pm-chip y">${k.warn.length} aviso(s)</span>` : ''}
      </div>
      ${
        k.err.length
          ? `<div class="pm-note r"><b>Corrige antes de importar:</b><ul>${k.err
              .slice(0, 40)
              .map(t => `<li>${esc(t)}</li>`)
              .join('')}</ul>${k.err.length > 40 ? `<div>… y ${k.err.length - 40} más</div>` : ''}</div>`
          : ''
      }
      ${
        rojo.length
          ? `<div class="pm-note r"><ul>${rojo
              .slice(0, 30)
              .map(w => `<li>${esc(w.t)}</li>`)
              .join(
                ''
              )}</ul>${rojo.length > 30 ? `<div>… y ${rojo.length - 30} más</div>` : ''}<div>Puedes importar así y asignarlas después, pero mientras no tengan dependencia nadie las verá ni reportará su avance.</div></div>`
          : ''
      }
      ${
        amar.length
          ? `<div class="pm-note y"><ul>${amar
              .slice(0, 30)
              .map(w => `<li>${esc(w.t)}</li>`)
              .join('')}</ul>${amar.length > 30 ? `<div>… y ${amar.length - 30} más</div>` : ''}</div>`
          : ''
      }`;
    $('#pmImpBtn').disabled = k.err.length > 0;
    imp.__k = k;
  };
  out
    .querySelectorAll('input,select,textarea')
    .forEach(el => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', sync));
  $('#pmIFmt').addEventListener('change', () => {
    const f = PM_FMT[$('#pmIFmt').value];
    if (f && f.contraloria) $('#pmICtl').value = f.contraloria;
    sync();
  });
  $('#pmIAll').addEventListener('change', e => {
    if (!e.target.value) return;
    document.querySelectorAll('.pmIDep').forEach(s => {
      if (!s.value) s.value = e.target.value;
    });
    e.target.value = '';
    sync();
  });
  sync();
}
async function pmDoImport(btn) {
  const imp = PM.imp;
  if (!imp || !imp.__k || imp.__k.err.length) return;
  const p = imp.plan,
    hoy = pmHoy();
  const en = S.entes.find(x => pmKey(x.nombre) === pmKey(p.contraloria));
  const payload = {
    archivo: imp.archivo,
    plan: {
      ...p,
      requerimiento_id: PM.v19 ? (pmReqSugerido(p) || {}).id || null : undefined,
      fecha_radicacion_informe: PM.v20
        ? p.fecha_radicacion_informe || (pmReqSugerido(p) || {}).fecha_radicacion || null
        : undefined,
      fecha_suscripcion: p.fecha_suscripcion || (imp.desdePdf ? p.fecha_informe || hoy : p.fecha_suscripcion),
      ente_id: en ? en.id : null
    },
    hallazgos: imp.hall.map(h => ({
      numero: h.numero,
      descripcion: h.descripcion,
      causa: h.causa,
      efecto: h.efecto,
      connotaciones: h.connotaciones,
      cuantia: h.cuantia,
      macroproceso: h.macroproceso,
      dependencia_id: h.dependencia_id || null,
      dependencia_texto: h.dependencia || '',
      acciones: h.acciones.map(a => {
        const ok = a.avance != null && a.fecha_corte && a.fecha_corte <= hoy;
        return {
          dependencia_id: a.dependencia_id || null,
          responsable: a.responsable,
          accion: a.accion,
          proposito: a.proposito,
          actividad: a.actividad,
          meta: a.meta,
          unidad_medida: a.unidad_medida || 'Unidades',
          cantidad: a.cantidad,
          fuente_verificacion: a.fuente_verificacion,
          lugar_verificacion: a.lugar_verificacion,
          fecha_inicio: a.fini || p.fecha_suscripcion,
          fecha_fin: a.ffin,
          avance: ok ? a.avance : null,
          fecha_corte: ok ? a.fecha_corte : null,
          descripcion_avance: ok ? a.descripcion_avance : '',
          obs_ci: a.obs_ci || ''
        };
      })
    }))
  };
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Importando…';
  }
  try {
    const id = await pmImportar(payload);
    closeModal();
    PM.imp = null;
    PM.plan = id;
    PM.tab = 'acciones';
    toast(`Plan importado: ${payload.hallazgos.length} hallazgos y ${imp.__k.nAcc} acciones`);
    /* memoria: el archivo original queda en el archivo documental del plan */
    await pmDocCopia(PM.impFile, {
      plan_id: id,
      tipo: imp.desdePdf ? 'informe_final' : 'plan_excel',
      observaciones: 'Archivo original importado'
    });
    PM.impFile = null;
    await pmRefresh();
  } catch (e) {
    toast(e.message, 'err');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Importar';
    }
  }
}

/* ---------- exportación ---------- */
function pmExportModal(p) {
  openModal({
    title: 'Exportar en el formato de la contraloría',
    body: `
      ${pmF('pmEFmt', 'Formato', `<select id="pmEFmt"><option value="PM_01_CGSC"${p.formato !== 'F14_CGR' ? ' selected' : ''}>PM_01 CGSC · formulación y avance (Contraloría de Cali)</option>${p.formato === 'PM_01_CGSC' ? '<option value="PM_01_AVANCE">PM_01 CGSC · informe semestral de avance (art. 11: columnas 16, 17 y 18)</option>' : ''}<option value="F14_CGR"${p.formato === 'F14_CGR' ? ' selected' : ''}>Formularios 14 y 14.1 · suscripción y seguimiento (CGR)</option></select>`)}
      ${pmF('pmECorte', 'Fecha de corte / evaluación', pmIn('pmECorte', PM.eval || pmHoy(), 'type="date"'), 'Se toma el último avance VALIDADO hasta esta fecha. Los avances por validar no se incluyen.')}
      ${PM.v20 && pmCanEdit() ? `<label class="chk" style="margin:6px 0"><input type="checkbox" id="pmEArch" checked> Guardar una copia en el archivo documental del plan</label>` : ''}
      <div class="hint">Para la CGSC, el archivo se nombra como lo exige el SIA Contralorías (FORMATO_202001_PM_CGSC_…); para el informe semestral use como corte el 30 de junio o el 31 de diciembre. El archivo de la CGR trae los cálculos del Formulario 14.1 como fórmulas de Excel. Revíselo antes de firmarlo y cargarlo en el aplicativo de la contraloría.</div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="pmDoExport" data-id="${esc(p.id)}"><i class="fa-solid fa-download"></i> Descargar Excel</button>`
  });
}
const pmXDate = s => {
  const d = parseD(s);
  return Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000
  );
};
function pmPlanData(p) {
  const hall = PM.hall.filter(h => h.plan_id === p.id).sort((a, b) => (a.orden || 0) - (b.orden || 0));
  return hall.map(h => ({
    h,
    acc: PM.acc.filter(a => a.hallazgo_id === h.id).sort((a, b) => (a.orden || 0) - (b.orden || 0))
  }));
}
function pmRespTxt(a) {
  const d = pmDepN(a.dependencia_id),
    r = pmTxt(a.responsable);
  if (!r) return d;
  if (!d || pmKey(r).includes(pmKey(d))) return r;
  return r + ' - ' + d;
}
/* Connotación como la lista desplegable del formato PM_01 (hoja LISTA) */
function pmConnPM01(h) {
  const c = new Set(h.connotaciones || []);
  if (c.has('sancionatoria') && c.size <= 2) return 'Sancionatorio';
  if (c.has('otra') && [...c].every(x => x === 'otra' || x === 'administrativa')) return 'Otra';
  const f = c.has('fiscal'),
    d = c.has('disciplinaria'),
    pe = c.has('penal');
  if (f && d && pe) return 'Administrativa, Fiscal, Penal y Disciplinaria';
  if (d && pe) return 'Administrativa, Disciplinaria y Penal';
  if (f && pe) return 'Administrativa fiscal y penal';
  if (f && d) return 'Administrativa fiscal y disciplinaria';
  if (f) return 'Administrativa fiscal';
  if (pe) return 'Administrativa penal';
  if (d) return 'Administrativa disciplinaria';
  return 'Administrativa';
}
const PM_MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
];
const pmFechaLarga = iso => {
  if (!pmFecha(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${PM_MESES_LARGOS[m - 1]} de ${y}`;
};
/* Formato PM_01 CGSC versión 2020: misma estructura, títulos y fórmulas de la plantilla de la Contraloría */
function pmSheetPM01(X, p, corte) {
  const datos = pmPlanData(p);
  const ws = {};
  const merges = [];
  const put = (ref, v, extra) => {
    if (v === null || v === undefined || v === '') return;
    ws[ref] = typeof v === 'object' && v.f ? { t: 'n', f: v.f } : { t: typeof v === 'number' ? 'n' : 's', v };
    if (extra) Object.assign(ws[ref], extra);
  };
  const M = r => merges.push(X.utils.decode_range(r));
  put('A1', 'CONTRALORÍA GENERAL DE SANTIAGO DE CALI');
  M('A1:J1');
  put('A2', 'FORMATO PM_01 CGSC - PLAN DE MEJORAMIENTO');
  M('A2:J2');
  M('Q2:S2');
  put('Q3', 'RESULTADO EVALUACIÓN PLAN DE MEJORAMIENTO');
  M('Q3:S3');
  put('Q4', 'VARIABLES A EVALUAR');
  M('Q4:R4');
  put('S4', 'Calificación Parcial');
  put('A5', 'Entidad auditada (1): ');
  M('A5:F5');
  put('G5', (p.entidad || 'DISTRITO DE SANTIAGO DE CALI').toUpperCase());
  M('G5:J5');
  put('Q5', 'Cumplimiento del Plan de Mejoramiento ');
  M('Q5:R5');
  put('S5', { f: '+L9' });
  put('A6', 'Nombre de la actuación de control fiscal (2): ');
  M('A6:F6');
  put('G6', p.ejercicio || '');
  M('G6:J6');
  put('A7', 'Tipo de actuación de control fiscal (3):');
  M('A7:F7');
  put('G7', p.tipo_ejercicio || '');
  M('G7:J7');
  put('Q7', 'Efectividad de las acciones');
  M('Q7:R7');
  put('S7', { f: '+M9' });
  put('A8', 'Fecha de suscripción (4): ' + pmFechaLarga(p.fecha_suscripcion));
  M('A8:F8');
  put('G8', 'Vigencia PVCFT (5)');
  M('G8:H8');
  put('I8', p.vigencia_pvcft || '');
  M('I8:J8');
  put('L8', { f: '+L9*0.2+M9*0.8' });
  M('L8:M8');
  put('Q8', ' CUMPLIMIENTO PLAN DE MEJORAMIENTO');
  M('Q8:S8');
  put('L9', { f: 'IF(COUNT(L12:L668)>0,AVERAGE(L12:L668)*100/2,0)' });
  put('M9', { f: 'IF(COUNT(M12:M668)>0,AVERAGE(M12:M668)*100/2,0)' });
  put('Q9', 'Concepto a emitir cumplimiento Plan de Mejoramiento');
  M('Q9:S9');
  put('A10', 'FORMULACIÓN DEL PLAN DE MEJORAMIENTO');
  M('A10:J10');
  put('K10', 'AVANCE DEL PLAN DE MEJORAMIENTO');
  M('K10:O10');
  [
    'N° hallazgo (6)',
    'Descripción de la condición y causa del hallazgo \n(7)',
    'Connotación del hallazgo \n(8)',
    'Macroproceso, criterio u otro\n(9)',
    'Acción de Correctiva\n(10)',
    'Meta \n(11)',
    'Fuente de verificación\n(12)',
    'Lugar de verificación\n(13)',
    'Fecha terminación de la Actividad\n(14)',
    'Responsable (Nombre y Cargo)\n(15)',
    'Descripción del avance de la acción\n(16)',
    'CUMPLIMIENTO\n20%',
    'EFECTIVIDAD\n80%',
    'ESTADO DE LA ACCIÓN\n(Cerrada-C / Abierta-A)',
    'DIRECCIÓN TECNICA RESPONSABLE',
    'Observaciones DACI'
  ].forEach((t, c) => put(X.utils.encode_cell({ r: 10, c }), t));
  let r = 11;
  datos.forEach(({ h, acc }) => {
    const r0 = r;
    (acc.length ? acc : [null]).forEach(a => {
      const av = a ? pmAvAl(a, corte) : null;
      const cal = a && PM.v19 ? pmCalAcc(a, corte) : null;
      const fila = [
        h.numero,
        [
          pmTxt(h.descripcion),
          h.causa && !pmKey(h.descripcion).includes(pmKey(h.causa).slice(0, 40)) ? 'Causa: ' + h.causa : ''
        ]
          .filter(Boolean)
          .join('\n'),
        pmConnPM01(h),
        h.macroproceso || '',
        a ? a.accion : '',
        a ? pmMetaTxt(a) : '',
        a ? a.fuente_verificacion || '' : '',
        a ? a.lugar_verificacion || '' : '',
        a && pmFecha(a.fecha_fin) ? pmXDate(a.fecha_fin) : '',
        a ? pmRespTxt(a) : '',
        av
          ? [
              av.descripcion || '',
              `(Avance validado ${pmPctTxt(pmPct(a, av.cantidad))} con corte ${fmtD(av.fecha_corte)})`
            ]
              .filter(Boolean)
              .join(' ')
          : '',
        cal && cal.c != null ? cal.c : '',
        cal && cal.e != null ? cal.e : '',
        cal && (cal.c != null || cal.e != null) ? cal.estado : '',
        p.direccion_tecnica || '',
        a && a.obs_ci ? a.obs_ci + (a.obs_ci_estado === 'atendida' ? ' (atendida)' : '') : ''
      ];
      fila.forEach((v, c) =>
        put(X.utils.encode_cell({ r, c }), v, c === 8 && v !== '' ? { t: 'n', z: 'dd/mm/yyyy' } : null)
      );
      r++;
    });
    if (r - r0 > 1) for (let c = 0; c <= 3; c++) merges.push({ s: { r: r0, c }, e: { r: r - 1, c } });
  });
  r += 3;
  put(X.utils.encode_cell({ r, c: 0 }), '______________________________');
  put(X.utils.encode_cell({ r, c: 6 }), '______________________________');
  put(X.utils.encode_cell({ r: r + 1, c: 0 }), p.representante_legal || '');
  put(X.utils.encode_cell({ r: r + 1, c: 6 }), p.ordenador_gasto || '');
  put(
    X.utils.encode_cell({ r: r + 2, c: 0 }),
    'Nombre y firma del Representante Legal del Sujeto de Vigilancia de Control Fiscal'
  );
  put(X.utils.encode_cell({ r: r + 2, c: 6 }), 'Nombre y firma del Ordenador del Gasto del Punto de Control');
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 2, c: 18 } });
  ws['!merges'] = merges;
  ws['!cols'] = [10, 60, 22, 18, 45, 28, 28, 22, 14, 32, 50, 12, 12, 14, 28, 40, 4, 24, 14].map(w => ({
    wch: w
  }));
  return ws;
}
/* Formato PM_02 CGSC (papel de trabajo PT 03-PF, evaluación del plan, versión 2.1) */
function pmSheetPM02(X, p, corte) {
  const datos = pmPlanData(p);
  const ws = {};
  const merges = [];
  const put = (ref, v, extra) => {
    if (v === null || v === undefined || v === '') return;
    ws[ref] = typeof v === 'object' && v.f ? { t: 'n', f: v.f } : { t: typeof v === 'number' ? 'n' : 's', v };
    if (extra) Object.assign(ws[ref], extra);
  };
  const M = x => merges.push(X.utils.decode_range(x));
  const acc = PM.acc.filter(a => a.plan_id === p.id);
  const k = PM.v19 ? pmCalCgsc(acc, corte) : { C: 0 };
  put('A1', 'CONTRALORÍA GENERAL DE SANTIAGO DE CALI');
  M('A1:F1');
  put('A2', 'PAPEL DE TRABAJO PT 03-PF EVALUACIÓN PLAN DE MEJORAMIENTO - Versión 2.1');
  M('A2:F2');
  put('Q3', 'RESULTADO EVALUACIÓN PLAN DE MEJORAMIENTO');
  M('Q3:U3');
  put('B4', 'AVANCE PLAN DE MEJORAMIENTO');
  M('B4:E4');
  put('Q4', 'VARIABLES A EVALUAR');
  M('Q4:R4');
  put('S4', 'Calificación Parcial');
  put('T4', 'Ponderación');
  put('U4', 'Puntaje Atribuido');
  put('A6', 'Entidad auditada:');
  M('A6:D6');
  put('E6', (p.entidad || 'DISTRITO DE SANTIAGO DE CALI').toUpperCase());
  put('Q6', 'Cumplimiento del Plan de Mejoramiento ');
  M('Q6:R6');
  put('S6', Math.round(k.C * 100) / 100);
  put('T6', 0.2);
  put('U6', { f: 'S6*T6' });
  put('A7', 'Auditoría u otra actuación:');
  M('A7:D7');
  put('E7', p.ejercicio || '');
  put('Q7', 'Efectividad de las acciones');
  M('Q7:R7');
  put('S7', { f: '+L10' });
  put('T7', 0.8);
  put('U7', { f: 'S7*T7' });
  put('A8', 'Fecha realización:');
  M('A8:B8');
  put('C8', 'Vigencia PVCFT');
  put('D8', p.vigencia_pvcft || '');
  put('Q8', ' PROCENTAJE DE AVANCE PLAN DE MEJORAMIENTO');
  M('Q8:S8');
  put('T8', { f: 'SUM(T6:T7)' });
  put('U8', { f: 'SUM(U6:U7)' });
  [
    'N° hallazgo',
    'Descripción del hallazgo',
    'INCIDENCIA',
    'MACROPROCESO PROCESO',
    'Acción de mejora',
    'Meta',
    'Fuente de verificación',
    'Lugar de verificación',
    'Fecha terminación de la Actividad',
    'Responsable (Nombre y Cargo)',
    '% de avance'
  ].forEach((t, c) => put(X.utils.encode_cell({ r: 9, c }), t));
  put('L10', { f: 'IF(COUNT(L11:L695)>0,AVERAGE(L11:L695)*100/2,0)' });
  put('M10', 'ESTADO (C/A)');
  put('N10', 'RESPONSABLE DEL AVANCE');
  put('O10', 'OBSERVACIONES DEL AVANCE DE LA ACCIÓN');
  let r = 10;
  datos.forEach(({ h, acc: l }) =>
    l.forEach(a => {
      const av = pmAvAl(a, corte);
      const cal = PM.v19 ? pmCalAcc(a, corte) : null;
      [
        h.numero,
        pmTxt(h.descripcion),
        pmConnPM01(h),
        h.macroproceso || '',
        a.accion,
        pmMetaTxt(a),
        a.fuente_verificacion || '',
        a.lugar_verificacion || '',
        pmFecha(a.fecha_fin) ? pmXDate(a.fecha_fin) : '',
        pmRespTxt(a),
        av ? pmPct(a, av.cantidad) : 0,
        cal && cal.e != null ? cal.e : '',
        cal && (cal.c != null || cal.e != null) ? cal.estado : '',
        av ? av.reportado_email || '' : '',
        av ? [av.descripcion || '', 'Corte ' + fmtD(av.fecha_corte)].filter(Boolean).join(' · ') : ''
      ].forEach((v, c) =>
        put(
          X.utils.encode_cell({ r, c }),
          v,
          c === 8 && v !== '' ? { t: 'n', z: 'dd/mm/yyyy' } : c === 10 ? { t: 'n', z: '0%' } : null
        )
      );
      r++;
    })
  );
  ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 11), c: 20 } });
  ws['!merges'] = merges;
  ws['!cols'] = [10, 60, 22, 18, 45, 28, 28, 22, 14, 32, 10, 12, 12, 28, 50, 4, 24, 12, 12, 12, 12].map(
    w => ({ wch: w })
  );
  return ws;
}
function pmSheetsF14(X, p, corte) {
  const datos = pmPlanData(p);
  const filas = [];
  datos.forEach(({ h, acc }) => acc.forEach(a => filas.push({ h, a })));
  const enc = (titulo, form) => [
    [],
    ['INFORME PRESENTADO A LA CONTRALORIA GENERAL DE LA REPUBLICA'],
    [titulo],
    [form],
    [],
    ['ENTIDAD:', p.entidad || '', '', '', '', '', '', '', '', 'NIT:', p.nit || ''],
    ['REPRESENTANTE LEGAL:', p.representante_legal || ''],
    ['PERIODO FISCAL', p.periodo_auditado || p.vigencia_pvcft || ''],
    ['MODALIDAD DE AUDITORIA:', p.modalidad || p.tipo_ejercicio || ''],
    ['FECHA DE SUSCRIPCIÓN:', pmXDate(p.fecha_suscripcion)]
  ];
  const cab = [
    'No.',
    'Código hallazgo',
    'Descripción hallazgo ',
    'Causa del hallazgo',
    'Efecto del hallazgo',
    'Acción de mejoramiento',
    'Propósito de la Acción de Mejora',
    'Descripción de las Actividades ',
    'Denominación de la Unidad de medida de la Actividad',
    'Cantidad de Medida de la Actividad',
    'Fecha iniciación de la Actividad',
    'Fecha terminación de la Actividad',
    'Plazo en semanas de la Actividad'
  ];
  const base = (x, i) => [
    i + 1,
    x.h.numero,
    x.h.descripcion,
    x.h.causa || '',
    x.h.efecto || '',
    x.a.accion,
    x.a.proposito || '',
    x.a.actividad || x.a.meta || '',
    x.a.unidad_medida,
    Number(x.a.cantidad),
    pmXDate(x.a.fecha_inicio),
    pmXDate(x.a.fecha_fin)
  ];
  const fecha = (ws, r, c) => {
    const a = X.utils.encode_cell({ r, c });
    if (ws[a]) Object.assign(ws[a], { t: 'n', z: 'dd/mm/yyyy' });
  };
  /* Formulario 14 · suscripción */
  const a1 = enc('SUSCRIPCIÓN PLANES DE MEJORAMIENTO', 'FORMULARIO No 14');
  a1.push([], [], [...cab, 'Area Responsable']);
  const d1 = a1.length;
  filas.forEach((x, i) =>
    a1.push([...base(x, i), pmSemanas(x.a), pmDepN(x.a.dependencia_id) || x.a.responsable || ''])
  );
  a1.push(
    [],
    [],
    [],
    ['', '', '', '', '', '', '', '', '', 'FIRMA DEL REPRESENTANTE LEGAL'],
    ['', '', '', '', '', '', '', '', '', 'Nombre: ' + (p.representante_legal || '')],
    ['', '', '', '', '', '', '', '', '', 'Correo electrónico:']
  );
  const ws1 = X.utils.aoa_to_sheet(a1);
  fecha(ws1, 9, 1);
  filas.forEach((x, i) => {
    const r = d1 + i,
      n = r + 1;
    fecha(ws1, r, 10);
    fecha(ws1, r, 11);
    ws1[X.utils.encode_cell({ r, c: 12 })] = { t: 'n', v: pmSemanas(x.a), f: `(+L${n}-K${n})/7`, z: '0.00' };
  });
  ws1['!cols'] = [6, 12, 50, 30, 30, 40, 30, 40, 18, 10, 12, 12, 10, 30].map(w => ({ wch: w }));
  /* Formulario 14.1 · seguimiento */
  const a2 = enc('SEGUIMIENTO PLANES DE MEJORAMIENTO', 'FORMULARIO No 14.1');
  a2[5] = ['ENTIDAD:', p.entidad || '', '', '', '', '', '', '', '', '', '', '', '', '', 'NIT:', p.nit || ''];
  a2.push([
    'Fecha de Evaluación:',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    pmXDate(corte)
  ]);
  a2.push([
    ...cab,
    'Avance fisico de ejecución de las Actividades',
    'Porcentaje de Avance fisico de ejecución de las Actividades',
    'Puntaje  Logrado  por las Actividades  (PLAI)',
    'Puntaje Logrado por las Actividades  Vencidas (PLAVI)  ',
    'Puntaje atribuido a las actividades vencidas (PAAVI)',
    'Observaciones'
  ]);
  a2.push([]);
  const d2 = a2.length;
  const tot = { plai: 0, plavi: 0, paavi: 0, pbea: 0 };
  filas.forEach((x, i) => {
    const av = pmAvAl(x.a, corte),
      cant = av ? Number(av.cantidad) : 0,
      s = pmSemanas(x.a),
      pc = pmPct(x.a, cant),
      venc = x.a.fecha_fin <= corte;
    tot.pbea += s;
    tot.plai += s * pc;
    tot.plavi += venc ? s * pc : 0;
    tot.paavi += venc ? s : 0;
    a2.push([
      ...base(x, i),
      s,
      cant,
      pc,
      s * pc,
      venc ? s * pc : 0,
      venc ? s : 0,
      av ? av.descripcion || '' : ''
    ]);
  });
  const rt = a2.length;
  a2.push([
    'TOTALES',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    tot.plai,
    tot.plavi,
    tot.paavi
  ]);
  a2.push(['Elaboró: ' + pmUser()], []);
  a2.push(
    ['', '', '', '', '', '', '', '', '', 'FIRMA DEL REPRESENTANTE LEGAL'],
    ['', '', '', '', '', '', '', '', '', 'Nombre: ' + (p.representante_legal || '')],
    ['', '', '', '', '', '', '', '', '', 'Correo electrónico:'],
    []
  );
  const re = a2.length;
  a2.push(['Convenciones: ', '', '', '', '', '', 'Evaluación del Plan de Mejoramiento']);
  a2.push(['', '', '', '', '', '', 'Puntajes base de Evaluación:']);
  a2.push([
    '',
    '',
    'Columnas de calculo automático ',
    '',
    '',
    '',
    'Puntaje base de evalaluación de cumplimiento',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'PBEC',
    '',
    tot.paavi
  ]);
  a2.push([
    '',
    '',
    'Informacion suministrada en el informe de la CGR ',
    '',
    '',
    '',
    'Puntaje base de evaluación de avance',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'PBEA',
    '',
    tot.pbea
  ]);
  a2.push([
    '',
    '',
    'Fila de Totales',
    '',
    '',
    '',
    'Cumplimiento del Plan de Mejoramiento',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'CPM = POMMVi / PBEC',
    '',
    tot.paavi ? tot.plavi / tot.paavi : 0
  ]);
  a2.push([
    '',
    '',
    '',
    '',
    '',
    '',
    'Avance del plan de Mejoramiento',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'AP =  POMi / PBEA',
    '',
    tot.pbea ? tot.plai / tot.pbea : 0
  ]);
  const ws2 = X.utils.aoa_to_sheet(a2);
  fecha(ws2, 9, 1);
  const S11 = '$S$' + 11; /* celda de la fecha de evaluación, como en la plantilla oficial */
  fecha(ws2, 10, 18);
  const nPrimera = d2 + 1,
    nUltima = d2 + filas.length;
  filas.forEach((x, i) => {
    const r = d2 + i,
      n = r + 1,
      av = pmAvAl(x.a, corte),
      cant = av ? Number(av.cantidad) : 0,
      s = pmSemanas(x.a),
      pc = pmPct(x.a, cant),
      venc = x.a.fecha_fin <= corte;
    fecha(ws2, r, 10);
    fecha(ws2, r, 11);
    const set = (c, v, f, z) => (ws2[X.utils.encode_cell({ r, c })] = { t: 'n', v, f, z });
    set(12, s, `(+L${n}-K${n})/7`, '0.00');
    set(14, pc, `IF(N${n}/J${n}>1,1,+N${n}/J${n})`, '0%');
    set(15, s * pc, `+M${n}*O${n}`, '0.00');
    set(16, venc ? s * pc : 0, `IF(L${n}<=${S11},P${n},0)`, '0.00');
    set(17, venc ? s : 0, `IF(${S11}>=L${n},M${n},0)`, '0.00');
  });
  if (filas.length) {
    const nt = rt + 1;
    ws2[X.utils.encode_cell({ r: rt, c: 15 })] = {
      t: 'n',
      v: tot.plai,
      f: `SUM(P${nPrimera}:P${nUltima})`,
      z: '0.00'
    };
    ws2[X.utils.encode_cell({ r: rt, c: 16 })] = {
      t: 'n',
      v: tot.plavi,
      f: `SUM(Q${nPrimera}:Q${nUltima})`,
      z: '0.00'
    };
    ws2[X.utils.encode_cell({ r: rt, c: 17 })] = {
      t: 'n',
      v: tot.paavi,
      f: `SUM(R${nPrimera}:R${nUltima})`,
      z: '0.00'
    };
    const c19 = (r, v, f, z) => (ws2[X.utils.encode_cell({ r, c: 19 })] = { t: 'n', v, f, z });
    c19(re + 2, tot.paavi, `+R${nt}`, '0.00');
    c19(re + 3, tot.pbea, `SUM(M${nPrimera}:M${nUltima})`, '0.00');
    c19(re + 4, tot.paavi ? tot.plavi / tot.paavi : 0, `IF(Q${nt}=0,0,+Q${nt}/T${re + 3})`, '0.00%');
    c19(re + 5, tot.pbea ? tot.plai / tot.pbea : 0, `IF(P${nt}=0,0,+P${nt}/T${re + 4})`, '0.00%');
  }
  ws2['!cols'] = [6, 12, 50, 30, 30, 40, 30, 40, 18, 10, 12, 12, 10, 12, 12, 12, 12, 12, 40, 12].map(w => ({
    wch: w
  }));
  return [ws1, ws2];
}
async function pmDoExport(id, btn) {
  const p = pmPlanOf(id),
    fmt = $('#pmEFmt').value,
    corte = $('#pmECorte').value;
  if (!pmFecha(corte)) return toast('Indica la fecha de corte', 'err');
  if (btn) btn.disabled = true;
  try {
    const X = await pmXlsx();
    const wb = X.utils.book_new();
    if (fmt === 'F14_CGR') {
      const [w1, w2] = pmSheetsF14(X, p, corte);
      X.utils.book_append_sheet(wb, w1, 'Informe Plan de mejoramiento ');
      X.utils.book_append_sheet(wb, w2, 'Avance Plan de Mejoramiento');
    } else if (fmt === 'PM_01_AVANCE') {
      X.utils.book_append_sheet(wb, pmSheetAvanceSemestral(X, p, corte), 'Formato PM_01 CGSC - AVANCE ');
    } else {
      X.utils.book_append_sheet(wb, pmSheetPM01(X, p, corte), 'Formato PM_01 CGSC - PLAN ');
      if (p.formato === 'PM_01_CGSC')
        X.utils.book_append_sheet(wb, pmSheetPM02(X, p, corte), 'Formato PM_02 CGSC - AVANCE ');
    }
    /* CGSC: nombre exigido por el SIA Contralorías (manual «Subida de planes de mejoramiento») */
    const nom =
      fmt === 'F14_CGR'
        ? `F14_CGR_${pmKey(p.numero_informe || p.ejercicio)
            .replace(/[^a-z0-9]+/g, '_')
            .slice(0, 40)}_corte_${corte}.xlsx`
        : pmNombreSIA(p, { avance: fmt === 'PM_01_AVANCE', corte: fmt === 'PM_01_AVANCE' ? corte : null });
    X.writeFile(wb, nom, { compression: true });
    if ($('#pmEArch') && $('#pmEArch').checked) {
      const bin = X.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
      await pmDocCopia(new File([bin], nom, { type: PM_DOC_MIME.xlsx }), {
        plan_id: p.id,
        tipo: fmt === 'PM_01_AVANCE' ? 'informe_avance' : 'formato_exportado',
        observaciones: 'Exportado con corte ' + fmtD(corte)
      });
      await pmRefresh();
    }
    closeModal();
    toast('Formato descargado: ' + nom);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* =====================================================================
   ACCIONES (las despacha 18-acciones.js: todo data-act que empieza por "pm")
   ===================================================================== */
async function pmAct(a, t) {
  const id = t.dataset.id;
  switch (a) {
    case 'pmReload':
      await pmRefresh();
      break;
    case 'pmCtl':
      PM.f.ctl = t.dataset.k;
      render();
      break;
    case 'pmOpen':
      PM.plan = id;
      PM.tab = 'acciones';
      PM.fa = { est: '', dep: '', q: '' };
      PM.eval = pmHoy();
      render();
      window.scrollTo(0, 0);
      break;
    case 'pmOpenAcc': {
      const x = pmAccOf(id);
      if (!x) break;
      closeModal();
      if (pmScoped()) {
        PM.plan = null;
      } else {
        PM.plan = x.plan_id;
        PM.tab = 'acciones';
        PM.fa = { est: '', dep: '', q: '' };
      }
      if (S.view !== 'planes') go('planes');
      else render();
      setTimeout(() => {
        const el = document.getElementById('pmA-' + id);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el.classList.add('pm-flash');
        }
      }, 60);
      break;
    }
    case 'pmBack':
      PM.plan = null;
      render();
      break;
    case 'pmTab':
      PM.tab = t.dataset.tab;
      render();
      break;
    case 'pmMore':
      PM.abiertos[id] = !PM.abiertos[id];
      render();
      break;
    case 'pmNewPlan':
      pmPlanModal(null);
      break;
    case 'pmEditPlan':
      pmPlanModal(pmPlanOf(id || PM.plan));
      break;
    case 'pmSavePlan':
      await pmSavePlan(id);
      break;
    case 'pmDelPlan': {
      const p = pmPlanOf(PM.plan);
      if (
        !p ||
        !confirm(
          `¿Eliminar el plan «${shortTxt(p.ejercicio, 80)}» con sus hallazgos y acciones? Esta acción queda en la auditoría y no se puede deshacer.`
        )
      )
        break;
      try {
        await pmEliminarPlan(p.id);
        PM.plan = null;
        toast('Plan eliminado');
        await pmRefresh();
      } catch (e) {
        toast(e.message, 'err');
      }
      break;
    }
    case 'pmNewHall':
      pmHallModal(null, PM.plan);
      break;
    case 'pmEditHall': {
      const h = pmHallOf(id);
      if (h) pmHallModal(h, h.plan_id);
      break;
    }
    case 'pmSaveHall':
      await pmSaveHall(id, t.dataset.plan);
      break;
    case 'pmDelHall': {
      const h = pmHallOf(id);
      if (!h || !confirm(`¿Eliminar el hallazgo ${h.numero} y sus acciones?`)) break;
      try {
        await pmDelete('hall', id);
        toast('Hallazgo eliminado');
        await pmRefresh();
      } catch (e) {
        toast(e.message, 'err');
      }
      break;
    }
    case 'pmProrAccion': {
      const x = PM.acc.find(r => r.id === id);
      if (x) pmProrModal('accion', { a: x });
      break;
    }
    case 'pmProrPresentar': {
      const p = pmPlanOf(PM.plan),
        pr = p && pmPresentacion(p);
      if (pr && pr.base) pmProrModal('presentacion', { p, venc: pr.limiteNorma });
      break;
    }
    case 'pmProrGuardar':
      await pmProrGuardar(t);
      break;
    case 'pmProrResolver': {
      const x = (PM.pror || []).find(r => r.id === id);
      if (x) pmProrResolverModal(x);
      break;
    }
    case 'pmProrResolverOk':
      await pmProrResolver(id, t);
      break;
    case 'pmInfModal': {
      const p = pmPlanOf(PM.plan);
      if (p) pmInfModal(p);
      break;
    }
    case 'pmInfGuardar':
      await pmInfGuardar(id, t);
      break;
    case 'pmNuevoPlan': {
      const p = pmPlanOf(PM.plan);
      if (p) pmNuevoPlanModal(p);
      break;
    }
    case 'pmNuevoPlanOk':
      await pmNuevoPlanCrear(id, t);
      break;
    case 'pmDocNuevo': {
      const p = pmPlanOf(PM.plan);
      if (p) pmDocNuevoModal(p);
      break;
    }
    case 'pmDocGuardar':
      await pmDocGuardar(id, t);
      break;
    case 'pmDocBajar':
      await pmDocDescargar(id);
      break;
    case 'pmDocPapelera':
      if (confirm('¿Enviar este documento a la papelera? Se puede restaurar.')) await pmDocMover(id, true);
      break;
    case 'pmDocRestaurar':
      await pmDocMover(id, false);
      pmPapeleraModal();
      break;
    case 'pmDocPurgar':
      await pmDocPurgar(id);
      break;
    case 'pmPapelera':
      await pmPapeleraModal();
      break;
    case 'pmRestaurar':
      await pmRestaurar(id, t);
      break;
    case 'pmCal': {
      const x = PM.acc.find(r => r.id === id);
      if (x) pmCalModal(x);
      break;
    }
    case 'pmSaveCal':
      await pmSaveCal(id);
      break;
    case 'pmObs': {
      const x = PM.acc.find(r => r.id === id);
      if (x) pmObsModal(x);
      break;
    }
    case 'pmObsGuardar':
      await pmObsGuardar(id);
      break;
    case 'pmObsAtendida':
      await pmObsGuardar(id, 'atendida');
      break;
    case 'pmObsQuitar':
      await pmObsGuardar(id, 'quitar');
      break;
    case 'pmEnlazarReq':
      await pmEnlazarReq(id);
      break;
    case 'pmAprobarPlan': {
      const x = PM.planes.find(r => r.id === PM.plan);
      if (x) pmAprobarModal(x);
      break;
    }
    case 'pmAprobar':
      await pmAprobar(id);
      break;
    case 'pmUsarSug':
      pmUsarSug(+t.dataset.i);
      break;
    case 'pmNewTras':
      closeModal();
      pmTrasModal(null, id);
      break;
    case 'pmEditTras': {
      const x = (PM.tras || []).find(r => r.id === id);
      if (x) pmTrasModal(x);
      break;
    }
    case 'pmSaveTras':
      await pmSaveTras(id, t.dataset.hall);
      break;
    case 'pmDelTras':
      await pmDelTras(id);
      break;
    case 'pmNewAcc':
      closeModal();
      if (pmHallOf(id)) pmAccModal(null, id);
      break;
    case 'pmEditAcc': {
      const x = pmAccOf(id);
      if (x) pmAccModal(x);
      break;
    }
    case 'pmSaveAcc':
      await pmSaveAcc(id, t.dataset.hall);
      break;
    case 'pmDelAcc': {
      const x = pmAccOf(id);
      if (!x || !confirm('¿Eliminar esta acción?')) break;
      try {
        await pmDelete('acc', id);
        toast('Acción eliminada');
        await pmRefresh();
      } catch (e) {
        toast(e.message, 'err');
      }
      break;
    }
    case 'pmReport': {
      const x = pmAccOf(id);
      if (x) pmReportModal(x);
      break;
    }
    case 'pmSaveAv':
      await pmSaveAv(id, t);
      break;
    case 'pmReview': {
      const v = PM.av.find(x => x.id === id);
      if (v) pmReviewModal(v);
      break;
    }
    case 'pmDoReview':
      await pmDoReview(id, t.dataset.estado);
      break;
    case 'pmHist': {
      const x = pmAccOf(id);
      if (x) pmHistModal(x);
      break;
    }
    case 'pmNotify':
      pmNotifyModal(t.dataset.dep);
      break;
    case 'pmSendNotif':
      await pmSendNotif(t.dataset.dep, t.dataset.canal);
      break;
    case 'pmImport':
      PM.imp = null;
      pmImportModal();
      break;
    case 'pmDoImport':
      await pmDoImport(t);
      break;
    case 'pmExport': {
      const p = pmPlanOf(PM.plan);
      if (p) pmExportModal(p);
      break;
    }
    case 'pmDoExport':
      await pmDoExport(id, t);
      break;
  }
}

/* =====================================================================
   RESÚMENES PARA EL CENTRO DE MANDO Y EL INFORME EJECUTIVO
   ===================================================================== */
function pmResumenMando() {
  if (!PM.ok || pmScoped()) return '';
  const hoy = pmHoy(),
    activos = PM.planes.filter(p => p.estado !== 'cerrado'),
    ids = new Set(activos.map(p => p.id)),
    acc = PM.acc.filter(a => ids.has(a.plan_id)),
    cn = pmCounts(acc),
    ind = pmIndic(acc, hoy),
    porVal = PM.av.filter(v => v.estado === 'reportado' && ids.has(v.plan_id)).length;
  if (!PM.planes.length)
    return `<div class="card pm-mando"><div class="pm-mando-h"><div><h3>Planes de mejoramiento</h3><div class="sub" style="margin:2px 0 0">Aún no hay planes cargados. Cuando Control Interno los entregue, su cumplimiento aparecerá aquí.</div></div><button class="btn sm" data-act="go" data-view="planes">Abrir planes</button></div></div>`;
  return `<div class="card pm-mando">
    <div class="pm-mando-h"><div><h3>Planes de mejoramiento</h3><div class="sub" style="margin:2px 0 0">${activos.length} plan${activos.length === 1 ? '' : 'es'} vigente${activos.length === 1 ? '' : 's'} con la Contraloría de Cali y la Contraloría General de la República</div></div>
      <button class="btn sm" data-act="go" data-view="planes">Ver planes</button></div>
    <div class="pm-ind" style="margin:12px 0">${pmMeter('Cumplimiento de metas vencidas', ind.cpm, 'var(--sem-v)', ind.cpm == null ? 'Aún no hay metas vencidas' : '')}${pmMeter('Avance de los planes', ind.ap, 'var(--neo, #4c8dff)')}</div>
    <div class="pm-chips"><span class="pm-chip">${cn.n} acciones</span>${cn.cumplida ? `<span class="pm-chip g">${cn.cumplida} cumplidas</span>` : ''}${cn.vencida ? `<span class="pm-chip r">${cn.vencida} vencidas sin cumplir</span>` : ''}${cn.proxima ? `<span class="pm-chip y">${cn.proxima} vencen en ${PM_ALERTA_DIAS} días</span>` : ''}${porVal ? `<span class="pm-chip b">${porVal} avances por validar</span>` : ''}</div>
  </div>`;
}
/* Sección del informe ejecutivo. org: nombre de la dependencia si el informe es de una sola. */
function pmSeccionInforme(org, num) {
  if (!PM.ok || !PM.planes.length) return '';
  const hoy = pmHoy();
  const accOrg = a => !org || pmDepN(a.dependencia_id) === org;
  const planes = PM.planes.filter(
    p => p.estado !== 'cerrado' && PM.acc.some(a => a.plan_id === p.id && accOrg(a))
  );
  if (!planes.length) return '';
  const filas = planes.map(p => {
    const l = PM.acc.filter(a => a.plan_id === p.id && accOrg(a)),
      k = pmCounts(l),
      i = pmIndic(l, hoy);
    return `<tr><td>${esc((PM_FMT[p.formato] || PM_FMT.OTRO).corto)}</td><td>${esc(shortTxt(p.ejercicio, 70))}</td><td>${fmtD(p.fecha_suscripcion)}</td><td style="text-align:right">${k.n}</td><td style="text-align:right">${k.cumplida}</td><td style="text-align:right"><b>${k.vencida}</b></td><td style="text-align:right">${pmPctTxt(i.cpm)}</td><td style="text-align:right">${pmPctTxt(i.ap)}</td></tr>`;
  });
  const venc = PM.acc
    .filter(a => planes.some(p => p.id === a.plan_id) && accOrg(a) && pmEstado(a).k === 'vencida')
    .sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)))
    .slice(0, 12);
  return `<div class="rsec"><h2>${num}. Planes de mejoramiento</h2><div class="rsmall" style="margin-bottom:6px">Cumplimiento (CPM) y avance (AP) con las fórmulas del Formulario 14.1 de la Contraloría General de la República, solo con avances validados al ${fmtD(hoy)}.</div>
    <table class="rt"><thead><tr><th>Contraloría</th><th>Plan</th><th>Suscrito</th><th>Acciones</th><th>Cumplidas</th><th>Vencidas</th><th>Cumplimiento</th><th>Avance</th></tr></thead><tbody>${filas.join('')}</tbody></table>
    ${venc.length ? `<h3 style="margin-top:12px">Acciones vencidas sin cumplir</h3><table class="rt"><thead><tr><th>Dependencia</th><th>Hallazgo</th><th>Acción</th><th>Terminaba</th><th>Avance</th></tr></thead><tbody>${venc.map(a => `<tr><td>${esc(shortOrg(pmDepN(a.dependencia_id)) || '—')}</td><td>${esc((pmHallOf(a.hallazgo_id) || {}).numero || '')}</td><td>${esc(shortTxt(a.accion, 80))}</td><td>${fmtD(a.fecha_fin)}</td><td style="text-align:right">${pmPctTxt(pmPct(a))}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
}
