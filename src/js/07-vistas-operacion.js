/**
 * src/js/07-vistas-operacion.js
 * Pantallas del módulo operativo: Tablero, Requerimientos, Cargar respuesta ORFEO y Alertas y escalamiento.
 * Depende de: 04 (db), 05, 06.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   VISTAS
   ===================================================================== */
function vTablero(c) {
  const k = counts(S.reqs),
    pct = k.total ? Math.round((k.verde * 100) / k.total) : 0;
  const byEnte = {};
  S.reqs.forEach(r => {
    (byEnte[r.ente_n] = byEnte[r.ente_n] || []).push(r);
  });
  const enteRows =
    Object.entries(byEnte)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([n, l]) => {
        const q = counts(l);
        return `<div class="list-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px;margin-bottom:7px"><b class="ellipsis" style="font-size:.84rem">${esc(n)}</b><span class="mono muted" style="font-size:.74rem;white-space:nowrap">${q.total} · <span style="color:var(--redink)">${q.rojo}</span> / <span style="color:var(--yelink)">${q.amarillo}</span> / <span style="color:var(--glow)">${q.verde}</span></span></div>
      <div class="bar"><span class="rojo" style="width:${(q.rojo * 100) / q.total}%"></span><span class="amarillo" style="width:${(q.amarillo * 100) / q.total}%"></span><span class="verde" style="width:${(q.verde * 100) / q.total}%"></span></div></div>`;
      })
      .join('') ||
    '<div class="empty"><i class="fa-solid fa-inbox"></i>Sin requerimientos en esta vigencia</div>';
  const prox =
    S.reqs
      .filter(r => r.estado === 'abierto')
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 6)
      .map(
        r => `
    <div class="list-row"><div class="grow"><b class="ellipsis">${esc(r.dep_n)}</b><small class="mono">${esc(r.radicado)} · ${esc(r.ente_s || r.ente_n)}</small></div>
    <div style="text-align:right">${pill(r.sem)}<div class="muted" style="font-size:.72rem;margin-top:4px">${diasTxt(r.dias)}</div></div></div>`
      )
      .join('') ||
    '<div class="empty"><i class="fa-solid fa-champagne-glasses"></i>No hay requerimientos abiertos</div>';
  const byDep = {};
  S.reqs
    .filter(r => r.estado === 'abierto')
    .forEach(r => {
      const o = (byDep[r.dep_n] = byDep[r.dep_n] || { n: 0, rojo: 0 });
      o.n++;
      if (r.sem === 'rojo') o.rojo++;
    });
  const depRows =
    Object.entries(byDep)
      .sort((a, b) => b[1].rojo - a[1].rojo || b[1].n - a[1].n)
      .slice(0, 6)
      .map(
        ([n, o]) => `
    <div class="list-row"><div class="grow"><b class="ellipsis">${esc(n)}</b><small>${o.n} abierto(s)</small></div>${o.rojo ? `<span class="pill rojo"><i></i>${o.rojo} CRÍTICO${o.rojo > 1 ? 'S' : ''}</span>` : '<span class="pill amarillo"><i></i>EN TÉRMINO</span>'}</div>`
      )
      .join('') || '<div class="empty"><i class="fa-solid fa-circle-check"></i>Sin pendientes</div>';
  c.innerHTML = `
    <div class="grid g-kpi" style="margin-bottom:14px">
      <div class="card kpi"><small>Total solicitudes</small><b>${nf(k.total)}</b></div>
      <div class="card kpi r"><small>Críticas</small><b>${nf(k.rojo)}</b></div>
      <div class="card kpi y"><small>En término</small><b>${nf(k.amarillo)}</b></div>
      <div class="card kpi g"><small>Cerradas</small><b>${nf(k.verde)}</b></div>
      <div class="card kpi g"><small>Cumplimiento</small><b>${pct}%</b></div>
    </div>
    <div class="grid g-2">
      <div class="card"><h3>Semáforo por ente de control</h3><div class="sub">Crítico / En término / Cerrado</div>${enteRows}</div>
      <div class="card"><h3>Próximos vencimientos</h3><div class="sub">Umbral crítico: ${S.cfg.dias_rojo} días o menos</div>${prox}</div>
      <div class="card"><h3>Dependencias con pendientes</h3><div class="sub">Ordenadas por criticidad</div>${depRows}</div>
    </div>`;
}

