/**
 * src/js/08-vistas-catalogos-y-seguridad.js
 * Pantallas de catálogos (entes, dependencias), reportes, auditoría (verificación de la cadena SHA-256), cuentas y roles, configuración.
 * Depende de: 04 (db), 06.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
function vCatalog(table) {
  const isE = table === 'entes',
    list = isE ? S.entes : S.deps;
  const cols = isE
    ? [
        ['nombre', 'Nombre'],
        ['sigla', 'Sigla'],
        ['tipo', 'Tipo']
      ]
    : [
        ['nombre', 'Dependencia'],
        ['secretario_nombre', 'Secretario(a)'],
        ['correo', 'Correo'],
        ['telefono', 'Teléfono']
      ];
  const admin = rol() === 'admin';
  $('#content').innerHTML = `
    <div class="toolbar"><span class="muted">${list.length} registro(s)</span><span class="spacer"></span>${admin ? `<button class="btn primary" data-act="editCat" data-table="${table}"><i class="fa-solid fa-plus"></i> Agregar</button>` : ''}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map(c => `<th>${c[1]}</th>`).join('')}<th>Estado</th><th></th></tr></thead><tbody>
    ${list
      .map(
        x => `<tr>${cols.map(c => `<td>${esc(x[c[0]] || '—')}</td>`).join('')}<td>${x.activo === false ? '<span class="pill neutral">INACTIVO</span>' : '<span class="pill verde"><i></i>ACTIVO</span>'}</td>
      <td class="right">${admin ? `<button class="btn sm" data-act="editCat" data-table="${table}" data-id="${x.id}"><i class="fa-solid fa-pen"></i></button>` : ''}</td></tr>`
      )
      .join('')}
    </tbody></table></div>`;
}
function catModal(table, id) {
  const isE = table === 'entes',
    list = isE ? S.entes : S.deps,
    x = list.find(i => String(i.id) === String(id)) || { activo: true };
  const f = isE
    ? [
        ['nombre', 'Nombre completo'],
        ['sigla', 'Sigla'],
        ['tipo', 'Tipo', 'select', ['Fiscal', 'Ministerio Público', 'Político', 'Disciplinario', 'Otro']]
      ]
    : [
        ['nombre', 'Dependencia'],
        ['secretario_nombre', 'Secretario(a) de Despacho'],
        ['correo', 'Correo institucional'],
        ['telefono', 'Teléfono celular (para WhatsApp)']
      ];
  openModal({
    title: (id ? 'Editar ' : 'Agregar ') + (isE ? 'ente de control' : 'dependencia'),
    body:
      f
        .map(
          a =>
            `<div class="field"><label>${a[1]}</label>${a[2] === 'select' ? `<select data-f="${a[0]}">${a[3].map(o => `<option${x[a[0]] === o ? ' selected' : ''}>${o}</option>`).join('')}</select>` : `<input data-f="${a[0]}" value="${esc(x[a[0]] || '')}">`}</div>`
        )
        .join('') +
      `<div class="field"><label>Estado</label><select data-f="activo"><option value="true"${x.activo !== false ? ' selected' : ''}>Activo</option><option value="false"${x.activo === false ? ' selected' : ''}>Inactivo</option></select></div><div id="catErr" class="err hidden"></div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="saveCat" data-table="${table}" data-id="${id || ''}">Guardar</button>`
  });
}
async function saveCat(table, id) {
  const o = id ? { id: isNaN(id) ? id : +id } : {};
  document.querySelectorAll('#modalRoot [data-f]').forEach(e => {
    o[e.dataset.f] = e.dataset.f === 'activo' ? e.value === 'true' : e.value.trim();
  });
  if (!o.nombre) {
    const e = $('#catErr');
    e.textContent = 'El nombre es obligatorio';
    e.classList.remove('hidden');
    return;
  }
  try {
    await db.saveCatalog(table, o);
    closeModal();
    toast('Guardado');
    await db.catalogs();
    await reload();
    render();
  } catch (e) {
    const x = $('#catErr');
    x.textContent = e.message;
    x.classList.remove('hidden');
  }
}

function vReportes(c) {
  const k = counts(S.reqs),
    byEnte = {};
  S.reqs.forEach(r => {
    (byEnte[r.ente_n] = byEnte[r.ente_n] || []).push(r);
  });
  c.innerHTML = `
    <div class="toolbar no-print"><span class="muted">Vigencia ${S.vigencia}</span><span class="spacer"></span>
      <button class="btn" data-act="print"><i class="fa-solid fa-print"></i> Imprimir</button>
      <button class="btn primary" data-act="csv"><i class="fa-solid fa-file-csv"></i> Exportar CSV</button></div>
    <div class="card" style="margin-bottom:14px"><h3>Consolidado de cumplimiento — vigencia ${S.vigencia}</h3>
      <div class="sub">Total ${nf(k.total)} · cerradas ${nf(k.verde)} · en término ${nf(k.amarillo)} · críticas ${nf(k.rojo)} · cumplimiento ${k.total ? Math.round((k.verde * 100) / k.total) : 0}%</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ente de control</th><th class="right">Total</th><th class="right">Críticas</th><th class="right">En término</th><th class="right">Cerradas</th><th class="right">Cumplimiento</th></tr></thead><tbody>
      ${
        Object.entries(byEnte)
          .map(([n, l]) => {
            const q = counts(l);
            return `<tr><td>${esc(n)}</td><td class="right mono">${q.total}</td><td class="right mono" style="color:var(--redink)">${q.rojo}</td><td class="right mono" style="color:var(--yelink)">${q.amarillo}</td><td class="right mono" style="color:var(--glow)">${q.verde}</td><td class="right mono">${Math.round((q.verde * 100) / q.total)}%</td></tr>`;
          })
          .join('') || '<tr><td colspan="6"><div class="empty">Sin datos</div></td></tr>'
      }
      </tbody></table></div></div>`;
}
function exportCsv() {
  const head = [
    'Radicado',
    'Vigencia',
    'Ente',
    'Dependencia',
    'Asunto',
    'Radicación',
    'Límite',
    'Estado',
    'Semáforo',
    'ORFEO salida',
    'Fecha cierre',
    'SHA-256 soporte'
  ];
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = S.reqs.map(r => [
    r.radicado,
    r.vigencia,
    r.ente_n,
    r.dep_n,
    r.asunto,
    r.fecha_radicacion,
    r.fecha_limite,
    r.estado,
    SEM[r.sem],
    r.orfeo_salida,
    r.fecha_cierre,
    r.soporte_hash
  ]);
  const csv = '\ufeff' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `control_entes_${S.vigencia}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function vAuditoria(c) {
  c.innerHTML =
    '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>Cargando pista de auditoría…</div>';
  const rows = await db.audit();
  c.innerHTML = `
    <div class="card" id="chainCard" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div style="flex:1;min-width:240px"><h3><i class="fa-solid fa-link" style="color:var(--glow)"></i> Cadena de custodia SHA-256</h3>
      <div class="sub" style="margin:4px 0 0" id="chainMsg">Cada registro contiene la huella del anterior. Alterar o borrar un evento rompe la cadena. Pulsa verificar para comprobarla.</div></div>
      ${S.demo ? '<button class="btn" data-act="tamper"><i class="fa-solid fa-user-secret"></i> Simular manipulación</button>' : ''}
      <button class="btn primary" data-act="verify"><i class="fa-solid fa-shield-halved"></i> Verificar integridad</button>
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Tabla</th><th>Registro</th><th>Huella</th></tr></thead><tbody>
    ${rows.length ? rows.map(r => `<tr><td class="mono">${r.id}</td><td style="white-space:nowrap">${fmtTs(r.created_at)}</td><td class="ellipsis" style="max-width:200px">${esc(r.usuario)}</td><td><span class="pill neutral">${esc(r.accion)}</span></td><td>${esc(r.tabla)}</td><td class="mono faint">${esc(String(r.registro_id).slice(0, 13))}</td><td class="mono faint" title="${esc(r.hash)}">${esc(r.hash.slice(0, 14))}…</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty"><i class="fa-solid fa-inbox"></i>Aún no hay eventos registrados</div></td></tr>'}
    </tbody></table></div>`;
}
async function verifyChain() {
  const card = $('#chainCard'),
    msg = $('#chainMsg');
  msg.textContent = 'Verificando…';
  try {
    const r = await db.verify();
    card.classList.remove('chain-ok', 'chain-bad');
    if (r.ok) {
      card.classList.add('chain-ok');
      msg.innerHTML = `<b style="color:var(--glow)">Cadena íntegra.</b> ${nf(r.total)} evento(s) verificados; ninguno fue alterado ni eliminado.`;
    } else {
      card.classList.add('chain-bad');
      msg.innerHTML = `<b style="color:var(--redink)">Integridad comprometida.</b> La cadena se rompe en el evento #${r.primer_id_roto}.`;
    }
  } catch (e) {
    msg.textContent = e.message;
  }
}

/* =====================================================================
   CUENTAS: una cuenta por dependencia con el correo institucional del titular.
   Cuando cambia el secretario o director, "Cambiar titular" actualiza el directorio
   y pasa la cuenta al correo nuevo en un solo paso (el titular anterior pierde el acceso).
   Las operaciones sobre cuentas las hace la Edge Function gestion-cuentas (servidor).
   ===================================================================== */
