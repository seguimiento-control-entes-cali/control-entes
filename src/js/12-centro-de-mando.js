/**
 * src/js/12-centro-de-mando.js
 * Centro de mando del Alcalde: cifra global, mosaico de dependencias con máquina del tiempo, cinta de seguimiento, lectura del corte y cola de acción.
 * Depende de: 09 (semOf), 10 (HIST, statsOf), 11 (cruceData), 14 (notificar).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   CENTRO DE MANDO (Alcalde) — mapa de calor + máquina del tiempo + cola de acción
   ===================================================================== */
const X = { org: null };
const Q = { vigs: { 2026: true, 2025: false, 2024: false } };
const TM = {
  idx: 0,
  timer: null,
  months: [],
  tiles: [],
  ventana: [3, 6, 12].includes(+lsGet('ce_ventana')) ? +lsGet('ce_ventana') : 6
};
const ventanaTxt = () =>
  TM.ventana === 12 ? 'los últimos 12 meses' : 'los últimos ' + TM.ventana + ' meses';
function stopPlay() {
  if (TM.timer) {
    clearInterval(TM.timer);
    TM.timer = null;
  }
}
function monthsList() {
  const f = HIST.rows
    .filter(r => r.fmax && r.opo <= 2)
    .map(r => r.fmax)
    .sort();
  if (!f.length) return [];
  const minV = Math.min(...HIST.rows.map(r => r.v)),
    a = (f[0].slice(0, 7) < minV + '-01' ? minV + '-01' : f[0]).slice(0, 7),
    b = (HIST.corte || f[f.length - 1]).slice(0, 7),
    out = [];
  let [y, m] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) {
    out.push({ key: y + '-' + pad(m), end: iso(new Date(y, m, 0)), label: MESES[m - 1] + ' ' + y });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}