function vReqs(c) {
  c.innerHTML = `
    <div class="toolbar">
      <div class="grow"><i class="fa-solid fa-magnifying-glass"></i><input id="fq" placeholder="Buscar radicado, asunto, ente o dependencia…" value="${esc(S.f.q)}"></div>
      <select id="fsem"><option value="">Todos los estados</option><option value="rojo">Crítico</option><option value="amarillo">En término</option><option value="verde">Cerrado</option></select>
      <select id="fente">${opts(S.entes, S.f.ente, 'Todos los entes')}</select>
      <select id="fdep">${opts(S.deps, S.f.dep, 'Todas las dependencias')}</select>
      ${canWrite() ? '<button class="btn primary" data-act="newReq"><i class="fa-solid fa-plus"></i> Nuevo</button>' : ''}
    </div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Estado</th><th>Radicado</th><th>Ente</th><th>Dependencia</th><th>Asunto</th><th>Límite</th><th class="req-acc"></th></tr></thead><tbody id="reqBody"></tbody></table></div>
    <div class="muted" style="margin-top:10px;font-size:.78rem" id="reqCount"></div>`;
  $('#fsem').value = S.f.sem;
  const upd = () => {
    S.f.q = $('#fq').value;
    S.f.sem = $('#fsem').value;
    S.f.ente = $('#fente').value;
    S.f.dep = $('#fdep').value;
    renderReqRows();
  };
  ['fq', 'fsem', 'fente', 'fdep'].forEach(id => $('#' + id).addEventListener('input', upd));
  renderReqRows();
}
function renderReqRows() {
  const q = S.f.q.toLowerCase().trim();
  const list = S.reqs
    .filter(
      r =>
        (!S.f.sem || r.sem === S.f.sem) &&
        (!S.f.ente || String(r.ente_id) === S.f.ente) &&
        (!S.f.dep || String(r.dependencia_id) === S.f.dep) &&
        (!q ||
          [r.radicado, r.asunto, r.ente_n, r.dep_n, r.orfeo_salida].some(x =>
            String(x || '')
              .toLowerCase()
              .includes(q)
          ))
    )
    .sort(
      (a, b) =>
        ({ rojo: 0, amarillo: 1, verde: 2 })[a.sem] - { rojo: 0, amarillo: 1, verde: 2 }[b.sem] ||
        a.dias - b.dias
    );
  $('#reqBody').innerHTML = list.length
    ? list
        .map(
          r => `
    <tr class="click" data-act="detail" data-id="${esc(r.id)}">
      <td>${pill(r.sem)}</td><td class="mono">${esc(r.radicado)}</td>
      <td>${esc(r.ente_s || r.ente_n)}</td><td>${esc(r.dep_n)}</td><td class="asunto">${esc(r.asunto)}</td>
      <td style="white-space:nowrap">${fmtD(r.fecha_limite)}<div class="muted" style="font-size:.72rem">${r.estado === 'abierto' ? diasTxt(r.dias) : 'Cerrado ' + fmtD(r.fecha_cierre)}</div></td>
      <td class="right req-acc">${r.estado === 'abierto' && canClose() ? `<button class="btn sm" data-act="closeFor" data-id="${esc(r.id)}"><i class="fa-solid fa-check"></i> Cerrar</button>` : ''}</td>
    </tr>`
        )
        .join('')
    : `<tr><td colspan="7"><div class="empty"><i class="fa-solid fa-inbox"></i>Sin resultados</div></td></tr>`;
  $('#reqCount').textContent = `${list.length} de ${S.reqs.length} requerimientos · vigencia ${S.vigencia}`;
}

