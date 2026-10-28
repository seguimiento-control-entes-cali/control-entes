/**
 * src/js/13-expediente-dependencia.js
 * Expediente de una dependencia (o "Mi dependencia" para secretarios): indicadores, gráficos y pendientes.
 * Depende de: 09, 10.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   EXPEDIENTE DE DEPENDENCIA (cada secretario/director ve solo la suya)
   ===================================================================== */
function svgDonut(p, color, txt) {
  const r = 52,
    C = 2 * Math.PI * r,
    off = C * (1 - Math.max(0, Math.min(1, p)));
  return `<svg viewBox="0 0 140 140" width="150" height="150" style="font-family:Arial,sans-serif"><circle cx="70" cy="70" r="${r}" fill="none" stroke="rgba(148,170,210,.14)" stroke-width="14"/>
  <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 70 70)"/>
  <text x="70" y="68" text-anchor="middle" font-size="26" font-weight="700" fill="#F2F6FF">${txt}</text><text x="70" y="88" text-anchor="middle" font-size="10" fill="#93A4C3">a tiempo</text></svg>`;
}
function svgTrend(pts) {
  const W = 620,
    H = 190,
    L = 34,
    R = 10,
    T = 12,
    B = 26,
    n = pts.length;
  if (n < 2)
    return '<div class="muted" style="padding:20px;font-size:.82rem">Sin datos suficientes para la tendencia.</div>';
  const X0 = i => L + ((W - L - R) * i) / (n - 1),
    Y0 = v => T + (H - T - B) * (1 - Math.min(1, v));
  const y20 = Y0(SEMP.verde_lt),
    y40 = Y0(SEMP.rojo_ge);
  const line = pts
    .map((p, i) => (p.v == null ? null : `${X0(i).toFixed(1)},${Y0(p.v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const dots = pts
    .map((p, i) =>
      p.v == null
        ? ''
        : `<circle cx="${X0(i).toFixed(1)}" cy="${Y0(p.v).toFixed(1)}" r="4" fill="${semColor(semOf(Math.max(p.ev, SEMP.min), p.v))}" stroke="#0B1630" stroke-width="1.5"><title>${p.label}: ${pct1(p.v)} (${p.inc} de ${p.ev})</title></circle>`
    )
    .join('');
  const step = Math.ceil(n / 8),
    xl = pts
      .map((p, i) =>
        i % step === 0
          ? `<text x="${X0(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#93A4C3">${p.short}</text>`
          : ''
      )
      .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="font-family:Arial,sans-serif"><rect x="${L}" y="${T}" width="${W - L - R}" height="${y40 - T}" fill="rgba(255,92,112,.06)"/><rect x="${L}" y="${y20}" width="${W - L - R}" height="${H - B - y20}" fill="rgba(56,217,154,.05)"/>
  <line x1="${L}" x2="${W - R}" y1="${y40}" y2="${y40}" stroke="#FF5C70" stroke-dasharray="4 4" stroke-opacity=".55"/><line x1="${L}" x2="${W - R}" y1="${y20}" y2="${y20}" stroke="#38D99A" stroke-dasharray="4 4" stroke-opacity=".55"/>
  <text x="4" y="${y40 + 3}" font-size="9" fill="#93A4C3">40%</text><text x="4" y="${y20 + 3}" font-size="9" fill="#93A4C3">20%</text><text x="4" y="${Y0(1) + 3}" font-size="9" fill="#93A4C3">100%</text><text x="4" y="${Y0(0) + 3}" font-size="9" fill="#93A4C3">0%</text>
  <polyline points="${line}" fill="none" stroke="#4C8DFF" stroke-width="2.2" filter="drop-shadow(0 0 4px rgba(76,141,255,.7))" stroke-linejoin="round"/>${dots}${xl}</svg>`;
}
function vDependencia(c) {
  const sc = scopeOrg();
  const orgs = mainOrgsAll();
  if (!HIST.rows.length) {
    c.innerHTML =
      '<div class="card"><div class="empty"><i class="fa-solid fa-database"></i>Aún no hay datos históricos cargados.</div></div>';
    return;
  }
  let org = sc || X.org;
  if (!org || (!sc && !orgs.includes(org))) org = (queueData()[0] || {}).org || orgs[0];
  X.org = org;
  const rows = HIST.rows.filter(r => r.org === org);
  if (sc && !rows.length) {
    c.innerHTML = `<div class="card"><div class="empty"><i class="fa-solid fa-circle-info"></i>No hay requerimientos registrados para tu dependencia${sc.startsWith('\u0000') ? ' (tu cuenta aún no tiene dependencia asignada)' : ''}.</div></div>`;
    return;
  }
  const st = statsOf(rows),
    ct = contactsOf(org);
  const vigs = [...new Set(rows.map(r => r.v))].sort((a, b) => b - a);
  // tendencia mensual (últimos 24 meses con datos)
  const byM = {};
  rows.forEach(r => {
    if (!r.fmax || r.opo > 2) return;
    const k = r.fmax.slice(0, 7);
    const o = (byM[k] = byM[k] || { ev: 0, inc: 0 });
    o.ev++;
    if (r.opo > 0) o.inc++;
  });
  const keys = Object.keys(byM).sort().slice(-24);
  const pts = keys.map(k => {
    const o = byM[k],
      [y, m] = k.split('-');
    return {
      label: MESES[+m - 1] + ' ' + y,
      short: MESES[+m - 1].slice(0, 3) + ' ' + y.slice(2),
      ev: o.ev,
      inc: o.inc,
      v: o.ev >= 3 ? o.inc / o.ev : null
    };
  });
  // por ente
  const byE = {};
  rows.forEach(r => {
    if (r.opo === 1 || r.opo === 2) byE[r.ente] = (byE[r.ente] || 0) + 1;
  });
  const eList = Object.entries(byE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6),
    eMax = eList.length ? eList[0][1] : 1;
  const open = rows
    .filter(r => r.opo === 2 || r.opo === 3)
    .sort(
      (a, b) =>
        (b.opo === 2) - (a.opo === 2) ||
        (b.ret || 0) - (a.ret || 0) ||
        String(a.fmax).localeCompare(String(b.fmax))
    );
  c.innerHTML = `
    <div class="card" style="margin-bottom:14px;display:flex;gap:18px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:260px">
        ${sc ? '' : `<div class="field" style="margin-bottom:10px;max-width:420px"><label>Dependencia</label><select id="depSel">${orgs.map(o => `<option${o === org ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`}
        <h2 style="font-size:1.25rem;margin-bottom:6px">${esc(org)}</h2>
        ${ct.length ? ct.map(x => `<div class="muted" style="font-size:.84rem">${esc(x.cargo)}: <b style="color:var(--ink)">${esc(x.nombre || 'sin nombre en el directorio')}</b>${normPhone(x.telefono) ? ' · ' + fmtPhone(normPhone(x.telefono)) : ''}</div>`).join('') : '<div class="muted" style="font-size:.84rem">Sin responsable cargado en el directorio.</div>'}
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <span class="pill ${st.sem === 'muestra' ? 'neutral' : st.sem}">${st.sem === 'muestra' ? 'MUESTRA INSUFICIENTE' : '<i></i>SEMÁFORO ' + st.sem.toUpperCase()}</span>
          ${canNotify() ? `<button class="btn sm primary" data-act="notify" data-org="${esc(org)}"><i class="fa-brands fa-whatsapp"></i> Notificar por WhatsApp</button>` : ''}
          <button class="btn sm" data-act="depCsv"><i class="fa-solid fa-file-csv"></i> Descargar mi reporte</button></div>
      </div>
      <div style="text-align:center">${svgDonut(st.ev ? st.ok / st.ev : 0, semColor(st.sem), st.ev ? Math.round((st.ok * 100) / st.ev) + '%' : '—')}</div>
    </div>
    <div class="grid g-kpi" style="margin-bottom:14px">
      <div class="card kpi"><small>Evaluados</small><b>${nf(st.ev)}</b></div>
      <div class="card kpi g"><small>A tiempo</small><b>${nf(st.ok)}</b></div>
      <div class="card kpi y"><small>Respondidos tarde</small><b>${nf(st.tar)}</b></div>
      <div class="card kpi r"><small>Sin respuesta</small><b>${nf(st.sin)}</b></div>
      <div class="card kpi"><small>Retraso promedio</small><b>${st.tar ? st.ret.toFixed(1).replace('.', ',') : '0'}<span style="font-size:.9rem"> d</span></b></div>
      <div class="card kpi"><small>Tarda en responder</small><b>${st.tiemN ? st.tiem.toFixed(1).replace('.', ',') : '—'}<span style="font-size:.9rem"> d háb.</span></b></div>
    </div>
    <div class="grid g-2" style="margin-bottom:14px">
      <div class="card"><h3>Tendencia mensual de incumplimiento</h3><div class="sub">Por mes de vencimiento. Línea punteada: umbrales del semáforo (20% y 40%).</div>${svgTrend(pts)}</div>
      <div class="card"><h3>Qué ente exige más y se incumple más</h3><div class="sub">Respuestas tardías o sin respuesta, por ente de control</div>
        ${eList.length ? eList.map(([e, n]) => `<div class="list-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:5px"><b style="font-size:.82rem">${esc(e)}</b><span class="mono muted">${n}</span></div><div class="bar"><span style="width:${(n * 100) / eMax}%;background:#9ad7ff"></span></div></div>`).join('') : '<div class="empty"><i class="fa-solid fa-circle-check"></i>Sin incumplimientos</div>'}</div>
    </div>
    <div class="card"><h3>Pendientes y vencidos de esta dependencia</h3><div class="sub">Sin respuesta registrada o por vencer. Vigencias con datos: ${vigs.join(', ')}. Corte ${fmtD(HIST.corte)}.</div>
      <div class="tbl-wrap"><table class="tbl" style="min-width:760px"><thead><tr><th>Vig.</th><th>N.º radicación del ente</th><th>Ente</th><th>Asunto</th><th>Fecha máx.</th><th>Estado</th></tr></thead><tbody>
      ${
        open.length
          ? open
              .slice(0, 60)
              .map(
                r =>
                  `<tr class="click" data-act="histDetail" data-i="${r.i}"><td class="mono">${r.v}</td><td class="mono">${esc(r.rad || '—')}</td><td>${esc(r.ente)}</td><td class="asunto">${esc(shortTxt(maskPII(r.asu), 90))}</td><td>${fmtD(r.fmax)}</td><td><span class="pill ${OPO_PILL[r.opo][0]}">${OPO_PILL[r.opo][1]}</span>${r.ret ? `<div class="muted" style="font-size:.72rem;margin-top:3px">${r.ret} d hábiles</div>` : ''}</td></tr>`
              )
              .join('')
          : '<tr><td colspan="6"><div class="empty"><i class="fa-solid fa-champagne-glasses"></i>No tiene requerimientos pendientes ni vencidos</div></td></tr>'
      }
      </tbody></table></div>${open.length > 60 ? `<div class="muted" style="font-size:.76rem;margin-top:8px">Se muestran 60 de ${open.length}. El resto está en Histórico de radicados.</div>` : ''}</div>`;
  const ds = $('#depSel');
  if (ds)
    ds.addEventListener('change', e => {
      X.org = e.target.value;
      render();
    });
}
