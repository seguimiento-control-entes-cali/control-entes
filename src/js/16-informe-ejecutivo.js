/**
 * src/js/16-informe-ejecutivo.js
 * Informe ejecutivo descargable en PDF: modelo de datos del informe, narrativa, gráficos SVG y registro con huella SHA-256.
 * Depende de: 09, 10, 02 (sha256Hex).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   INFORME EJECUTIVO (PDF descargable desde la aplicación)
   ===================================================================== */
const RP = { vig: 'todas', org: '', casos: true };
const PAL = {
  ok: '#4FB57C',
  tar: '#F2B230',
  sin: '#E0566B',
  ink: '#13203A',
  soft: '#55627A',
  line: '#DDE3EC',
  brand: '#0B3D91',
  blue: '#2F66C9'
};
const semBg = s => ({ rojo: '#f9d3d9', amarillo: '#fdecbd', verde: '#d3eedd', muestra: '#e6e9ec' })[s];
const semTxt = s => (s === 'muestra' ? 'MUESTRA INSUFICIENTE' : s.toUpperCase());
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function reportModel() {
  const sc = scopeOrg(),
    org = sc || RP.org || '';
  const rows = hrows().filter(
    r => (RP.vig === 'todas' || r.v === +RP.vig) && MAIN_NIV.includes(r.niv) && (!org || r.org === org)
  );
  const st = statsOf(rows);
  const by = new Map();
  rows.forEach(r => {
    let a = by.get(r.org);
    if (!a) {
      a = [];
      by.set(r.org, a);
    }
    a.push(r);
  });
  const orgs = [...by.entries()]
    .map(([name, l]) => ({ name, ...statsOf(l) }))
    .filter(o => o.ev > 0)
    .sort((a, b) => b.inc - a.inc || b.tasa - a.tasa);
  const ente = {};
  rows
    .filter(r => r.opo === 1 || r.opo === 2)
    .forEach(r => {
      ente[r.ente] = (ente[r.ente] || 0) + 1;
    });
  const entes = Object.entries(ente)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const byM = {};
  rows.forEach(r => {
    if (!r.fmax || r.opo > 2) return;
    const k = r.fmax.slice(0, 7);
    const o = (byM[k] = byM[k] || { ev: 0, inc: 0 });
    o.ev++;
    if (r.opo > 0) o.inc++;
  });
  const pts = Object.keys(byM)
    .sort()
    .slice(-24)
    .map(k => {
      const o = byM[k],
        [y, m] = k.split('-');
      return {
        label: cap(MESES[+m - 1]) + ' ' + y,
        short: MESES[+m - 1].slice(0, 3) + ' ' + y.slice(2),
        ev: o.ev,
        inc: o.inc,
        v: o.ev >= 3 ? o.inc / o.ev : null
      };
    });
  const corte = HIST.corte,
    cd = new Date(corte + 'T00:00:00'),
    d1 = iso(new Date(cd.getTime() - 90 * 864e5)),
    d2 = iso(new Date(cd.getTime() - 180 * 864e5));
  const win = (a, b) => {
    let ok = 0,
      inc = 0;
    rows.forEach(r => {
      if (!r.fmax || r.opo > 2 || r.fmax <= a || r.fmax > b) return;
      if (r.opo === 0) ok++;
      else inc++;
    });
    return { ev: ok + inc, inc, t: ok + inc ? inc / (ok + inc) : null };
  };
  const q1 = win(d1, corte),
    q0 = win(d2, d1);
  const critical = rows
    .filter(r => r.opo === 2)
    .sort((a, b) => (b.ret || 0) - (a.ret || 0))
    .slice(0, 15);
  const semCount = { rojo: 0, amarillo: 0, verde: 0, muestra: 0 };
  orgs.forEach(o => semCount[o.sem]++);
  const nots = NOTIF.filter(n => !org || n.org === org).slice(0, 8);
  return {
    org,
    rows,
    st,
    orgs,
    entes,
    pts,
    q1,
    q0,
    critical,
    semCount,
    nots,
    pend: rows.filter(r => r.opo === 3).length,
    corte
  };
}
function narrative(m) {
  const s = m.st,
    out = [],
    per = RP.vig === 'todas' ? 'las vigencias 2024, 2025 y 2026' : 'la vigencia ' + RP.vig,
    who = m.org || 'las dependencias del Distrito';
  out.push(
    `En ${per} se evaluaron ${nf(s.ev)} requerimientos de entes de control atendidos por ${who}. De ellos, ${nf(s.ok)} (${pct1(s.ev ? s.ok / s.ev : 0)}) se respondieron dentro del término, ${nf(s.tar)} (${pct1(s.ev ? s.tar / s.ev : 0)}) fuera del término y ${nf(s.sin)} (${pct1(s.ev ? s.sin / s.ev : 0)}) permanecen sin respuesta registrada y con el término vencido. La tasa de incumplimiento es ${pct1(s.tasa)}, que corresponde a semáforo ${semTxt(s.sem).toLowerCase()}.`
  );
  if (!m.org && m.orgs.length) {
    const t3 = m.orgs
      .slice(0, 3)
      .map(o => `${o.name} (${o.inc} incumplimientos, ${pct1(o.tasa)})`)
      .join('; ');
    out.push(
      `Las dependencias con mayor número de incumplimientos son: ${t3}. Hay ${m.semCount.rojo} dependencia(s) en semáforo rojo, ${m.semCount.amarillo} en amarillo y ${m.semCount.verde} en verde.`
    );
  }
  if (m.q1.t != null && m.q0.t != null) {
    const d = (m.q1.t - m.q0.t) * 100,
      w = Math.abs(d).toFixed(1).replace('.', ',');
    out.push(
      `En los últimos tres meses la tasa de incumplimiento fue ${pct1(m.q1.t)} frente a ${pct1(m.q0.t)} del trimestre anterior: ${Math.abs(d) < 0.5 ? 'se mantiene estable' : d < 0 ? 'mejora en ' + w + ' puntos porcentuales' : 'empeora en ' + w + ' puntos porcentuales'}.`
    );
  }
  if (m.entes.length)
    out.push(
      `El ente de control con más requerimientos incumplidos es ${m.entes[0][0]} (${m.entes[0][1]} casos).`
    );
  if (s.sin || m.pend)
    out.push(
      `Hay ${nf(s.sin)} requerimiento(s) sin respuesta registrada y ${nf(m.pend)} por vencer. Se recomienda priorizar su atención y notificar a los responsables.`
    );
  return out;
}
/* ---- gráficos SVG (fondo claro, paleta pastel, Arial) ---- */
function chBarsStack(list) {
  if (!list.length) return '';
  const W = 700,
    LBL = 235,
    BAR = 330,
    RH = 26,
    H = list.length * RH + 8,
    mx = Math.max(...list.map(o => o.ev), 1);
  const rows = list
    .map((o, i) => {
      const y = 4 + i * RH,
        k = BAR / mx,
        a = o.ok * k,
        b = o.tar * k,
        c = o.sin * k;
      return `<g><text x="${LBL - 8}" y="${y + 16}" text-anchor="end" font-size="10.5" fill="${PAL.ink}">${esc(shortOrg(o.name).slice(0, 38))}</text>
    <rect x="${LBL}" y="${y + 4}" width="${a.toFixed(1)}" height="15" fill="${PAL.ok}"/><rect x="${(LBL + a).toFixed(1)}" y="${y + 4}" width="${b.toFixed(1)}" height="15" fill="${PAL.tar}"/><rect x="${(LBL + a + b).toFixed(1)}" y="${y + 4}" width="${c.toFixed(1)}" height="15" fill="${PAL.sin}"/>
    <circle cx="${LBL + BAR + 24}" cy="${y + 11.5}" r="5" fill="${semColor(o.sem)}" stroke="#9aa5ab" stroke-width=".6"/>
    <text x="${LBL + BAR + 36}" y="${y + 15}" font-size="10.5" fill="${PAL.ink}">${o.inc} · ${pct1(o.tasa)}</text></g>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="font-family:Arial,Helvetica,sans-serif">${rows}</svg>`;
}
function chDonut(parts, center, sub) {
  const r = 54,
    C = 2 * Math.PI * r,
    tot = parts.reduce((s, p) => s + p.v, 0) || 1;
  let acc = 0;
  const arcs = parts
    .filter(p => p.v > 0)
    .map(p => {
      const len = (C * p.v) / tot,
        el = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${p.color}" stroke-width="20" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 70 70)"/>`;
      acc += len;
      return el;
    })
    .join('');
  return `<svg viewBox="0 0 140 140" width="150" height="150" style="font-family:Arial,Helvetica,sans-serif"><circle cx="70" cy="70" r="${r}" fill="none" stroke="#eef2f4" stroke-width="20"/>${arcs}
    <text x="70" y="69" text-anchor="middle" font-size="22" font-weight="700" fill="${PAL.ink}">${center}</text><text x="70" y="85" text-anchor="middle" font-size="9" fill="${PAL.soft}">${sub}</text></svg>`;
}
function chTrend(pts) {
  const W = 700,
    H = 200,
    L = 36,
    R = 12,
    T = 14,
    B = 28,
    n = pts.length;
  if (n < 2) return '<div style="color:#5c6b73;padding:14px">Sin datos suficientes para la tendencia.</div>';
  const xs = i => L + ((W - L - R) * i) / (n - 1),
    ys = v => T + (H - T - B) * (1 - Math.min(1, v)),
    y20 = ys(SEMP.verde_lt),
    y40 = ys(SEMP.rojo_ge);
  const line = pts
    .map((p, i) => (p.v == null ? null : `${xs(i).toFixed(1)},${ys(p.v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const dots = pts
    .map((p, i) =>
      p.v == null
        ? ''
        : `<circle cx="${xs(i).toFixed(1)}" cy="${ys(p.v).toFixed(1)}" r="4.2" fill="${semColor(semOf(Math.max(p.ev, SEMP.min), p.v))}" stroke="#fff" stroke-width="1.4"/>`
    )
    .join('');
  const step = Math.ceil(n / 9),
    xl = pts
      .map((p, i) =>
        i % step === 0
          ? `<text x="${xs(i).toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="9" fill="${PAL.soft}">${p.short}</text>`
          : ''
      )
      .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="font-family:Arial,Helvetica,sans-serif"><rect x="${L}" y="${T}" width="${W - L - R}" height="${y40 - T}" fill="#fdeef0"/><rect x="${L}" y="${y20}" width="${W - L - R}" height="${H - B - y20}" fill="#eef8f1"/>
  <line x1="${L}" x2="${W - R}" y1="${y40}" y2="${y40}" stroke="#D21F3C" stroke-dasharray="4 4"/><line x1="${L}" x2="${W - R}" y1="${y20}" y2="${y20}" stroke="#138A44" stroke-dasharray="4 4"/>
  <text x="3" y="${y40 + 3}" font-size="9" fill="${PAL.soft}">40%</text><text x="3" y="${y20 + 3}" font-size="9" fill="${PAL.soft}">20%</text><text x="3" y="${ys(1) + 3}" font-size="9" fill="${PAL.soft}">100%</text><text x="3" y="${ys(0) + 3}" font-size="9" fill="${PAL.soft}">0%</text>
  <polyline points="${line}" fill="none" stroke="#0B3D91" stroke-width="2.2" stroke-linejoin="round"/>${dots}${xl}</svg>`;
}
function chBarsH(list) {
  if (!list.length) return '<div style="color:#5c6b73">Sin incumplimientos.</div>';
  const mx = list[0][1];
  return list
    .map(
      ([e, n]) =>
        `<div style="margin:0 0 7px"><div style="display:flex;justify-content:space-between;font-size:11px"><span>${esc(e)}</span><b>${n}</b></div><div style="height:9px;background:#eef2f4;border-radius:5px"><div style="height:9px;width:${(n * 100) / mx}%;background:${PAL.blue};border-radius:5px"></div></div></div>`
    )
    .join('');
}
function reportHtml(m, huella, gen) {
  const s = m.st,
    who = m.org || 'Todas las dependencias',
    per = RP.vig === 'todas' ? '2024 - 2026' : RP.vig;
  const kpi = (l, v, c) => `<div class="rk"><span>${l}</span><b style="color:${c || PAL.ink}">${v}</b></div>`;
  const leg = (c, t) =>
    `<span style="margin-right:12px"><i style="display:inline-block;width:10px;height:10px;background:${c};border-radius:2px;margin-right:5px"></i>${t}</span>`;
  const shield = ($('.brand .shield img') || {}).src || '';
  return `
  ${ES_DEMO_PUBLICA ? '<div style="background:#fdecbd;border:1px solid #e9c46a;border-radius:6px;padding:6px 10px;margin-bottom:10px;font-size:10.5px;color:#7a5210"><b>DATOS DE EJEMPLO</b>: este informe es una demostración y sus cifras no corresponden a la realidad.</div>' : ''}
  <div class="rsec rhead"><img src="${shield}" alt="" style="height:64px"><div style="flex:1"><div class="rsmall">ALCALDÍA DE SANTIAGO DE CALI · DESPACHO DEL ALCALDE</div>
    <h1>Informe ejecutivo de cumplimiento frente a los entes de control</h1>
    <div class="rsmall">${esc(who)} · Vigencia ${per} · Corte de datos ${fmtD(m.corte)}</div></div></div>
  <div class="rsec"><h2>1. Resumen ejecutivo</h2>
    <div class="rgrid">${kpi('Evaluados', nf(s.ev))}${kpi('A tiempo', nf(s.ok), '#2e7d4f')}${kpi('Respondidos tarde', nf(s.tar), '#b07d0a')}${kpi('Sin respuesta', nf(s.sin), '#b83a4b')}${kpi('Incumplimiento', pct1(s.tasa), s.sem === 'rojo' ? '#b83a4b' : s.sem === 'amarillo' ? '#b07d0a' : '#2e7d4f')}</div>
    ${narrative(m)
      .map(p => `<p>${esc(p)}</p>`)
      .join('')}</div>
  <div class="rsec"><h2>2. Oportunidad de respuesta${m.org ? '' : ' y semáforo de dependencias'}</h2>
    <div style="display:flex;gap:26px;align-items:center;flex-wrap:wrap">
      <div style="text-align:center">${chDonut(
        [
          { v: s.ok, color: PAL.ok },
          { v: s.tar, color: PAL.tar },
          { v: s.sin, color: PAL.sin }
        ],
        s.ev ? Math.round((s.ok * 100) / s.ev) + '%' : '—',
        'a tiempo'
      )}<div class="rsmall">Oportunidad</div></div>
      ${
        m.org
          ? ''
          : `<div style="text-align:center">${chDonut(
              [
                { v: m.semCount.verde, color: '#4FB57C' },
                { v: m.semCount.amarillo, color: '#F2B230' },
                { v: m.semCount.rojo, color: '#E0566B' },
                { v: m.semCount.muestra, color: '#d5dade' }
              ],
              String(m.orgs.length),
              'dependencias'
            )}<div class="rsmall">Semáforo</div></div>`
      }
      <div style="flex:1;min-width:220px">${leg(PAL.ok, 'A tiempo')}${leg(PAL.tar, 'Tarde')}${leg(PAL.sin, 'Sin respuesta vencida')}
        <div style="margin-top:8px" class="rsmall">Semáforo: verde si el incumplimiento es menor a ${SEMP.verde_lt * 100}%, rojo desde ${SEMP.rojo_ge * 100}%, amarillo entre ambos. Se califica con mínimo ${SEMP.min} casos evaluados.</div>
        ${!m.org ? `<div style="margin-top:8px">${leg('#E0566B', 'Rojo: ' + m.semCount.rojo)}${leg('#F2B230', 'Amarillo: ' + m.semCount.amarillo)}${leg('#4FB57C', 'Verde: ' + m.semCount.verde)}</div>` : ''}</div></div></div>
  <div class="rsec"><h2>3. Tendencia mensual de incumplimiento</h2><div class="rsmall">Por mes de vencimiento del requerimiento. Líneas punteadas: umbrales del semáforo.</div>${chTrend(m.pts)}</div>
  ${
    m.org
      ? ''
      : `<div class="rsec"><h2>4. Cumplimiento por dependencia</h2><div class="rsmall" style="margin-bottom:6px">Ordenado de mayor a menor número de incumplimientos. A la derecha: incumplimientos · porcentaje.</div>${chBarsStack(m.orgs.slice(0, 18))}</div>
  <div class="rsec rflow"><h3 style="margin-top:0">Detalle por dependencia</h3><table class="rt"><thead><tr><th>#</th><th>Dependencia</th><th>Evaluados</th><th>A tiempo</th><th>Tarde</th><th>Sin resp.</th><th>Incumpl.</th><th>%</th><th>Semáforo</th></tr></thead><tbody>
    ${m.orgs.map((o, i) => `<tr><td>${i + 1}</td><td>${esc(o.name)}</td><td>${o.ev}</td><td>${o.ok}</td><td>${o.tar}</td><td>${o.sin}</td><td><b>${o.inc}</b></td><td>${pct1(o.tasa)}</td><td style="background:${semBg(o.sem)};font-weight:700;text-align:center">${semTxt(o.sem)}</td></tr>`).join('')}</tbody></table></div>`
  }
  <div class="rsec"><h2>${m.org ? '4' : '5'}. Entes de control con más incumplimientos</h2>${chBarsH(m.entes)}</div>
  ${
    RP.casos
      ? `<div class="rsec"><h2>${m.org ? '5' : '6'}. Casos críticos: mayor retraso sin respuesta registrada</h2><div class="rsmall" style="margin-bottom:6px">Se omite el asunto para proteger datos personales. Los casos de vigencias anteriores pueden haberse respondido sin actualizar el registro: confirmar con la dependencia.</div>
    <table class="rt"><thead><tr><th>Dependencia</th><th>Ente de control</th><th>Radicado del ente</th><th>Vig.</th><th>Fecha máx.</th><th>Retraso (días háb.)</th></tr></thead><tbody>
    ${m.critical.length ? m.critical.map(r => `<tr><td>${esc(shortOrg(r.org))}</td><td>${esc(r.ente)}</td><td>${esc(r.rad || 'sin número')}</td><td>${r.v}</td><td>${fmtD(r.fmax)}</td><td style="text-align:right">${r.ret == null ? '—' : r.ret}</td></tr>`).join('') : '<tr><td colspan="6">No hay requerimientos sin respuesta registrada.</td></tr>'}</tbody></table></div>`
      : ''
  }
  ${pmSeccionInforme(m.org, (m.org ? 5 : 6) + (RP.casos ? 1 : 0))}
  ${m.nots.length ? `<div class="rsec"><h2>Notificaciones enviadas</h2><table class="rt"><thead><tr><th>Fecha</th><th>Dependencia</th><th>Destinatario</th><th>Mensaje</th></tr></thead><tbody>${m.nots.map(n => `<tr><td>${fmtTs(n.ts)}</td><td>${esc(shortOrg(n.org))}</td><td>${esc(n.nombre || '—')}</td><td>${esc((TPL[n.tpl] || [n.tpl])[0])}</td></tr>`).join('')}</tbody></table></div>` : ''}
  <div class="rsec"><h2>Metodología y notas</h2><ul class="rsmall" style="margin:0;padding-left:16px;line-height:1.55">
    <li>Fuente: Control de Requerimientos de Entes de Control (Excel consolidados 2024-2026). Corte de datos: ${fmtD(m.corte)}.</li>
    <li>Respuesta tardía: la fecha de respuesta es posterior a la fecha máxima del requerimiento. Los retrasos se miden en días hábiles (festivos de Colombia).</li>
    <li>Sin respuesta vencida: no hay fecha ni radicado ORFEO de respuesta y la fecha máxima es anterior al corte.</li>
    <li>Incumplimiento = respuestas tardías + sin respuesta vencidas, sobre el total evaluado (a tiempo + tardías + sin respuesta vencidas).</li>
    <li>Si un ente concedió prórroga y no se actualizó la fecha máxima en el Excel de origen, la respuesta aparece como tardía.</li></ul></div>
  <div class="rsec rfoot">Generado el ${gen.fecha} por ${esc(gen.usuario)}. Registros considerados: ${nf(m.rows.length)}.<br>Huella de verificación SHA-256 de los datos: <span style="font-family:'Courier New',monospace;font-size:9.5px;word-break:break-all">${huella}</span></div>`;
}
async function vInforme(c) {
  if (!HIST.rows.length) {
    c.innerHTML =
      '<div class="card"><div class="empty"><i class="fa-solid fa-database"></i>Aún no hay datos históricos cargados.</div></div>';
    return;
  }
  const sc = scopeOrg(),
    m = reportModel();
  const huella = await sha256Hex(
    m.rows.map(r => [r.v, r.rad || '', r.org, r.opo, r.fmax || '', r.fresp || ''].join('|')).join('\n')
  );
  const now = new Date(),
    gen = {
      fecha: fmtD(iso(now)) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()),
      usuario: S.user.email
    };
  RP._last = { m, huella };
  c.innerHTML = `
    <div class="toolbar no-print">
      <select id="rpVig"><option value="todas">Todas las vigencias</option>${[2026, 2025, 2024].map(y => `<option value="${y}"${String(y) === RP.vig ? ' selected' : ''}>Vigencia ${y}</option>`).join('')}</select>
      ${
        sc
          ? ''
          : `<select id="rpOrg"><option value="">Todas las dependencias</option>${mainOrgsAll()
              .map(o => `<option${o === RP.org ? ' selected' : ''}>${esc(o)}</option>`)
              .join('')}</select>`
      }
      <label style="display:flex;gap:7px;align-items:center;font-size:.82rem;color:var(--soft)"><input type="checkbox" id="rpCasos" style="width:auto"${RP.casos ? ' checked' : ''}> Incluir casos críticos</label>
      <span class="spacer"></span>
      <button class="btn" data-act="rpCsv"><i class="fa-solid fa-file-csv"></i> Datos (CSV)</button>
      <button class="btn primary" data-act="rpPdf"><i class="fa-solid fa-file-pdf"></i> Descargar PDF</button></div>
    <div class="muted no-print" style="font-size:.78rem;margin:-4px 0 12px">Al pulsar Descargar PDF se abre el cuadro de impresión: elige "Guardar como PDF" como destino. El informe queda registrado con su huella de verificación.</div>
    <div class="paper" id="paper">${reportHtml(m, huella, gen)}</div>`;
  const upd = () => {
    RP.vig = $('#rpVig').value;
    if ($('#rpOrg')) RP.org = $('#rpOrg').value;
    RP.casos = $('#rpCasos').checked;
    render();
  };
  ['rpVig', 'rpOrg', 'rpCasos'].forEach(id => {
    const e = $('#' + id);
    if (e) e.addEventListener('change', upd);
  });
}
let INFS = [];
async function logInforme() {
  const { m, huella } = RP._last || {};
  if (!m) return;
  const e = {
    ts: new Date().toISOString(),
    usuario: S.user.email,
    alcance: m.org || 'Todas las dependencias',
    vigencias: RP.vig === 'todas' ? '2024, 2025, 2026' : String(RP.vig),
    corte: HIST.corte,
    n: m.rows.length,
    huella
  };
  if (S.demo || !sb) {
    try {
      INFS = JSON.parse(lsGet('ce_inf') || '[]');
    } catch (x) {
      INFS = [];
    }
  }
  INFS.unshift(e);
  if (S.demo || !sb) {
    lsSet('ce_inf', JSON.stringify(INFS.slice(0, 100)));
    await demoAudit(
      'informes',
      'INSERT',
      INFS.length,
      { alcance: e.alcance, vigencias: e.vigencias, huella: e.huella },
      e.usuario
    );
    return;
  }
  const { error } = await sb.from('informes').insert({
    alcance: e.alcance,
    vigencias: e.vigencias,
    corte: e.corte || null,
    n_registros: e.n,
    huella: e.huella
  });
  if (error) toast('El informe se generó pero no se pudo registrar: ' + error.message, 'err');
}
async function rpPdf() {
  await logInforme();
  const t = document.title;
  document.title =
    'Informe_Ejecutivo_Cumplimiento_' +
    (HIST.corte || '') +
    (RP._last && RP._last.m.org ? '_' + shortOrg(RP._last.m.org).replace(/\W+/g, '_') : '');
  const back = () => {
    document.title = t;
    window.removeEventListener('afterprint', back);
  };
  window.addEventListener('afterprint', back);
  setTimeout(() => window.print(), 80);
  setTimeout(back, 60000);
}
