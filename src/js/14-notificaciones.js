/**
 * src/js/14-notificaciones.js
 * Notificaciones por WhatsApp y correo institucional: plantillas de mensaje (buildMsg), envío individual, modo despacho y bitácora.
 * Depende de: 10 (DIRLIST, contactsOf, NOTIF), 01 (REMITENTE).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   NOTIFICACIONES POR WHATSAPP
   ===================================================================== */
const TPL = {
  vencidos: ['Requerimientos sin respuesta (vencidos)'],
  preventivo: ['Recordatorio preventivo (por vencer)'],
  desempeno: ['Resumen de desempeño'],
  reconocimiento: ['Reconocimiento por buen cumplimiento']
};
function buildMsg(org, tpl, vigs, ct) {
  const rows = HIST.rows.filter(r => r.org === org && vigs.includes(r.v)),
    st = statsOf(rows),
    per = vigs.slice().sort().join(', ');
  const hi = 'Cordial saludo' + (ct && ct.nombre ? ', ' + ct.nombre : '') + '.';
  const foot = '\n\nDespacho del Alcalde\nAlcaldía de Santiago de Cali';
  const corte = fmtD(HIST.corte);
  const limit = 1500;
  const pack = (head, items, fmt, tail) => {
    let lines = [],
      extra = 0;
    for (let i = 0; i < items.length; i++) {
      const l = fmt(items[i], lines.length + 1);
      const trial =
        head +
        lines.concat(l).join('\n') +
        (items.length > lines.length + 1 ? '\n(y ' + (items.length - lines.length - 1) + ' más)' : '') +
        tail +
        foot;
      if (trial.length > limit || lines.length >= 10) {
        extra = items.length - lines.length;
        break;
      }
      lines.push(l);
    }
    return (
      head +
      lines.join('\n') +
      (extra > 0 ? `\n... y ${extra} más (el detalle está disponible en el Centro de Mando).` : '') +
      tail +
      foot
    );
  };
  if (tpl === 'vencidos') {
    const it = rows.filter(r => r.opo === 2).sort((a, b) => (b.ret || 0) - (a.ret || 0));
    const head = `${hi}\n\nDesde el Despacho del Alcalde se informa que, según el Control de Requerimientos de Entes de Control (corte ${corte}; vigencia ${per}), ${org} registra ${it.length} requerimiento(s) sin respuesta registrada y con el término vencido:\n\n`;
    return pack(
      head,
      it,
      (r, n) =>
        `${n}. ${r.ente}, radicado ${r.rad || 'sin número'}. Venció el ${fmtD(r.fmax)}${r.ret != null ? ' (' + r.ret + ' días hábiles de retraso)' : ''}.`,
      '\n\nEl detalle de cada radicado puede consultarse en el Control de Requerimientos. Se solicita dar respuesta de manera prioritaria, radicarla en ORFEO y reportar el número de radicado de salida al Despacho. Si el requerimiento ya fue respondido, favor informar el número de ORFEO para actualizar el registro.'
    );
  }
  if (tpl === 'preventivo') {
    const it = rows.filter(r => r.opo === 3).sort((a, b) => String(a.fmax).localeCompare(String(b.fmax)));
    const head = `${hi}\n\nDesde el Despacho del Alcalde se recuerda que ${org} tiene ${it.length} requerimiento(s) de entes de control próximos a vencer:\n\n`;
    return pack(
      head,
      it,
      (r, n) => `${n}. ${r.ente}, radicado ${r.rad || 'sin número'}. Vence el ${fmtD(r.fmax)}.`,
      '\n\nSe agradece dar respuesta dentro del término y registrar el radicado ORFEO de salida.'
    );
  }
  if (tpl === 'reconocimiento') {
    return `${hi}\n\nDesde el Despacho del Alcalde se reconoce el compromiso de ${org} con la atención oportuna de los entes de control. En el periodo evaluado (vigencia ${per}; corte ${corte}) la dependencia respondió dentro del término ${st.ok} de ${st.ev} requerimientos (${st.ev ? Math.round((st.ok * 100) / st.ev) : 0}%).\n\nAgradecemos mantener este nivel de cumplimiento.${foot}`;
  }
  return `${hi}\n\nDesde el Despacho del Alcalde se comparte el resumen de cumplimiento de ${org} frente a los entes de control (vigencia ${per}; corte ${corte}):\n\n- Requerimientos evaluados: ${st.ev}\n- Respondidos dentro del término: ${st.ok}\n- Respondidos fuera del término: ${st.tar}${st.tar ? ' (retraso promedio de ' + st.ret.toFixed(1).replace('.', ',') + ' días hábiles)' : ''}\n- Sin respuesta registrada: ${st.sin}\n- Porcentaje de incumplimiento: ${pct1(st.tasa)}\n\nSe solicita revisar los pendientes y priorizar su respuesta.${foot}`;
}
const NM = { tpl: 'vencidos', vigs: { 2026: true, 2025: true, 2024: false }, org: null, ci: 0 };
function notifyModal(org) {
  NM.org = org;
  const st0 = statsOf(HIST.rows.filter(r => r.org === org && Q.vigs[r.v]));
  NM.tpl =
    st0.sin > 0
      ? 'vencidos'
      : st0.pend > 0
        ? 'preventivo'
        : st0.tasa < SEMP.verde_lt && st0.ev >= SEMP.min
          ? 'reconocimiento'
          : 'desempeno';
  NM.vigs = { ...Q.vigs };
  NM.ci = 0;
  const ct = contactsOf(org);
  openModal({
    title: 'Notificar a ' + shortOrg(org),
    wide: true,
    body: `
    <div class="row2">
      <div class="field"><label>Destinatario</label><select id="nCt">${ct.length ? ct.map((x, i) => `<option value="${i}">${esc(x.cargo)}${x.nombre ? ' - ' + esc(x.nombre) : ''}</option>`).join('') : '<option value="-1">Sin responsable en el directorio</option>'}</select></div>
      <div class="field"><label>Mensaje</label><select id="nTpl">${Object.entries(TPL)
        .map(([k, v]) => `<option value="${k}"${k === NM.tpl ? ' selected' : ''}>${v[0]}</option>`)
        .join('')}</select></div>
    </div>
    <div class="row2">
      <div class="field"><label>Celular (WhatsApp)</label><input id="nTel" class="mono" placeholder="3001234567" inputmode="tel"><div class="hint" id="nTelHint"></div></div>
      <div class="field"><label>Correo institucional del destinatario</label><input id="nMail" class="mono" placeholder="nombre.apellido@cali.gov.co" inputmode="email"><div class="hint" id="nMailHint"></div></div>
    </div>
    <div class="row2">
      <div class="field"><label>Asunto del correo</label><input id="nSubj"></div>
      <div class="field"><label>Vigencias a incluir</label><div class="seg" id="nVigs">${[2026, 2025, 2024].map(y => `<button type="button" data-y="${y}" class="${NM.vigs[y] ? 'on' : ''}">${y}</button>`).join('')}</div></div>
    </div>
    <div class="field"><label>Vista previa (editable)</label><textarea id="nMsg" style="min-height:230px;font-size:.84rem"></textarea><div class="hint" id="nCount"></div></div>`,
    footer: `<button class="btn" data-act="closeModal">Cancelar</button><button class="btn" data-act="copyMsg"><i class="fa-regular fa-copy"></i> Copiar</button><button class="btn" data-act="sendWa"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button><button class="btn primary" data-act="sendMail"><i class="fa-solid fa-envelope"></i> Enviar por correo</button>`
  });
  const refresh = regen => {
    const cts = contactsOf(org),
      c0 = cts[+$('#nCt').value] || null;
    const vigs = Object.keys(NM.vigs)
      .filter(y => NM.vigs[y])
      .map(Number);
    if (regen) $('#nMsg').value = buildMsg(org, $('#nTpl').value, vigs.length ? vigs : [2026], c0);
    $('#nCount').textContent = $('#nMsg').value.length + ' caracteres';
  };
  const loadTel = () => {
    const cts = contactsOf(org),
      c0 = cts[+$('#nCt').value];
    $('#nTel').value = c0 ? fmtPhone(normPhone(c0.telefono)).replace('+57 ', '') : '';
    $('#nMail').value = c0 ? c0.correo || '' : '';
    telHint();
    mailHint();
  };
  const mailHint = () => {
    const ok = normMail($('#nMail').value);
    $('#nMailHint').textContent = ok
      ? 'Se enviará desde ' + REMITENTE + ' a ' + ok
      : 'Ingresa el correo institucional (@cali.gov.co)';
    $('#nMailHint').className = 'hint' + (ok ? '' : ' err');
  };
  const subj = () => {
    const t = $('#nTpl').value;
    $('#nSubj').value =
      ({
        vencidos: 'Requerimientos de entes de control vencidos',
        preventivo: 'Recordatorio: requerimientos de entes de control por vencer',
        reconocimiento: 'Reconocimiento: cumplimiento frente a los entes de control',
        desempeno: 'Desempeño frente a los entes de control'
      }[t] || 'Requerimientos de entes de control') +
      ' · ' +
      shortOrg(org);
  };
  $('#nMail').addEventListener('input', mailHint);
  const telHint = () => {
    const ok = normPhone($('#nTel').value);
    $('#nTelHint').textContent = ok
      ? 'Se enviará a ' + fmtPhone(ok)
      : 'Ingresa un celular colombiano de 10 dígitos';
    $('#nTelHint').className = 'hint' + (ok ? '' : ' err');
  };
  $('#nCt').addEventListener('change', () => {
    loadTel();
    refresh(true);
  });
  $('#nTpl').addEventListener('change', () => {
    refresh(true);
    subj();
  });
  $('#nTel').addEventListener('input', telHint);
  $('#nMsg').addEventListener('input', () => refresh(false));
  $('#nVigs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    NM.vigs[b.dataset.y] = !NM.vigs[b.dataset.y];
    b.classList.toggle('on');
    refresh(true);
  });
  loadTel();
  refresh(true);
  subj();
}
async function sendWa() {
  const org = NM.org,
    tel = normPhone($('#nTel').value),
    msg = $('#nMsg').value.trim();
  if (!tel) {
    toast('Ingresa un celular válido para abrir WhatsApp', 'err');
    return;
  }
  if (!msg) {
    toast('El mensaje está vacío', 'err');
    return;
  }
  const cts = contactsOf(org),
    c0 = cts[+$('#nCt').value];
  if (c0 && normPhone(c0.telefono) !== tel) {
    c0.telefono = tel;
    try {
      await saveDirRow(c0);
    } catch (e) {
      toast(e.message, 'err');
    }
  } else if (!c0) {
    const nx = { organismo: org, cargo: defaultCargo(org), nombre: '', telefono: tel };
    DIRLIST.push(nx);
    try {
      await saveDirRow(nx);
    } catch (e) {
      toast(e.message, 'err');
    }
  }
  window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  const tplv = $('#nTpl').value;
  const nItems = HIST.rows.filter(
    r =>
      r.org === org &&
      NM.vigs[r.v] &&
      (tplv === 'preventivo' ? r.opo === 3 : tplv === 'vencidos' ? r.opo === 2 : r.opo === 2 || r.opo === 3)
  ).length;
  await logNotif({
    ts: new Date().toISOString(),
    org,
    nombre: c0 ? c0.nombre : '',
    tel,
    tpl: tplv,
    n: nItems,
    usuario: S.user.email,
    mensaje: msg
  });
  closeModal();
  toast('Notificación preparada en WhatsApp para ' + shortOrg(org) + ' y registrada');
  if (S.view === 'mando') renderQueue();
  else if (S.view === 'notificaciones') render();
}
async function sendMail() {
  const org = NM.org,
    to = normMail($('#nMail').value),
    msg = $('#nMsg').value.trim(),
    su = $('#nSubj').value.trim() || 'Requerimientos de entes de control · ' + shortOrg(org);
  if (!to) {
    toast('Ingresa el correo institucional (@cali.gov.co) del destinatario', 'err');
    return;
  }
  if (!msg) {
    toast('El mensaje está vacío', 'err');
    return;
  }
  const cts = contactsOf(org),
    c0 = cts[+$('#nCt').value];
  if (c0 && (c0.correo || '') !== to) {
    c0.correo = to;
    try {
      await saveDirRow(c0);
    } catch (e) {
      toast(e.message, 'err');
      return;
    }
  }
  const url =
    'https://mail.google.com/mail/?authuser=' +
    encodeURIComponent(REMITENTE) +
    '&view=cm&fs=1&tf=1&to=' +
    encodeURIComponent(to) +
    '&su=' +
    encodeURIComponent(su) +
    '&body=' +
    encodeURIComponent(msg);
  window.open(url, '_blank', 'noopener');
  const tplv = $('#nTpl').value;
  const nItems = HIST.rows.filter(
    r =>
      r.org === org &&
      NM.vigs[r.v] &&
      (tplv === 'preventivo' ? r.opo === 3 : tplv === 'vencidos' ? r.opo === 2 : r.opo === 2 || r.opo === 3)
  ).length;
  await logNotif({
    ts: new Date().toISOString(),
    org,
    nombre: c0 ? c0.nombre : '',
    tel: '',
    correo: to,
    canal: 'correo',
    tpl: tplv,
    n: nItems,
    usuario: S.user.email,
    mensaje: msg
  });
  closeModal();
  toast('Correo listo en ' + REMITENTE + ' para ' + shortOrg(org) + '. Revisa y pulsa Enviar en Gmail.');
  if (S.view === 'mando') renderQueue();
  else if (S.view === 'notificaciones') render();
}
function despachoModal() {
  const q = queueData(),
    today = iso(new Date());
  openModal({
    title: 'Modo despacho',
    wide: true,
    body: `<div class="muted" style="font-size:.82rem;margin-bottom:12px">Notifica de a una dependencia: cada botón abre el mensaje listo para enviar por correo institucional o por WhatsApp. Las ya notificadas hoy aparecen marcadas.</div>
    ${
      q.length
        ? q
            .map(o => {
              const ct = contactsOf(o.org)[0],
                ok = ct && normPhone(ct.telefono),
                done = NOTIF.some(n => n.org === o.org && String(n.ts).slice(0, 10) === today);
              return `<div class="list-row"><div class="grow"><b>${esc(shortOrg(o.org))}</b><small>${o.venc} sin respuesta · ${o.pend} por vencer · ${ct && ct.nombre ? esc(ct.nombre) : 'sin responsable'}${ok ? '' : ' · sin celular'}${ct && ct.correo ? '' : ' · sin correo'}</small></div>
      ${done ? '<span class="pill verde"><i></i>NOTIFICADA HOY</span>' : ''}<button class="btn sm ${done ? '' : 'primary'}" data-act="notify" data-org="${esc(o.org)}">${done ? 'Reenviar' : 'Preparar'}</button></div>`;
            })
            .join('')
        : '<div class="empty"><i class="fa-solid fa-champagne-glasses"></i>No hay dependencias con pendientes</div>'
    }`,
    footer: '<button class="btn" data-act="closeModal">Cerrar</button>'
  });
}
function vNotificaciones(c) {
  const orgs = mainOrgsAll(),
    withPhone = orgs.filter(o => contactsOf(o).some(x => normPhone(x.telefono))).length;
  c.innerHTML = `
    <div class="toolbar"><span class="muted">${NOTIF.length} notificación(es) registrada(s) · directorio con celular en ${withPhone} de ${orgs.length} dependencias</span><span class="spacer"></span>
      <button class="btn no-print" data-act="notifCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button>
      ${canNotify() ? '<button class="btn danger" data-act="despacho"><i class="fa-solid fa-paper-plane"></i> Modo despacho</button>' : ''}</div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Dependencia</th><th>Destinatario</th><th>Mensaje</th><th class="right">Casos</th><th>Enviado por</th></tr></thead><tbody>
    ${NOTIF.length ? NOTIF.map(n => `<tr><td style="white-space:nowrap">${fmtTs(n.ts)}</td><td>${esc(shortOrg(n.org))}</td><td>${esc(n.nombre || '—')}<div class="muted mono" style="font-size:.72rem">${n.canal === 'correo' ? '<i class="fa-solid fa-envelope"></i> ' + esc(n.correo || '') : '<i class="fa-brands fa-whatsapp"></i> ' + fmtPhone(n.tel)}</div></td><td>${esc((TPL[n.tpl] || [n.tpl])[0])}</td><td class="right mono">${n.n}</td><td class="muted" style="font-size:.78rem">${esc(n.usuario || '—')}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty"><i class="fa-solid fa-inbox"></i>Aún no se ha enviado ninguna notificación</div></td></tr>'}
    </tbody></table></div>`;
}