let PERFILES = [];
const depIdDe = org => (S.deps.find(d => orgKey(d.nombre) === orgKey(org)) || {}).id || null;
const cuentaDe = org => {
  const id = depIdDe(org);
  return id ? PERFILES.find(p => p.dependencia_id === id && p.rol === 'secretario') || null : null;
};
const titularDe = org => contactsOf(org)[0] || null;
function estadoCuenta(org) {
  const p = cuentaDe(org),
    t = titularDe(org),
    mail = t ? normMail(t.correo) : '';
  if (!p)
    return mail && fullName(t.nombre)
      ? ['sin', 'rojo', 'Sin cuenta']
      : ['incompleto', 'neutral', 'Faltan datos del titular'];
  if (!p.activo) return ['inactiva', 'neutral', 'Preparada, sin activar'];
  if (mail && String(p.email).toLowerCase() !== mail)
    return ['distinto', 'amarillo', 'Correo distinto al directorio'];
  return ['activa', 'verde', 'Activa'];
}
async function vCuentas(c) {
  c.innerHTML = '<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i>Cargando cuentas…</div>';
  PERFILES = await db.profiles();
  const orgs = mainOrgsAll(),
    est = orgs.map(o => [o, estadoCuenta(o)]);
  const n = k => est.filter(([, e]) => e[0] === k).length,
    pendientes = est.filter(([, e]) => e[0] === 'sin').map(([o]) => o);
  const depIds = new Set(orgs.map(depIdDe).filter(Boolean));
  const otras = PERFILES.filter(p => !(p.rol === 'secretario' && depIds.has(p.dependencia_id)));
  c.innerHTML = `
    <div class="grid g-kpi" style="margin-bottom:14px">
      <div class="card kpi g"><small>Dependencias con cuenta activa</small><b>${n('activa')}<span class="kpi-of"> / ${orgs.length}</span></b></div>
      <div class="card kpi r"><small>Sin cuenta</small><b>${n('sin')}</b></div>
      <div class="card kpi y"><small>Correo distinto al directorio</small><b>${n('distinto')}</b></div>
      <div class="card kpi"><small>Preparadas sin activar o sin datos</small><b>${n('incompleto') + n('inactiva')}</b></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:240px"><h3>Cuentas por dependencia</h3><div class="sub">Cada dependencia ingresa con el correo institucional de su secretario o director y solo ve sus requerimientos. Las cuentas se pueden <b>preparar</b> sin enviar ningún correo: quedan creadas y bloqueadas. Al <b>activarlas</b>, el titular recibe el enlace para definir su propia contraseña.</div></div>
        ${pendientes.length ? `<button class="btn primary" data-act="ctaPrepararTodas"><i class="fa-solid fa-user-lock"></i> Preparar cuentas sin activar (${pendientes.length})</button>` : ''}
      </div>
      <div class="dir-list">${est
        .map(([o, e]) => {
          const p = cuentaDe(o),
            t = titularDe(o);
          return `<div class="dir-row card">
        <div class="dir-h"><div><b class="dir-org">${esc(o)}</b><span class="pill ${e[1]}"><i></i>${e[2]}</span></div></div>
        <dl class="kv" style="margin-top:10px">
          <div><dt>Titular</dt><dd>${t && t.nombre ? esc(t.nombre) + '<div class="muted" style="font-size:.74rem">' + esc(t.cargo || '') + '</div>' : '<span class="muted">Sin registrar</span>'}</dd></div>
          <div><dt>Correo del directorio</dt><dd>${t && t.correo ? esc(t.correo) : '<span class="muted">—</span>'}</dd></div>
          <div><dt>Cuenta de acceso</dt><dd>${p ? esc(p.email) : '<span class="muted">—</span>'}</dd></div>
        </dl>
        <div class="dir-a" style="margin-top:10px">
          ${!p && e[0] === 'sin' ? `<button class="btn sm primary" data-act="ctaPreparar" data-org="${esc(o)}"><i class="fa-solid fa-user-lock"></i> Preparar cuenta</button><button class="btn sm" data-act="ctaCrear" data-org="${esc(o)}"><i class="fa-solid fa-user-plus"></i> Crear e invitar ya</button>` : ''}
          ${p && !p.activo ? `<button class="btn sm primary" data-act="ctaActivarInvitar" data-id="${esc(p.id)}" data-correo="${esc(p.email)}"><i class="fa-solid fa-paper-plane"></i> Activar e invitar</button>` : ''}
          <button class="btn sm" data-act="ctaTitular" data-org="${esc(o)}"><i class="fa-solid fa-user-pen"></i> Cambiar titular</button>
          ${p && p.activo ? `<button class="btn sm" data-act="ctaEnlace" data-correo="${esc(p.email)}"><i class="fa-solid fa-key"></i> Reenviar enlace de contraseña</button>` : ''}
          ${p && p.activo ? `<button class="btn sm" data-act="ctaDesactivar" data-id="${esc(p.id)}">Desactivar</button>` : ''}
        </div></div>`;
        })
        .join('')}</div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div style="flex:1;min-width:240px"><h3>Otras cuentas</h3><div class="sub">Super administrador, Alcalde, Control Interno y enlaces operativos.</div></div>
        <button class="btn" data-act="ctaInvitar"><i class="fa-solid fa-envelope"></i> Invitar usuario</button>
      </div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Correo</th><th>Rol</th><th>Dependencia</th><th>Activo</th><th></th></tr></thead><tbody>
      ${
        otras
          .map(
            p => `<tr data-pid="${esc(p.id)}"><td>${esc(p.email)}<div class="muted" style="font-size:.72rem">${esc(p.nombre || '')}</div></td>
        <td><select data-k="rol">${Object.entries(ROLES)
          .map(([k, v]) => `<option value="${k}"${p.rol === k ? ' selected' : ''}>${v}</option>`)
          .join('')}</select></td>
        <td><select data-k="dependencia_id">${opts(S.deps, p.dependencia_id, '— Todas / ninguna —')}</select></td>
        <td><select data-k="activo"><option value="true"${p.activo ? ' selected' : ''}>Sí</option><option value="false"${!p.activo ? ' selected' : ''}>No</option></select></td>
        <td class="right"><button class="btn sm primary" data-act="saveProfile" data-id="${esc(p.id)}">Guardar</button></td></tr>`
          )
          .join('') || '<tr><td colspan="5"><div class="empty">No hay otras cuentas</div></td></tr>'
      }
      </tbody></table></div>
    </div>
    <div class="card"><h3>Matriz de permisos por rol</h3><div class="sub">Se aplica en la base de datos (RLS), no solo en la interfaz.</div>
    <div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>Rol</th><th>Ve</th><th>Crea</th><th>Cierra con ORFEO</th><th>Escala</th><th>Auditoría</th></tr></thead><tbody>
      <tr><td>Super administrador</td><td>Todo</td><td>Sí</td><td>Sí</td><td>Sí</td><td>Sí</td></tr>
      <tr><td>Alcalde / Despacho</td><td>Todo</td><td>No</td><td>No</td><td>Sí</td><td>Sí</td></tr>
      <tr><td>Control Interno</td><td>Todo</td><td>No</td><td>No</td><td>Sí</td><td>Sí</td></tr>
      <tr><td>Secretario de Despacho</td><td>Su dependencia</td><td>No</td><td>Su dependencia</td><td>No</td><td>No</td></tr>
      <tr><td>Enlace operativo</td><td>Su dependencia</td><td>Su dependencia</td><td>Su dependencia</td><td>Sí</td><td>No</td></tr>
    </tbody></table></div></div>`;
}
function titularModal(org) {
  const t = titularDe(org) || { cargo: defaultCargo(org), nombre: '', correo: '', telefono: '' },
    p = cuentaDe(org);
  openModal({
    title: 'Cambiar titular · ' + shortOrg(org),
    body: `<div class="sub" style="margin-bottom:12px">${p ? `La cuenta de acceso <b>${esc(p.email)}</b> pasará al correo nuevo. El titular anterior ya no podrá ingresar y el nuevo recibirá un enlace para definir su contraseña.` : 'Se registrará el titular en el directorio y se creará su cuenta de acceso.'}</div>
      <input type="hidden" id="tiOrg" value="${esc(org)}">
      <div class="field"><label>Nombre completo</label><input id="tiNombre" value="${esc(t.nombre && !/ejemplo/i.test(t.nombre) ? t.nombre : '')}" placeholder="Nombres y apellidos"></div>
      <div class="field"><label>Cargo</label><input id="tiCargo" value="${esc(t.cargo || defaultCargo(org))}"></div>
      <div class="field"><label>Correo institucional</label><input id="tiCorreo" type="email" value="${esc(t.correo || '')}" placeholder="nombre.apellido@cali.gov.co"></div>
      <div class="field"><label>Celular (WhatsApp)</label><input id="tiTel" class="mono" inputmode="tel" value="${esc(normPhone(t.telefono) ? normPhone(t.telefono).slice(2) : t.telefono || '')}" placeholder="3001234567"><div class="hint">Opcional, pero necesario para notificar por WhatsApp.</div></div>
      <div id="tiErr" class="hint err hidden"></div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="ctaTitularGuardar"><i class="fa-solid fa-check"></i> ${p ? 'Cambiar titular' : 'Guardar y crear cuenta'}</button>`
  });
}
async function guardarTitular() {
  const org = $('#tiOrg').value,
    nombre = $('#tiNombre').value.trim().replace(/\s+/g, ' '),
    cargo = $('#tiCargo').value.trim();
  const correo = normMail($('#tiCorreo').value),
    telTxt = $('#tiTel').value.trim(),
    tel = normPhone(telTxt);
  const err = m => {
    const e = $('#tiErr');
    e.textContent = m;
    e.classList.remove('hidden');
  };
  if (!fullName(nombre)) return err('Escribe el nombre completo: nombres y apellidos.');
  if (!correo) return err('El correo debe ser institucional @cali.gov.co.');
  if (telTxt && !tel) return err('El celular debe tener 10 dígitos e iniciar en 3.');
  const otro = PERFILES.find(
    x => String(x.email).toLowerCase() === correo && x.id !== (cuentaDe(org) || {}).id
  );
  if (otro) return err('Ese correo ya pertenece a otra cuenta (' + otro.email + ').');
  const b = $('#modalRoot [data-act=ctaTitularGuardar]');
  if (b) {
    b.disabled = true;
    b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';
  }
  try {
    let x = DIRLIST.find(d => orgKey(d.organismo) === orgKey(org));
    if (!x) {
      x = { organismo: org, cargo, nombre: '', telefono: '', correo: '' };
      DIRLIST.push(x);
    }
    Object.assign(x, { cargo: cargo || x.cargo, nombre, correo, telefono: tel || x.telefono || '' });
    await saveDirRow(x);
    const p = cuentaDe(org);
    const r = p
      ? await db.cuenta('cambiar_correo', { id: p.id, correo, nombre })
      : await db.cuenta('invitar', { correo, nombre, rol: 'secretario', dependencia: org });
    closeModal();
    toast(r.mensaje || 'Listo');
    await refrescarDeps();
    render();
  } catch (e) {
    if (b) {
      b.disabled = false;
      b.textContent = 'Reintentar';
    }
    err(e.message);
  }
}
async function refrescarDeps() {
  try {
    await db.catalogs();
  } catch (e) {}
}
function invitarModal() {
  openModal({
    title: 'Invitar usuario',
    body: `<div class="field"><label>Nombre completo</label><input id="inNombre" placeholder="Nombres y apellidos"></div>
      <div class="field"><label>Correo institucional</label><input id="inCorreo" type="email" placeholder="nombre.apellido@cali.gov.co"></div>
      <div class="field"><label>Rol</label><select id="inRol">${Object.entries(ROLES)
        .filter(([k]) => k !== 'secretario')
        .map(([k, v]) => `<option value="${k}">${v}</option>`)
        .join('')}</select></div>
      <div class="field"><label>Dependencia (solo para enlace operativo)</label><select id="inDep"><option value="">—</option>${mainOrgsAll()
        .map(o => `<option>${esc(o)}</option>`)
        .join('')}</select></div>
      <div id="inErr" class="hint err hidden"></div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="ctaInvitarGuardar"><i class="fa-solid fa-envelope"></i> Enviar invitación</button>`
  });
}
async function guardarInvitacion() {
  const nombre = $('#inNombre').value.trim(),
    correo = normMail($('#inCorreo').value),
    rol = $('#inRol').value,
    dep = $('#inDep').value;
  const err = m => {
    const e = $('#inErr');
    e.textContent = m;
    e.classList.remove('hidden');
  };
  if (!fullName(nombre)) return err('Escribe el nombre completo.');
  if (!correo) return err('El correo debe ser institucional @cali.gov.co.');
  if (rol === 'enlace' && !dep) return err('Un enlace operativo debe tener dependencia.');
  try {
    const r = await db.cuenta('invitar', { correo, nombre, rol, dependencia: rol === 'enlace' ? dep : '' });
    closeModal();
    toast(r.mensaje);
    await refrescarDeps();
    render();
  } catch (e) {
    err(e.message);
  }
}
/* Contraseña propia: cualquier usuario puede cambiarla; también se abre al llegar desde una invitación o recuperación */
function claveModal(obligatoria) {
  openModal({
    title: obligatoria ? 'Define tu contraseña' : 'Cambiar mi contraseña',
    body: `${obligatoria ? '<div class="sub" style="margin-bottom:12px">Bienvenido(a). Define la contraseña con la que ingresarás de ahora en adelante.</div>' : ''}
      <div class="field"><label>Contraseña nueva</label><input id="ckA" type="password" autocomplete="new-password"><div class="hint">Mínimo 10 caracteres, con letras y números.</div></div>
      <div class="field"><label>Repite la contraseña</label><input id="ckB" type="password" autocomplete="new-password"></div>
      <div id="ckErr" class="hint err hidden"></div>`,
    footer: `${obligatoria ? '' : '<button class="btn" data-act="closeModal">Cancelar</button>'}<button class="btn primary" data-act="miClaveGuardar"><i class="fa-solid fa-key"></i> Guardar contraseña</button>`
  });
}
async function guardarClave() {
  const a = $('#ckA').value,
    bb = $('#ckB').value,
    err = m => {
      const e = $('#ckErr');
      e.textContent = m;
      e.classList.remove('hidden');
    };
  if (a.length < 10 || !/[a-zA-Z]/.test(a) || !/\d/.test(a))
    return err('Mínimo 10 caracteres, con letras y números.');
  if (a !== bb) return err('Las dos contraseñas no coinciden.');
  if (S.demo) {
    closeModal();
    return toast('Contraseña actualizada (simulado en modo demostración)');
  }
  const { error } = await sb.auth.updateUser({ password: a });
  if (error) return err('No se pudo guardar: ' + error.message);
  closeModal();
  toast('Contraseña actualizada');
  /* Llegada por invitación o recuperación: la verificación en dos pasos se pide de inmediato, no en el próximo ingreso */
  if (LLEGADA_CLAVE) await mfaRevisarTrasIngreso();
}