function detailModal(id) {
  const r = S.reqs.find(x => String(x.id) === String(id));
  if (!r) return;
  openModal({
    title: r.radicado,
    body: `
    <div style="margin-bottom:10px">${pill(r.sem)}</div>
    <dl class="kv">
      <div><dt>Ente de control</dt><dd>${esc(r.ente_n)}</dd></div>
      <div><dt>Dependencia</dt><dd>${esc(r.dep_n)}</dd></div>
      <div><dt>Asunto</dt><dd>${esc(r.asunto)}</dd></div>
      <div><dt>Radicación</dt><dd>${fmtD(r.fecha_radicacion)}</dd></div>
      <div><dt>Fecha límite</dt><dd>${fmtD(r.fecha_limite)}${r.estado === 'abierto' ? ' · ' + diasTxt(r.dias) : ''}</dd></div>
      <div><dt>Estado</dt><dd>${r.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}</dd></div>
      ${r.orfeo_salida ? `<div><dt>ORFEO de salida</dt><dd class="mono">${esc(r.orfeo_salida)}</dd></div><div><dt>Fecha de envío</dt><dd>${fmtD(r.fecha_cierre)}</dd></div>` : ''}
      ${r.soporte_hash ? `<div><dt>SHA-256 del soporte</dt><dd class="mono" style="font-size:.72rem">${esc(r.soporte_hash.slice(0, 32))}…</dd></div>` : ''}
      ${r.escalado_at ? `<div><dt>Escalado</dt><dd>${fmtTs(r.escalado_at)}</dd></div>` : ''}
    </dl>`,
    footer: `${r.soporte_path && !S.demo ? `<button class="btn" data-act="openPdf" data-path="${esc(r.soporte_path)}"><i class="fa-solid fa-file-pdf"></i> Ver soporte</button>` : ''}
             ${r.estado === 'abierto' && canClose() ? `<button class="btn primary" data-act="closeFor" data-id="${esc(r.id)}"><i class="fa-solid fa-check"></i> Registrar respuesta</button>` : ''}
             <button class="btn" data-act="closeModal">Cerrar</button>`
  });
}

