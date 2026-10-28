/**
 * src/js/11-cruces-y-temas.js
 * Cruce de información: tema de cada requerimiento por reglas fijas, cruces exactos entre entes (mismo contrato, expediente, radicado o documento) y alertas de mismo tema en 90 días. Pantalla "Cruces y temas".
 * Depende de: 10 (HIST, maskPII, scopeOrg), 06.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   CRUCE DE INFORMACIÓN · temas y cruces entre entes de control
   - Tema: reglas fijas sobre el asunto (sin adivinar). Si ninguna regla aplica,
     queda "Sin clasificar" para revisión manual. Un administrador puede corregirlo.
   - Cruce exacto: el mismo identificador (contrato, proceso, expediente IUS/IUC,
     PRF, SINPROC, radicado largo o cédula) citado por entes de familias distintas.
   - Concurrencia temática: dos o más entes distintos piden a la misma dependencia
     sobre el mismo tema sustantivo en un lapso de 90 días.
   ===================================================================== */
const TEMA_DEF = [
  [
    'contractual',
    'Contractual',
    [
      'contrat',
      'contractual',
      'convenio',
      'licitaci',
      'proceso de seleccion',
      'secop',
      'sia observa',
      'interventor',
      'contratistas?',
      'orden de (compra|servicio|prestacion)',
      'liquidacion del? (contrato|convenio)',
      'comodato',
      'muestra contractual',
      'gestion contractual',
      'colombia compra',
      'acuerdo marco',
      '\\brup\\b'
    ]
  ],
  [
    'fiscal',
    'Fiscal y presupuestal',
    [
      'fiscal',
      'presupuest',
      'auditoria financiera',
      '\\bafgr\\b',
      '\\baef\\b',
      'ejecucion de (los )?recursos',
      'recursos (publicos|del sgp|asignados|girados)',
      '\\bsgp\\b',
      'sistema general de participaciones',
      'regalias',
      '\\bpoai\\b',
      'vigencias? futuras',
      'estados? financieros?',
      'tesoreria',
      '\\bdeuda\\b',
      'hallazgo',
      'detrimento',
      'patrimonio publico',
      'impuesto',
      'predial',
      'cartera',
      'rendicion (de la )?cuenta',
      '\\bprf\\b',
      'responsabilidad fiscal',
      'certificacion de ingresos',
      'pagos?\\b',
      'giros?\\b'
    ]
  ],
  [
    'disciplinario',
    'Disciplinario y judicial',
    [
      'disciplinari',
      '\\bius\\b',
      '\\biuc\\b',
      '\\biucd\\b',
      'sinproc',
      'indagacion',
      'investigacion',
      'proceso penal',
      '\\bspoa\\b',
      'fiscalia',
      'tutela',
      'fallo',
      'accion popular',
      'accion de cumplimiento',
      'juzgado',
      'tribunal',
      'sentencia',
      'desacato',
      'medida cautelar',
      'pliego de cargos',
      'ley 1437',
      'conciliacion',
      '\\b\\d{3}-\\d{4}-\\d{5}-\\d{2}\\b',
      '\\b\\d{4}-\\d{5}-\\d{2}\\b'
    ]
  ],
  [
    'peticion',
    'Peticiones y quejas ciudadanas',
    [
      'derecho de peticion',
      '\\bpeticion',
      '\\btraslado\\b',
      'queja',
      'pqrs',
      'denuncia ciudadana',
      'traslado por competencia',
      'remision por competencia',
      'rem.si.n por competencia',
      'peticionari',
      'reclamo',
      'veeduria',
      'ciudadan[oa]s?\\b'
    ]
  ],
  [
    'ddhh',
    'Derechos humanos y protección',
    [
      'defensorial',
      'ruta de proteccion',
      'amenaza',
      'victima',
      'derechos humanos',
      'desplazad',
      'migrant',
      'indigena',
      'afro',
      'personas trans',
      'lgbt',
      'ninez',
      'ninos',
      'adolescente',
      'adulto mayor',
      'discapacidad',
      'alerta temprana',
      'mujer(es)?\\b',
      'genero',
      'habitantes? de (la )?calle',
      'restitucion de tierra',
      'conflicto armado',
      'lideres sociales',
      'proteccion'
    ]
  ],
  [
    'obras',
    'Obras, bienes e infraestructura',
    [
      '\\bobras?\\b',
      'elefantes? blancos?',
      'proyectos? criticos?',
      'infraestructura',
      'adecuacion',
      'reparacion',
      'mantenimiento',
      'inmuebles?',
      'predios?',
      'plaza de mercado',
      '\\bvias?\\b',
      'malla vial',
      'puentes?',
      'escenarios?',
      'instalaciones',
      'construccion',
      'espacio publico',
      'alumbrado',
      'parques?',
      'calle \\d'
    ]
  ],
  [
    'administrativo',
    'Administrativo y de gestión',
    [
      'informe de gestion',
      'plan de mejoramiento',
      'accion preventiva',
      'preventivo',
      'auditoria de cumplimiento',
      'auditoria de desempeno',
      'talento humano',
      'planta de personal',
      'nomina',
      'funcionari',
      'archivo',
      'gestion documental',
      'plan(es)? de desarrollo',
      '\\bmetas?\\b',
      'indicadores',
      'control interno',
      'manual de funciones',
      'empleos?',
      'carrera administrativa',
      'concurso',
      'transparencia',
      'pagina web',
      'informe anual',
      'certificaci'
    ]
  ],
  [
    'servicios',
    'Servicios sociales, salud y ambiente',
    [
      'salud',
      '\\beps\\b',
      'hospital',
      'educacion',
      'colegio',
      'instituci[oa]n educativa',
      '\\bpae\\b',
      'alimentacion escolar',
      'vivienda',
      'subsidio',
      'servicios publicos',
      '\\bagua\\b',
      'ambient',
      'recursos naturales',
      'arbol',
      'residuos',
      'basuras?',
      'movilidad',
      'transito',
      'seguridad',
      'camaras',
      'cultura',
      'deporte',
      'programa',
      'ola invernal',
      'emergencia',
      'riesgo'
    ]
  ]
].map(([k, l, ps]) => ({ k, l, rx: ps.map(p => new RegExp(p)) }));
const TEMA_PESO = { servicios: 0.5, administrativo: 0.8 }; // sectores generales pesan menos que un tema específico
const TEMA_LBL = Object.fromEntries(TEMA_DEF.map(t => [t.k, t.l]));
TEMA_LBL.sin = 'Sin clasificar';
const TEMA_KEYS = TEMA_DEF.map(t => t.k);
const TEMA_SUST = ['contractual', 'fiscal', 'disciplinario', 'obras'];
const FAMILIAS = ['Contraloría', 'Procuraduría', 'Personería', 'Defensoría', 'Otro'];
const nrmTxt = s =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ');
const famOf = e => {
  const t = nrmTxt(e);
  return t.includes('contralor')
    ? 'Contraloría'
    : t.includes('procura')
      ? 'Procuraduría'
      : t.includes('personer')
        ? 'Personería'
        : t.includes('defensor')
          ? 'Defensoría'
          : 'Otro';
};
function temasAuto(asunto) {
  const t = nrmTxt(asunto),
    hits = [];
  TEMA_DEF.forEach(d => {
    const why = [];
    d.rx.forEach(rx => {
      const m = t.match(rx);
      if (m) why.push(m[0].trim());
    });
    if (why.length) hits.push({ k: d.k, n: why.length * (TEMA_PESO[d.k] || 1), why });
  });
  return hits.sort((a, b) => b.n - a.n); // estable: en empate conserva el orden de TEMA_DEF
}
const RX_CONTRATO =
  /\b(4\d{3})\s?[.,]\s?(\d{3})\s?[.,]\s?(\d{2})\s?[.,]\s?(\d)\s?[.,]\s?(\d{1,5})\s?(?:[-.]|de|del)\s?((?:20)?\d{2})(?!\d)/g;