/* El código QR llega como "data:image/svg+xml;utf-8,<svg …>" sin codificar: las comillas y los '#' de los colores
   cortan la dirección de la imagen. Se codifica el SVG para que el navegador lo dibuje completo. */
function qrSeguro(qr) {
  const s = String(qr || '');
  const i = s.indexOf(',');
  if (i < 0 || !/^data:image\/svg\+xml/i.test(s) || /;base64,/i.test(s.slice(0, i + 1))) return s;
  const svg = s.slice(i + 1);
  return (
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(/%3C/i.test(svg) ? decodeURIComponent(svg) : svg)
  );
}

/* ---------- Verificación en dos pasos (código de una app autenticadora) ----------
   Supabase Auth con factor TOTP. La base de datos (supabase/14) no reconoce un rol de supervisión
   a quien ya la activó si entró solo con la contraseña. Es obligatoria para el Super administrador. */
const MFA = { pendiente: null, resolver: null };
const mfaRolesObligatorio = ['admin'];
const mfaRolesRecomendado = ['alcalde', 'control_interno'];
async function mfaFactores() {
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) throw error;
  return { verificados: (data.totp || []).filter(f => f.status === 'verified'), todos: data.all || [] };
}
async function miCuentaModal() {
  let estado = '<div class="muted">No disponible en modo demostración.</div>',
    botones = '';
  if (!S.demo && sb) {
    try {
      const f = await mfaFactores();
      if (f.verificados.length) {
        const fx = f.verificados[0];
        estado = `<div><span class="pill verde">Activa</span> <span class="muted" style="font-size:.8rem">desde el ${fmtD((fx.created_at || '').slice(0, 10))}</span></div>`;
        botones = mfaRolesObligatorio.includes(rol())
          ? '<div class="hint">Es obligatoria para el Super administrador. Si cambió de celular, actívela de nuevo en el celular nuevo y luego quite la anterior.</div><button class="btn sm" data-act="mfaActivar" style="margin-top:8px"><i class="fa-solid fa-mobile-screen"></i> Agregar otro celular</button>' +
            (f.verificados.length > 1
              ? f.verificados
                  .map(
                    x =>
                      `<button class="btn sm" data-act="mfaQuitar" data-id="${esc(x.id)}" style="margin:8px 0 0 8px">Quitar ${esc(x.friendly_name || 'dispositivo')}</button>`
                  )
                  .join('')
              : '')
          : f.verificados
              .map(
                x =>
                  `<button class="btn sm" data-act="mfaQuitar" data-id="${esc(x.id)}" style="margin-top:8px">Quitar ${esc(x.friendly_name || 'dispositivo')}</button>`
              )
              .join(' ');
      } else {
        estado = `<div><span class="pill ${mfaRolesObligatorio.includes(rol()) ? 'rojo' : 'amarillo'}">No activa</span></div>`;
        botones =
          '<button class="btn primary sm" data-act="mfaActivar" style="margin-top:10px"><i class="fa-solid fa-shield-halved"></i> Activar verificación en dos pasos</button>';
      }
    } catch (e) {
      estado = `<div class="muted">No se pudo consultar: ${esc(e.message)}</div>`;
    }
  }
  openModal({
    title: 'Mi cuenta y seguridad',
    body: `<div class="field"><label>Cuenta</label><div>${esc((S.user || {}).email || '')}<div class="muted" style="font-size:.8rem">${esc(ROLES[rol()] || '')}</div></div></div>
      <div class="field"><label>Contraseña</label><button class="btn sm" data-act="miClaveCambiar"><i class="fa-solid fa-key"></i> Cambiar mi contraseña</button></div>
      <div class="field"><label>Verificación en dos pasos</label>${estado}
        <div class="hint" style="margin-top:6px">Además de la contraseña, al ingresar se pide un código de 6 dígitos que genera una app en su celular (Google Authenticator o Microsoft Authenticator). Así, una contraseña robada no basta para entrar.</div>${botones}</div>`,
    footer: '<button class="btn" data-act="closeModal">Cerrar</button>'
  });
}
/* Inscribe un celular: muestra el código QR y pide el primer código para confirmarlo */
async function mfaInscribir(obligatoria) {
  if (S.demo || !sb) return toast('No disponible en modo demostración', 'err');
  try {
    const f = await mfaFactores();
    /* intentos anteriores sin terminar */
    for (const x of f.todos.filter(x => x.status !== 'verified'))
      await sb.auth.mfa.unenroll({ factorId: x.id });
    const nombre =
      'Celular ' + (f.verificados.length + 1) + ' (' + new Date().toLocaleDateString('es-CO') + ')';
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: nombre });
    if (error) throw error;
    MFA.pendiente = data.id;
    openModal({
      title: obligatoria ? 'Active la verificación en dos pasos' : 'Activar verificación en dos pasos',
      fija: !!obligatoria,
      body: `${obligatoria ? '<div class="pm-note y" style="margin:0 0 12px">Por seguridad, la cuenta de Super administrador debe tener verificación en dos pasos. Toma un minuto.</div>' : ''}
        <ol style="margin:0 0 12px 18px;line-height:1.6">
          <li>Instale en su celular <b>Google Authenticator</b> o <b>Microsoft Authenticator</b> (gratis).</li>
          <li>En la app, agregue una cuenta y escanee este código:</li>
        </ol>
        <div style="text-align:center;margin:10px 0"><img src="${esc(qrSeguro(data.totp.qr_code))}" alt="Código QR para la app autenticadora" style="width:210px;height:210px;background:#fff;padding:8px;border-radius:10px"></div>
        <div class="hint" style="text-align:center">Si no puede escanear, escriba esta clave en la app: <span class="mono" style="user-select:all">${esc(data.totp.secret)}</span></div>
        <div class="field" style="margin-top:14px"><label for="mfaCod">3. Escriba el código de 6 dígitos que muestra la app</label><input id="mfaCod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="mono" style="font-size:1.4rem;letter-spacing:.3em;text-align:center"></div>
        <div id="mfaErr" class="hint err hidden"></div>`,
      footer: `${obligatoria ? '<button class="btn" data-act="mfaSalir">Cerrar sesión</button>' : '<button class="btn" data-act="mfaCancelar">Cancelar</button>'}<button class="btn primary" data-act="mfaConfirmar"><i class="fa-solid fa-check"></i> Confirmar</button>`
    });
  } catch (e) {
    toast('No se pudo iniciar la verificación en dos pasos: ' + e.message, 'err');
  }
}
async function mfaConfirmar(btn) {
  const code = ($('#mfaCod').value || '').replace(/\D/g, '');
  const err = m => {
    const e = $('#mfaErr');
    e.textContent = m;
    e.classList.remove('hidden');
  };
  if (code.length !== 6) return err('Escriba los 6 dígitos que muestra la app.');
  if (btn) btn.disabled = true;
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: MFA.pendiente, code });
  if (btn) btn.disabled = false;
  if (error) return err('El código no es correcto o ya cambió. Escriba el código actual de la app.');
  MFA.pendiente = null;
  closeModal();
  toast('Verificación en dos pasos activada. Desde ahora se pedirá el código al ingresar.');
}
async function mfaCancelar() {
  if (MFA.pendiente) await sb.auth.mfa.unenroll({ factorId: MFA.pendiente }).catch(() => {});
  MFA.pendiente = null;
  closeModal();
}
async function mfaQuitar(id) {
  const f = await mfaFactores().catch(() => ({ verificados: [] }));
  if (mfaRolesObligatorio.includes(rol()) && f.verificados.length <= 1)
    return toast('Es obligatoria para el Super administrador: agregue primero otro celular.', 'err');
  if (!confirm('¿Quitar este celular de la verificación en dos pasos?')) return;
  const { error } = await sb.auth.mfa.unenroll({ factorId: id });
  if (error)
    return toast(
      'No se pudo quitar: ' + error.message + '. Ingrese de nuevo con el código e inténtelo otra vez.',
      'err'
    );
  toast('Celular quitado de la verificación en dos pasos');
  await miCuentaModal();
}
/* Al ingresar: si la cuenta tiene verificación activa, pide el código antes de abrir la app */
function mfaPedirCodigo() {
  return new Promise(resolve => {
    MFA.resolver = resolve;
    openModal({
      title: 'Verificación en dos pasos',
      fija: true,
      body: `<div class="sub" style="margin-bottom:12px">Abra la app autenticadora de su celular y escriba el código de 6 dígitos de Control de Entes.</div>
        <div class="field"><label for="mfaCod">Código</label><input id="mfaCod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" class="mono" style="font-size:1.4rem;letter-spacing:.3em;text-align:center"></div>
        <div id="mfaErr" class="hint err hidden"></div>
        <div class="hint">Si perdió el celular, pida al Super administrador o al soporte técnico que restablezca su verificación.</div>`,
      footer:
        '<button class="btn" data-act="mfaSalir">Cancelar</button><button class="btn primary" data-act="mfaVerificar"><i class="fa-solid fa-unlock"></i> Ingresar</button>'
    });
    const i = $('#mfaCod');
    if (i)
      i.addEventListener('keydown', e => {
        if (e.key === 'Enter') $('[data-act="mfaVerificar"]').click();
      });
  });
}
async function mfaVerificarCodigo(btn) {
  const code = ($('#mfaCod').value || '').replace(/\D/g, '');
  const err = m => {
    const e = $('#mfaErr');
    e.textContent = m;
    e.classList.remove('hidden');
  };
  if (code.length !== 6) return err('Escriba los 6 dígitos.');
  try {
    if (btn) btn.disabled = true;
    const f = await mfaFactores();
    const fx = f.verificados[0];
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fx.id, code });
    if (btn) btn.disabled = false;
    if (error) return err('El código no es correcto o ya cambió. Escriba el código actual.');
    closeModal();
    const r = MFA.resolver;
    MFA.resolver = null;
    if (r) r(true);
  } catch (e) {
    if (btn) btn.disabled = false;
    err('No se pudo verificar: ' + e.message);
  }
}
async function mfaSalir() {
  MFA.pendiente = null;
  closeModal();
  const r = MFA.resolver;
  MFA.resolver = null;
  if (r) r(false);
  else {
    await sb.auth.signOut();
    location.reload();
  }
}
/* Después de ingresar: obliga al Super administrador a activarla y la recomienda a la supervisión */
async function mfaRevisarTrasIngreso() {
  if (S.demo || !sb) return;
  try {
    const f = await mfaFactores();
    if (f.verificados.length) return;
    if (mfaRolesObligatorio.includes(rol())) return mfaInscribir(true);
    if (mfaRolesRecomendado.includes(rol()) && !sessionStorage.getItem('ce_mfa_aviso')) {
      sessionStorage.setItem('ce_mfa_aviso', '1');
      toast('Recomendado: active la verificación en dos pasos en Mi cuenta (botón de la llave).');
    }
  } catch (e) {
    console.error(e);
  }
}

