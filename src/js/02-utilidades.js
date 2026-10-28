/**
 * src/js/02-utilidades.js
 * Utilidades generales: selectores $/$$, escape HTML (esc), fechas, almacenamiento local (lsGet/lsSet), SHA-256.
 * Depende de: Nada; todos los demás archivos usan estas funciones.
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
/* En la variante privada las llaves llevan sufijo para no mezclarse con la demo pública en el mismo navegador */
const lsKey = k => (ES_PRIVADA ? k + '_real' : k);
const lsGet = k => {
  try {
    return localStorage.getItem(lsKey(k));
  } catch (e) {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(lsKey(k), v);
  } catch (e) {}
};
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today0 = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const addDays = n => {
  const d = today0();
  d.setDate(d.getDate() + n);
  return iso(d);
};
const parseD = s => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysUntil = s => Math.round((parseD(s) - today0()) / 86400000);
const fmtD = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');
const fmtTs = s => {
  const d = new Date(s);
  return isNaN(d) ? '—' : fmtD(iso(d)) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
};
const nf = n => Number(n).toLocaleString('es-CO');
const diasTxt = d =>
  d < 0 ? `Vencido hace ${-d} d` : d === 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `En ${d} días`;
async function sha256Hex(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const h = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const ROLES = {
  admin: 'Super administrador',
  alcalde: 'Alcalde / Despacho',
  secretario: 'Secretario(a) / Director(a)',
  enlace: 'Enlace operativo',
  control_interno: 'Control Interno'
};
const SEM = { rojo: 'Crítico', amarillo: 'En término', verde: 'Cerrado' };

/* ---------- Días hábiles en Colombia ----------
   Festivos según la Ley 51 de 1983 ("Ley Emiliani") y la Ley 2578 de 2026: fijos; trasladables al lunes siguiente;
   y los que dependen de la Pascua (Jueves y Viernes Santo, Ascensión, Corpus Christi y Sagrado Corazón). */
const FESTIVOS_CO = {};
function pascua(y) {
  const a = y % 19,
    b = Math.floor(y / 100),
    c = y % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31),
    dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}
function festivosCO(y) {
  if (FESTIVOS_CO[y]) return FESTIVOS_CO[y];
  const s = new Set();
  const lunes = d => {
    const w = d.getDay();
    if (w !== 1) d.setDate(d.getDate() + ((8 - w) % 7));
    return d;
  };
  [
    [1, 1],
    [5, 1],
    [7, 20],
    [8, 7],
    [12, 8],
    [12, 25]
  ].forEach(([m, d]) => s.add(iso(new Date(y, m - 1, d))));
  [
    [1, 6],
    [3, 19],
    [6, 29],
    [8, 15],
    [10, 12],
    [11, 1],
    [11, 11]
  ].forEach(([m, d]) => s.add(iso(lunes(new Date(y, m - 1, d)))));
  /* Ley 2578 de 2026: Día de Nuestra Señora del Rosario de Chiquinquirá (9 de julio), trasladable */
  if (y >= 2026) s.add(iso(lunes(new Date(y, 6, 9))));
  const p = pascua(y),
    mas = n => {
      const d = new Date(p);
      d.setDate(d.getDate() + n);
      return d;
    };
  s.add(iso(mas(-3)));
  s.add(iso(mas(-2)));
  [39, 60, 68].forEach(n => s.add(iso(lunes(mas(n)))));
  return (FESTIVOS_CO[y] = s);
}
function esHabil(d) {
  const w = d.getDay();
  return w !== 0 && w !== 6 && !festivosCO(d.getFullYear()).has(iso(d));
}
/* Fecha que resulta de sumar n días hábiles a una fecha (AAAA-MM-DD), sin contar el día inicial */
function sumarHabiles(desde, n) {
  const d = new Date(desde + 'T00:00:00');
  let k = 0;
  while (k < n) {
    d.setDate(d.getDate() + 1);
    if (esHabil(d)) k++;
  }
  return iso(d);
}