function newReqModal() {
  const y = S.vigencia,
    hoy = iso(new Date());
  openModal({
    title: 'Nuevo requerimiento',
    body: `
    <div class="field"><label>Radicado de entrada</label><input id="nrRad" class="mono" placeholder="${y}EE004812" maxlength="16" style="text-transform:uppercase"><div class="hint">Formato: año + 2 letras + consecutivo (ej. ${y}EE004812)</div></div>
    <div class="row2">
      <div class="field"><label>Ente de control</label><select id="nrEnte">${opts(S.entes.filter(e => e.activo !== false))}</select></div>
      <div class="field"><label>Dependencia responsable</label><select id="nrDep">${opts(
        S.deps.filter(d => d.activo !== false),
        S.profile.dependencia_id
      )}</select></div>
    </div>
    <div class="field"><label>Asunto</label><textarea id="nrAsu" placeholder="Describe el requerimiento…"></textarea></div>
    <div class="row2">
      <div class="field"><label>Fecha de radicación</label><input id="nrFr" type="date" value="${hoy}" max="${hoy}"></div>
      <div class="field"><label>Término para responder (días hábiles)</label><input id="nrTe" type="number" min="1" max="90" value="10" inputmode="numeric"></div>
    </div>
    <div class="field"><label>Fecha límite de respuesta</label><input id="nrFl" type="date" value="${sumarHabiles(hoy, 10)}"><div class="hint" id="nrFlH">Calculada sin sábados, domingos ni festivos de Colombia. Puede ajustarla si el oficio indica otra fecha.</div></div>
    <div id="nrErr" class="err hidden"></div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn primary" data-act="saveReq"><i class="fa-solid fa-floppy-disk"></i> Guardar</button>`
  }); /* La fecha límite se recalcula con el término en días hábiles, salvo que se haya escrito a mano */
  const calc = () => {
    const fr = $('#nrFr').value,
      n = parseInt($('#nrTe').value, 10);
    if (fr && n > 0) $('#nrFl').value = sumarHabiles(fr, n);
  };
  $('#nrFr').addEventListener('change', calc);
  $('#nrTe').addEventListener('input', calc);
}
async function saveReq() {
  const err = m => {
    const e = $('#nrErr');
    e.textContent = m;
    e.classList.remove('hidden');
  };
  const rad = $('#nrRad').value.trim().toUpperCase(),
    asu = $('#nrAsu').value.trim(),
    fr = $('#nrFr').value,
    fl = $('#nrFl').value;
  if (!/^[0-9]{4}[A-Z]{2}[0-9]{4,10}$/.test(rad))
    return err('Radicado inválido. Ejemplo: ' + S.vigencia + 'EE004812');
  if (asu.length < 4) return err('Escribe el asunto del requerimiento');
  if (!fr || !fl) return err('Completa las fechas');
  if (fl < fr) return err('La fecha límite no puede ser anterior a la radicación');
  if (S.reqs.some(r => r.radicado === rad)) return err('Ese radicado ya existe en esta vigencia');
  try {
    await db.createReq({
      radicado: rad,
      vigencia: parseD(fr).getFullYear(),
      ente_id: +$('#nrEnte').value,
      dependencia_id: +$('#nrDep').value,
      asunto: asu,
      fecha_radicacion: fr,
      fecha_limite: fl
    });
    closeModal();
    toast('Requerimiento ' + rad + ' registrado');
    await reload();
    render();
  } catch (e) {
    err(e.message);
  }
}

