/**
 * src/js/20-carga-excel.js
 * Carga de los Excel de control desde la app (reemplaza al ETL en Python de etl/): lee las hojas CONTROL y
 * NO RESPUESTA, unifica organismos, mide la oportunidad con días hábiles y festivos de Colombia, muestra una vista
 * previa con los cambios y las filas con problemas, y reemplaza la vigencia en Supabase en una sola operación.
 * La lectura reproduce etl/load.py y etl/clean.py regla por regla (verificado registro por registro contra el CSV del ETL).
 * Depende de: 02 (utilidades, festivosCO), 03 (S, rol), 04 (db, dbErr), 06 (toast, openModal, render),
 *             10 (HIST, loadHist), 19 (pmXlsx). Supabase: supabase/16_carga_excel.sql
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   1. VALORES DE CELDA CON LA MISMA SEMÁNTICA DE PYTHON/OPENPYXL
   Una celda queda como: null | texto | {n, f, raw} (número; f = era decimal en el archivo) | {d, h} (fecha)
   ===================================================================== */
const CE = { res: null, cargando: false };
/* Texto crudo de cada celda numérica, leído del XML del archivo: openpyxl distingue "1" (entero) de "1.0"
   (decimal) y esa diferencia cambia cómo Python escribe el valor como texto. */
function ceNumerosCrudos(wb, idx) {
  const out = new Map();
  try {
    const path = (wb.Directory.sheets[idx] || '').replace(/^\//, '');
    const f = wb.files && (wb.files[path] || wb.files['/' + path]);
    if (!f) return out;
    const xml = new TextDecoder('utf-8').decode(f.content);
    const re = /<c r="([A-Z]+[0-9]+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while ((m = re.exec(xml))) {
      if (/\bt="(s|str|inlineStr|b|e|d)"/.test(m[2]) || !m[3]) continue;
      const v = /<v>([^<]*)<\/v>/.exec(m[3]);
      if (v) out.set(m[1], v[1]);
    }
  } catch (e) {
    console.error(e);
  }
  return out;
}
function ceLimpiar(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    const t = v
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return t === '' || t === '-' ? null : t;
  }
  return v;
}
function ceCelda(X, ws, crudos, r, c) {
  const ref = X.utils.encode_cell({ r, c }),
    cell = ws[ref];
  if (!cell || cell.v == null) return null;
  if (cell.t === 's' || cell.t === 'str') return ceLimpiar(String(cell.v));
  if (cell.t === 'b') return cell.v ? 'True' : 'False';
  if (cell.t === 'e') return ceLimpiar(cell.w || '#N/A');
  if (cell.t === 'd' && cell.v instanceof Date) return { d: iso(cell.v), h: '00:00:00' };
  if (cell.t === 'n') {
    if (cell.z && X.SSF.is_date(cell.z)) {
      const p = X.SSF.parse_date_code(cell.v);
      if (p && p.y)
        return {
          d: p.y + '-' + pad(p.m) + '-' + pad(p.d),
          h: pad(p.H || 0) + ':' + pad(p.M || 0) + ':' + pad(Math.floor(p.S || 0))
        };
    }
    const raw = crudos.get(ref) || String(cell.v);
    return { n: cell.v, f: /[.eE]/.test(raw), raw };
  }
  return ceLimpiar(String(cell.v));
}
const ceEsNum = v => v != null && typeof v === 'object' && 'n' in v;
const ceEsFecha = v => v != null && typeof v === 'object' && 'd' in v;
/* bool(v) de Python: None, '', 0 y 0.0 son falsos */
const ceVerdad = v => v != null && v !== '' && !(ceEsNum(v) && v.n === 0);
/* str(v) de Python */
function cePyFloat(n) {
  if (!isFinite(n)) return isNaN(n) ? 'nan' : n > 0 ? 'inf' : '-inf';
  const a = Math.abs(n);
  if (Number.isInteger(n) && a < 1e16) return n.toFixed(0) + '.0';
  if (a >= 1e16 || (a < 1e-4 && n !== 0)) {
    const [m, e] = n.toExponential().split('e');
    const s = e[0] === '-' ? '-' : '+',
      d = e.replace(/^[+-]/, '');
    return m + 'e' + s + (d.length < 2 ? '0' + d : d);
  }
  return String(n);
}
function cePyStr(v) {
  if (v == null) return 'None';
  if (typeof v === 'string') return v;
  if (ceEsNum(v)) return v.f ? cePyFloat(v.n) : v.raw;
  if (ceEsFecha(v)) return v.d + ' ' + v.h;
  return String(v);
}
const ceTexto = v => (v == null ? null : cePyStr(v));
function ceIdStr(v) {
  if (v == null) return null;
  const t = cePyStr(v).trim();
  return /^\d+\.0$/.test(t) ? t.slice(0, -2) : t;
}
/* int(float(v)) de Python, o null si no se puede */
function ceEntero(v) {
  if (v == null || ceEsFecha(v)) return null;
  if (ceEsNum(v)) return isFinite(v.n) ? Math.trunc(v.n) : null;
  const s = String(v).trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return isFinite(n) ? Math.trunc(n) : null;
}

/* =====================================================================
   2. FECHAS, TEXTO Y ORGANISMOS (etl/clean.py)
   ===================================================================== */