const RX_PROCESO = /\b(4\d{3})\.(\d{3})\.(3\d)\.(\d{3,4})\s?-\s?(\d{4})\b/g;
const RX_IDS = [
  [
    'ius',
    /\b(iu[sc])\s?-?\s?([a-z])\s?-?\s?(\d{4})\s?-\s?(\d{4,8})\b/g,
    m => `${m[1].toUpperCase()}-${m[2].toUpperCase()}-${m[3]}-${+m[4]}`
  ],
  ['prf', /\bprf\s?-\s?(\d{3,6})\s?-\s?(\d{4})\s?-\s?(\d{3,6})\b/g, m => `PRF-${+m[1]}-${m[2]}-${+m[3]}`],
  [
    'expediente_pgn',
    /\b([de])\s?-\s?(\d{4})\s?-\s?(\d{6,8})\b/g,
    m => `${m[1].toUpperCase()}-${m[2]}-${+m[3]}`
  ],
  ['sinproc', /sinproc[^0-9]{0,8}(\d{5,8})/g, m => `SINPROC ${+m[1]}`],
  [
    'cedula',
    /\bc\.?\s?c\.?\s?(?:no\.?)?\s?:?\s?(\d{1,3}(?:\.\d{3}){2,3}|\d{7,10})\b/g,
    m => m[1].replace(/\./g, '')
  ],
  ['radicado', /(?:^|[^\d.\-])(\d{10,21})(?![\d.\-])/g, m => m[1]]
];
const ID_LBL = {
  contrato: 'Contrato',
  proceso: 'Proceso de selección',
  ius: 'Expediente IUS/IUC',
  prf: 'Proceso de responsabilidad fiscal',
  expediente_pgn: 'Expediente Procuraduría',
  sinproc: 'SINPROC',
  cedula: 'Ciudadano (documento)',
  radicado: 'Radicado'
};
function idsOf(asunto) {
  const t = nrmTxt(asunto),
    out = new Map(),
    add = (k, v) => out.set(k + ':' + v, { k, v });
  const y4 = y => {
    y = +y;
    return y < 100 ? y + 2000 : y;
  };
  for (const m of t.matchAll(RX_CONTRATO))
    add('contrato', `${m[1]}.${m[2]}.${m[3]}.${m[4]}.${+m[5]}-${y4(m[6])}`);
  for (const m of t.matchAll(RX_PROCESO)) add('proceso', `${m[1]}.${m[2]}.${m[3]}.${+m[4]}-${m[5]}`);
  RX_IDS.forEach(([k, rx, f]) => {
    for (const m of t.matchAll(rx)) {
      const v = f(m);
      if (k === 'radicado' && v.length === 10 && v[0] === '3') continue;
      if (k === 'cedula' && !(v.length >= 6 && v.length <= 10)) continue;
      add(k, v);
    }
  });
  const ced = new Set([...out.values()].filter(x => x.k === 'cedula').map(x => x.v));
  return [...out.values()].filter(x => !(x.k === 'radicado' && ced.has(x.v)));
}
const idShow = x => (x.k === 'cedula' ? 'C.C. terminada en ' + x.v.slice(-3) : x.v);
const rowKey = r => [r.v, r.orfE || '', r.rad || '', r.org].join('|');
let TEMA_MAN = {},
  CRUCE_REV = {},
  CRX = null,
  CRUF = { tab: 'exactos', tema: '', fam: '', org: '', vig: '', q: '', page: 0 };
