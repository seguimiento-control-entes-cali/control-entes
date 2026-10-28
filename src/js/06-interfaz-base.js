/**
 * src/js/06-interfaz-base.js
 * Interfaz común: avisos (toast), ventanas modales, menú lateral, barra de pestañas del celular, navegación entre pantallas (go/render).
 * Depende de: 03 (NAV, TITLES), todas las vistas v*().
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   UI base: toast, modal, shell
   ===================================================================== */
function toast(msg, type) {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : '');
  t.innerHTML = `<i class="fa-solid ${type === 'err' ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3800);
}
function openModal({ title, body, footer, wide, fija }) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'overlay';
  el.id = 'modalOv';
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="width:min(720px,100%)"' : ''}><header><h3>${esc(title)}</h3>${fija ? '' : '<button class="icon-btn" data-act="closeModal" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>'}</header><div class="body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}</div>`;
  /* Una ventana fija (verificación obligatoria) no se cierra con clic afuera ni con Escape */
  if (fija) el.dataset.fija = '1';
  el.addEventListener('mousedown', e => {
    if (e.target === el && !fija) closeModal();
  });
  $('#modalRoot').appendChild(el);
  const f = el.querySelector('input,select,textarea');
  if (f) f.focus();
}
function closeModal() {
  $('#modalRoot').innerHTML = '';
}
document.addEventListener('keydown', e => {
  const ov = $('#modalOv');
  if (e.key === 'Escape' && !(ov && ov.dataset.fija)) closeModal();
});

function renderNav() {
  const r = rol();
  if (!r) return;
  const nRojo = S.reqs.filter(x => x.sem === 'rojo').length;
  $('#nav').innerHTML = NAV.map(g => {
    const items = g.items.filter(i => i.roles.includes(r));
    if (!items.length) return '';
    return (
      `<div class="nav-group">${g.g}</div>` +
      items
        .map(
          i => `
      <button class="nav-item${S.view === i.id ? ' active' : ''}" data-act="go" data-view="${i.id}" title="${esc(i.label)}">
        <i class="fa-solid ${i.icon}"></i><span class="nav-label">${esc(scopeOrg() && i.labelScoped ? i.labelScoped : i.label)}</span>
        ${(() => {
          const n = i.badgeFn ? i.badgeFn() : i.badge ? nRojo : 0;
          return n ? `<span class="badge">${n}</span>` : '';
        })()}
      </button>`
        )
        .join('')
    );
  }).join('');
  $('#uEmail').textContent = S.user.email;
  $('#uRole').textContent = ROLES[r] || r;
  renderTabbar();
}
function hudTick() {
  const el = document.getElementById('hudClock');
  if (!el) return;
  const d = new Date();
  el.textContent =
    d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '') +
    ' · ' +
    d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}
if (!window.__hud) {
  window.__hud = setInterval(hudTick, 1000);
}
function countUp(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  (root || document).querySelectorAll('.kpi b, .trio b, .st b, .top-card .n').forEach(el => {
    const t = el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild : null;
    if (!t) return;
    const raw = t.textContent.trim();
    if (!/^\d{1,3}(\.\d{3})*$/.test(raw)) return;
    const end = +raw.replace(/\./g, '');
    if (end < 2) return;
    const t0 = performance.now(),
      dur = 900;
    const f = x => Math.round(x).toLocaleString('es-CO');
    const step = n => {
      const k = Math.min(1, (n - t0) / dur),
        e = 1 - Math.pow(1 - k, 3);
      t.textContent = f(end * e);
      if (k < 1) requestAnimationFrame(step);
      else t.textContent = raw;
    };
    requestAnimationFrame(step);
  });
}
function renderTabbar() {
  const bar = $('#tabbar');
  if (!bar) return;
  const r = rol(),
    allowed = NAV.flatMap(g => g.items).filter(i => i.roles.includes(r));
  const pref = scopeOrg()
    ? ['dependencia', 'requerimientos', 'carga', 'informe']
    : ['mando', 'dependencia', 'notificaciones', 'informe', 'alertas', 'cumplimiento'];
  const short = {
    mando: 'Mando',
    dependencia: scopeOrg() ? 'Mi dependencia' : 'Expediente',
    notificaciones: 'Avisos',
    informe: 'Informe',
    requerimientos: 'Requerim.',
    carga: 'ORFEO',
    alertas: 'Alertas',
    cruces: 'Cruces',
    planes: 'Mejora',
    cumplimiento: 'Ranking',
    tablero: 'Tablero'
  };
  const items = pref
    .map(id => allowed.find(i => i.id === id))
    .filter(Boolean)
    .slice(0, 4);
  const inTabs = items.some(i => i.id === S.view);
  bar.innerHTML =
    items
      .map(
        i =>
          `<button class="tab${S.view === i.id ? ' on' : ''}" data-act="go" data-view="${i.id}"><i class="fa-solid ${i.icon}"></i><span>${short[i.id] || i.label}</span></button>`
      )
      .join('') +
    `<button class="tab${inTabs ? '' : ' on'}" id="tabMenu" aria-label="Menú administrativo"><i class="fa-solid fa-bars"></i><span>Menú</span></button>`;
  $('#tabMenu').addEventListener('click', () => $('#app').classList.add('open'));
}

function renderMode() {
  const b = $('#modeBadge');
  if (!navigator.onLine) {
    b.className = 'mode off';
    $('#modeTxt').textContent = 'SIN CONEXIÓN';
    return;
  }
  b.className = 'mode ' + (S.demo ? 'demo' : 'live');
  $('#modeTxt').textContent = S.demo ? (ES_PRIVADA ? 'DATOS REALES' : 'MODO DEMO') : 'EN LÍNEA';
}
window.addEventListener('online', renderMode);
window.addEventListener('offline', renderMode);

const defaultView = () => (scopeOrg() ? 'dependencia' : canRole(SUPERV) ? 'mando' : 'tablero');
const VISTAS_CON_VIGENCIA = ['tablero', 'requerimientos', 'carga', 'alertas', 'reportes'];
function go(view) {
  stopPlay();
  if (!NAV.some(g => g.items.some(i => i.id === view && i.roles.includes(rol())))) view = defaultView();
  S.view = view;
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  document.getElementById('app').classList.remove('open');
  const t = TITLES[view];
  $('#pageTitle').textContent = t[0];
  $('#pageSub').textContent = t[1];
  /* El selector de vigencia solo filtra el módulo operativo: se muestra únicamente en esas pantallas */
  $('#selVigencia').classList.toggle('hidden', !VISTAS_CON_VIGENCIA.includes(view));
  renderNav();
  render();
}
async function render() {
  const c = $('#content');
  const v = {
    tablero: vTablero,
    requerimientos: vReqs,
    carga: vCarga,
    alertas: vAlertas,
    entes: () => vCatalog('entes'),
    dependencias: () => vCatalog('dependencias'),
    mando: vMando,
    informe: vInforme,
    actividad: vActividad,
    dependencia: vDependencia,
    notificaciones: vNotificaciones,
    directorio: vDirectorio,
    reportes: vReportes,
    cumplimiento: vCumplimiento,
    cruces: vCruces,
    planes: vPlanes,
    historico: vHistorico,
    auditoria: vAuditoria,
    cuentas: vCuentas,
    config: vConfig
  }[S.view];
  try {
    await v(c);
  } catch (e) {
    c.innerHTML = `<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i>${esc(e.message || 'Error')}</div>`;
  }
  if (S.__cu !== S.view) {
    S.__cu = S.view;
    countUp(c);
  }
  hudTick();
}