function vCarga(c) {
  const abiertos = S.reqs.filter(r => r.estado === 'abierto').sort((a, b) => a.dias - b.dias);
  if (!abiertos.length) {
    c.innerHTML =
      '<div class="card"><div class="empty"><i class="fa-solid fa-champagne-glasses"></i>No hay requerimientos abiertos en la vigencia ' +
      S.vigencia +
      '</div></div>';
    return;
  }
  const hoy = iso(new Date());
  c.innerHTML = `<div class="card" style="max-width:640px">
    <h3>Registrar respuesta ORFEO</h3><div class="sub">Vigencia <b class="mono" style="color:var(--glow)">${S.vigencia}</b> · el cierre queda firmado en la pista de auditoría</div>
    <form id="cargaForm" novalidate>
      <div class="field"><label>Buscar caso</label><input id="cBus" placeholder="Radicado, ente, dependencia o asunto" autocomplete="off"><div class="hint" id="cBusN">${abiertos.length} caso(s) abiertos en la vigencia ${S.vigencia}</div></div>
      <div class="field"><label>Requerimiento pendiente</label><select id="cSel">${abiertos.map(r => `<option value="${esc(r.id)}"${String(r.id) === String(S.preselect) ? ' selected' : ''}>${esc(r.radicado)} · ${esc(r.ente_s || r.ente_n)} · ${esc(r.dep_n)} (${r.sem === 'rojo' ? 'crítico' : 'en término'})</option>`).join('')}</select></div>
      <div class="field"><label>Radicado ORFEO de salida</label><input id="cOrfeo" class="mono" inputmode="numeric" placeholder="202641430100000171" maxlength="20" value="${esc(S.preselectOrfeo || '')}"><div class="hint">Solo dígitos (10 a 20). Se valida contra duplicados.</div><div class="err hidden" id="cOrfeoErr"></div></div>
      <div class="row2">
        <div class="field"><label>Fecha de envío oficial</label><input id="cFecha" type="date" value="${S.preselectFecha && S.preselectFecha <= hoy ? S.preselectFecha : hoy}" max="${hoy}"></div>
        <div class="field"><label>Soporte PDF</label><input id="cFile" type="file" accept="application/pdf,.pdf"><div class="hint">Máx. 10 MB · se calcula su huella SHA-256</div></div>
      </div>
      <div class="err hidden" id="cErr" style="margin-bottom:12px"></div>
      <button class="btn primary" id="cBtn" type="submit"><i class="fa-solid fa-check-circle"></i> Guardar y marcar en verde</button>
    </form></div>`;
  S.preselect = null;
  S.preselectOrfeo = S.preselectFecha = null;
  $('#cBus').addEventListener('input', e => {
    const q = nrmTxt(e.target.value).trim(),
      sel = $('#cSel');
    let n = 0,
      primero = null;
    [...sel.options].forEach(o => {
      const r = abiertos.find(x => String(x.id) === o.value),
        ok = !q || [r.radicado, r.ente_n, r.ente_s, r.dep_n, r.asunto].some(v => nrmTxt(v).includes(q));
      o.hidden = !ok;
      o.disabled = !ok;
      if (ok) {
        n++;
        if (!primero) primero = o;
      }
    });
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled && primero) sel.value = primero.value;
    $('#cBusN').textContent = n + ' de ' + abiertos.length + ' caso(s)';
  });
  $('#cOrfeo').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '');
    const v = e.target.value,
      er = $('#cOrfeoErr');
    let m = '';
    if (v && DEMO_or_loaded(v)) m = 'Este ORFEO ya está asociado a otro requerimiento';
    er.textContent = m;
    er.classList.toggle('hidden', !m);
  });
  $('#cargaForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const err = m => {
      const e = $('#cErr');
      e.textContent = m;
      e.classList.remove('hidden');
    };
    $('#cErr').classList.add('hidden');
    const r = S.reqs.find(x => String(x.id) === $('#cSel').value);
    const orfeo = $('#cOrfeo').value,
      fecha = $('#cFecha').value,
      file = $('#cFile').files[0];
    if (!/^[0-9]{10,20}$/.test(orfeo)) return err('El radicado ORFEO debe tener entre 10 y 20 dígitos');
    if (DEMO_or_loaded(orfeo)) return err('Este radicado ORFEO ya está asociado a otro requerimiento');
    if (!fecha) return err('Indica la fecha de envío');
    if (fecha > iso(new Date())) return err('La fecha de envío no puede ser futura');
    if (fecha < r.fecha_radicacion)
      return err(
        'La fecha de envío no puede ser anterior a la radicación (' + fmtD(r.fecha_radicacion) + ')'
      );
    if (!file) return err('Adjunta el soporte en PDF');
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name))
      return err('El soporte debe ser un archivo PDF');
    if (file.size > 10 * 1024 * 1024) return err('El PDF supera los 10 MB');
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...head) !== '%PDF-') return err('El archivo no parece ser un PDF válido');
    const btn = $('#cBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';
    try {
      const res = await db.closeReq(r, orfeo, fecha, file);
      toast(`${r.radicado} cerrado · huella ${res.hash.slice(0, 10)}…`);
      // Si el caso viene del histórico, el cumplimiento se actualiza sin recargar la página
      if (r.hist_key) {
        const h = HIST.rows.find(x => rowKey(x) === r.hist_key);
        if (h) aplicarCierre(h, fecha, orfeo);
      }
      await reload();
      go('requerimientos');
    } catch (e) {
      err(e.message);
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check-circle"></i> Guardar y marcar en verde';
    }
  });
}
const DEMO_or_loaded = v => S.reqs.some(r => r.orfeo_salida === v);

