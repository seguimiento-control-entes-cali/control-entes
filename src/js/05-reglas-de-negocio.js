/**
 * src/js/05-reglas-de-negocio.js
 * Reglas del módulo operativo: semáforo de cada requerimiento vivo (decorate) y recarga de datos (reload).
 * Depende de: 04 (db), 03 (S).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   Lógica de negocio
   ===================================================================== */
function decorate(r) {
  r.dias = daysUntil(r.fecha_limite);
  r.sem = r.estado === 'cerrado' ? 'verde' : r.dias <= (S.cfg.dias_rojo || 5) ? 'rojo' : 'amarillo';
  r.venc = r.estado === 'abierto' && r.dias < 0;
  r.ente_n = (S.entes.find(e => e.id === r.ente_id) || {}).nombre || r.ente || '—';
  r.ente_s = (S.entes.find(e => e.id === r.ente_id) || {}).sigla || r.ente_sigla || '';
  r.dep_n = (S.deps.find(d => d.id === r.dependencia_id) || {}).nombre || r.dependencia || '—';
  return r;
}
const counts = list =>
  list.reduce(
    (a, r) => {
      a.total++;
      a[r.sem]++;
      return a;
    },
    { total: 0, rojo: 0, amarillo: 0, verde: 0 }
  );
const pill = sem => `<span class="pill ${sem}"><i></i>${SEM[sem].toUpperCase()}</span>`;
const opts = (arr, sel, all) =>
  (all ? `<option value="">${all}</option>` : '') +
  arr
    .map(
      x =>
        `<option value="${esc(x.id)}"${String(x.id) === String(sel) ? ' selected' : ''}>${esc(x.nombre)}</option>`
    )
    .join('');

async function reload() {
  try {
    S.reqs = (await db.reqs(S.vigencia)).map(decorate);
    /* Vista previa por rol: la misma restricción que aplicaría la base de datos a esa dependencia */
    if (typeof VP !== 'undefined' && VP.real && ['secretario', 'enlace'].includes(rol()))
      S.reqs = S.reqs.filter(r => r.dependencia_id === S.profile.dependencia_id);
  } catch (e) {
    toast(e.message || 'No se pudieron cargar los datos', 'err');
    S.reqs = [];
  }
  renderNav();
}
