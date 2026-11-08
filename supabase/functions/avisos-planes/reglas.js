// =====================================================================
// Reglas del aviso diario de planes de mejoramiento (función avisos-planes).
// JavaScript puro, sin dependencias: lo usan la función del servidor (Deno) y las pruebas (tests/avisos-planes.test.cjs),
// y se puede trasladar al backend de la Etapa 2. Todas las fechas son textos 'AAAA-MM-DD' en hora de Colombia y se
// calculan en UTC, para que no dependan de la zona horaria del equipo.
//
// Cuándo se avisa una acción pendiente (avance < meta y plan no cerrado):
//   * "previo": el día hábil anterior a su fecha de terminación. Si ese día no se pudo enviar, se envía hasta el
//     mismo día del vencimiento.
//   * "atraso": desde el primer día hábil después del vencimiento, solo si venció en los últimos 7 días; las más
//     antiguas siguen en el resumen semanal de los lunes.
//   * Nunca dos veces la misma acción con el mismo tipo y la misma fecha. Con una prórroga cambia la fecha y se
//     vuelve a avisar.
// =====================================================================

export const VENTANA_ATRASO_DIAS = 7;
export const DOMINIO = /^[a-z0-9._%+-]+@cali\.gov\.co$/;
/* El titular: secretario(a), director(a), gerente o jefe; si no hay, el primero con correo (igual que el resumen) */
export const TITULAR = /secretari|director|gerente|jefe|alcalde/i;

const iso = d => d.toISOString().slice(0, 10);
const fechaUTC = s => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const masDias = (s, n) => {
  const d = fechaUTC(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/* Festivos de Colombia: mismo calendario de la app (src/js/02-utilidades.js), incluida la Ley 2578 de 2026 */
function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mes - 1, dia));
}
const FESTIVOS = {};
export function festivos(y) {
  if (FESTIVOS[y]) return FESTIVOS[y];
  const s = new Set();
  const lunes = d => {
    const w = d.getUTCDay();
    if (w !== 1) d.setUTCDate(d.getUTCDate() + ((8 - w) % 7));
    return d;
  };
  [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].forEach(([m, d]) => s.add(iso(new Date(Date.UTC(y, m - 1, d)))));
  [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].forEach(([m, d]) => s.add(iso(lunes(new Date(Date.UTC(y, m - 1, d))))));
  if (y >= 2026) s.add(iso(lunes(new Date(Date.UTC(y, 6, 9))))); // Ley 2578 de 2026: 9 de julio, trasladable
  const p = pascua(y);
  const mas = n => {
    const d = new Date(p);
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };
  s.add(iso(mas(-3)));
  s.add(iso(mas(-2)));
  [39, 60, 68].forEach(n => s.add(iso(lunes(mas(n)))));
  return (FESTIVOS[y] = s);
}
export function esHabil(s) {
  const d = fechaUTC(s), w = d.getUTCDay();
  return w !== 0 && w !== 6 && !festivos(d.getUTCFullYear()).has(iso(d));
}
export function siguienteHabil(s) {
  let x = masDias(s, 1);
  while (!esHabil(x)) x = masDias(x, 1);
  return x;
}
export function anteriorHabil(s) {
  let x = masDias(s, -1);
  while (!esHabil(x)) x = masDias(x, -1);
  return x;
}
/* Fecha de hoy en Colombia (UTC-5 todo el año, sin horario de verano) */
export const hoyColombia = (ahora = new Date()) => new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
/* La tarea corre de lunes a viernes; los festivos no envía nada */
export const debeCorrer = hoy => esHabil(hoy);

export const pendiente = (a, planes) =>
  Number(a.avance) < Number(a.cantidad) && (planes.get(a.plan_id) || {}).estado !== 'cerrado';
export const claveAviso = (accionId, tipo, fechaFin) => `${accionId}|${tipo}|${String(fechaFin).slice(0, 10)}`;

/**
 * Elige los avisos de hoy.
 * @param {{hoy: string, acciones: object[], planes: Map<string, object>, enviados: Set<string>}} p
 *   acciones: filas de pm_acciones (id, plan_id, dependencia_id, fecha_fin, avance, cantidad…);
 *   enviados: claves claveAviso() de los avisos ya registrados en pm_avisos.
 * @returns {{previo: object[], atraso: object[], sinDependencia: object[]}}
 */