async function loadCruceMeta() {
  TEMA_MAN = {};
  CRUCE_REV = {};
  if (S.demo || !sb) {
    try {
      TEMA_MAN = JSON.parse(lsGet('ce_tema_man') || '{}');
      CRUCE_REV = JSON.parse(lsGet('ce_cruce_rev') || '{}');
    } catch (e) {}
    CRX = null;
    return;
  }
  try {
    const { data, error } = await sb.from('tema_manual').select('*');
    if (!error && data)
      data.forEach(x => (TEMA_MAN[x.row_key] = { tema: x.tema, usuario: x.usuario, ts: x.updated_at }));
  } catch (e) {}
  try {
    const { data, error } = await sb.from('cruce_revision').select('*');
    if (!error && data)
      data.forEach(
        x =>
          (CRUCE_REV[x.clave] = {
            estado: x.estado,
            nota: x.nota || '',
            usuario: x.usuario,
            ts: x.updated_at
          })
      );
  } catch (e) {}
  CRX = null;
}
async function saveTemaManual(key, tema) {
  const usuario = (S.user && S.user.email) || '';
  if (tema) TEMA_MAN[key] = { tema, usuario, ts: new Date().toISOString() };
  else delete TEMA_MAN[key];
  CRX = null;
  if (S.demo || !sb) {
    lsSet('ce_tema_man', JSON.stringify(TEMA_MAN));
    await demoAudit('tema_manual', tema ? 'UPDATE' : 'DELETE', key, { tema: tema || null }, usuario);
    return;
  }
  const { error } = tema
    ? await sb.from('tema_manual').upsert({ row_key: key, tema, usuario }, { onConflict: 'row_key' })
    : await sb.from('tema_manual').delete().eq('row_key', key);
  if (error) throw dbErr(error);
}
async function saveCruceRev(clave, estado, nota) {
  const usuario = (S.user && S.user.email) || '';
  if (estado) CRUCE_REV[clave] = { estado, nota: nota || '', usuario, ts: new Date().toISOString() };
  else delete CRUCE_REV[clave];
  if (S.demo || !sb) {
    lsSet('ce_cruce_rev', JSON.stringify(CRUCE_REV));
    await demoAudit(
      'cruce_revision',
      estado ? 'UPDATE' : 'DELETE',
      clave,
      { estado: estado || null, nota: nota || '' },
      usuario
    );
    return;
  }
  const { error } = estado
    ? await sb
        .from('cruce_revision')
        .upsert({ clave, estado, nota: nota || '', usuario }, { onConflict: 'clave' })
    : await sb.from('cruce_revision').delete().eq('clave', clave);
  if (error) throw dbErr(error);
}
const fechaOf = r => String(r.rec || r.fmax || '').slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function cruceData() {
  if (CRX && CRX.n === HIST.rows.length) return CRX;
  const rows = HIST.rows,
    info = new Map();
  rows.forEach(r => {
    const auto = temasAuto(r.asu),
      man = TEMA_MAN[rowKey(r)];
    const prim = man ? man.tema : auto[0] ? auto[0].k : 'sin';
    info.set(r.i, {
      auto,
      man: !!man,
      prim,
      temas: man ? [man.tema, ...auto.map(x => x.k).filter(k => k !== man.tema)] : auto.map(x => x.k),
      ids: idsOf(r.asu),
      fam: famOf(r.ente)
    });
  });
  // casos: requerimientos unidos por un mismo identificador
  const par = new Map(),
    find = x => {
      while (par.get(x) !== x) {
        par.set(x, par.get(par.get(x)));
        x = par.get(x);
      }
      return x;
    };
  rows.forEach(r => par.set(r.i, r.i));
  const idx = new Map();
  rows.forEach(r =>
    info.get(r.i).ids.forEach(x => {
      const k = x.k + ':' + x.v;
      if (!idx.has(k)) idx.set(k, []);
      idx.get(k).push(r.i);
    })
  );
  idx.forEach(L => L.slice(1).forEach(j => par.set(find(j), find(L[0]))));
  const comp = new Map();
  rows.forEach(r => {
    if (!info.get(r.i).ids.length) return;
    const c = find(r.i);
    if (!comp.has(c)) comp.set(c, []);
    comp.get(c).push(r);
  });
  const byI = new Map(rows.map(r => [r.i, r]));
  const casos = [];
  comp.forEach(L => {
    if (L.length < 2) return;
    const shared = [...idx.entries()]
      .filter(([k, I]) => I.length > 1 && I.some(i => L.some(r => r.i === i)))
      .map(([k]) => {
        const p = k.indexOf(':');
        return { k: k.slice(0, p), v: k.slice(p + 1) };
      });
    const fams = [...new Set(L.map(r => info.get(r.i).fam))];
    const sorted = L.slice().sort((a, b) => fechaOf(a).localeCompare(fechaOf(b)));
    const clave = 'ID|' + shared.map(x => x.k + ':' + x.v).sort()[0];
    const temas = [...new Set(L.map(r => info.get(r.i).prim).filter(k => k !== 'sin'))];
    casos.push({
      tipo: fams.length >= 2 ? 'exacto' : 'reiteracion',
      clave,
      ids: shared,
      rows: sorted,
      fams,
      entes: [...new Set(L.map(r => r.ente))],
      orgs: [...new Set(L.map(r => r.org))],
      temas,
      desde: fechaOf(sorted[0]),
      hasta: fechaOf(sorted[sorted.length - 1]),
      abierto: L.some(r => r.opo === 2 || r.opo === 3)
    });
  });
  // concurrencias: misma dependencia + mismo tema sustantivo + >=2 familias en 90 días
  const g = new Map();
  rows.forEach(r => {
    const p = info.get(r.i).prim;
    if (!TEMA_SUST.includes(p) || !fechaOf(r)) return;
    const k = r.org + '\u0001' + p;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  });
  const conc = [];
  g.forEach((L, k) => {
    L.sort((a, b) => fechaOf(a).localeCompare(fechaOf(b)));
    let a = 0;
    while (a < L.length) {
      let b = a;
      while (b + 1 < L.length && diasEntre(fechaOf(L[a]), fechaOf(L[b + 1])) <= 90) b++;
      const W = L.slice(a, b + 1),
        fams = [...new Set(W.map(r => info.get(r.i).fam))];
      if (fams.length >= 2) {
        const [org, tema] = k.split('\u0001');
        conc.push({
          tipo: 'tematico',
          clave: 'TM|' + org + '|' + tema + '|' + fechaOf(W[0]),
          org,
          tema,
          rows: W,
          fams,
          entes: [...new Set(W.map(r => r.ente))],
          desde: fechaOf(W[0]),
          hasta: fechaOf(W[W.length - 1]),
          abierto: W.some(r => r.opo === 2 || r.opo === 3)
        });
        a = b + 1;
      } else a++;
    }
  });
  const ord = (x, y) => y.abierto - x.abierto || y.hasta.localeCompare(x.hasta);
  CRX = {
    n: rows.length,
    info,
    casos: casos.filter(c => c.tipo === 'exacto').sort(ord),
    reit: casos.filter(c => c.tipo === 'reiteracion').sort(ord),
    conc: conc.sort(ord),
    byI
  };
  return CRX;
}
const casoDe = r => cruceData().casos.find(c => c.rows.some(x => x.i === r.i));
const inScope = c => {
  const o = scopeOrg();
  return !o || c.rows.some(r => r.org === o);
};
function cruceAlertCount() {
  if (!HIST.rows.length) return 0;
  const d = cruceData();
  return d.casos
    .concat(d.conc)
    .filter(c => c.abierto && inScope(c) && (CRUCE_REV[c.clave] || {}).estado !== 'descartado').length;
}
const canClasif = () => canRole(['admin', 'alcalde', 'control_interno']);
const famChip = f => `<span class="fam fam-${nrmTxt(f).slice(0, 5)}">${esc(f)}</span>`;
const temaChip = (k, man) =>
  `<span class="tema tema-${k}">${esc(TEMA_LBL[k] || k)}${man ? ' <i class="fa-solid fa-user-pen" title="Clasificado manualmente"></i>' : ''}</span>`;