/* ---------- Resumen semanal por correo (Edge Function resumen-semanal, supabase/14) ---------- */
async function guardarResumen() {
  if (!('resumen_activo' in S.cfg) && !S.demo)
    return toast('Primero ejecute el script supabase/14_seguridad_y_resumen.sql', 'err');
  try {
    await db.saveConfig({ resumen_activo: $('#cfRes').checked });
    await db.catalogs();
    toast(
      $('#cfRes').checked
        ? 'Resumen semanal activado: se enviará los lunes a las 7:00 a. m.'
        : 'Resumen semanal desactivado'
    );
    render();
  } catch (e) {
    toast(e.message, 'err');
  }
}
async function probarResumen(btn) {
  if (S.demo || !sb) return toast('En modo demostración no se envían correos', 'err');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando…';
  }
  try {
    const { data, error } = await sb.functions.invoke('resumen-semanal', { body: { prueba: true } });
    if (error) throw new Error((data && data.error) || error.message);
    if (data && data.error) throw new Error(data.error);
    /* si el servidor de correo rechazó el envío, se muestra su respuesta (antes se confundía con "sin pendientes") */
    if (data && data.errores && data.errores.length)
      throw new Error('el servidor de correo respondió: ' + data.errores[0]);
    toast(
      data.enviados
        ? 'Correo de prueba enviado a ' +
            S.user.email +
            '. Revise su bandeja de entrada y la carpeta de spam.'
        : 'No hay dependencias con pendientes para armar la prueba.'
    );
  } catch (e) {
    toast('No se pudo enviar la prueba: ' + e.message, 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar prueba a mi correo';
    }
  }
}

