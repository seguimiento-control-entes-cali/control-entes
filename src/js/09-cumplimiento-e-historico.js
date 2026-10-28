/**
 * src/js/09-cumplimiento-e-historico.js
 * Semáforo histórico (SEMP, semOf), ranking de cumplimiento por secretaría, histórico de radicados y detalle de un radicado.
 * Depende de: 10 (HIST, statsOf), 11 (temas y cruces en el detalle).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   HISTÓRICO Y CUMPLIMIENTO POR SECRETARÍA (datos de los Excel 2024-2026)
   ===================================================================== */
const SEMP = { verde_lt: 0.2, rojo_ge: 0.4, min: 10 }; // umbrales del semáforo (mismos del Excel)
const OPO_PILL = [
  ['verde', 'A TIEMPO'],
  ['amarillo', 'TARDÍA'],
  ['rojo', 'SIN RESPUESTA'],
  ['neutral', 'PENDIENTE'],
  ['neutral', 'SIN FECHA'],
  ['neutral', 'NO REQUIERE']
];
const C = { vig: 'todas', niv: 'principal', sort: 'inc' };
const Hs = { q: '', vig: 'todas', ente: '', org: '', opo: '', page: 0 };
const semOf = (ev, t) =>
  ev < SEMP.min ? 'muestra' : t >= SEMP.rojo_ge ? 'rojo' : t < SEMP.verde_lt ? 'verde' : 'amarillo';
const semPill = s =>
  s === 'muestra'
    ? '<span class="pill neutral">MUESTRA INSUFICIENTE</span>'
    : `<span class="pill ${s}"><i></i>${s.toUpperCase()}</span>`;
const pct1 = x => (x * 100).toFixed(1).replace('.', ',') + '%';

function aggOrgs(vig, niv) {
  const m = new Map();
  hrows().forEach(r => {
    if (vig !== 'todas' && r.v !== +vig) return;
    if (r.org === 'Sin dato' || r.org === 'Todos los organismos' || r.niv === 'Otro') return;
    if (niv === 'principal' && r.niv === 'Subunidad') return;
    if (niv === 'sub' && r.niv !== 'Subunidad') return;
    let o = m.get(r.org);
    if (!o) {
      o = {
        org: r.org,
        niv: r.niv,
        ok: 0,
        tar: 0,
        sin: 0,
        pend: 0,
        retSum: 0,
        y: { 2024: 0, 2025: 0, 2026: 0 }
      };
      m.set(r.org, o);
    }
    if (r.opo === 0) o.ok++;
    else if (r.opo === 1) {
      o.tar++;
      o.retSum += r.ret || 0;
      o.y[r.v]++;
    } else if (r.opo === 2) {
      o.sin++;
      o.y[r.v]++;
    } else if (r.opo === 3) o.pend++;
  });
  return [...m.values()]
    .map(o => {
      o.ev = o.ok + o.tar + o.sin;
      o.inc = o.tar + o.sin;
      o.tasa = o.ev ? o.inc / o.ev : 0;
      o.ret = o.tar ? o.retSum / o.tar : 0;
      o.sem = semOf(o.ev, o.tasa);
      return o;
    })
    .filter(o => o.ev > 0);
}
function sortOrgs(list) {
  if (C.sort === 'tasa')
    return list.sort(
      (a, b) => (a.sem === 'muestra') - (b.sem === 'muestra') || b.tasa - a.tasa || b.inc - a.inc
    );
  return list.sort((a, b) => b.inc - a.inc || b.tasa - a.tasa);
}