function caseCard(c) {
  const rev = CRUCE_REV[c.clave],
    o = scopeOrg();
  const rws = o ? c.rows.filter(r => r.org === o) : c.rows;
  const head =
    c.tipo === 'exacto'
      ? `<span class="pill rojo"><i></i>Cruce exacto</span> ${c.ids.map(x => `<span class="idtag"><small>${esc(ID_LBL[x.k] || x.k)}</small> <b class="mono">${esc(idShow(x))}</b></span>`).join(' ')}`
      : `<span class="pill amarillo"><i></i>Mismo tema, varios entes</span> <span class="idtag"><small>Dependencia</small> <b>${esc(shortOrg(c.org))}</b></span> ${temaChip(c.tema)}`;
  return `<div class="card cx ${c.tipo}${rev ? ' rev-' + rev.estado : ''}" data-clave="${esc(c.clave)}">
    <div class="cx-h">${head}</div>
    <div class="cx-m">${c.fams.map(famChip).join('')}<span class="muted">${fmtD(c.desde)} a ${fmtD(c.hasta)} · ${c.rows.length} requerimientos${c.abierto ? ' · <b class="t-r">con pendientes</b>' : ''}</span></div>
    ${c.tipo === 'exacto' && c.temas.length ? `<div class="cx-m">${c.temas.map(k => temaChip(k)).join('')}</div>` : ''}
    <div class="cx-rows">${rws
      .map(
        r => `<button class="cx-row" data-act="histDetail" data-i="${r.i}">
        <span class="cx-d mono">${fmtD(fechaOf(r))}</span>
        <span class="cx-t"><b>${esc(r.ente)}</b><small>${esc(shortOrg(r.org))} · ${esc(r.rad || r.orfE || 'sin número')}</small><small class="muted">${esc(shortTxt(maskPII(r.asu), 120))}</small></span>
        <span class="pill ${OPO_PILL[r.opo][0]}">${OPO_PILL[r.opo][1]}</span></button>`
      )
      .join('')}
      ${o && rws.length < c.rows.length ? `<div class="muted" style="font-size:.76rem;padding:6px 0">Otros ${c.rows.length - rws.length} requerimiento(s) del mismo caso están a cargo de otras dependencias.</div>` : ''}</div>
    <div class="cx-f">${rev ? `<span class="pill ${rev.estado === 'confirmado' ? 'verde' : 'neutral'}"><i></i>${rev.estado === 'confirmado' ? 'Cruce confirmado' : 'Descartado'} por ${esc(rev.usuario || '—')} el ${fmtD(rev.ts)}</span>` : ''}
      ${canClasif() ? (rev ? `<button class="btn sm" data-act="cxRev" data-clave="${esc(c.clave)}" data-estado="">Quitar revisión</button>` : `<button class="btn sm primary" data-act="cxRev" data-clave="${esc(c.clave)}" data-estado="confirmado"><i class="fa-solid fa-check"></i> Confirmar cruce</button><button class="btn sm" data-act="cxRev" data-clave="${esc(c.clave)}" data-estado="descartado">Descartar</button>`) : ''}</div>
  </div>`;
}
function vCruces(c) {
  if (!HIST.rows.length) {
    c.innerHTML =
      '<div class="card"><div class="empty"><i class="fa-solid fa-database"></i>Aún no hay datos históricos cargados.</div></div>';
    return;
  }
  const d = cruceData(),
    o = scopeOrg(),
    F = CRUF;
  const base = hrows();
  const cas = d.casos.filter(inScope),
    con = d.conc.filter(inScope);
  const sinN = base.filter(r => d.info.get(r.i).prim === 'sin').length;
  const abiertos = x => x.filter(c => c.abierto && (CRUCE_REV[c.clave] || {}).estado !== 'descartado').length;
  const tabs = [
    ['exactos', 'Cruces exactos', cas.length],
    ['tematicos', 'Mismo tema', con.length],
    ['temas', 'Temas', null],
    ['sin', 'Sin clasificar', sinN]
  ];
  let body = '';
  if (F.tab === 'exactos')
    body = cas.length
      ? cas.map(caseCard).join('')
      : '<div class="card"><div class="empty"><i class="fa-solid fa-shield-halved"></i>No hay requerimientos de entes distintos que citen el mismo contrato, expediente o radicado.</div></div>';
  else if (F.tab === 'tematicos')
    body = con.length
      ? con.map(caseCard).join('')
      : '<div class="card"><div class="empty"><i class="fa-solid fa-shield-halved"></i>No hay dependencias con el mismo tema pedido por entes distintos en 90 días.</div></div>';
  else {
    const fams = FAMILIAS.filter(f => base.some(r => d.info.get(r.i).fam === f));
    const keys = [...TEMA_KEYS, 'sin'];
    const M = {};
    keys.forEach(k => {
      M[k] = {};
      fams.forEach(f => (M[k][f] = 0));
    });
    base.forEach(r => {
      const x = d.info.get(r.i);
      M[x.prim][x.fam]++;
    });
    const tot = k => fams.reduce((s, f) => s + M[k][f], 0),
      mx = Math.max(1, ...keys.map(tot));
    const qk = nrmTxt(F.q);
    let L = base.filter(r => {
      const x = d.info.get(r.i);
      return (
        (F.tab === 'sin' ? x.prim === 'sin' : !F.tema || x.prim === F.tema) &&
        (!F.fam || x.fam === F.fam) &&
        (!F.vig || String(r.v) === F.vig) &&
        (o || !F.org || r.org === F.org) &&
        (!qk || nrmTxt(r.asu + ' ' + r.rad + ' ' + r.orfE).includes(qk))
      );
    });
    L.sort((a, b) => fechaOf(b).localeCompare(fechaOf(a)));
    const PG = 40,
      pages = Math.max(1, Math.ceil(L.length / PG));
    if (F.page >= pages) F.page = pages - 1;
    const pg = L.slice(F.page * PG, (F.page + 1) * PG);
    body =
      (F.tab === 'temas'
        ? `<div class="card" style="margin-bottom:14px"><h3>Requerimientos por tema y ente</h3><div class="sub">Tema principal de cada requerimiento. Toca una cifra para ver esos requerimientos.</div>
      <div class="tbl-wrap"><table class="tbl tm-x"><thead><tr><th>Tema</th>${fams.map(f => `<th class="right">${esc(f)}</th>`).join('')}<th class="right">Total</th><th style="min-width:120px"></th></tr></thead><tbody>
      ${keys.map(k => `<tr><td>${temaChip(k)}</td>${fams.map(f => `<td class="right">${M[k][f] ? `<button class="lnk" data-act="cxCell" data-tema="${k}" data-fam="${esc(f)}">${nf(M[k][f])}</button>` : '<span class="faint">0</span>'}</td>`).join('')}<td class="right"><button class="lnk" data-act="cxCell" data-tema="${k}" data-fam=""><b>${nf(tot(k))}</b></button></td><td><div class="bar"><span class="tb-${k}" style="width:${(tot(k) / mx) * 100}%"></span></div></td></tr>`).join('')}
      </tbody></table></div></div>`
        : `<div class="card warn-card" style="margin-bottom:14px"><h3><i class="fa-solid fa-circle-question"></i> Requerimientos sin clasificar</h3><div class="sub" style="margin:4px 0 0">El asunto no trae palabras suficientes para asignar un tema con certeza (por ejemplo, "Solicitud de información"). ${canClasif() ? 'Asígnales el tema correcto: el cambio queda registrado en la auditoría.' : 'Un administrador puede asignarles el tema.'}</div></div>`) +
      `<div class="toolbar">
        <div class="grow"><i class="fa-solid fa-magnifying-glass"></i><input id="cxQ" placeholder="Buscar en asunto, radicado u ORFEO" value="${esc(F.q)}"></div>
        ${F.tab === 'temas' ? `<select id="cxTema"><option value="">Todos los temas</option>${keys.map(k => `<option value="${k}"${F.tema === k ? ' selected' : ''}>${esc(TEMA_LBL[k])}</option>`).join('')}</select>` : ''}
        <select id="cxFam"><option value="">Todos los entes</option>${fams.map(f => `<option${F.fam === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select>
        <select id="cxVig"><option value="">Todas las vigencias</option>${[
          ...new Set(base.map(r => String(r.v)))
        ]
          .sort()
          .reverse()
          .map(v => `<option${F.vig === v ? ' selected' : ''}>${v}</option>`)
          .join('')}</select>
        ${
          o
            ? ''
            : `<select id="cxOrg"><option value="">Todas las dependencias</option>${mainOrgsAll()
                .map(
                  x =>
                    `<option value="${esc(x)}"${F.org === x ? ' selected' : ''}>${esc(shortOrg(x))}</option>`
                )
                .join('')}</select>`
        }
        <button class="btn" data-act="cxCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Ente</th><th>Dependencia</th><th>Asunto</th><th>Tema</th><th>Por qué</th></tr></thead><tbody>
      ${
        pg.length
          ? pg
              .map(r => {
                const x = d.info.get(r.i),
                  cs = casoDe(r);
                return `<tr><td class="mono">${fmtD(fechaOf(r))}</td><td>${esc(r.ente)}</td><td>${esc(shortOrg(r.org))}</td>
        <td class="asunto"><button class="lnk" data-act="histDetail" data-i="${r.i}">${esc(shortTxt(maskPII(r.asu), 110) || '—')}</button>${cs ? ' <span class="pill rojo" title="Hace parte de un cruce exacto"><i></i>Cruce</span>' : ''}</td>
        <td>${canClasif() ? `<select class="cx-sel" data-key="${esc(rowKey(r))}">${keys.map(k => `<option value="${k}"${x.prim === k ? ' selected' : ''}>${esc(TEMA_LBL[k])}</option>`).join('')}</select>${x.man ? '<div class="muted" style="font-size:.7rem;margin-top:3px"><i class="fa-solid fa-user-pen"></i> manual</div>' : ''}` : temaChip(x.prim, x.man)}</td>
        <td class="muted" style="font-size:.74rem">${x.man ? 'Clasificado por ' + esc(TEMA_MAN[rowKey(r)].usuario || 'administrador') : x.auto[0] ? esc(x.auto[0].why.slice(0, 3).join(', ')) : 'Sin palabras clave'}</td></tr>`;
              })
              .join('')
          : '<tr><td colspan="6"><div class="empty"><i class="fa-solid fa-magnifying-glass"></i>No hay requerimientos con esos filtros</div></td></tr>'
      }
      </tbody></table></div>
      <div class="pager"><span class="muted">${nf(L.length)} requerimientos</span><button class="btn sm" data-act="cxPage" data-d="-1"${F.page ? '' : ' disabled'}>Anterior</button><span class="muted">${F.page + 1} / ${pages}</span><button class="btn sm" data-act="cxPage" data-d="1"${F.page < pages - 1 ? '' : ' disabled'}>Siguiente</button></div>`;
  }
  const clas = base.length - sinN;
  c.innerHTML = `
    <div class="grid g-kpi" style="margin-bottom:14px">
      <button class="card kpi r" data-act="cxTab" data-tab="exactos"><small>Cruces exactos entre entes</small><b>${cas.length}</b><span class="kpi-of">${abiertos(cas)} con pendientes</span></button>
      <button class="card kpi y" data-act="cxTab" data-tab="tematicos"><small>Mismo tema, varios entes</small><b>${con.length}</b><span class="kpi-of">${abiertos(con)} con pendientes</span></button>
      <button class="card kpi g" data-act="cxTab" data-tab="temas"><small>Requerimientos clasificados</small><b>${base.length ? pct1(clas / base.length) : '0%'}</b><span class="kpi-of">${nf(clas)} de ${nf(base.length)}</span></button>
      <button class="card kpi" data-act="cxTab" data-tab="sin"><small>Sin clasificar</small><b>${nf(sinN)}</b><span class="kpi-of">requieren revisión</span></button>
    </div>
    <details class="card cx-help"><summary><b>¿Cómo se cruza la información?</b></summary><p class="muted" style="margin:8px 0 0">Un <b>cruce exacto</b> ocurre cuando dos o más entes distintos (Contraloría, Procuraduría, Personería, Defensoría) citan en el asunto el mismo número de contrato, proceso, expediente, radicado o documento de un ciudadano. Una <b>alerta de mismo tema</b> ocurre cuando dos o más entes distintos piden a la misma dependencia sobre el mismo tema contractual, fiscal, disciplinario o de obras en un lapso de 90 días. El tema se asigna con reglas fijas sobre el asunto; si no hay palabras suficientes queda "Sin clasificar" para revisión.</p></details>
    <div class="seg cx-tabs">${tabs.map(([k, l, n]) => `<button data-act="cxTab" data-tab="${k}" class="${F.tab === k ? 'on' : ''}">${l}${n != null ? ` <span class="cnt">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="cx-body">${body}</div>`;
  const q = $('#cxQ');
  if (q)
    q.addEventListener('input', () => {
      F.q = q.value;
      F.page = 0;
      const p = q.selectionStart;
      render();
      const n = $('#cxQ');
      if (n) {
        n.focus();
        n.setSelectionRange(p, p);
      }
    });
  [
    ['cxTema', 'tema'],
    ['cxFam', 'fam'],
    ['cxVig', 'vig'],
    ['cxOrg', 'org']
  ].forEach(([id, k]) => {
    const s = $('#' + id);
    if (s)
      s.addEventListener('change', () => {
        F[k] = s.value;
        F.page = 0;
        render();
      });
  });
  document.querySelectorAll('.cx-sel').forEach(s =>
    s.addEventListener('change', async () => {
      const key = s.dataset.key,
        r = HIST.rows.find(x => rowKey(x) === key);
      if (!r) return;
      const auto = (temasAuto(r.asu)[0] || { k: 'sin' }).k,
        val = s.value === auto ? '' : s.value;
      try {
        await saveTemaManual(key, val);
        toast(val ? 'Tema actualizado a ' + TEMA_LBL[val] : 'Se restableció el tema automático');
        renderNav();
        render();
      } catch (e) {
        toast(e.message, 'err');
      }
    })
  );
}
