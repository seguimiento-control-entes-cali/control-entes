/**
 * src/js/17-actividad.js
 * Actividad y cambios: quién modificó, notificó, ingresó o generó informes, a partir de la auditoría.
 * Depende de: 04 (db), 10.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   ACTIVIDAD Y CAMBIOS (quién modificó qué, quién notificó, quién ingresó)
   ===================================================================== */
const AC = { tab: 'cambios', u: '', t: '', a: '', q: '' };
let ACT = { audit: [], profs: [], acc: {}, loaded: false };
const TABLA_LBL = {
  requerimientos: 'Requerimiento',
  profiles: 'Cuenta',
  entes: 'Ente de control',
  dependencias: 'Dependencia',
  directorio: 'Directorio',
  notificaciones: 'Notificación',
  alertas_log: 'Escalamiento',
  informes: 'Informe'
};
const ACC_LBL = { INSERT: 'Creó', UPDATE: 'Modificó', DELETE: 'Eliminó' };
const FIELD_LBL = {
  estado: 'Estado',
  orfeo_salida: 'ORFEO de salida',
  fecha_cierre: 'Fecha de cierre',
  rol: 'Rol',
  activo: 'Activo',
  dependencia_id: 'Dependencia',
  nombre: 'Nombre',
  cargo: 'Cargo',
  telefono: 'Celular',
  sigla: 'Sigla',
  tipo: 'Tipo',
  correo: 'Correo',
  secretario_nombre: 'Secretario(a)',
  escalado_at: 'Escalado',
  fecha_limite: 'Fecha límite',
  asunto: 'Asunto'
};
const userLabel = u => {
  const p = ACT.profs.find(x => x.id === u || x.email === u);
  return p ? p.email : u === 'sistema' ? 'Sistema' : u || '—';
};
function auditWhat(a) {
  const p = a.payload || {};
  const id =
    p.radicado ||
    p.email ||
    p.nombre ||
    (p.organismo ? p.organismo + (p.cargo ? ' - ' + p.cargo : '') : '') ||
    p.alcance ||
    p.canal ||
    a.registro_id;
  return `${TABLA_LBL[a.tabla] || a.tabla}: ${shortTxt(String(id), 70)}`;
}
function auditDetail(a) {
  const ch = a.cambios || {},
    keys = Object.keys(ch).filter(k => !['updated_at', 'updated_by', 'created_at'].includes(k));
  if (a.accion === 'UPDATE' && keys.length)
    return (
      keys
        .slice(0, 4)
        .map(k => {
          const v = x =>
            x == null || x === ''
              ? 'vacío'
              : k === 'telefono'
                ? fmtPhone(String(x))
                : shortTxt(String(x), 38);
          return `${FIELD_LBL[k] || k}: ${v(ch[k].de)} → ${v(ch[k].a)}`;
        })
        .join('; ') + (keys.length > 4 ? ' …' : '')
    );
  if (a.accion === 'INSERT')
    return a.tabla === 'notificaciones'
      ? `Mensaje a ${(a.payload || {}).destinatario || '—'}`
      : a.tabla === 'informes'
        ? `Huella ${String((a.payload || {}).huella || '').slice(0, 12)}…`
        : 'Registro nuevo';
  return '';
}
async function loadActividad() {
  let audit = [],
    profs = [],
    acc = {};
  try {
    audit = await db.audit();
  } catch (e) {}
  try {
    profs = await db.profiles();
  } catch (e) {}
  if (S.demo || !sb) {
    try {
      acc = JSON.parse(lsGet('ce_acc') || '{}');
    } catch (e) {}
    try {
      INFS = JSON.parse(lsGet('ce_inf') || '[]');
    } catch (e) {}
  } else {
    const a = await sb
      .from('accesos')
      .select('user_id,created_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (!a.error)
      (a.data || []).forEach(x => {
        if (!acc[x.user_id]) acc[x.user_id] = x.created_at;
      });
    const i = await sb.from('informes').select('*').order('created_at', { ascending: false }).limit(100);
    if (!i.error)
      INFS = (i.data || []).map(x => ({
        ts: x.created_at,
        usuario: x.generado_por,
        alcance: x.alcance,
        vigencias: x.vigencias,
        corte: x.corte,
        n: x.n_registros,
        huella: x.huella
      }));
  }
  ACT = { audit, profs, acc, loaded: true };
}
async function vActividad(c) {
  c.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>Cargando actividad…</div>';
  await loadActividad();
  const A = ACT.audit,
    hace = n => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString();
    };
  const cambios = A.filter(a => a.tabla !== 'audit_log');
  const usuarios = [...new Set(cambios.map(a => userLabel(a.usuario)))].sort();
  const act7 = ACT.profs.filter(p => (ACT.acc[p.id] || ACT.acc[p.email] || '') > hace(7)).length;
  const q = queueData
    ? (() => {
        const m = new Map();
        HIST.rows.forEach(r => {
          if (MAIN_NIV.includes(r.niv) && r.opo === 2 && Q.vigs[r.v]) m.set(r.org, (m.get(r.org) || 0) + 1);
        });
        return m;
      })()
    : new Map();
  const sinNotificar = [...q.keys()].filter(o => !NOTIF.some(n => n.org === o)).length;
  c.innerHTML = `
    <div class="grid g-kpi" style="margin-bottom:14px">
      <div class="card kpi"><small>Cambios registrados</small><b>${nf(cambios.length)}</b></div>
      <div class="card kpi g"><small>Usuarios con acceso (7 días)</small><b>${act7}</b></div>
      <div class="card kpi y"><small>Notificaciones enviadas</small><b>${nf(NOTIF.length)}</b></div>
      <div class="card kpi r"><small>Con pendientes y sin notificar</small><b>${sinNotificar}</b></div>
      <div class="card kpi"><small>Informes generados</small><b>${nf(INFS.length)}</b></div>
    </div>
    <div class="seg" style="margin-bottom:14px">${[
      ['cambios', 'Quién modificó qué'],
      ['notificaciones', 'Seguimiento de notificaciones'],
      ['usuarios', 'Actividad por usuario'],
      ['informes', 'Informes generados']
    ]
      .map(
        ([k, l]) => `<button data-act="acTab" data-t="${k}" class="${AC.tab === k ? 'on' : ''}">${l}</button>`
      )
      .join('')}</div>
    <div id="acBody"></div>`;
  const body = $('#acBody');
  if (AC.tab === 'cambios') {
    body.innerHTML = `<div class="toolbar"><div class="grow"><i class="fa-solid fa-magnifying-glass"></i><input id="acQ" placeholder="Buscar por radicado, correo, dependencia…" value="${esc(AC.q)}"></div>
      <select id="acU"><option value="">Todos los usuarios</option>${usuarios.map(u => `<option${u === AC.u ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>
      <select id="acT"><option value="">Todo tipo de registro</option>${Object.entries(TABLA_LBL)
        .map(([k, v]) => `<option value="${k}"${k === AC.t ? ' selected' : ''}>${v}</option>`)
        .join('')}</select>
      <select id="acA"><option value="">Toda acción</option>${Object.entries(ACC_LBL)
        .map(([k, v]) => `<option value="${k}"${k === AC.a ? ' selected' : ''}>${v}</option>`)
        .join('')}</select></div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:900px"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Qué</th><th>Detalle del cambio</th></tr></thead><tbody id="acRows"></tbody></table></div>
      <div class="muted" style="margin-top:8px;font-size:.78rem">Cada fila está firmada en la cadena de auditoría SHA-256 (menú Auditoría > Verificar integridad). Nadie puede editar ni borrar este historial.</div>`;
    const paint = () => {
      AC.q = $('#acQ').value;
      AC.u = $('#acU').value;
      AC.t = $('#acT').value;
      AC.a = $('#acA').value;
      const qq = AC.q.toLowerCase();
      const l = cambios.filter(
        a =>
          (!AC.u || userLabel(a.usuario) === AC.u) &&
          (!AC.t || a.tabla === AC.t) &&
          (!AC.a || a.accion === AC.a) &&
          (!qq ||
            (auditWhat(a) + ' ' + auditDetail(a) + ' ' + userLabel(a.usuario)).toLowerCase().includes(qq))
      );
      $('#acRows').innerHTML = l.length
        ? l
            .slice(0, 300)
            .map(
              a =>
                `<tr><td style="white-space:nowrap">${fmtTs(a.created_at)}</td><td>${esc(userLabel(a.usuario))}</td><td><span class="pill ${a.accion === 'DELETE' ? 'rojo' : a.accion === 'UPDATE' ? 'amarillo' : 'verde'}">${(ACC_LBL[a.accion] || a.accion).toUpperCase()}</span></td><td>${esc(auditWhat(a))}</td><td class="muted" style="font-size:.8rem">${esc(auditDetail(a))}</td></tr>`
            )
            .join('')
        : '<tr><td colspan="5"><div class="empty"><i class="fa-solid fa-inbox"></i>Sin cambios para este filtro</div></td></tr>';
    };
    ['acQ', 'acU', 'acT', 'acA'].forEach(id => $('#' + id).addEventListener('input', paint));
    paint();
  } else if (AC.tab === 'notificaciones') {
    const orgs = [...new Set([...q.keys(), ...NOTIF.map(n => n.org)])];
    const rows = orgs
      .map(o => {
        const last = NOTIF.find(n => n.org === o),
          cnt = NOTIF.filter(n => n.org === o).length,
          hoy = q.get(o) || 0;
        const dias = last ? Math.floor((Date.now() - new Date(last.ts)) / 864e5) : null;
        const est = !last
          ? ['rojo', 'NUNCA NOTIFICADA']
          : hoy === 0
            ? ['verde', 'RESUELTA']
            : hoy < last.n
              ? ['amarillo', 'EN PROGRESO']
              : dias >= 7
                ? ['rojo', 'SIN ATENDER']
                : ['amarillo', 'EN PLAZO'];
        return { o, last, cnt, hoy, dias, est };
      })
      .sort((a, b) => b.hoy - a.hoy);
    body.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="min-width:860px"><thead><tr><th>Dependencia</th><th class="right">Sin respuesta hoy</th><th>Última notificación</th><th>Enviada por</th><th class="right">Casos al notificar</th><th class="right">Días</th><th class="right">Veces</th><th>Seguimiento</th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr><td>${esc(shortOrg(r.o))}</td><td class="right mono">${r.hoy}</td><td>${r.last ? fmtTs(r.last.ts) : '—'}</td><td>${r.last ? esc(userLabel(r.last.usuario)) : '—'}</td><td class="right mono">${r.last ? r.last.n : '—'}</td><td class="right mono">${r.dias == null ? '—' : r.dias}</td><td class="right mono">${r.cnt}</td><td><span class="pill ${r.est[0]}"><i></i>${r.est[1]}</span></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty"><i class="fa-solid fa-inbox"></i>Sin dependencias con pendientes ni notificaciones</div></td></tr>'}
    </tbody></table></div><div class="muted" style="margin-top:8px;font-size:.78rem">Seguimiento: "Sin atender" si pasaron 7 o más días desde el aviso y los casos no bajaron; "En progreso" si ya disminuyeron; "Resuelta" si no quedan casos sin respuesta (vigencias seleccionadas en el Centro de mando).</div>`;
  } else if (AC.tab === 'usuarios') {
    const rows = ACT.profs.map(p => {
      const em = p.email,
        mods = cambios.filter(a => userLabel(a.usuario) === em).length,
        nots = NOTIF.filter(n => userLabel(n.usuario) === em).length,
        infs = INFS.filter(i => userLabel(i.usuario) === em).length;
      return { p, mods, nots, infs, last: ACT.acc[p.id] || ACT.acc[em] || '' };
    });
    body.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="min-width:860px"><thead><tr><th>Usuario</th><th>Rol</th><th>Dependencia</th><th>Último acceso</th><th class="right">Cambios</th><th class="right">Notificaciones</th><th class="right">Informes</th><th>Estado</th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr><td>${esc(r.p.email)}</td><td>${esc(ROLES[r.p.rol] || r.p.rol)}</td><td>${esc(shortOrg((S.deps.find(d => d.id === r.p.dependencia_id) || {}).nombre || '—'))}</td><td>${r.last ? fmtTs(r.last) : 'Nunca'}</td><td class="right mono">${r.mods}</td><td class="right mono">${r.nots}</td><td class="right mono">${r.infs}</td><td>${r.p.activo ? '<span class="pill verde"><i></i>ACTIVO</span>' : '<span class="pill neutral">INACTIVO</span>'}</td></tr>`).join('') : '<tr><td colspan="8"><div class="empty">Sin cuentas</div></td></tr>'}
    </tbody></table></div>`;
  } else {
    body.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="min-width:780px"><thead><tr><th>Fecha</th><th>Generado por</th><th>Alcance</th><th>Vigencias</th><th class="right">Registros</th><th>Huella SHA-256</th></tr></thead><tbody>
    ${INFS.length ? INFS.map(i => `<tr><td style="white-space:nowrap">${fmtTs(i.ts)}</td><td>${esc(userLabel(i.usuario))}</td><td>${esc(i.alcance)}</td><td>${esc(i.vigencias)}</td><td class="right mono">${nf(i.n)}</td><td class="mono faint" title="${esc(i.huella)}">${esc(String(i.huella).slice(0, 16))}…</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty"><i class="fa-solid fa-inbox"></i>Aún no se ha generado ningún informe</div></td></tr>'}
    </tbody></table></div>`;
  }
}