function vCumplimiento(c) {
  const list = sortOrgs(aggOrgs(C.vig, C.niv));
  const T = list.reduce(
    (a, o) => {
      a.ok += o.ok;
      a.tar += o.tar;
      a.sin += o.sin;
      a.pend += o.pend;
      return a;
    },
    { ok: 0, tar: 0, sin: 0, pend: 0 }
  );
  const ev = T.ok + T.tar + T.sin,
    inc = T.tar + T.sin,
    tasa = ev ? inc / ev : 0,
    gs = semOf(ev, tasa);
  const top = list.filter(o => o.sem === 'rojo').slice(0, 3);
  const yrs = ['todas', 2026, 2025, 2024];
  c.innerHTML = `
    <div class="toolbar">
      <select id="cVig">${yrs.map(y => `<option value="${y}"${String(y) === String(C.vig) ? ' selected' : ''}>${y === 'todas' ? 'Todas las vigencias' : 'Vigencia ' + y}</option>`).join('')}</select>
      <select id="cNiv"><option value="principal"${C.niv === 'principal' ? ' selected' : ''}>Secretarías, departamentos y UAE</option><option value="todos"${C.niv === 'todos' ? ' selected' : ''}>Todos los organismos</option></select>
      <div class="seg"><button data-act="cSort" data-s="inc" class="${C.sort === 'inc' ? 'on' : ''}">Por n.º de incumplimientos</button><button data-act="cSort" data-s="tasa" class="${C.sort === 'tasa' ? 'on' : ''}">Por % de incumplimiento</button></div>
      <span class="spacer"></span>
      <button class="btn no-print" data-act="cumCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button>
    </div>
    <div class="grid g-kpi" style="margin-bottom:14px">
      <div class="card kpi"><small>Evaluados</small><b>${nf(ev)}</b></div>
      <div class="card kpi g"><small>A tiempo</small><b>${nf(T.ok)}</b></div>
      <div class="card kpi y"><small>Respondidos tarde</small><b>${nf(T.tar)}</b></div>
      <div class="card kpi r"><small>Sin respuesta (vencidos)</small><b>${nf(T.sin)}</b></div>
      <div class="card kpi ${gs === 'rojo' ? 'r' : gs === 'amarillo' ? 'y' : 'g'}"><small>% de incumplimiento</small><b>${pct1(tasa)}</b></div>
    </div>
    ${top.length ? `<div class="top3">${top.map((o, i) => `<div class="top-card"><span class="pill rojo"><i></i>ALERTA ${i + 1}</span><div class="n" style="margin-top:10px">${o.inc}</div><b>${esc(o.org)}</b><small class="muted">${o.tar} tarde · ${o.sin} sin respuesta · ${pct1(o.tasa)} de incumplimiento</small></div>`).join('')}</div>` : ''}
    <div class="legend"><span><i style="background:#38D99A"></i>A tiempo</span><span><i style="background:#FFC44D"></i>Tarde</span><span><i style="background:#FF5C70"></i>Sin respuesta vencida</span>
      <span class="faint">Semáforo: verde menos de ${SEMP.verde_lt * 100}% · rojo desde ${SEMP.rojo_ge * 100}% · mínimo ${SEMP.min} casos evaluados · corte de datos ${fmtD(HIST.corte)}</span></div>
    <div class="tbl-wrap"><table class="tbl" style="min-width:980px"><thead><tr><th>#</th><th>Organismo</th><th style="width:170px">Oportunidad</th><th class="right">A tiempo</th><th class="right">Tarde</th><th class="right">Sin resp.</th><th class="right">Incumpl.</th><th class="right">%</th><th>Semáforo</th><th class="right">Retraso prom.</th><th class="right">2024 / 2025 / 2026</th></tr></thead><tbody>
    ${
      list.length
        ? list
            .map(
              (o, i) => `<tr class="click" data-act="drill" data-org="${esc(o.org)}">
      <td class="mono muted">${i + 1}</td><td style="min-width:250px"><span class="org">${esc(o.org)}</span></td>
      <td><div class="stack"><span class="ok" style="width:${(o.ok * 100) / o.ev}%"></span><span class="tar" style="width:${(o.tar * 100) / o.ev}%"></span><span class="sin" style="width:${(o.sin * 100) / o.ev}%"></span></div></td>
      <td class="right mono">${o.ok}</td><td class="right mono" style="color:var(--yelink)">${o.tar}</td><td class="right mono" style="color:var(--redink)">${o.sin}</td>
      <td class="right mono"><b>${o.inc}</b></td><td class="right mono">${pct1(o.tasa)}</td><td>${semPill(o.sem)}</td>
      <td class="right mono">${o.tar ? o.ret.toFixed(1).replace('.', ',') + ' d' : '—'}</td>
      <td class="right mono muted">${o.y[2024]} / ${o.y[2025]} / ${o.y[2026]}</td></tr>`
            )
            .join('')
        : '<tr><td colspan="11"><div class="empty"><i class="fa-solid fa-inbox"></i>Sin datos</div></td></tr>'
    }
    </tbody></table></div>
    <div class="muted" style="margin-top:10px;font-size:.78rem">Toca una fila para ver los radicados que incumplieron. "Retraso prom." = días hábiles promedio de las respuestas tardías.</div>`;
  $('#cVig').addEventListener('change', e => {
    C.vig = e.target.value;
    render();
  });
  $('#cNiv').addEventListener('change', e => {
    C.niv = e.target.value;
    render();
  });
}
function drillModal(org) {
  const rows = hrows()
    .filter(r => r.org === org && (r.opo === 1 || r.opo === 2) && (C.vig === 'todas' || r.v === +C.vig))
    .sort((a, b) => (b.ret || 0) - (a.ret || 0));
  openModal({
    title: org,
    wide: true,
    body: `
    <div class="muted" style="font-size:.8rem;margin-bottom:10px">${rows.length} radicado(s) con respuesta tardía o sin respuesta${C.vig === 'todas' ? '' : ' en la vigencia ' + C.vig}. Ordenados por mayor retraso.</div>
    <div class="tbl-wrap"><table class="tbl" style="min-width:640px"><thead><tr><th>Vig.</th><th>N.º radicación ente</th><th>Fecha máx.</th><th>Fecha respuesta</th><th>ORFEO respuesta</th><th class="right">Retraso</th><th>Estado</th></tr></thead><tbody>
    ${rows
      .slice(0, 200)
      .map(
        r =>
          `<tr><td class="mono">${r.v}</td><td class="mono">${esc(r.rad || '—')}</td><td>${fmtD(r.fmax)}</td><td>${fmtD(r.fresp)}</td><td class="mono" style="font-size:.76rem">${esc(r.orfR || '—')}</td><td class="right mono">${r.ret == null ? '—' : r.ret + ' d'}</td><td><span class="pill ${OPO_PILL[r.opo][0]}">${OPO_PILL[r.opo][1]}</span></td></tr>`
      )
      .join('')}
    </tbody></table></div>${rows.length > 200 ? `<div class="muted" style="font-size:.76rem;margin-top:8px">Se muestran los 200 con mayor retraso. El detalle completo está en Histórico de radicados.</div>` : ''}`,
    footer: `<button class="btn" data-act="closeModal">Cerrar</button>`
  });
}
function csvDownload(name, head, rows) {
  const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv = '\ufeff' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function histFiltered() {
  const q = Hs.q.toLowerCase().trim();
  return hrows().filter(
    r =>
      (Hs.vig === 'todas' || r.v === +Hs.vig) &&
      (!Hs.ente || r.ente === Hs.ente) &&
      (!Hs.org || r.org === Hs.org) &&
      (Hs.opo === '' || r.opo === +Hs.opo) &&
      (!q ||
        [r.rad, r.orfE, r.orfR, r.asu, r.org, r.ente].some(x =>
          String(x || '')
            .toLowerCase()
            .includes(q)
        ))
  );
}
function vHistorico(c) {
  const so = (arr, sel, all) =>
    `<option value="">${all}</option>` +
    arr.map(x => `<option${x === sel ? ' selected' : ''}>${esc(x)}</option>`).join('');
  c.innerHTML = `
    <div class="toolbar">
      <div class="grow"><i class="fa-solid fa-magnifying-glass"></i><input id="hq" placeholder="Buscar radicado del ente, ORFEO, asunto…" value="${esc(Hs.q)}"></div>
      <select id="hvig"><option value="todas">Todas las vigencias</option>${[2026, 2025, 2024].map(y => `<option value="${y}"${String(y) === Hs.vig ? ' selected' : ''}>${y}</option>`).join('')}</select>
      <select id="hente">${so([...new Set(hrows().map(r => r.ente))].sort(), Hs.ente, 'Todos los entes')}</select>
      <select id="horg">${so([...new Set(hrows().map(r => r.org))].sort(), Hs.org, 'Todos los organismos')}</select>
      <select id="hopo"><option value="">Todo estado</option>${OPO_PILL.map((p, i) => `<option value="${i}"${String(i) === Hs.opo ? ' selected' : ''}>${p[1][0] + p[1].slice(1).toLowerCase()}</option>`).join('')}</select>
      <button class="btn no-print" data-act="histCsv"><i class="fa-solid fa-file-csv"></i> Exportar</button>
      ${rol() === 'admin' ? '<button class="btn primary no-print" data-act="ceAbrir"><i class="fa-solid fa-file-arrow-up"></i> Cargar Excel de control</button>' : ''}
    </div>
    <div class="tbl-wrap"><table class="tbl" style="min-width:1180px"><thead><tr><th>Vig.</th><th>N.º radicación ente</th><th>ORFEO entrada</th><th>Organismo</th><th class="right">Término</th><th>Fecha máx.</th><th>Fecha resp.</th><th>ORFEO respuesta</th><th>¿Respondió?</th><th>¿Tardía?</th><th class="right">Retraso</th><th>Estado</th></tr></thead><tbody id="hBody"></tbody></table></div>
    <div class="pager"><span class="muted" id="hCount" style="margin-right:auto;font-size:.78rem"></span><button class="btn sm" data-act="hPage" data-d="-1">Anterior</button><span class="mono" id="hPg"></span><button class="btn sm" data-act="hPage" data-d="1">Siguiente</button></div>`;
  const upd = () => {
    Hs.q = $('#hq').value;
    Hs.vig = $('#hvig').value;
    Hs.ente = $('#hente').value;
    Hs.org = $('#horg').value;
    Hs.opo = $('#hopo').value;
    Hs.page = 0;
    renderHist();
  };
  ['hq', 'hvig', 'hente', 'horg', 'hopo'].forEach(id => $('#' + id).addEventListener('input', upd));
  renderHist();
}
const H_PAGE = 100;
function renderHist() {
  const list = histFiltered(),
    pages = Math.max(1, Math.ceil(list.length / H_PAGE));
  Hs.page = Math.min(Hs.page, pages - 1);
  const yn = v => (v === 1 ? 'Sí' : v === 0 ? 'No' : '—');
  $('#hBody').innerHTML =
    list
      .slice(Hs.page * H_PAGE, (Hs.page + 1) * H_PAGE)
      .map(
        r => `<tr class="click" data-act="histDetail" data-i="${r.i}">
    <td class="mono">${r.v}</td><td class="mono">${esc(r.rad || '—')}</td><td class="mono" style="font-size:.76rem">${esc(r.orfE || '—')}</td><td style="min-width:210px">${esc(r.org)}</td>
    <td class="right mono">${r.term == null ? '—' : r.term + ' d'}</td><td>${fmtD(r.fmax)}</td><td>${fmtD(r.fresp)}</td><td class="mono" style="font-size:.76rem">${esc(r.orfR || '—')}</td>
    <td>${yn(r.resp)}</td><td>${r.opo === 5 ? '—' : r.opo === 1 ? 'Sí' : r.opo === 0 || r.opo === 2 ? 'No' : '—'}</td>
    <td class="right mono">${r.ret == null ? '—' : r.ret + ' d'}</td><td><span class="pill ${OPO_PILL[r.opo][0]}">${OPO_PILL[r.opo][1]}</span></td></tr>`
      )
      .join('') ||
    '<tr><td colspan="12"><div class="empty"><i class="fa-solid fa-inbox"></i>Sin resultados</div></td></tr>';
  $('#hCount').textContent =
    `${nf(list.length)} de ${nf(hrows().length)} registros · corte de datos ${fmtD(HIST.corte)}`;
  $('#hPg').textContent = `${Hs.page + 1} / ${pages}`;
}
function histDetail(i) {
  const r = hrows().find(x => x.i === i);
  if (!r) return;
  openModal({
    title: r.rad || 'Sin número',
    body: `<div style="margin-bottom:10px"><span class="pill ${OPO_PILL[r.opo][0]}">${OPO_PILL[r.opo][1]}</span></div><dl class="kv">
    <div><dt>Vigencia</dt><dd>${r.v}</dd></div><div><dt>Ente de control</dt><dd>${esc(r.ente)}</dd></div>
    <div><dt>N.º radicación del ente</dt><dd class="mono">${esc(r.rad || '—')}</dd></div><div><dt>ORFEO de entrada</dt><dd class="mono">${esc(r.orfE || '—')}</dd></div>
    <div><dt>Organismo responsable</dt><dd>${esc(r.org)}</dd></div><div><dt>Asunto</dt><dd id="asuDd">${esc(maskPII(r.asu) || '—')}</dd></div>
    <div><dt>Tema</dt><dd>${(() => {
      const x = cruceData().info.get(r.i);
      return x
        ? x.temas
            .slice(0, 3)
            .map((k, j) => temaChip(k, j === 0 && x.man))
            .join(' ') || temaChip('sin')
        : '';
    })()}</dd></div>
    ${(() => {
      const cs = casoDe(r);
      if (!cs) return '';
      const own = new Set(
        cruceData()
          .info.get(r.i)
          .ids.map(x => x.k + ':' + x.v)
      );
      const mine = cs.ids.filter(x => own.has(x.k + ':' + x.v));
      return `<div><dt>Cruce con otros entes</dt><dd><span class="pill rojo"><i></i>${esc(cs.fams.join(' + '))}</span><div class="muted" style="font-size:.76rem;margin-top:4px">Relacionado por: ${mine.map(x => esc((ID_LBL[x.k] || x.k) + ' ' + idShow(x))).join(' · ')}</div></dd></div>`;
    })()}
    <div><dt>Fecha de recibo</dt><dd>${fmtD(r.rec)}</dd></div><div><dt>Término</dt><dd>${r.term == null ? '—' : r.term + ' días hábiles'}</dd></div>
    <div><dt>Fecha máxima de respuesta</dt><dd>${fmtD(r.fmax)}</dd></div><div><dt>Fecha de respuesta</dt><dd>${fmtD(r.fresp)}</dd></div>
    <div><dt>ORFEO de la respuesta</dt><dd class="mono">${esc(r.orfR || '—')}</dd></div>
    <div><dt>Retraso</dt><dd>${r.ret == null ? '—' : r.ret + ' días hábiles'}</dd></div>
    <div><dt>Días hábiles que tardó</dt><dd>${r.tiem == null ? '—' : r.tiem}</dd></div></dl>`,
    footer: `${casoDe(r) ? '<button class="btn" data-act="cxTab" data-tab="exactos"><i class="fa-solid fa-code-merge"></i> Ver cruce</button>' : ''}<button class="btn" data-act="closeModal">Cerrar</button>`
  });
}