/* ---------- Aviso diario de planes (Edge Function avisos-planes, supabase/24 y 25) ---------- */
const CORREO_CALI = /^[a-z0-9._%+-]+@cali\.gov\.co$/;
async function guardarAvisos() {
  if (!('avisos_activo' in S.cfg) && !S.demo)
    return toast('Primero ejecute el script supabase/24_avisos_planes.sql', 'err');
  const copia = ($('#cfAvCopia').value || '').trim().toLowerCase();
  if (copia && !CORREO_CALI.test(copia))
    return toast('El correo de copia a Control Interno debe ser @cali.gov.co', 'err');
  try {
    await db.saveConfig({ avisos_activo: $('#cfAv').checked, avisos_copia_correo: copia });
    await db.catalogs();
    toast(
      $('#cfAv').checked
        ? 'Aviso diario activado: se enviará de lunes a viernes a las 7:00 a. m.'
        : 'Aviso diario desactivado'
    );
    render();
  } catch (e) {
    toast(e.message, 'err');
  }
}
async function previaAvisos(btn) {
  if (S.demo || !sb) return toast('En modo demostración no hay vista previa del aviso', 'err');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Consultando…';
  }
  try {
    const { data, error } = await sb.functions.invoke('avisos-planes', { body: { vista_previa: true } });
    if (error) throw new Error((data && data.error) || error.message);
    if (data && data.error) throw new Error(data.error);
    const filas = (data.dependencias || [])
      .map(
        d =>
          `<tr><td>${esc(d.dependencia)}</td><td class="mono">${d.previo}</td><td class="mono">${d.atraso}</td><td>${d.correo ? esc(d.correo) : '<span class="muted">sin correo en el directorio</span>'}</td></tr>`
      )
      .join('');
    openModal({
      title: 'Vista previa del aviso diario',
      wide: true,
      body: `<div class="hint" style="margin-bottom:10px">Lo que se enviaría hoy (${fmtD(data.hoy)}). No se envió ningún correo.${data.dia_habil ? '' : ' Hoy no es día hábil: la tarea no enviaría nada.'}${data.activo ? '' : ' El aviso está desactivado.'}</div>
        ${filas ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dependencia</th><th>Vencen el próximo día hábil</th><th>Vencidas</th><th>Correo del titular</th></tr></thead><tbody>${filas}</tbody></table></div>` : '<div class="empty">Hoy no hay acciones para avisar.</div>'}
        <div class="hint" style="margin-top:10px">Copia a Control Interno: ${data.copia ? esc(data.copia) : 'sin correo de copia'}.${data.sin_dependencia ? ` ${data.sin_dependencia} acción(es) sin dependencia asignada no se avisan.` : ''}</div>`
    });
  } catch (e) {
    toast('No se pudo consultar la vista previa: ' + e.message, 'err');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-eye"></i> Ver qué se enviaría hoy';
    }
  }
}

function vConfig(c) {
  c.innerHTML = `<div class="hint" id="cfVersion" style="margin-bottom:12px"><i class="fa-solid fa-circle-info"></i> ${esc(versionApp())}</div>
  <div class="grid g-2">
    <div class="card"><h3>Parámetros del semáforo</h3><div class="sub">Se guardan en la base de datos y aplican a toda la entidad.</div>
      <div class="field"><label>Días para considerar un requerimiento crítico (rojo)</label><input id="cfDias" type="number" min="1" max="30" value="${S.cfg.dias_rojo}"><div class="hint">Un requerimiento abierto pasa a rojo cuando le quedan este número de días o menos, o ya venció.</div></div>
      <div class="field"><label>Correo de Control Disciplinario Interno</label><input id="cfDisc" type="email" value="${esc(S.cfg.correo_disciplinario || '')}" placeholder="disciplinario@cali.gov.co"><div class="hint">Destino de la notificación preventiva para requerimientos vencidos.</div></div>
      <button class="btn primary" data-act="saveCfg"><i class="fa-solid fa-floppy-disk"></i> Guardar parámetros</button></div>
    <div class="card"><h3>Conexión a Supabase</h3><div class="sub">${S.demo ? 'Estás en modo demostración. Pega los datos de tu proyecto para conectar la base real.' : 'Conectado a tu proyecto Supabase.'}</div>
      <div class="field"><label>Project URL</label><input id="cfUrl" value="${esc(CFG.SUPABASE_URL || lsGet('ce_url') || '')}" placeholder="https://xxxx.supabase.co"></div>
      <div class="field"><label>anon public key</label><input id="cfKey" value="${esc(CFG.SUPABASE_ANON_KEY || lsGet('ce_key') || '')}" placeholder="eyJ…"><div class="hint">Nunca uses la service_role key en este archivo.</div></div>
      <button class="btn" data-act="saveConn"><i class="fa-solid fa-plug"></i> Guardar en este navegador y recargar</button></div>
    <div class="card"><h3>Resumen semanal por correo</h3><div class="sub">Cada lunes a las 7:00 a. m. se envía a cada secretario o director, a su correo institucional, lo que su dependencia tiene pendiente: requerimientos vencidos y por vencer, y acciones de planes de mejoramiento vencidas, por vencer o devueltas. Cada envío queda en la bitácora de notificaciones.</div>
      ${
        !S.demo && !('resumen_activo' in S.cfg)
          ? '<div class="pm-note y">Para usarlo, ejecute en Supabase el script <span class="mono">14_seguridad_y_resumen.sql</span> y despliegue la función <span class="mono">resumen-semanal</span> (ver docs/DESPLIEGUE.md).</div>'
          : `<label class="pm-checks" style="margin:6px 0 12px"><input type="checkbox" id="cfRes" ${S.cfg.resumen_activo ? 'checked' : ''}> Enviar el resumen semanal automáticamente</label>
      ${S.cfg.resumen_ultimo ? `<div class="hint" style="margin-bottom:10px">Último envío: ${fmtTs(S.cfg.resumen_ultimo)}. ${esc(S.cfg.resumen_ultimo_detalle || '')}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="saveResumen"><i class="fa-solid fa-floppy-disk"></i> Guardar</button><button class="btn" data-act="probarResumen"><i class="fa-solid fa-paper-plane"></i> Enviar prueba a mi correo</button></div>`
      }</div>
    <div class="card"><h3>Aviso diario de planes de mejoramiento</h3><div class="sub">De lunes a viernes a las 7:00 a. m. (los festivos no) se avisa a cada secretario o director, con copia a Control Interno, de las acciones que vencen el próximo día hábil y de las que se vencieron sin cumplirse (solo las de los últimos 7 días; las más antiguas siguen en el resumen de los lunes). Nunca se avisa dos veces lo mismo; con una prórroga se avisa de nuevo.</div>
      ${
        !S.demo && !('avisos_activo' in S.cfg)
          ? '<div class="pm-note y">Para usarlo, ejecute en Supabase el script <span class="mono">24_avisos_planes.sql</span>, despliegue la función <span class="mono">avisos-planes</span> y programe la tarea con <span class="mono">25_programar_avisos.sql</span> (ver docs/DESPLIEGUE.md).</div>'
          : `<label class="pm-checks" style="margin:6px 0 12px"><input type="checkbox" id="cfAv" ${S.cfg.avisos_activo ? 'checked' : ''}> Enviar el aviso diario automáticamente</label>
      <div class="field"><label>Correo de copia a Control Interno</label><input id="cfAvCopia" type="email" value="${esc(S.cfg.avisos_copia_correo || '')}" placeholder="control.interno@cali.gov.co"><div class="hint">Solo correos @cali.gov.co. Vacío: el aviso sale sin copia.</div></div>
      ${S.cfg.avisos_ultimo ? `<div class="hint" style="margin-bottom:10px">Último envío: ${fmtTs(S.cfg.avisos_ultimo)}. ${esc(S.cfg.avisos_ultimo_detalle || '')}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="saveAvisos"><i class="fa-solid fa-floppy-disk"></i> Guardar</button><button class="btn" data-act="previaAvisos"><i class="fa-solid fa-eye"></i> Ver qué se enviaría hoy</button></div>`
      }</div>
    <div class="card"><h3>Datos desde el Excel de control</h3><div class="sub">Actualice el histórico cargando el Excel de control de la vigencia. Antes de guardar se muestra qué cambia y qué filas revisar.</div>
      <button class="btn primary" data-act="ceAbrir"><i class="fa-solid fa-file-arrow-up"></i> Cargar Excel de control</button>
      <div id="ceUltimas" class="hint" style="margin-top:12px"></div></div>
    <div class="card"><h3>Copias de seguridad</h3><div class="sub">Cada domingo a las 11:00 p. m. se guarda una copia completa de la información (se conservan las 12 más recientes). Descargue una copia a su computador al menos una vez al mes.</div>
      <div id="rpCaja"><div class="hint"><i class="fa-solid fa-spinner fa-spin"></i> Consultando…</div></div>
      <div class="rp-arch"><b>Archivos (PDF y documentos)</b><div class="sub">La copia anterior guarda los datos. Los archivos se respaldan aparte: verifique que estén completos y sin alteraciones, y descárguelos en un ZIP con su manifiesto de huellas digitales.</div>
        <div class="toolbar"><button class="btn sm" data-act="archVerificar"><i class="fa-solid fa-shield-halved"></i> Verificar archivos</button><button class="btn sm" data-act="archZip"><i class="fa-solid fa-file-zipper"></i> Descargar archivos (ZIP)</button></div>
        <div id="respArchivos" class="hint"></div></div></div>
    <div class="card"><h3>Salud del sistema</h3><div class="sub">Errores y avisos de las funciones automáticas (resumen semanal, copias de seguridad) y de la app en los equipos de los usuarios.</div>
      <div id="slCaja"><div class="hint"><i class="fa-solid fa-spinner fa-spin"></i> Consultando…</div></div></div></div>`;
  respaldoCargar();
  saludCargar();
  ceUltimasCargas().then(l => {
    const el = $('#ceUltimas');
    if (!el) return;
    if (l === null)
      el.innerHTML =
        'Para guardar las cargas en la base de datos, ejecute el script <span class="mono">16_carga_excel.sql</span>.';
    else if (l.length)
      el.innerHTML =
        '<b>Últimas cargas</b><br>' +
        l
          .map(
            x =>
              `${fmtTs(x.created_at)}: vigencia ${esc((x.vigencias || []).join(' y '))}, ${nf(x.registros)} registros, por ${esc(x.usuario)}`
          )
          .join('<br>');
  });
}

/* =====================================================================
   COPIAS DE SEGURIDAD Y SALUD DEL SISTEMA (supabase/17 y función "respaldo")
   ===================================================================== */
/* respaldo_2026-10-25_2300.json.gz → 25/10/2026, 11:00 p. m. */
const rpFecha = n => {
  const m = /respaldo_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(n);
  if (!m) return n;
  const h = +m[4],
    hh = h % 12 || 12;
  return `${m[3]}/${m[2]}/${m[1]}, ${hh}:${m[5]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
};
const sinScript17 = () => !S.demo && !('respaldo_ultimo' in S.cfg);
async function respaldoCargar() {
  const caja = $('#rpCaja');
  if (!caja) return;
  if (S.demo) {
    caja.innerHTML = '<div class="hint">En modo demostración no se crean copias de seguridad.</div>';
    return;
  }
  if (sinScript17()) {
    caja.innerHTML =
      '<div class="pm-note y">Para activarlas, ejecute en Supabase los scripts <span class="mono">17_respaldos_y_monitoreo.sql</span> y <span class="mono">23_respaldo_texto.sql</span>, despliegue la función <span class="mono">respaldo</span> y, para la copia semanal, ejecute <span class="mono">21_programar_tareas_boveda.sql</span> (ver docs/RESPALDOS.md).</div>';
    return;
  }
  const { data, error } = await sb.storage
    .from('respaldos')
    .list('', { limit: 20, sortBy: { column: 'name', order: 'desc' } });
  const lista = (data || []).filter(f => /^respaldo_.*\.json\.gz$/.test(f.name));
  caja.innerHTML = `${S.cfg.respaldo_ultimo ? `<div class="hint" style="margin-bottom:10px">Última copia: ${fmtTs(S.cfg.respaldo_ultimo)}. ${esc(S.cfg.respaldo_ultimo_detalle || '')}</div>` : '<div class="hint" style="margin-bottom:10px">Todavía no hay copias. Cree la primera ahora.</div>'}
    <button class="btn primary" data-act="rpCrear"><i class="fa-solid fa-shield-halved"></i> Crear copia ahora</button>
    ${
      error
        ? `<div class="hint err" style="margin-top:10px">No se pudo consultar la lista: ${esc(error.message)}</div>`
        : lista.length
          ? `<div class="rp-lista">${lista
              .map(
                f =>
                  `<div><span class="mono">${esc(rpFecha(f.name))}</span><span class="muted">${f.metadata && f.metadata.size ? (f.metadata.size / 1024).toFixed(0) + ' KB' : ''}</span><button class="btn sm" data-act="rpDescargar" data-n="${esc(f.name)}"><i class="fa-solid fa-download"></i> Descargar</button></div>`
              )
              .join('')}</div>`
          : ''
    }`;
}
async function respaldoCrear(btn) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando copia…';
  }
  try {
    const { data, error } = await sb.functions.invoke('respaldo', { body: {} });
    if (error) throw new Error((data && data.error) || error.message);
    if (data && data.error) throw new Error(data.error);
    toast(`Copia creada: ${nf(data.registros)} registros, ${data.kb} KB.`);
    await db.catalogs();
  } catch (e) {
    toast('No se pudo crear la copia: ' + e.message, 'err');
  }
  respaldoCargar();
  saludCargar();
}
async function respaldoDescargar(nombre) {
  const { data, error } = await sb.storage
    .from('respaldos')
    .createSignedUrl(nombre, 120, { download: nombre });
  if (error) return toast('No se pudo descargar: ' + error.message, 'err');
  const a = document.createElement('a');
  a.href = data.signedUrl;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function saludCargar() {
  const caja = $('#slCaja');
  if (!caja) return;
  if (S.demo) {
    caja.innerHTML = '<div class="hint">En modo demostración no hay funciones automáticas.</div>';
    return;
  }
  if (sinScript17()) {
    caja.innerHTML =
      '<div class="hint">Disponible al ejecutar el script <span class="mono">17_respaldos_y_monitoreo.sql</span>.</div>';
    return;
  }
  const { data, error } = await sb
    .from('eventos_sistema')
    .select('*')
    .in('nivel', ['error', 'aviso'])
    .eq('revisado', false)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    caja.innerHTML = `<div class="hint err">${esc(error.message)}</div>`;
    return;
  }
  caja.innerHTML = data.length
    ? `<div class="sl-lista">${data
        .map(
          e =>
            `<div><span class="pill ${e.nivel === 'error' ? 'rojo' : 'amarillo'}"><i></i>${e.nivel === 'error' ? 'Error' : 'Aviso'}</span><div><b>${esc(e.mensaje)}</b><div class="muted">${fmtTs(e.created_at)} · ${esc(e.origen)}${e.usuario ? ' · ' + esc(e.usuario) : ''}</div>${e.detalle && e.detalle.error ? `<div class="muted mono">${esc(String(e.detalle.error).slice(0, 200))}</div>` : ''}</div><button class="btn sm" data-act="slRevisado" data-id="${e.id}">Marcar revisado</button></div>`
        )
        .join('')}</div>`
    : '<div class="pm-note g" style="margin:0"><i class="fa-solid fa-circle-check"></i> Sin errores pendientes.</div>';
}
async function saludRevisado(id) {
  const { error } = await sb.from('eventos_sistema').update({ revisado: true }).eq('id', id);
  if (error) return toast(error.message, 'err');
  saludCargar();
}
/* Errores del navegador: se registran en eventos_sistema (máximo 5 por sesión; el servidor limita 20 por hora) */
let errAppN = 0;
function reportarErrorApp(mensaje, detalle) {
  if (S.demo || !sb || !S.user || errAppN >= 5) return;
  errAppN++;
  try {
    sb.rpc('registrar_error_app', {
      p_mensaje: String(mensaje || 'Error').slice(0, 500),
      p_detalle: {
        ...detalle,
        vista: S.view || '',
        version: (CE_BUILD && CE_BUILD.version) || '',
        navegador: navigator.userAgent.slice(0, 160)
      }
    }).then(
      () => {},
      () => {}
    );
  } catch (e) {
    /* nunca interrumpir la app por el reporte */
  }
}
window.addEventListener('error', ev =>
  reportarErrorApp(ev.message, { archivo: ev.filename ? 'app' : '', linea: ev.lineno, columna: ev.colno })
);
window.addEventListener('unhandledrejection', ev =>
  reportarErrorApp(ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason), {
    tipo: 'promesa'
  })
);
