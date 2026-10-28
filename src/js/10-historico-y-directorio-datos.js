/**
 * src/js/10-historico-y-directorio-datos.js
 * Datos del histórico 2024-2026 (HIST), directorio del gabinete (DIRLIST), bitácora de notificaciones, alcance por dependencia (scopeOrg/hrows), estadísticas y enmascaramiento de datos personales (maskPII).
 * Depende de: 04 (sb), 03 (S).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   DATOS HISTÓRICOS, DIRECTORIO Y ALCANCE POR DEPENDENCIA
   ===================================================================== */
const OPO_NAMES = [
  'A tiempo',
  'Tardía',
  'Sin respuesta (vencida)',
  'Pendiente en término',
  'Respondida (sin fecha para medir)',
  'No requiere respuesta'
];
const MAIN_NIV = ['Secretaría', 'Departamento', 'UAE', 'Despacho'];
const MESES = [
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
let HIST = { corte: '', rows: [], entes: [], orgs: [], source: 'vacío', loaded: false };
let DIRLIST = []; // [{organismo,cargo,nombre,telefono}]
let NOTIF = []; // bitácora de notificaciones

function histFromPayload(j) {
  const rows = j.rows.map((a, i) => ({
    i,
    v: a[0],
    rad: a[1],
    ente: j.entes[a[2]] || '—',
    orfE: a[3],
    rec: a[4],
    org: j.orgs[a[5]][0],
    niv: j.orgs[a[5]][1],
    asu: a[6],
    term: a[7],
    fmax: a[8],
    orfR: a[9],
    fresp: a[10],
    resp: a[11],
    opo: a[12],
    ret: a[13],
    tiem: a[14]
  }));
  return {
    corte: j.corte,
    rows,
    entes: j.entes,
    orgs: j.orgs.map(o => o[0]),
    source: 'embebido',
    loaded: true
  };
}
function histFromDb(list) {
  const rows = list.map((r, i) => ({
    i,
    v: r.vigencia,
    rad: r.radicacion_ente,
    ente: r.ente || '—',
    orfE: r.orfeo_entrada,
    rec: r.fecha_recibo,
    org: r.organismo,
    niv: r.tipo_organismo || '',
    asu: r.asunto,
    term: r.termino_dias_habiles,
    fmax: r.fecha_maxima,
    orfR: r.orfeo_respuesta,
    fresp: r.fecha_respuesta,
    resp: r.respondio === 'Sí' ? 1 : r.respondio === 'No' ? 0 : 2,
    opo: Math.max(0, OPO_NAMES.indexOf(r.oportunidad)),
    ret: r.retraso_dias_habiles,
    tiem: r.dias_habiles_responder
  }));
  let corte = '';
  rows.forEach(r => {
    [r.fresp, r.rec].forEach(d => {
      if (d && d > corte) corte = d;
    });
  });
  return {
    corte: String(corte).slice(0, 10),
    rows,
    entes: [...new Set(rows.map(r => r.ente))].sort(),
    orgs: [...new Set(rows.map(r => r.org))],
    source: 'supabase',
    loaded: true
  };
}
async function loadHist() {
  if (HIST.loaded) return;
  const el = document.getElementById('histData');
  if (el && el.textContent.trim()) {
    try {
      HIST = histFromPayload(JSON.parse(el.textContent));
      return;
    } catch (e) {
      console.error('histData', e);
    }
  }
  if (!S.demo && sb) {
    try {
      let from = 0,
        out = [];
      for (;;) {
        const { data, error } = await sb
          .from('historico_requerimientos')
          .select('*')
          .order('id')
          .range(from, from + 999);
        if (error) throw error;
        out = out.concat(data);
        if (data.length < 1000) break;
        from += 1000;
      }
      HIST = histFromDb(out);
      await aplicarCierresApp();
      return;
    } catch (e) {
      console.error(e);
      toast('No se pudo cargar el histórico: ' + e.message, 'err');
    }
  }
  HIST.loaded = true;
}
/* Cierres hechos en la app sobre casos del histórico (supabase/12): el registro original no se
   modifica; al cargar, cada caso cerrado en "Cargar respuesta ORFEO" se muestra como respondido
   (a tiempo o tarde) y el cumplimiento se recalcula. Sobrevive a una recarga del histórico. */
function habilesEntre(a, b) {
  const d = new Date(a + 'T00:00:00'),
    f = new Date(b + 'T00:00:00');
  let n = 0;
  while (d < f) {
    d.setDate(d.getDate() + 1);
    if (esHabil(d)) n++; /* sin sábados, domingos ni festivos de Colombia */
  }
  return n;
}
function aplicarCierre(r, fecha, orfeo) {
  r.fresp = fecha;
  r.orfR = orfeo;
  r.resp = 1;
  r.cerradaApp = true;
  if (r.fmax) {
    r.opo = fecha <= r.fmax ? 0 : 1;
    r.ret = r.opo === 1 ? habilesEntre(r.fmax, fecha) : null;
  } else r.opo = 4;
  if (r.rec) r.tiem = habilesEntre(r.rec, fecha);
}
async function aplicarCierresApp() {
  if (S.demo || !sb || !HIST.rows.length) return;
  const { data, error } = await sb
    .from('requerimientos')
    .select('hist_key, orfeo_salida, fecha_cierre')
    .not('hist_key', 'is', null)
    .eq('estado', 'cerrado');
  if (error || !data || !data.length) return;
  const m = new Map(data.map(x => [x.hist_key, x]));
  HIST.rows.forEach(r => {
    const c = m.get(rowKey(r));
    if (c && (r.opo === 2 || r.opo === 3))
      aplicarCierre(r, String(c.fecha_cierre).slice(0, 10), c.orfeo_salida);
  });
}
async function loadDir() {
  DIRLIST = [];
  const el = document.getElementById('dirData');
  if (S.demo || !sb) {
    let saved = null;
    try {
      saved = JSON.parse(lsGet('ce_dir_v2') || 'null');
    } catch (e) {}
    if (Array.isArray(saved)) DIRLIST = saved;
    else if (el && el.textContent.trim()) {
      try {
        DIRLIST = JSON.parse(el.textContent).map(x => ({
          organismo: x.organismo,
          cargo: x.cargo,
          nombre: x.nombre,
          telefono: x.telefono,
          correo: x.correo || ''
        }));
      } catch (e) {}
    }
    if (ES_DEMO_PUBLICA && !Array.isArray(saved)) {
      DIRLIST.forEach((x, k) => {
        x.nombre = 'Responsable Ejemplo';
        if (!x.telefono) x.telefono = '57300' + String(1000000 + k * 137).slice(-7);
        x.correo = 'responsable.ejemplo' + (k + 1) + '@cali.gov.co';
      });
    }
    return;
  }
  const { data, error } = await sb.from('directorio').select('*').order('organismo');
  if (!error && data)
    DIRLIST = data.map(x => ({
      organismo: x.organismo,
      cargo: x.cargo,
      nombre: x.nombre,
      telefono: x.telefono,
      correo: x.correo || ''
    }));
}
async function saveDirRow(x) {
  if (S.demo || !sb) {
    lsSet('ce_dir_v2', JSON.stringify(DIRLIST));
    return;
  }
  const { error } = await sb.from('directorio').upsert(
    {
      organismo: x.organismo,
      cargo: x.cargo,
      nombre: x.nombre || '',
      telefono: x.telefono || '',
      correo: x.correo || ''
    },
    { onConflict: 'organismo,cargo' }
  );
  if (error) throw dbErr(error);
}
async function loadNotifs() {
  if (S.demo || !sb) {
    try {
      NOTIF = JSON.parse(lsGet('ce_notif') || '[]');
    } catch (e) {
      NOTIF = [];
    }
    return;
  }
  const { data, error } = await sb
    .from('notificaciones')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  NOTIF = error
    ? []
    : data.map(x => ({
        ts: x.created_at,
        org: x.organismo,
        nombre: x.destinatario,
        tel: x.telefono,
        correo: x.correo || '',
        canal: x.canal || 'whatsapp',
        tpl: x.plantilla,
        n: x.n_items,
        usuario: x.enviado_por,
        mensaje: x.mensaje
      }));
}
async function logNotif(e) {
  NOTIF.unshift(e);
  if (S.demo || !sb) {
    lsSet('ce_notif', JSON.stringify(NOTIF.slice(0, 300)));
    await demoAudit(
      'notificaciones',
      'INSERT',
      NOTIF.length,
      { organismo: e.org, destinatario: e.nombre || '', plantilla: e.tpl, n_items: e.n },
      e.usuario
    );
    return;
  }
  const { error } = await sb.from('notificaciones').insert({
    organismo: e.org,
    destinatario: e.nombre || '',
    telefono: e.tel || '',
    correo: e.correo || '',
    plantilla: e.tpl,
    n_items: e.n,
    canal: e.canal || 'whatsapp',
    mensaje: e.mensaje
  });
  if (error) toast('La notificación se envió pero no se pudo registrar: ' + error.message, 'err');
}

const scopeOrg = () => {
  if (!['secretario', 'enlace'].includes(rol())) return null;
  const p = S.profile || {};
  const n = p.org || (S.deps.find(d => d.id === p.dependencia_id) || {}).nombre;
  return n ? canonOrg(n) : '\u0000sin-dependencia';
};
const hrows = () => {
  const o = scopeOrg();
  return o ? HIST.rows.filter(r => r.org === o) : HIST.rows;
};
const mainOrgsAll = () =>
  [...new Set(HIST.rows.filter(r => MAIN_NIV.includes(r.niv)).map(r => r.org))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
const nivOf = org => (HIST.rows.find(r => r.org === org) || {}).niv || '';
function shortOrg(n) {
  return n
    .replace('Oficina de la Secretaría Privada y Despacho del Alcalde', 'Despacho / Sec. Privada')
    .replace('Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)', 'DAGMA')
    .replace('Departamento Administrativo de ', 'DA ')
    .replace('Unidad Administrativa Especial de ', 'UAE ')
    .replace('Unidad Administrativa Especial ', 'UAE ')
    .replace('Secretaría de ', '')
    .replace('Secretaría del ', '')
    .replace('Desarrollo e Innovación Institucional', 'Innovación Instit.')
    .replace('Tecnologías de la Información y las Comunicaciones', 'TIC')
    .replace('Gestión del Riesgo de Emergencias y Desastres', 'Gestión del Riesgo')
    .replace('Desarrollo Territorial y Participación Ciudadana', 'Des. Territorial y Particip.');
}
const defaultCargo = org => {
  const n = nivOf(org);
  return n === 'Secretaría'
    ? 'Secretario(a) de Despacho'
    : n === 'Despacho'
      ? 'Secretario(a) Privado(a)'
      : 'Director(a)';
};
/* Llave normalizada para que dependencia, directorio y cuenta coincidan aunque cambien tildes, mayúsculas o espacios */
const orgKey = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const canonOrg = name => {
  const k = orgKey(name);
  if (!k) return name;
  const hit = HIST.rows.find(r => orgKey(r.org) === k);
  return hit ? hit.org : name;
};
const contactsOf = org => {
  const k = orgKey(org);
  return DIRLIST.filter(x => orgKey(x.organismo) === k);
};
/* Estado de un contacto para WhatsApp: listo, falta nombre completo o falta celular */
const normMail = s => {
  const v = String(s || '')
    .replace(/\s/g, '')
    .toLowerCase();
  return /^[a-z0-9._%+-]+@cali\.gov\.co$/.test(v) ? v : '';
};
const fullName = n =>
  String(n || '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1).length >= 2;
const ctStatus = x =>
  !x ? 'sin' : !fullName(x.nombre) ? 'nombre' : !normPhone(x.telefono) ? 'celular' : 'ok';
function normPhone(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (/^57\d{10}$/.test(d)) return d;
  if (/^3\d{9}$/.test(d)) return '57' + d;
  return '';
}
const fmtPhone = d =>
  /^57\d{10}$/.test(d || '') ? '+57 ' + d.slice(2, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8) : d || '—';
const canNotify = () => canRole(['admin', 'alcalde', 'control_interno']);

function statsOf(rows) {
  const s = { ok: 0, tar: 0, sin: 0, pend: 0, retSum: 0, tiemSum: 0, tiemN: 0 };
  rows.forEach(r => {
    if (r.opo === 0) s.ok++;
    else if (r.opo === 1) {
      s.tar++;
      s.retSum += r.ret || 0;
    } else if (r.opo === 2) s.sin++;
    else if (r.opo === 3) s.pend++;
    if (r.tiem != null && r.tiem >= 0 && r.opo <= 1) {
      s.tiemSum += r.tiem;
      s.tiemN++;
    }
  });
  s.ev = s.ok + s.tar + s.sin;
  s.inc = s.tar + s.sin;
  s.tasa = s.ev ? s.inc / s.ev : 0;
  s.ret = s.tar ? s.retSum / s.tar : 0;
  s.tiem = s.tiemN ? s.tiemSum / s.tiemN : 0;
  s.sem = semOf(s.ev, s.tasa);
  return s;
}
const semColor = s =>
  ({ rojo: '#FF5C70', amarillo: '#FFC44D', verde: '#38D99A', muestra: '#7C8BA8' })[s] || '#7C8BA8';
function maskPII(s) {
  s = String(s == null ? '' : s);
  s = s.replace(
    /\b(?:C\.?\s?C\.?|c[eé]dula|PPT|T\.?\s?I\.?|NUIP)\s*[:.]?\s*(?:No\.?|N[°º.]|#)?\s*[:.]?\s*[\d.\-]{5,}/gi,
    '[documento reservado]'
  );
  const TRIG =
    /^(favor|peticionari[oa]|se[ñn]or[a]?|sr[a]?|estudiantes?|joven|ni[ñn][oa]|menor|ciudadan[oa]|accionante|solicitante|quejos[oa]|denunciante|usuari[oa]|paciente|se[ñn]or\(a\))$/i;
  const NAME = /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ'.\-]+$/,
    CONN = /^(de|del|la|las|los|y|e)$/i;
  const parts = s.split(/(\s+)/),
    out = [];
  let i = 0;
  while (i < parts.length) {
    const w = parts[i],
      bare = w.replace(/[:.,;()]/g, '');
    out.push(w);
    i++;
    if (w.trim() && TRIG.test(bare)) {
      let j = i,
        names = 0,
        last = -1;
      while (j < parts.length) {
        const t = parts[j];
        if (!t.trim()) {
          j++;
          continue;
        }
        const tb = t.replace(/[,;:]$/, '');
        if (names === 0 && CONN.test(tb) && /^favor$/i.test(bare)) {
          j++;
          continue;
        }
        if (NAME.test(tb) && !/^(Contralor|Personer|Procurad|Defensor|Alcald|Secretar)/i.test(tb)) {
          names++;
          last = j;
          j++;
          if (names >= 6 || /[,;]$/.test(t)) break;
          continue;
        }
        if (names > 0 && CONN.test(tb) && j + 1 < parts.length) {
          j++;
          continue;
        }
        break;
      }
      if (names > 0) {
        out.push(' [nombre reservado]');
        i = last + 1;
      }
    }
  }
  return out.join('').replace(/(\[nombre reservado\])\s*[\d.\-]{6,}\.*/g, '$1');
}
const shortTxt = (s, n) => {
  s = String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '...' : s;
};
