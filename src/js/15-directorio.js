/**
 * src/js/15-directorio.js
 * Directorio del gabinete: un responsable por dependencia, con validación de nombre completo, celular y duplicados.
 * Depende de: 10 (DIRLIST, saveDirRow, normPhone).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   DIRECTORIO DEL GABINETE (solo secretarios y directores)
   ===================================================================== */
const DIRF = { q: '', f: 'todos' };
function vDirectorio(c) {
  const edit = canRole(['admin', 'alcalde']);
  const orgs = mainOrgsAll();
  const rows = [];
  orgs.forEach(o => {
    const k = orgKey(o);
    const l = DIRLIST.map((x, i) => ({ x, i })).filter(z => orgKey(z.x.organismo) === k);
    if (l.length) l.forEach(z => rows.push({ org: o, ...z, st: ctStatus(z.x) }));
    else rows.push({ org: o, x: null, i: -1, st: 'sin' });
  });
  const keys = new Set(orgs.map(orgKey));
  const huerf = DIRLIST.map((x, i) => ({ x, i })).filter(z => !keys.has(orgKey(z.x.organismo)));
  const telCount = {};
  DIRLIST.forEach(x => {
    const p = normPhone(x.telefono);
    if (p) telCount[p] = (telCount[p] || 0) + 1;
  });
  const dup = Object.keys(telCount).filter(p => telCount[p] > 1);
  const n = s => rows.filter(r => r.st === s).length,
    ok = orgs.filter(o => contactsOf(o).some(x => ctStatus(x) === 'ok')).length;
  const STL = {
    ok: ['verde', 'Listo para WhatsApp'],
    nombre: ['amarillo', 'Falta nombre completo'],
    celular: ['amarillo', 'Falta celular válido'],
    sin: ['rojo', 'Sin responsable']
  };
  const qk = orgKey(DIRF.q);
  const vis = rows.filter(
    r =>
      (DIRF.f === 'todos' || (DIRF.f === 'pend' ? r.st !== 'ok' : r.st === DIRF.f)) &&
      (!qk || orgKey(r.org + ' ' + (r.x ? r.x.nombre + ' ' + r.x.cargo : '')).includes(qk))
  );
  c.innerHTML = `
    <div class="grid g-kpi" style="margin-bottom:14px">
      <div class="card kpi g"><small>Listas para WhatsApp</small><b>${ok}<span class="kpi-of"> / ${orgs.length}</span></b></div>
      <div class="card kpi y"><small>Falta nombre o celular</small><b>${n('nombre') + n('celular')}</b></div>
      <div class="card kpi r"><small>Sin responsable</small><b>${n('sin')}</b></div>
      <div class="card kpi ${huerf.length || dup.length ? 'r' : ''}"><small>Inconsistencias</small><b>${huerf.length + dup.length}</b></div>
    </div>
    ${
      huerf.length || dup.length
        ? `<div class="card warn-card" style="margin-bottom:14px"><h3><i class="fa-solid fa-triangle-exclamation"></i> Revisa antes de notificar</h3>
      ${huerf.length ? `<div class="sub" style="margin:6px 0">Estos registros del directorio no corresponden a ninguna dependencia, por eso no se usarán para WhatsApp. Corrige el nombre del organismo en Supabase para que coincida exactamente:</div>${huerf.map(z => `<div class="list-row"><div class="grow"><b>${esc(z.x.organismo)}</b><small>${esc(z.x.cargo)} · ${esc(z.x.nombre || 'sin nombre')}</small></div></div>`).join('')}` : ''}
      ${
        dup.length
          ? `<div class="sub" style="margin:10px 0 6px">El mismo celular está asignado a más de un responsable:</div>${dup
              .map(
                p =>
                  `<div class="list-row"><div class="grow"><b class="mono">${fmtPhone(p)}</b><small>${DIRLIST.filter(
                    x => normPhone(x.telefono) === p
                  )
                    .map(x => esc(shortOrg(x.organismo)))
                    .join(' · ')}</small></div></div>`
              )
              .join('')}`
          : ''
      }
    </div>`
        : ''
    }
    <div class="toolbar">
      <div class="grow"><i class="fa-solid fa-magnifying-glass"></i><input id="dirQ" placeholder="Buscar dependencia, nombre o cargo" value="${esc(DIRF.q)}"></div>
      <select id="dirF"><option value="todos">Todas</option><option value="pend"${DIRF.f === 'pend' ? ' selected' : ''}>Pendientes por completar</option><option value="ok"${DIRF.f === 'ok' ? ' selected' : ''}>Listas para WhatsApp</option><option value="sin"${DIRF.f === 'sin' ? ' selected' : ''}>Sin responsable</option></select>
      <button class="btn no-print" data-act="dirCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button></div>
    <div class="dir-list">${
      vis.length
        ? vis
            .map(r =>
              r.x
                ? `<div class="dir-row card" data-di="${r.i}">
        <div class="dir-h"><div><b class="dir-org">${esc(r.org)}</b><span class="pill ${STL[r.st][0]}"><i></i>${STL[r.st][1]}</span></div></div>
        <div class="dir-f">
          <div class="field"><label>Cargo</label>${edit ? `<input data-k="cargo" value="${esc(r.x.cargo)}">` : `<div class="ro">${esc(r.x.cargo)}</div>`}</div>
          <div class="field"><label>Nombre completo</label>${edit ? `<input data-k="nombre" value="${esc(r.x.nombre)}" placeholder="Nombres y apellidos" autocomplete="off">` : `<div class="ro">${esc(r.x.nombre || '—')}</div>`}</div>
          <div class="field"><label>Celular (WhatsApp)</label>${edit ? `<input data-k="telefono" class="mono" inputmode="tel" placeholder="3001234567" value="${esc(normPhone(r.x.telefono) ? normPhone(r.x.telefono).slice(2) : r.x.telefono)}">` : `<div class="ro mono">${fmtPhone(normPhone(r.x.telefono))}</div>`}</div>
          <div class="field"><label>Correo institucional</label>${edit ? `<input data-k="correo" class="mono" inputmode="email" placeholder="nombre.apellido@cali.gov.co" value="${esc(r.x.correo || '')}">` : `<div class="ro mono">${esc(r.x.correo || '—')}</div>`}${r.x.correo ? '' : '<div class="hint err">Sin correo: solo se podrá notificar por WhatsApp</div>'}</div>
          <div class="dir-a">${edit ? `<button class="btn primary" data-act="dirSave" data-i="${r.i}"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>` : ''}${normPhone(r.x.telefono) ? `<a class="btn" href="https://wa.me/${normPhone(r.x.telefono)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Probar chat</a>` : ''}</div>
        </div></div>`
                : `<div class="dir-row card"><div class="dir-h"><div><b class="dir-org">${esc(r.org)}</b><span class="pill rojo"><i></i>Sin responsable</span></div>${edit ? `<button class="btn sm primary" data-act="dirAdd" data-org="${esc(r.org)}"><i class="fa-solid fa-user-plus"></i> Agregar responsable</button>` : ''}</div></div>`
            )
            .join('')
        : '<div class="card"><div class="empty"><i class="fa-solid fa-magnifying-glass"></i>Ninguna dependencia coincide con la búsqueda</div></div>'
    }</div>
    <div class="muted" style="margin-top:12px;font-size:.78rem">Solo secretarios y directores (no subsecretarios, asesores ni jefes de oficina). Cada responsable queda amarrado a su dependencia: el nombre del organismo no se escribe a mano, se toma de la lista oficial. El celular debe tener 10 dígitos e iniciar en 3, y el nombre debe ir completo (nombres y apellidos) para que el saludo del mensaje salga correcto.</div>`;
  const q = $('#dirQ');
  q.addEventListener('input', () => {
    DIRF.q = q.value;
    const p = q.selectionStart;
    render();
    const n2 = $('#dirQ');
    if (n2) {
      n2.focus();
      n2.setSelectionRange(p, p);
    }
  });
  $('#dirF').addEventListener('change', e => {
    DIRF.f = e.target.value;
    render();
  });
}