function waLink(r) {
  const msg =
    `Cordial saludo. Se informa que el requerimiento ${r.radicado} del ente ${r.ente_n}, a cargo de ${r.dep_n}, ` +
    (r.dias < 0
      ? `se encuentra vencido desde el ${fmtD(r.fecha_limite)}. `
      : `vence el ${fmtD(r.fecha_limite)} (${diasTxt(r.dias).toLowerCase()}). `) +
    `Asunto: ${r.asunto} Se solicita dar respuesta de manera prioritaria y registrar el radicado ORFEO de salida en el sistema Control de Entes.`;
  const _ct = contactsOf(r.dep_n)[0] || {},
    _tel = normPhone(_ct.telefono);
  return {
    msg,
    wa: 'https://wa.me/' + _tel + '?text=' + encodeURIComponent(msg),
    mail:
      'mailto:' +
      encodeURIComponent((S.deps.find(d => d.id === r.dependencia_id) || {}).correo || '') +
      '?subject=' +
      encodeURIComponent('Alerta de cumplimiento ' + r.radicado) +
      '&body=' +
      encodeURIComponent(msg)
  };
}
function vAlertas(c) {
  const rojos = S.reqs.filter(r => r.sem === 'rojo').sort((a, b) => a.dias - b.dias);
  const venc = rojos.filter(r => r.venc);
  if (!rojos.length) {
    c.innerHTML =
      '<div class="card"><div class="empty"><i class="fa-solid fa-champagne-glasses"></i>Sin alertas críticas en la vigencia ' +
      S.vigencia +
      '</div></div>';
    return;
  }
  const pend = rojos.filter(r => !r.escalado_at);
  c.innerHTML = `
    <div class="card" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
      <div style="flex:1;min-width:240px"><h3>${rojos.length} requerimiento(s) crítico(s)${venc.length ? ` · <span style="color:var(--redink)">${venc.length} vencido(s)</span>` : ''}</h3>
      <div class="sub" style="margin:4px 0 0">Cada envío por WhatsApp o correo abre tu aplicación con el mensaje redactado; luego registra el escalamiento para dejar trazabilidad.</div></div>
      ${canEscalate() && pend.length ? `<button class="btn danger" data-act="escalateAll"><i class="fa-solid fa-paper-plane"></i> Registrar escalamiento de ${pend.length}</button>` : ''}
    </div>
    ${rojos
      .map(r => {
        const l = waLink(r);
        return `
      <div class="alert-card${r.venc ? ' venc' : ''}">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px"><b>${esc(r.dep_n)}</b><span class="mono muted" style="font-size:.76rem">${esc(r.radicado)} · ${esc(r.ente_s || r.ente_n)}</span></div>
        <div class="muted" style="font-size:.84rem;margin-bottom:10px">${esc(r.asunto)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="pill rojo"><i></i>${r.venc ? 'VENCIDO' : 'CRÍTICO'}</span><span style="color:var(--redink);font-weight:600;font-size:.82rem">${diasTxt(r.dias)}</span>
          ${r.escalado_at ? `<span class="pill neutral">Escalado ${fmtTs(r.escalado_at)}</span>` : ''}
          <span class="spacer"></span>
          <a class="btn sm" href="${l.wa}" target="_blank" rel="noopener" data-act="log" data-id="${esc(r.id)}" data-canal="whatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
          <a class="btn sm" href="${l.mail}" data-act="log" data-id="${esc(r.id)}" data-canal="correo"><i class="fa-regular fa-envelope"></i> Correo</a>
          ${r.venc && S.cfg.correo_disciplinario ? `<a class="btn sm" href="mailto:${esc(S.cfg.correo_disciplinario)}?subject=${encodeURIComponent('Requerimiento vencido ' + r.radicado)}&body=${encodeURIComponent(l.msg)}" data-act="log" data-id="${esc(r.id)}" data-canal="disciplinario"><i class="fa-solid fa-scale-balanced"></i> Control Disciplinario</a>` : ''}
          ${canEscalate() && !r.escalado_at ? `<button class="btn sm danger" data-act="escalate" data-id="${esc(r.id)}">Registrar</button>` : ''}
        </div>
      </div>`;
      })
      .join('')}`;
}