export function elegirAvisos({ hoy, acciones, planes, enviados }) {
  const out = { previo: [], atraso: [], sinDependencia: [] };
  const desde = masDias(hoy, -VENTANA_ATRASO_DIAS);
  for (const a of acciones) {
    const fin = a.fecha_fin ? String(a.fecha_fin).slice(0, 10) : '';
    if (!fin || !pendiente(a, planes)) continue;
    let tipo = null;
    if (fin >= hoy && anteriorHabil(fin) <= hoy) tipo = 'previo';
    else if (fin < hoy && siguienteHabil(fin) <= hoy && fin >= desde) tipo = 'atraso';
    if (!tipo || enviados.has(claveAviso(a.id, tipo, fin))) continue;
    if (a.dependencia_id === null || a.dependencia_id === undefined) out.sinDependencia.push({ ...a, tipo });
    else out[tipo].push(a);
  }
  return out;
}

/* Agrupa los avisos por dependencia: Map dependencia_id → { previo: [], atraso: [] } */
export function porDependencia({ previo, atraso }) {
  const m = new Map();
  const de = id => (m.has(id) ? m.get(id) : m.set(id, { previo: [], atraso: [] }).get(id));
  previo.forEach(a => de(a.dependencia_id).previo.push(a));
  atraso.forEach(a => de(a.dependencia_id).atraso.push(a));
  return m;
}

/* El titular de la dependencia en el directorio, solo con correo @cali.gov.co */
export function titularDe(directorio, nombreDependencia) {
  const contactos = directorio.filter(x => x.organismo === nombreDependencia && DOMINIO.test(String(x.correo || '').toLowerCase()));
  return contactos.find(x => TITULAR.test(String(x.cargo || ''))) || contactos[0] || null;
}
/* Correo de copia a Control Interno: vacío o @cali.gov.co */
export const copiaValida = c => !c || DOMINIO.test(String(c).trim().toLowerCase());

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const fechaLarga = s => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const corto = (s, n) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/**
 * Arma el correo de una dependencia.
 * @param {{dependencia: string, titular: object|null, previo: object[], atraso: object[], hallazgos: Map, planes: Map,
 *          sitio: string, hoy: string}} p
 * @returns {{asunto: string, texto: string, html: string, n: number}}
 */
export function armarCorreo({ dependencia, titular, previo, atraso, hallazgos, planes, sitio, hoy }) {
  const ente = a => ((planes.get(a.plan_id) || {}).formato === 'F14_CGR' ? 'Contraloría General de la República' : 'Contraloría General de Santiago de Cali');
  const linea = a => {
    const pct = Math.round((100 * Number(a.avance)) / Number(a.cantidad || 1));
    return `${ente(a)}, hallazgo ${hallazgos.get(a.hallazgo_id) || ''}: ${corto(a.accion, 110)} (termina ${fechaLarga(a.fecha_fin)}; avance ${pct} %)`;
  };
  const bloques = [];
  if (previo.length) bloques.push({ titulo: `Acciones que vencen el próximo día hábil (${previo.length})`, filas: previo.map(linea) });
  if (atraso.length) bloques.push({ titulo: `Acciones vencidas sin cumplir (${atraso.length})`, filas: atraso.map(linea) });
  const saludo = titular && titular.nombre ? `Respetado(a) ${titular.nombre}:` : 'Respetado(a) secretario(a) o director(a):';
  const intro = `Desde el Despacho del Alcalde le informamos que su dependencia, ${dependencia}, tiene acciones de planes de mejoramiento que requieren atención, con corte al ${fechaLarga(hoy)}.`;
  const cierre = `Le solicitamos reportar los avances con su soporte en la aplicación Control de Entes${sitio ? ' (' + sitio + ')' : ''} o, si la acción requiere más tiempo, tramitar la prórroga a tiempo.`;
  const texto = [saludo, '', intro, '', ...bloques.flatMap(b => [b.titulo + ':', ...b.filas.map(f => '- ' + f), '']), cierre, '',
    'Cordialmente,', 'Despacho del Alcalde', 'Alcaldía Distrital de Santiago de Cali'].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0e1c3a;line-height:1.5;max-width:680px">
    <p>${esc(saludo)}</p><p>${esc(intro)}</p>
    ${bloques.map(b => `<p style="margin:16px 0 6px"><b>${esc(b.titulo)}</b></p><ul style="margin:0;padding-left:20px">${b.filas.map(f => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')}</ul>`).join('')}
    <p style="margin-top:18px">${esc(cierre)}</p><p>Cordialmente,<br><b>Despacho del Alcalde</b><br>Alcaldía Distrital de Santiago de Cali</p>
    <p style="font-size:12px;color:#5b6780;border-top:1px solid #d9dee8;padding-top:8px">Mensaje generado por la aplicación Control de Entes.</p></div>`;
  /* Asunto corto y sin tildes: con tildes y más de ~75 caracteres, denomailer parte mal el encabezado (ver resumen-semanal) */
  return { asunto: 'Aviso de planes de mejoramiento', texto, html, n: previo.length + atraso.length };
}