const CE_MES = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12
};
function ceFechaValida(y, m, d) {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > new Date(y, m, 0).getDate()) return null;
  return y + '-' + pad(m) + '-' + pad(d);
}
/* pdate(): devuelve { d: 'AAAA-MM-DD' | null, malo: texto original si no se pudo leer } */
function ceFecha(v) {
  if (v == null) return { d: null, malo: null };
  if (ceEsFecha(v)) return { d: v.d, malo: null };
  const s = cePyStr(v).trim().toLowerCase();
  let m = /^(\d{1,2})[-/ ]([a-z]{3,4})\.?[-/ ](\d{2,4})$/.exec(s);
  if (m && CE_MES[m[2]]) {
    const r = ceFechaValida(+m[3], CE_MES[m[2]], +m[1]);
    if (r) return { d: r, malo: null };
  }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s);
  if (m) {
    const r = ceFechaValida(+m[3], +m[2], +m[1]);
    if (r) return { d: r, malo: null };
  }
  return { d: null, malo: cePyStr(v) };
}
/* Quita los signos diacríticos (unicodedata.combining en Python) */
const ceSinTildes = s =>
  String(s)
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '');
/* fold() de clean.py */
const ceFold = s =>
  ceSinTildes(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/* _fold() de load.py (conserva la puntuación) */
const ceFoldEnc = s =>
  ceSinTildes(s == null ? '' : cePyStr(s))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/* Reglas de unificación de organismos: (patrón sobre texto sin tildes, nombre oficial, tipo, confianza).
   Mismo orden y mismo contenido que RULES en etl/clean.py. */
const CE_SUB = 'Subunidad';
const CE_REGLAS = [
  /* EXTRA3 */
  ['contrav', 'Oficina de Contravenciones (padre por confirmar)', 'Subunidad', 'media'],
  ['comiaria', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  [
    'talento humane',
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento',
    'alta'
  ],
  ['politica de segurdad', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['infaestructura', 'Secretaría de Infraestructura', 'Secretaría', 'alta'],
  [
    'defensa judicial|defense judicial|prevencion del dano antijuridico',
    'Departamento Administrativo de Gestión Jurídica Pública',
    'Departamento',
    'alta'
  ],
  ['patrimonio|bibliotecas', 'Secretaría de Cultura', 'Secretaría', 'alta'],
  ['inspeccion urbano de policia', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  /* EXTRA2 */
  ['^\\d{1,3}( y \\d{1,3})?$|^y \\d+$', 'Sin dato', 'Otro', 'baja'],
  ['comis\\w*ri|corregidor', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['secretaria de (ed\\w*c\\w*n|edcuac\\w*|eduac\\w*)', 'Secretaría de Educación', 'Secretaría', 'alta'],
  ['cobertura educativa', 'Secretaría de Educación', 'Secretaría', 'alta'],
  ['seguridad y j\\w+|secretaria de inspeccion', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['infra\\w{3,}ructura', 'Secretaría de Infraestructura', 'Secretaría', 'alta'],
  ['sec+retaria privada', 'Oficina de la Secretaría Privada y Despacho del Alcalde', 'Despacho', 'alta'],
  ['etnias', 'Subsecretaría de Poblaciones y Etnias (padre por confirmar)', 'Subunidad', 'media'],
  ['contra\\w+ publica', 'Departamento Administrativo de Contratación Pública', 'Departamento', 'alta'],
  [
    'cobro (coactivo|persuasivo|coativo)|tesoreria|administracion de pagos',
    'Departamento Administrativo de Hacienda Municipal',
    'Departamento',
    'alta'
  ],
  [
    'subdireccion desarrollo integral',
    'Departamento Administrativo de Planeación Municipal',
    'Departamento',
    'alta'
  ],
  ['transparencia', 'Oficina de Transparencia (padre por confirmar)', 'Subunidad', 'media'],
  ['contravenciones', 'Oficina de Contravenciones (padre por confirmar)', 'Subunidad', 'media'],
  /* EXTRA */
  ['insp\\w* polic|inspeccion de policia', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['acceso a (servicios de )?(la )?justicia', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  [
    '(subsecretari[ao] (de )?(la )?)?politica de seguridad',
    'Secretaría de Seguridad y Justicia',
    'Secretaría',
    'alta'
  ],
  ['derechos humanos y construccion de paz', 'Secretaría de Paz y Cultura Ciudadana', 'Secretaría', 'alta'],
  ['mejoramiento integral y legalizacion', 'Secretaría de Vivienda Social y Hábitat', 'Secretaría', 'alta'],
  ['catast|finanzas publicas', 'Departamento Administrativo de Hacienda Municipal', 'Departamento', 'alta'],
  [
    'doctrina y asuntos normativos',
    'Departamento Administrativo de Gestión Jurídica Pública',
    'Departamento',
    'alta'
  ],
  [
    'centro de administracion local integrada|\\bcali \\d|cali rural',
    'Secretaría de Desarrollo Territorial y Participación Ciudadana',
    'Secretaría',
    'alta'
  ],
  ['takeshima', 'Unidad Administrativa Especial Estudios Takeshima', 'UAE', 'alta'],
  [
    'gestion ambiental',
    'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
    'Departamento',
    'alta'
  ],
  ['contrataci', 'Departamento Administrativo de Contratación Pública', 'Departamento', 'alta'],
  [
    'tecnolog|tenolog',
    'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones',
    'Departamento',
    'alta'
  ],
  ['suguridad|seguridad y just', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  ['educac', 'Secretaría de Educación', 'Secretaría', 'alta'],
  [
    'proteccion an\\w*mal|\\buepa\\b|\\buaepa\\b',
    'Unidad Administrativa Especial de Protección Animal',
    'UAE',
    'alta'
  ],
  [
    'contador del distrito|contaduria',
    'Departamento Administrativo de Hacienda Municipal',
    'Departamento',
    'alta'
  ],
  [
    'gestion del medio',
    'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
    'Departamento',
    'alta'
  ],
  ['\\bsgred\\b', 'Secretaría de Gestión del Riesgo de Emergencias y Desastres', 'Secretaría', 'alta'],
  [
    '\\bdatic\\b',
    'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones',
    'Departamento',
    'alta'
  ],
  [
    'disciplinario interno',
    'Departamento Administrativo de Control Disciplinario Interno',
    'Departamento',
    'alta'
  ],
  [
    'subsecretari[ao] (de )?(la )?primera infancia',
    'Subsecretaría de Primera Infancia (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?equidad',
    'Subsecretaría de Equidad de Género (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?(poblaciones y etnias|etnias y poblaciones)',
    'Subsecretaría de Poblaciones y Etnias (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?atencion',
    'Subsecretaría de Atención Integral a Víctimas (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'subsecretari[ao] (de )?inspeccion|^vigilancia y control',
    'Subsecretaría de Inspección, Vigilancia y Control (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  [
    'tramites servicios y gestion documental',
    'Subdirección de Trámites, Servicios y Gestión Documental (padre por confirmar)',
    'Subunidad',
    'media'
  ],
  /* subunidades con padre de confianza alta */
  [
    'subsecretaria de acceso a servicios de justicia|comisaria|inspeccion de policia|inspector',
    'Secretaría de Seguridad y Justicia',
    'Secretaría',
    'alta'
  ],
  ['subsecretaria de la politica de seguridad', 'Secretaría de Seguridad y Justicia', 'Secretaría', 'alta'],
  [
    'subsecretaria de promocion y fortalecimiento de la participacion',
    'Secretaría de Desarrollo Territorial y Participación Ciudadana',
    'Secretaría',
    'alta'
  ],
  [
    'subsecretaria (proteccion de la salud|de promocion prevencion)|subsecretaria de salud|promocion prevencion y produccion social',
    'Secretaría de Salud Pública',
    'Secretaría',
    'alta'
  ],
  [
    'subsecretaria de infraestructura y mantenimiento vial',
    'Secretaría de Infraestructura',
    'Secretaría',
    'alta'
  ],
  [
    'subsecretaria de infraestructura deportiva',
    'Secretaría del Deporte y la Recreación',
    'Secretaría',
    'alta'
  ],
  ['subsecretaria de movilidad sostenible', 'Secretaría de Movilidad', 'Secretaría', 'alta'],
  ['subsecretaria de artes', 'Secretaría de Cultura', 'Secretaría', 'alta'],
  [
    'subdireccion (de )?(finanzas publicas|tesoreria|de impuestos|de catastro)|oficina tecnica operativa de cobro coactivo|contaduria',
    'Departamento Administrativo de Hacienda Municipal',
    'Departamento',
    'alta'
  ],
  [
    'subdireccion (de )?(planificacion del territorio|de espacio publico|de desarrollo integral)',
    'Departamento Administrativo de Planeación Municipal',
    'Departamento',
    'alta'
  ],
  [
    '(subdireccion|subsecretaria) (de )?gesti\\w* estrategica (de )?(del )?talento humano|subdireccion estrategica de talento humano|talento humano',
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento',
    'alta'
  ],
  /* subunidades sin padre confirmado */
  [
    'subsecretaria de equidad de gener',
    'Subsecretaría de Equidad de Género (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  [
    'subsecretaria de poblaciones y etnias',
    'Subsecretaría de Poblaciones y Etnias (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  [
    'subsecretaria de atencion (integral )?a victimas',
    'Subsecretaría de Atención Integral a Víctimas (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  [
    'subsecretaria de inspeccion',
    'Subsecretaría de Inspección, Vigilancia y Control (padre por confirmar)',
    CE_SUB,
    'media'
  ],
  /* organismos principales */
  [
    'secretaria privada|despacho (del )?alcalde|^alcalde|^alcaldia$|^alcalde$',
    'Oficina de la Secretaría Privada y Despacho del Alcalde',
    'Despacho',
    'alta'
  ],
  ['todos los organismos', 'Todos los organismos', 'Otro', 'alta'],
  ['paz y cultura', 'Secretaría de Paz y Cultura Ciudadana', 'Secretaría', 'alta'],
  [
    'seguridad y just|seguridad y justcia|seguridad y jus',
    'Secretaría de Seguridad y Justicia',
    'Secretaría',
    'alta'
  ],
  ['educacion', 'Secretaría de Educación', 'Secretaría', 'alta'],
  ['movilidad', 'Secretaría de Movilidad', 'Secretaría', 'alta'],
  ['bienestar|binestar', 'Secretaría de Bienestar Social', 'Secretaría', 'alta'],
  ['salud', 'Secretaría de Salud Pública', 'Secretaría', 'alta'],
  ['infraestructura', 'Secretaría de Infraestructura', 'Secretaría', 'alta'],
  ['hacienda', 'Departamento Administrativo de Hacienda Municipal', 'Departamento', 'alta'],
  [
    'desarrollo (e )?innovacion|desarrollo institucional|dadii|desarrollo e inovacion',
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento',
    'alta'
  ],
  ['planeacion', 'Departamento Administrativo de Planeación Municipal', 'Departamento', 'alta'],
  [
    'desarrollo territorial|participacion ciudadana',
    'Secretaría de Desarrollo Territorial y Participación Ciudadana',
    'Secretaría',
    'alta'
  ],
  ['gobierno', 'Secretaría de Gobierno', 'Secretaría', 'alta'],
  [
    'medio ambiente|dagma',
    'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
    'Departamento',
    'alta'
  ],
  ['desarrollo economico', 'Secretaría de Desarrollo Económico', 'Secretaría', 'alta'],
  ['cultura', 'Secretaría de Cultura', 'Secretaría', 'alta'],
  ['bienes y servicios', 'Unidad Administrativa Especial de Gestión de Bienes y Servicios', 'UAE', 'alta'],
  [
    'control disciplinario',
    'Departamento Administrativo de Control Disciplinario Interno',
    'Departamento',
    'alta'
  ],
  ['control interno', 'Departamento Administrativo de Control Interno', 'Departamento', 'alta'],
  [
    'servicios publicos|uaesp',
    'Unidad Administrativa Especial de Servicios Públicos Municipales',
    'UAE',
    'alta'
  ],
  [
    'gestion juridica|juridica',
    'Departamento Administrativo de Gestión Jurídica Pública',
    'Departamento',
    'alta'
  ],
  ['deporte', 'Secretaría del Deporte y la Recreación', 'Secretaría', 'alta'],
  ['contratacion publica', 'Departamento Administrativo de Contratación Pública', 'Departamento', 'alta'],
  ['vivienda', 'Secretaría de Vivienda Social y Hábitat', 'Secretaría', 'alta'],
  ['riesgo', 'Secretaría de Gestión del Riesgo de Emergencias y Desastres', 'Secretaría', 'alta'],
  [
    'tecnologias de la informacion|\\btic\\b',
    'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones',
    'Departamento',
    'alta'
  ],
  ['turismo', 'Secretaría de Turismo', 'Secretaría', 'alta'],
  ['proteccion animal', 'Unidad Administrativa Especial de Protección Animal', 'UAE', 'alta'],
  ['teatro municipal', 'Teatro Municipal Enrique Buenaventura', 'UAE', 'alta']
].map(([p, n, l, c]) => [new RegExp(p), n, l, c]);
const CE_PADRE = {
  'Subsecretaría de Equidad de Género (padre por confirmar)': [
    'Secretaría de Bienestar Social',
    'Secretaría'
  ],
  'Subsecretaría de Poblaciones y Etnias (padre por confirmar)': [
    'Secretaría de Bienestar Social',
    'Secretaría'
  ],
  'Subsecretaría de Atención Integral a Víctimas (padre por confirmar)': [
    'Secretaría de Bienestar Social',
    'Secretaría'
  ],
  'Subsecretaría de Primera Infancia (padre por confirmar)': ['Secretaría de Bienestar Social', 'Secretaría'],
  'Subsecretaría de Inspección, Vigilancia y Control (padre por confirmar)': [
    'Secretaría de Seguridad y Justicia',
    'Secretaría'
  ],
  'Oficina de Contravenciones (padre por confirmar)': ['Secretaría de Movilidad', 'Secretaría'],
  'Subdirección de Trámites, Servicios y Gestión Documental (padre por confirmar)': [
    'Departamento Administrativo de Desarrollo e Innovación Institucional',
    'Departamento'
  ],
  'Oficina de Transparencia (padre por confirmar)': [
    'Oficina de la Secretaría Privada y Despacho del Alcalde',
    'Despacho'
  ]
};
function ceCanonUno(txt) {
  const f = ceFold(txt);
  for (const [rx, n0, l0] of CE_REGLAS)
    if (rx.test(f)) {
      const [n, l] = CE_PADRE[n0] || [n0, l0];
      return [n, l];
    }
  return null;
}
/* Un texto puede nombrar varios organismos ("Despacho Alcalde, Secretaría X y Secretaría Y") */
const CE_SEP =
  /\s*(?:,|;|\/|\+|\sy\s(?=(?:secretar|departamento|despacho|oficina|unidad|subsecretar|subdirec|dagma|alcald)))\s*/i;
function ceOrganismos(txt) {
  if (txt == null) return [];
  const out = [];
  cePyStr(txt)
    .split(CE_SEP)
    .forEach(p => {
      if (!p || !p.trim()) return;
      const c = ceCanonUno(p);
      const k = c || [p.trim().replace(/\s+/g, ' '), 'Sin clasificar'];
      if (!out.some(o => o[0] === k[0])) out.push(k);
    });
  return out;
}
/* Días hábiles en (a, b]; negativo si b < a (busday_count de numpy con festivos de Colombia) */
function ceHabiles(a, b) {
  if (!a || !b) return null;
  const cuenta = (x, y) => {
    const d = new Date(x + 'T00:00:00'),
      f = new Date(y + 'T00:00:00');
    let n = 0;
    while (d < f) {
      d.setDate(d.getDate() + 1);
      const w = d.getDay();
      /* igual que el ETL: festivos desde 2023 (fechas anteriores son errores de digitación del año) */
      if (w !== 0 && w !== 6 && !(d.getFullYear() >= 2023 && festivosCO(d.getFullYear()).has(iso(d)))) n++;
    }
    return n;
  };
  return b >= a ? cuenta(a, b) : -cuenta(b, a);
}
const CE_NOAPL = /^(n\/?a|no aplica|no aplic\w*|sin respuesta|ninguno)$/i;
const CE_SINNUM = /^(sin n[uú]mero|sin numero|s\/?n|none|nan|)$/i;
const ceTokens = x =>
  new Set(
    cePyStr(x == null ? '' : x)
      .replace(/(\d)\.0\b/g, '$1')
      .match(/\d{12,}/g) || []
  );

/* =====================================================================
   3. LECTURA DE UN LIBRO (etl/load.py)
   ===================================================================== */
const CE_ENC_2026 = {
  0: 'no. orden',
  1: 'radicado ente',
  2: 'ente externo',
  3: 'radicacion en',
  4: 'fecha radicacion',
  5: 'clase',
  6: 'organismo',
  7: 'asunto',
  8: 'dias habiles',
  9: 'fecha maxima',
  10: 'orfeo',
  11: 'fecha de respuesta',
  12: 'estado',
  13: 'observaciones'
};
function ceFilas(X, wb, nombre) {
  const idx = wb.SheetNames.indexOf(nombre);
  if (idx < 0) return null;
  const ws = wb.Sheets[nombre],
    crudos = ceNumerosCrudos(wb, idx);
  if (!ws['!ref']) return { filas: [] };
  const rg = X.utils.decode_range(ws['!ref']),
    ncol = Math.max(rg.e.c + 1, 16),
    filas = [];
  for (let r = 0; r <= rg.e.r; r++) {
    const fila = [];
    for (let c = 0; c < ncol; c++) fila.push(ceCelda(X, ws, crudos, r, c));
    filas.push(fila);
  }
  return { filas };
}
/* Formato 2026 en adelante: la tabla empieza debajo de la fila "No. Orden"; 2024-2025 empiezan en la fila 6 */
function ceInicio(filas) {
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const a = ceFoldEnc(filas[i][0]);
    if (a.startsWith('no. orden') || a === 'no orden') {
      const faltan = Object.entries(CE_ENC_2026)
        .filter(([c, t]) => !ceFoldEnc(filas[i][+c]).includes(t))
        .map(([c, t]) => String.fromCharCode(65 + +c) + ': "' + t + '"');
      return { fila: i + 2, nuevo: true, faltan };
    }
  }
  return { fila: 6, nuevo: false, faltan: [] };
}
function ceLeerControl(filas, vig, ini) {
  const out = [];
  for (let i = ini.fila; i <= filas.length; i++) {
    const r = filas[i - 1];
    if (!ini.nuevo) {
      if (!r.slice(1, 15).some(ceVerdad)) continue;
      out.push({
        vigencia: vig,
        hoja: 'CONTROL',
        fila_excel: i,
        rad_ente: r[1],
        fecha_oficio: r[2],
        ente: r[3],
        orfeo_entrada: r[4],
        fecha_radicacion: r[5],
        fecha_daci: r[6],
        dirigido: r[7],
        asunto: r[8],
        dias_habiles: r[9],
        fecha_max: r[10],
        responde: r[11],
        orfeo_resp: r[12],
        fecha_resp: r[13],
        estado: r[14],
        obs: r[15],
        clase: null
      });
    } else {
      if (!r.slice(1, 13).some(ceVerdad)) continue;
      out.push({
        vigencia: vig,
        hoja: 'CONTROL',
        fila_excel: i,
        rad_ente: r[1],
        fecha_oficio: null,
        ente: r[2],
        orfeo_entrada: r[3],
        fecha_radicacion: r[4],
        fecha_daci: null,
        dirigido: r[6],
        asunto: r[7],
        dias_habiles: r[8],
        fecha_max: r[9],
        responde: null,
        orfeo_resp: r[10],
        fecha_resp: r[11],
        estado: r[12],
        obs: r[13],
        clase: r[5]
      });
    }
  }
  return out;
}
/* 2024 y 2025: la hoja "NO RESPUESTA" registra oficios que no exigen respuesta; se incorporan como
   "No requiere respuesta" los que no estén ya en CONTROL (mismo ORFEO de entrada, mismo número del ente,
   o mismo ente + misma fecha + mismo inicio del asunto). */
function ceNoRespuesta(filasNR, control, vig) {
  if (!filasNR) return [];
  const T = new Set(),
    R = new Set(),
    A = new Set();
  control.forEach(c => {
    ceTokens(c.orfeo_entrada).forEach(t => T.add(t));
    if (!CE_SINNUM.test(cePyStr(ceVerdad(c.rad_ente) ? c.rad_ente : '').trim()))
      R.add(cePyStr(c.rad_ente).trim().toLowerCase());
    A.add(
      [
        ceFold(cePyStr(c.ente)).slice(0, 40),
        (ceFecha(c.fecha_radicacion).d || 'NaT').slice(0, 10),
        ceFold(cePyStr(c.asunto)).slice(0, 40)
      ].join('\u0001')
    );
  });
  const vistos = new Set(),
    out = [];
  for (let i = 6; i <= filasNR.length; i++) {
    const r = filasNR[i - 1];
    if (!r.slice(1, 9).some(ceVerdad)) continue;
    const nr = {
      rad_ente: r[1],
      fecha_oficio: r[2],
      ente: r[3],
      orfeo_entrada: r[4],
      fecha_radicacion: r[5],
      fecha_daci: r[6],
      dirigido: r[7],
      asunto: r[8]
    };
    const t = ceTokens(nr.orfeo_entrada),
      rad = cePyStr(ceVerdad(nr.rad_ente) ? nr.rad_ente : '')
        .trim()
        .toLowerCase();
    if ((t.size && [...t].some(x => T.has(x))) || (rad && !CE_SINNUM.test(rad) && R.has(rad))) continue;
    if (
      A.has(
        [
          ceFold(cePyStr(nr.ente)).slice(0, 40),
          (ceFecha(nr.fecha_radicacion).d || 'NaT').slice(0, 10),
          ceFold(cePyStr(nr.asunto)).slice(0, 40)
        ].join('\u0001')
      )
    )
      continue;
    const k = [[...t].sort().join(','), rad, ceFold(cePyStr(nr.asunto)).slice(0, 60)].join('\u0001');
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({
      vigencia: vig,
      hoja: 'NO RESPUESTA',
      fila_excel: i,
      ...nr,
      dias_habiles: null,
      fecha_max: null,
      responde: null,
      orfeo_resp: null,
      fecha_resp: null,
      estado: 'No requiere respuesta',
      obs: null,
      clase: 'Informativo'
    });
  }
  return out;
}

/* =====================================================================
   4. CLASIFICACIÓN (build() de etl/clean.py)
   ===================================================================== */
function ceCorte(regs) {
  let max = null;
  regs.forEach(r =>
    [r.fecha_radicacion, r.fecha_resp].forEach(v => {
      const f = ceFecha(v).d;
      if (f && (!max || f > max)) max = f;
    })
  );
  return max;
}
function ceClasificar(regs, HOY) {
  const out = [],
    calidad = [];
  regs.forEach(r => {
    const q = (tipo, detalle) =>
      calidad.push({
        vigencia: r.vigencia,
        hoja: r.hoja,
        fila_excel: r.fila_excel,
        rad_ente: ceIdStr(r.rad_ente),
        tipo,
        detalle
      });
    const fm = ceFecha(r.fecha_max),
      fr = ceFecha(r.fecha_resp),
      frad = ceFecha(r.fecha_radicacion).d,
      fdaci = ceFecha(r.fecha_daci).d;
    const fmax = fm.d,
      fresp = fr.d,
      frecibo = fdaci || frad;
    const dh = ceEntero(r.dias_habiles);
    const requiere = r.hoja === 'NO RESPUESTA' ? false : r.vigencia >= 2026 ? dh != null && dh > 0 : true;
    if (r.vigencia < 2026 && dh == null)
      q('Término sin dato', 'Días hábiles vacío o no numérico: ' + cePyStr(r.dias_habiles));
    const base = ceVerdad(r.responde) ? r.responde : r.dirigido;
    let orgs = ceOrganismos(base);
    if (!orgs.length) orgs = ceOrganismos(r.dirigido);
    let org, nivel;
    if (orgs.length) [org, nivel] = orgs[0];
    else {
      org = 'Sin dato';
      nivel = 'Otro';
      q('Organismo vacío', 'No hay organismo responsable registrado');
    }
    if (nivel === 'Sin clasificar') q('Organismo sin clasificar', cePyStr(base));
    const orfeoTxt =
      r.orfeo_resp == null || CE_NOAPL.test(cePyStr(r.orfeo_resp)) ? null : cePyStr(r.orfeo_resp);
    const cerrado = cePyStr(r.estado).toLowerCase() === 'cerrado';
    if (fr.malo) q('Fecha de respuesta ilegible', 'Valor en Excel: ' + fr.malo);
    if (fm.malo && requiere) q('Fecha máxima ilegible', 'Valor en Excel: ' + fm.malo);
    const respondio = !!fresp || (cerrado && orfeoTxt != null);
    let oport;
    if (requiere) {
      if (fresp && fmax) oport = fresp <= fmax ? 'A tiempo' : 'Tardía';
      else if (respondio) {
        oport = 'Respondida (sin fecha para medir)';
        q(
          'Respondida sin fecha medible',
          'Tiene ORFEO/estado cerrado pero la fecha de respuesta falta o es ilegible'
        );
      } else if (!fmax) {
        oport = 'Pendiente en término';
        q('Sin fecha máxima', 'No se puede evaluar el vencimiento');
      } else if (fmax < HOY) oport = 'Sin respuesta (vencida)';
      else oport = 'Pendiente en término';
    } else oport = 'No requiere respuesta';
    if (requiere && cerrado && !respondio)
      q('Cerrado sin respuesta', 'Estado Cerrado pero sin fecha ni radicado ORFEO de respuesta');
    if (requiere && !cerrado && respondio && r.estado != null)
      q('Abierto con respuesta', 'Estado "Abierto" pero ya tiene respuesta registrada');
    if (fresp && frecibo && fresp < frecibo)
      q('Respuesta anterior a recepción', 'Fecha de respuesta menor a la fecha de recibo');
    const retraso =
      oport === 'Tardía'
        ? ceHabiles(fmax, fresp)
        : oport === 'Sin respuesta (vencida)'
          ? ceHabiles(fmax, HOY)
          : null;
    const tiempo = requiere && fresp ? ceHabiles(frecibo, fresp) : null;
    out.push({
      vigencia: r.vigencia,
      hoja_excel: r.hoja,
      radicacion_ente: ceIdStr(r.rad_ente),
      ente: ceTexto(r.ente),
      orfeo_entrada: ceIdStr(r.orfeo_entrada),
      fecha_recibo: frecibo || null,
      organismo: org,
      tipo_organismo: nivel,
      asunto: ceTexto(r.asunto),
      termino_dias_habiles: dh,
      fecha_maxima: fmax || null,
      orfeo_respuesta: orfeoTxt,
      fecha_respuesta: fresp || null,
      respondio: requiere ? (respondio ? 'Sí' : 'No') : 'No aplica',
      tardia: requiere ? (oport === 'Tardía' ? 'Sí' : 'No') : 'No aplica',
      oportunidad: oport,
      retraso_dias_habiles: retraso,
      dias_habiles_responder: tiempo,
      estado_excel: ceTexto(r.estado),
      observaciones: ceTexto(r.obs),
      fila_excel: r.fila_excel
    });
  });
  return { filas: out, calidad };
}
/* Vigencia de un libro: la del nombre del archivo ("Vigencia 2026") o, si no, el año más frecuente de radicación */
function ceVigencia(nombreArchivo, regs) {
  const m = /vigencia[\s_-]*(20\d\d)/i.exec(nombreArchivo || '');
  if (m) return +m[1];
  const n = {};
  regs.forEach(r => {
    const f = ceFecha(r.fecha_radicacion).d;
    if (f) n[f.slice(0, 4)] = (n[f.slice(0, 4)] || 0) + 1;
  });
  const y = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return y ? +y[0] : null;
}
/* Lee un libro completo. Devuelve los registros sin clasificar (la clasificación necesita el corte de todos los libros). */
function ceLeerLibro(X, wb, nombreArchivo, vigForzada) {
  const ctl = ceFilas(X, wb, 'CONTROL');
  if (!ctl) throw new Error('«' + nombreArchivo + '» no tiene la hoja CONTROL.');
  const ini = ceInicio(ctl.filas);
  let vig = vigForzada || null;
  let control = ceLeerControl(ctl.filas, vig || 0, ini);
  if (!vig) vig = ceVigencia(nombreArchivo, control);
  if (!vig)
    throw new Error(
      'No se pudo saber la vigencia de «' +
        nombreArchivo +
        '». Inclúyala en el nombre del archivo, por ejemplo "Vigencia 2026".'
    );
  if (ini.nuevo && ini.faltan.length)
    throw new Error(
      `Vigencia ${vig}: la hoja CONTROL cambió de columnas en la fila ${ini.fila - 1}. No coinciden: ${ini.faltan.join('; ')}`
    );
  if (!ini.nuevo && vig >= 2026)
    throw new Error(`Vigencia ${vig}: no se encontró la fila de encabezados "No. Orden" en la hoja CONTROL.`);
  control.forEach(c => (c.vigencia = vig));
  const nr = vig < 2026 ? ceFilas(X, wb, 'NO RESPUESTA') : null;
  const norep = ceNoRespuesta(nr && nr.filas, control, vig);
  return { archivo: nombreArchivo, vigencia: vig, control, norep, registros: control.concat(norep) };
}

/* =====================================================================
   5. PANTALLA DE CARGA (Super administrador)
   ===================================================================== */
const ceClave = f => [f.vigencia, f.orfeo_entrada || '', f.radicacion_ente || '', f.organismo].join('|');
const CE_ABIERTO = ['Sin respuesta (vencida)', 'Pendiente en término'];
function ceAbrir() {
  if (rol() !== 'admin') return toast('Solo el Super administrador carga el Excel de control', 'err');
  CE.res = null;
  openModal({
    title: 'Cargar Excel de control',
    wide: true,
    body: `<div class="pm-drop">
        <i class="fa-solid fa-file-excel"></i>
        <b>Seleccione el Excel de control de la vigencia</b>
        <div class="muted">Puede elegir uno o varios archivos (por ejemplo, 2025 y 2026). La app lee las hojas CONTROL y NO RESPUESTA, le muestra qué cambia frente a lo que ya está cargado y las filas con problemas. Nada se guarda hasta que usted confirme.</div>
        <input type="file" id="ceFile" multiple accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      </div>
      <div id="ceOut"></div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" id="ceBtn" data-act="ceGuardar" disabled><i class="fa-solid fa-database"></i> Cargar</button>`
  });
  $('#ceFile').addEventListener('change', e => ceLeerArchivos([...e.target.files]));
}
async function ceLeerArchivos(files) {
  const out = $('#ceOut');
  if (!files.length) return;
  out.innerHTML =
    '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>Leyendo ' +
    files.length +
    ' archivo(s)…</div>';
  $('#ceBtn').disabled = true;
  try {
    const X = await pmXlsx();
    const libros = [];
    for (const f of files) {
      const wb = X.read(new Uint8Array(await f.arrayBuffer()), {
        type: 'array',
        cellNF: true,
        bookFiles: true
      });
      libros.push(ceLeerLibro(X, wb, f.name));
    }
    const vigs = libros.map(l => l.vigencia);
    const dup = vigs.find((v, i) => vigs.indexOf(v) !== i);
    if (dup) throw new Error('Eligió dos archivos de la vigencia ' + dup + '. Deje solo el más reciente.');
    /* Corte: la fecha más reciente de los archivos o de lo ya cargado (si se carga solo una vigencia antigua,
       sus vencidos se miden hasta la misma fecha que el resto), nunca posterior a hoy */
    let corte = ceCorte(libros.flatMap(l => l.registros)) || '';
    if (HIST.corte && HIST.corte > corte) corte = HIST.corte;
    if (!corte || corte > pmHoy()) corte = pmHoy();
    const { filas, calidad } = ceClasificar(
      libros.flatMap(l => l.registros),
      corte
    );
    CE.res = { libros, vigs, corte, filas, calidad };
    ceVistaPrevia();
  } catch (e) {
    CE.res = null;
    out.innerHTML = `<div class="pm-note r"><i class="fa-solid fa-circle-exclamation"></i> ${esc(e.message)}</div>`;
  }
}
/* Comparación con lo que ya está cargado y vista previa */
function ceVistaPrevia() {
  const R = CE.res,
    out = $('#ceOut');
  const resumenes = R.libros.map(l => {
    const nuevas = R.filas.filter(f => f.vigencia === l.vigencia);
    const antes = HIST.rows.filter(r => r.v === l.vigencia);
    const kAntes = new Map(antes.map(r => [rowKey(r), r])),
      kNuevas = new Map(nuevas.map(f => [ceClave(f), f]));
    let nuevos = 0,
      cambian = 0;
    nuevas.forEach(f => {
      const a = kAntes.get(ceClave(f));
      if (!a) nuevos++;
      else if (!a.cerradaApp && OPO_NAMES[a.opo] !== f.oportunidad) cambian++;
    });
    const salen = antes.filter(r => !kNuevas.has(rowKey(r))).length;
    const abN = nuevas.filter(f => CE_ABIERTO.includes(f.oportunidad)).length,
      abA = antes.filter(r => r.opo === 2 || r.opo === 3).length;
    return {
      l,
      n: nuevas.length,
      ctl: l.control.length,
      nr: l.norep.length,
      nuevos,
      cambian,
      salen,
      abN,
      abA,
      hay: antes.length
    };
  });
  const porTipo = {};
  R.calidad.forEach(q => (porTipo[q.tipo] = (porTipo[q.tipo] || 0) + 1));
  const sinClas = {};
  R.filas
    .filter(f => f.tipo_organismo === 'Sin clasificar')
    .forEach(f => (sinClas[f.organismo] = (sinClas[f.organismo] || 0) + 1));
  const graves = R.calidad.filter(q => /ilegible|vacío/.test(q.tipo)).length;
  out.innerHTML = `
    <div class="pm-imp-k"><span class="pm-chip">Corte de datos: ${fmtD(R.corte)}</span><span class="pm-chip">${R.filas.length} registros leídos</span>${R.calidad.length ? `<span class="pm-chip y">${R.calidad.length} filas para revisar</span>` : '<span class="pm-chip g">Sin filas con problemas</span>'}</div>
    ${resumenes
      .map(
        s => `<div class="ce-vig"><div class="ce-vig-h"><b>Vigencia ${s.l.vigencia}</b><span class="muted">${esc(s.l.archivo)}</span></div>
      <div class="ce-num">
        <div><small>Registros</small><b>${nf(s.n)}</b><span>${s.ctl} de CONTROL${s.nr ? ' y ' + s.nr + ' de NO RESPUESTA' : ''}</span></div>
        <div><small>Ya cargados</small><b>${nf(s.hay)}</b><span>${s.hay ? 'se reemplazan' : 'vigencia nueva'}</span></div>
        <div><small>Nuevos</small><b>${nf(s.nuevos)}</b><span>no estaban en la app</span></div>
        <div><small>Cambian de estado</small><b>${nf(s.cambian)}</b><span>por ejemplo, ya respondidos</span></div>
        <div><small>Ya no aparecen</small><b class="${s.salen ? 'ce-ojo' : ''}">${nf(s.salen)}</b><span>${s.salen ? 'revise si se borraron filas o cambió el radicado' : 'ninguno'}</span></div>
        <div><small>Abiertos</small><b>${nf(s.abN)}</b><span>antes ${nf(s.abA)}</span></div>
      </div></div>`
      )
      .join('')}
    ${
      Object.keys(sinClas).length
        ? `<div class="pm-note y"><b>Organismos que no se reconocieron (${Object.keys(sinClas).length}).</b> Se cargan con el texto del Excel y no cuentan en el semáforo de ninguna dependencia. Corrija el nombre en el Excel si es un error de digitación.<ul>${Object.entries(
            sinClas
          )
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([o, n]) => `<li>${esc(o)} <span class="muted">(${n})</span></li>`)
            .join('')}</ul></div>`
        : ''
    }
    ${
      R.calidad.length
        ? `<div class="field" style="margin-top:12px"><label>Filas para revisar en el Excel</label>
      <div class="ce-tipos">${Object.entries(porTipo)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([t, n]) =>
            `<span class="pm-chip ${/ilegible|vacío|Cerrado sin/.test(t) ? 'r' : ''}">${esc(t)}: ${n}</span>`
        )
        .join('')}</div>
      <div class="hint">No impiden la carga: se aplican las mismas reglas de siempre (por ejemplo, una fecha ilegible no se puede medir). Descargue la lista para corregirlas en el Excel.</div>
      <button class="btn sm" data-act="ceCalidad" style="margin-top:8px"><i class="fa-solid fa-file-csv"></i> Descargar filas para revisar</button></div>`
        : ''
    }
    ${graves ? `<div class="hint" style="margin-top:6px">${graves} filas tienen fechas ilegibles u organismo vacío.</div>` : ''}
    <div class="pm-note b" style="margin-top:12px">Al cargar se <b>reemplaza</b> la${R.vigs.length > 1 ? 's vigencias' : ' vigencia'} ${R.vigs.join(' y ')} con lo que trae el Excel. Las respuestas registradas en la app con radicado ORFEO y PDF se conservan. Los casos abiertos nuevos pasan a "Cargar respuesta ORFEO".</div>`;
  const b = $('#ceBtn');
  b.disabled = false;
  b.innerHTML = `<i class="fa-solid fa-database"></i> Cargar vigencia${R.vigs.length > 1 ? 's' : ''} ${R.vigs.join(' y ')}`;
}
function ceDescargarCalidad() {
  const R = CE.res;
  if (!R) return;
  csvDownload(
    'filas_para_revisar_' + R.vigs.join('_') + '.csv',
    ['Vigencia', 'Hoja', 'Fila del Excel', 'Radicado del ente', 'Problema', 'Detalle'],
    R.calidad.map(q => [q.vigencia, q.hoja, q.fila_excel, q.rad_ente || '', q.tipo, q.detalle])
  );
}
/* En modo demostración o en la versión con datos en el equipo, la carga se aplica solo en este navegador */
function ceAplicarEnMemoria(R) {
  const otras = HIST.rows.filter(r => !R.vigs.includes(r.v));
  const nuevas = histFromDb(R.filas).rows;
  const rows = otras.concat(nuevas).map((r, i) => ({ ...r, i }));
  let corte = '';
  rows.forEach(r => [r.fresp, r.rec].forEach(d => d && d > corte && (corte = d)));
  HIST = {
    ...HIST,
    rows,
    corte: String(corte).slice(0, 10),
    entes: [...new Set(rows.map(r => r.ente))].sort(),
    orgs: [...new Set(rows.map(r => r.org))],
    loaded: true
  };
}
async function ceGuardar(btn) {
  const R = CE.res;
  if (!R || CE.cargando) return;
  if (
    !confirm(
      `¿Reemplazar la${R.vigs.length > 1 ? 's vigencias' : ' vigencia'} ${R.vigs.join(' y ')} con ${nf(R.filas.length)} registros del Excel?`
    )
  )
    return;
  CE.cargando = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando…';
  }
  try {
    let res;
    if (S.demo || !sb) {
      ceAplicarEnMemoria(R);
      res = { registros: R.filas.length, demo: true };
    } else {
      const { data, error } = await sb.rpc('cargar_historico', {
        p: { vigencias: R.vigs, archivos: R.libros.map(l => l.archivo), corte: R.corte, filas: R.filas }
      });
      if (error) {
        if (
          /cargar_historico/.test(error.message || '') &&
          /function|exist|schema cache/i.test(error.message || '')
        )
          throw new Error('Falta ejecutar en Supabase el script supabase/16_carga_excel.sql');
        throw dbErr(error);
      }
      res = data;
      HIST.loaded = false;
      await loadHist();
    }
    await reload();
    closeModal();
    CE.res = null;
    ceResultado(R, res);
    render();
  } catch (e) {
    toast(e.message, 'err');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-database"></i> Cargar';
    }
  } finally {
    CE.cargando = false;
  }
}
function ceResultado(R, res) {
  const filas = [
    ['Registros cargados', nf(res.registros)],
    res.abiertos_nuevos != null
      ? ['Casos abiertos nuevos en "Cargar respuesta ORFEO"', nf(res.abiertos_nuevos)]
      : null,
    res.abiertos_retirados != null
      ? ['Casos que el Excel ya trae respondidos y salieron de pendientes', nf(res.abiertos_retirados)]
      : null,
    res.abiertos_conservados_con_escalamiento
      ? [
          'Casos ya respondidos en el Excel que siguen en pendientes porque tienen escalamientos registrados (ciérrelos en "Cargar respuesta ORFEO")',
          nf(res.abiertos_conservados_con_escalamiento)
        ]
      : null,
    res.respuestas_app_sin_caso
      ? [
          'Respuestas registradas en la app cuyo caso cambió en el Excel (radicado u organismo distinto)',
          nf(res.respuestas_app_sin_caso)
        ]
      : null
  ].filter(Boolean);
  openModal({
    title: 'Excel cargado',
    body: `<div class="pm-note ${res.demo ? 'y' : 'b'}" style="margin:0 0 12px">${res.demo ? 'Modo demostración: la carga se aplicó solo en este navegador y no se guardó en la base de datos.' : 'La vigencia ' + R.vigs.join(' y ') + ' quedó actualizada con corte al ' + fmtD(R.corte) + '. La carga quedó registrada en la auditoría.'}</div>
      <div class="ce-res">${filas.map(([a, b]) => `<div><span>${esc(a)}</span><b class="mono">${b}</b></div>`).join('')}</div>`,
    footer: '<button class="btn primary" data-act="closeModal">Listo</button>'
  });
}
/* Últimas cargas (Configuración) */
async function ceUltimasCargas() {
  if (S.demo || !sb) return [];
  const { data, error } = await sb
    .from('historico_cargas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  return error ? null : data;
}
async function ceAct(a, t) {
  switch (a) {
    case 'ceAbrir':
      ceAbrir();
      break;
    case 'ceGuardar':
      await ceGuardar(t);
      break;
    case 'ceCalidad':
      ceDescargarCalidad();
      break;
  }
}