function windowStatsByOrg(endIso) {
  /* Ventana móvil de TM.ventana meses que termina en endIso (el inicio no se incluye) */
  const d = new Date(endIso + 'T00:00:00');
  d.setMonth(d.getMonth() - TM.ventana);
  const start = iso(d);
  const m = new Map();
  HIST.rows.forEach(r => {
    if (!r.fmax || r.opo > 2 || r.fmax <= start || r.fmax > endIso || !MAIN_NIV.includes(r.niv)) return;
    let o = m.get(r.org);
    if (!o) {
      o = { ok: 0, inc: 0 };
      m.set(r.org, o);
    }
    if (r.opo === 0) o.ok++;
    else o.inc++;
  });
  return m;
}
function vMando(c) {
  stopPlay();
  TM.months = monthsList();
  if (TM.idx <= 0 || TM.idx > TM.months.length - 1) TM.idx = Math.max(0, TM.months.length - 1);
  const all = HIST.rows.filter(r => MAIN_NIV.includes(r.niv));
  const g = statsOf(all);
  const venc = all.filter(r => r.opo === 2 && Q.vigs[r.v]).length,
    pend = all.filter(r => r.opo === 3).length;
  if (!HIST.rows.length) {
    c.innerHTML =
      '<div class="card"><div class="empty"><i class="fa-solid fa-database"></i>Aún no hay datos históricos cargados. Importa <b>historico_requerimientos.csv</b> en Supabase (ver README).</div></div>';
    return;
  }
  const tick = all
    .filter(r => r.opo === 3 && r.fmax)
    .sort((a, b) => String(a.fmax).localeCompare(String(b.fmax)))
    .slice(0, 14)
    .concat(
      all
        .filter(r => r.opo === 2 && Q.vigs[r.v])
        .sort((a, b) => (b.ret || 0) - (a.ret || 0))
        .slice(0, 10)
    );
  const tickHtml = tick
    .map(
      r =>
        `<span><b>${esc(shortOrg(r.org))}</b> ${esc(r.ente)} ${r.opo === 3 ? 'vence el ' + fmtD(r.fmax) : 'vencido, ' + (r.ret || 0) + ' días hábiles de retraso'} <em>${esc(r.rad || '')}</em></span>`
    )
    .join('');
  c.innerHTML = `
    <section class="cmd">
      <div class="cmd-line"><span class="pulso-vivo"></span>Corte ${fmtD(HIST.corte)}${S.demo ? (ES_PRIVADA ? ' · datos reales' : ' · datos de ejemplo') : ''}</div>
      <div class="cmd-fig">
        <h2 class="cmd-head" id="cmdHead"></h2>
        <p>En el histórico, el <b><span id="bigNum">0</span> %</b> de los ${nf(g.ev)} requerimientos evaluados se respondió tarde o sigue sin respuesta. La meta es bajar de ${SEMP.verde_lt * 100} %.</p>
      </div>
      <div class="states" id="states">
        <button class="st" data-act="tmFilter" data-s="rojo"><b id="kRojo">0</b><span><i class="sw-r"></i>Rojo</span></button>
        <button class="st" data-act="tmFilter" data-s="amarillo"><b id="kAma">0</b><span><i class="sw-y"></i>Amarillo</span></button>
        <button class="st" data-act="tmFilter" data-s="verde"><b id="kVer">0</b><span><i class="sw-g"></i>Verde</span></button>
        <button class="st" data-act="tmFilter" data-s="gris"><b id="kGris">0</b><span><i class="sw-n"></i>Sin muestra</span></button>
      </div>
      <div class="cmd-h"><b>Tablero de dependencias</b><span>De mayor a menor incumplimiento. Toca una tecla para ver su detalle</span></div>
      <div class="tmbar"><button class="btn sm" data-act="tmPlay" id="tmPlay"><i class="fa-solid fa-play"></i> Reproducir</button>
        <input type="range" id="tmRange" min="0" max="${Math.max(0, TM.months.length - 1)}" value="${TM.idx}" aria-label="Mes">
        <span class="tmlabel" id="tmLabel"></span>
        <div class="seg tm-vent" role="group" aria-label="Ventana de tiempo">${[3, 6, 12].map(n => `<button data-act="tmVentana" data-n="${n}" class="${TM.ventana === n ? 'on' : ''}" aria-pressed="${TM.ventana === n}">${n} meses</button>`).join('')}</div></div>
      <div class="tm" id="tm"></div>
      <div class="tm-det" id="tmDet" aria-live="polite"></div>
      <div class="cmd-legend"><span><i class="sw-r"></i>Rojo, desde ${SEMP.rojo_ge * 100} %</span><span><i class="sw-y"></i>Amarillo, de ${SEMP.verde_lt * 100} % a ${SEMP.rojo_ge * 100} %</span><span><i class="sw-g"></i>Verde, menos de ${SEMP.verde_lt * 100} %</span><span><i class="sw-n"></i>Sin muestra: menos de 3 casos evaluados</span><span class="cmd-legend-w">Ventana de ${ventanaTxt()}</span></div>
      ${tick.length ? `<div class="ticker" aria-label="Requerimientos en seguimiento"><span class="tk-lbl">En seguimiento</span><div class="tk-track">${tickHtml}${tickHtml}</div></div>` : ''}
    </section>
    <div class="trio">
      <button data-act="go" data-view="${canRole(['admin', 'alcalde', 'control_interno', 'enlace']) ? 'alertas' : 'historico'}"><b class="t-r">${nf(venc)}</b><small>sin respuesta registrada</small></button>
      <button data-act="go" data-view="historico"><b class="t-y">${nf(pend)}</b><small>por vencer en término</small></button>
      <button data-act="go" data-view="cumplimiento"><b class="t-b">${pct1(g.tasa)}</b><small>incumplimiento histórico</small></button>
    </div>
    ${pmResumenMando()}
    <div class="card brief" id="brief"></div>
    <div class="card"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
        <div style="flex:1;min-width:220px"><h3>Cola de acción</h3><div class="sub" style="margin:2px 0 0">Dependencias con requerimientos sin respuesta registrada. Notifica a cada secretario o director por WhatsApp.</div></div>
        ${canNotify() ? '<button class="btn danger" data-act="despacho"><i class="fa-solid fa-paper-plane"></i> Modo despacho</button>' : ''}
      </div>
      <div class="seg" style="margin:6px 0 12px">${[2026, 2025, 2024].map(y => `<button data-act="qVig" data-y="${y}" class="${Q.vigs[y] ? 'on' : ''}">Vigencia ${y}</button>`).join('')}</div>
      <div id="queue"></div></div>`;
  $('#tmRange').addEventListener('input', e => {
    TM.idx = +e.target.value;
    paintTreemap();
  });
  buildTreemap();
  paintTreemap();
  renderQueue();
  renderBrief();
  const end = +(g.tasa * 100).toFixed(1),
    el = $('#bigNum'),
    f1 = v => v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = f1(end);
  } else {
    const t0 = performance.now();
    const step = t => {
      if (!document.body.contains(el)) return;
      const k = Math.min(1, (t - t0) / 1100);
      el.textContent = f1(end * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}
function renderBrief() {
  const box = $('#brief');
  if (!box) return;
  const q = queueData(),
    tot = q.reduce((s, o) => s + o.venc, 0),
    top = q[0];
  const byE = {};
  HIST.rows.forEach(r => {
    if (r.opo === 2 && Q.vigs[r.v] && MAIN_NIV.includes(r.niv)) byE[r.ente] = (byE[r.ente] || 0) + 1;
  });
  const eTop = Object.entries(byE).sort((a, b) => b[1] - a[1])[0];
  const sinCel = q.filter(o => !contactsOf(o.org).some(x => ctStatus(x) === 'ok')).length;
  const p = [];
  if (top && tot)
    p.push(
      `<p><mark>${esc(shortOrg(top.org))}</mark> concentra ${nf(top.venc)} de los ${nf(tot)} requerimientos sin respuesta registrada (${pct1(top.venc / tot)}).</p>`
    );
  p.push(
    `<p><mark class="r">${TM.nRojo || 0} dependencias</mark> están en rojo en la ventana de ${ventanaTxt()}; ${q.length} tienen casos sin respuesta en las vigencias seleccionadas.</p>`
  );
  if (eTop)
    p.push(
      `<p>El ente con más requerimientos sin respuesta es <mark>${esc(eTop[0])}</mark> (${nf(eTop[1])}).</p>`
    );
  if (sinCel)
    p.push(
      `<p><mark class="r">${sinCel} dependencia(s)</mark> de la cola no tienen responsable completo en el directorio; complétalo para poder notificarlas por WhatsApp.</p>`
    );
  const cxd = cruceData(),
    cxA = cxd.casos.filter(c => (CRUCE_REV[c.clave] || {}).estado !== 'descartado'),
    cxT = cxd.conc.filter(c => c.abierto && (CRUCE_REV[c.clave] || {}).estado !== 'descartado');
  if (cxA.length || cxT.length)
    p.push(
      `<p><mark class="r">${cxA.length} caso(s)</mark> fueron requeridos por más de un ente de control con el mismo número de contrato, expediente o radicado${cxT.length ? `, y hay <mark>${cxT.length} alerta(s) de mismo tema</mark> con pendientes` : ''}.</p>`
    );
  box.innerHTML = `<div class="brief-h"><i class="fa-solid fa-chart-line"></i>Lectura del corte</div>${p.join('')}
    <div class="brief-a">${canNotify() && q.length ? '<button class="btn primary" data-act="despacho"><i class="fa-brands fa-whatsapp"></i> Notificar dependencias en cola</button>' : ''}${sinCel && canRole(['admin', 'alcalde', 'control_interno']) ? '<button class="btn" data-act="go" data-view="directorio"><i class="fa-solid fa-address-book"></i> Completar directorio</button>' : ''}${cxA.length || cxT.length ? '<button class="btn" data-act="cxTab" data-tab="exactos"><i class="fa-solid fa-code-merge"></i> Ver cruces</button>' : ''}</div>`;
}
function onResizeTm() {}
function buildTreemap() {
  const box = $('#tm');
  if (!box) return;
  const mo = TM.months[TM.idx],
    ws = mo ? windowStatsByOrg(mo.end > HIST.corte && HIST.corte ? HIST.corte : mo.end) : new Map();
  const rank = o => {
    const x = ws.get(o) || { ok: 0, inc: 0 },
      ev = x.ok + x.inc;
    return ev < 3 ? -1 : x.inc / ev;
  };
  const orgs = mainOrgsAll()
    .slice()
    .sort((a, b) => rank(b) - rank(a) || a.localeCompare(b, 'es'));
  box.innerHTML = orgs
    .map(
      (o, i) =>
        `<button class="tile gris" style="--i:${i}" data-act="tmSel" data-org="${esc(o)}" aria-pressed="false"><b>${esc(shortOrg(o))}</b><span class="tl-f"><span class="num"></span><small></small></span></button>`
    )
    .join('');
  TM.tiles = [...box.children].map((el, k) => ({ el, org: orgs[k] }));
  box.classList.add('reveal');
  setTimeout(() => box.classList.remove('reveal'), 1400);
  if (TM.filter) box.classList.add('filtering');
}
function paintTreemap() {
  const mo = TM.months[TM.idx];
  if (!mo) return;
  const endIso = mo.end > HIST.corte && HIST.corte ? HIST.corte : mo.end;
  const ws = windowStatsByOrg(endIso);
  let nr = 0,
    na = 0,
    nv = 0,
    ng = 0;
  TM.stats = new Map();
  TM.tiles.forEach(t => {
    const o = ws.get(t.org) || { ok: 0, inc: 0 },
      ev = o.ok + o.inc,
      tasa = ev ? o.inc / ev : 0;
    const sem = ev < 3 ? 'gris' : semOf(Math.max(ev, SEMP.min), tasa);
    if (sem === 'rojo') nr++;
    else if (sem === 'amarillo') na++;
    else if (sem === 'verde') nv++;
    else ng++;
    TM.stats.set(t.org, { sem, ev, inc: o.inc, tasa });
    t.el.className = 'tile ' + sem + (TM.filter === sem ? ' match' : '') + (TM.sel === t.org ? ' on' : '');
    t.el.setAttribute('aria-pressed', TM.sel === t.org ? 'true' : 'false');
    t.el.querySelector('.num').textContent = ev ? pct1(tasa) : '—';
    t.el.querySelector('small').textContent = ev ? o.inc + ' de ' + ev : 'Sin casos';
    t.el.title =
      t.org + (ev ? `: ${o.inc} de ${ev} con incumplimiento (${pct1(tasa)})` : ': sin casos en el periodo');
  });
  $('#tmLabel').textContent =
    mo.label.charAt(0).toUpperCase() + mo.label.slice(1) + ' · ventana de ' + TM.ventana + ' meses';
  $('#tmRange').value = TM.idx;
  $('#kRojo').textContent = nr;
  $('#kAma').textContent = na;
  $('#kVer').textContent = nv;
  $('#kGris').textContent = ng;
  TM.nRojo = nr;
  const head = $('#cmdHead');
  if (head)
    head.innerHTML = nr
      ? `${nr} ${nr === 1 ? 'dependencia' : 'dependencias'} en rojo<span>${na ? ` y ${na} en riesgo` : ''}</span>`
      : na
        ? `Ninguna dependencia en rojo<span> y ${na} en riesgo</span>`
        : 'Ninguna dependencia en rojo<span> ni en riesgo</span>';
  renderTmDet();
  document
    .querySelectorAll('#states .st')
    .forEach(b => b.setAttribute('aria-pressed', TM.filter === b.dataset.s));
  renderBrief();
}
function renderTmDet() {
  const box = $('#tmDet');
  if (!box) return;
  const x = TM.sel && TM.stats ? TM.stats.get(TM.sel) : null;
  if (!x) {
    box.className = 'tm-det vacio';
    box.innerHTML = 'Toca una tecla para ver el detalle de la dependencia.';
    return;
  }
  const NOM = { rojo: 'En rojo', amarillo: 'En amarillo', verde: 'En verde', gris: 'Sin muestra suficiente' };
  const ancho = Math.max(2, Math.round(x.tasa * 100));
  box.className = 'tm-det ' + x.sem;
  box.innerHTML = `<div class="tmd-h"><div><b>${esc(TM.sel)}</b><span class="tmd-e">${NOM[x.sem]}${x.ev ? `: ${x.inc} de ${x.ev} requerimientos respondidos tarde o vencidos (${pct1(x.tasa)})` : ''}</span></div>
    <button class="btn primary" data-act="openOrg" data-org="${esc(TM.sel)}"><i class="fa-solid fa-folder-open"></i> Abrir expediente</button></div>
    ${
      x.sem === 'gris'
        ? `<p class="tmd-n">${x.ev ? 'Con menos de 3 casos evaluados no se asigna color, para no dar una lectura injusta.' : 'No tuvo requerimientos evaluados en esta ventana de ' + TM.ventana + ' meses.'}</p>`
        : `<div class="tmd-trk" role="img" aria-label="Incumplimiento ${pct1(x.tasa)}"><i style="width:${ancho}%"></i></div>
    <div class="tmd-esc"><span>0 %</span><span>Cambia de color en ${SEMP.verde_lt * 100} % y ${SEMP.rojo_ge * 100} %</span><span>100 %</span></div>`
    }`;
}
function tmPlay() {
  const b = $('#tmPlay');
  if (TM.timer) {
    stopPlay();
    b.innerHTML = '<i class="fa-solid fa-play"></i> Reproducir';
    return;
  }
  if (TM.idx >= TM.months.length - 1) TM.idx = 0;
  b.innerHTML = '<i class="fa-solid fa-pause"></i> Pausar';
  TM.timer = setInterval(() => {
    if (TM.idx >= TM.months.length - 1) {
      stopPlay();
      b.innerHTML = '<i class="fa-solid fa-play"></i> Reproducir';
      return;
    }
    TM.idx++;
    paintTreemap();
  }, 650);
}
function queueData() {
  const m = new Map();
  HIST.rows.forEach(r => {
    if (!MAIN_NIV.includes(r.niv) || !Q.vigs[r.v] || (r.opo !== 2 && r.opo !== 3)) return;
    let o = m.get(r.org);
    if (!o) {
      o = { org: r.org, venc: 0, pend: 0, maxRet: 0 };
      m.set(r.org, o);
    }
    if (r.opo === 2) {
      o.venc++;
      o.maxRet = Math.max(o.maxRet, r.ret || 0);
    } else o.pend++;
  });
  return [...m.values()].sort((a, b) => b.venc - a.venc || b.pend - a.pend);
}
const lastNotif = org => NOTIF.find(n => n.org === org);
function renderQueue() {
  const q = queueData(),
    box = $('#queue');
  if (!box) return;
  if (!q.length) {
    box.innerHTML =
      '<div class="empty"><i class="fa-solid fa-champagne-glasses"></i>Ninguna dependencia tiene requerimientos sin respuesta en las vigencias seleccionadas</div>';
    return;
  }
  box.innerHTML = `<div class="tbl-wrap"><table class="tbl" style="min-width:760px"><thead><tr><th>Dependencia</th><th class="right">Sin respuesta</th><th class="right">Por vencer</th><th class="right">Mayor retraso</th><th>Responsable</th><th>Última notificación</th><th></th></tr></thead><tbody>
  ${q
    .map(o => {
      const ct = contactsOf(o.org)[0],
        ln = lastNotif(o.org);
      const ok = ct && normPhone(ct.telefono);
      return `<tr><td><b>${esc(shortOrg(o.org))}</b></td><td class="right mono" style="color:var(--redink)"><b>${o.venc}</b></td><td class="right mono" style="color:var(--yelink)">${o.pend}</td>
    <td class="right mono">${o.maxRet ? o.maxRet + ' d' : '—'}</td>
    <td>${ct && ct.nombre ? esc(ct.nombre) + `<div class="muted" style="font-size:.72rem">${ok ? fmtPhone(normPhone(ct.telefono)) : 'sin celular'}</div>` : '<span class="faint">Sin directorio</span>'}</td>
    <td class="muted" style="font-size:.78rem">${ln ? fmtTs(ln.ts) : 'Nunca'}</td>
    <td class="right" style="white-space:nowrap">${canNotify() ? `<button class="btn sm primary" data-act="notify" data-org="${esc(o.org)}"><i class="fa-brands fa-whatsapp"></i> Notificar</button> ` : ''}<button class="btn sm" data-act="openOrg" data-org="${esc(o.org)}">Expediente</button></td></tr>`;
    })
    .join('')}
  </tbody></table></div>`;
}
