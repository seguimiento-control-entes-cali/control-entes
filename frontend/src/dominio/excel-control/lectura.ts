// Lectura y clasificación del Excel de control (reemplaza al ETL en Python de etl/). Porte función por función de
// src/js/20-carga-excel.js de la 2.x (secciones 1 a 4: valores de celda con la semántica de Python, fechas, texto,
// organismos, lectura de las hojas CONTROL y NO RESPUESTA, y clasificación). La 2.x se verificó registro por registro
// contra el CSV del ETL; esta copia se verifica contra la 2.x en pruebas/paridad-excel-control.test.ts.
// La lectura del archivo (SheetJS) queda fuera del dominio: aquí llegan las hojas ya convertidas en celdas.
import { festivosColombia } from '../dias-habiles';
import { diaSemana, sumarDias } from '../fechas';
import { PADRE_ORGANISMO, REGLAS_ORGANISMOS } from './organismos';

// =====================================================================
// 1. VALORES DE CELDA CON LA MISMA SEMÁNTICA DE PYTHON/OPENPYXL
// =====================================================================
/** Número: n = valor, f = era decimal en el archivo, raw = texto crudo del XML. */
export interface CeldaNumero {
  n: number;
  f: boolean;
  raw: string;
}
/** Fecha: d = AAAA-MM-DD, h = HH:MM:SS. */
export interface CeldaFecha {
  d: string;
  h: string;
}
export type Celda = null | string | CeldaNumero | CeldaFecha;

/** ceLimpiar: espacios normalizados; vacío o "-" es nada. */
export function limpiar(v: Celda): Celda {
  if (v == null) return null;
  if (typeof v === 'string') {
    const t = v
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return t === '' || t === '-' ? null : t;
  }
  return v;
}
export const esNumero = (v: Celda): v is CeldaNumero => v != null && typeof v === 'object' && 'n' in v;
export const esFecha = (v: Celda): v is CeldaFecha => v != null && typeof v === 'object' && 'd' in v;
/** bool(v) de Python: None, '', 0 y 0.0 son falsos (ceVerdad). */
export const verdad = (v: Celda) => v != null && v !== '' && !(esNumero(v) && v.n === 0);
/** str(float) de Python (cePyFloat). */
export function pyFloat(n: number): string {
  if (!isFinite(n)) return isNaN(n) ? 'nan' : n > 0 ? 'inf' : '-inf';
  const a = Math.abs(n);
  if (Number.isInteger(n) && a < 1e16) return n.toFixed(0) + '.0';
  if (a >= 1e16 || (a < 1e-4 && n !== 0)) {
    const [m = '', e = ''] = n.toExponential().split('e');
    const s = e[0] === '-' ? '-' : '+',
      d = e.replace(/^[+-]/, '');
    return m + 'e' + s + (d.length < 2 ? '0' + d : d);
  }
  return String(n);
}
/** str(v) de Python (cePyStr). */
export function pyStr(v: Celda | undefined): string {
  if (v == null) return 'None';
  if (typeof v === 'string') return v;
  if (esNumero(v)) return v.f ? pyFloat(v.n) : v.raw;
  if (esFecha(v)) return v.d + ' ' + v.h;
  return String(v);
}
const texto = (v: Celda) => (v == null ? null : pyStr(v));
/** ceIdStr: identificador como texto, sin el ".0" de Python. */
export function idStr(v: Celda): string | null {
  if (v == null) return null;
  const t = pyStr(v).trim();
  return /^\d+\.0$/.test(t) ? t.slice(0, -2) : t;
}
/** int(float(v)) de Python, o null si no se puede (ceEntero). */
export function entero(v: Celda): number | null {
  if (v == null || esFecha(v)) return null;
  if (esNumero(v)) return isFinite(v.n) ? Math.trunc(v.n) : null;
  const s = String(v).trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return isFinite(n) ? Math.trunc(n) : null;
}

// =====================================================================
// 2. FECHAS, TEXTO Y ORGANISMOS (etl/clean.py)
// =====================================================================
const MES: Readonly<Record<string, number>> = {
  ene: 1,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dic: 12,
  dec: 12
};
const dos = (n: number) => String(n).padStart(2, '0');
const diasDelMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function fechaValida(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > diasDelMes(y, m)) return null;
  return y + '-' + dos(m) + '-' + dos(d);
}
/** pdate() (ceFecha): { d: 'AAAA-MM-DD' | null, malo: texto original si no se pudo leer }. */
export function fecha(v: Celda): { d: string | null; malo: string | null } {
  if (v == null) return { d: null, malo: null };
  if (esFecha(v)) return { d: v.d, malo: null };
  const s = pyStr(v).trim().toLowerCase();
  let m = /^(\d{1,2})[-/ ]([a-z]{3,4})\.?[-/ ](\d{2,4})$/.exec(s);
  const mes = m ? MES[m[2] as string] : undefined;
  if (m && mes) {
    const r = fechaValida(+(m[3] as string), mes, +(m[1] as string));
    if (r) return { d: r, malo: null };
  }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s);
  if (m) {
    const r = fechaValida(+(m[3] as string), +(m[2] as string), +(m[1] as string));
    if (r) return { d: r, malo: null };
  }
  return { d: null, malo: pyStr(v) };
}
/** Quita los signos diacríticos (unicodedata.combining en Python). */
const sinTildes = (s: string) =>
  String(s)
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '');
/** fold() de clean.py. */
export const plegar = (s: string) =>
  sinTildes(s)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
/** _fold() de load.py (conserva la puntuación). */
const plegarEncabezado = (s: Celda | undefined) =>
  sinTildes(s == null ? '' : pyStr(s))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** ceCanonUno: [nombre oficial, tipo] según la primera regla que coincide, o null. */
export function organismoOficial(txt: string): [string, string] | null {
  const f = plegar(txt);
  for (const [rx, n0, l0] of REGLAS_ORGANISMOS)
    if (rx.test(f)) {
      const [n, l] = PADRE_ORGANISMO[n0] ?? [n0, l0];
      return [n, l];
    }
  return null;
}
/** Un texto puede nombrar varios organismos ("Despacho Alcalde, Secretaría X y Secretaría Y"). */
const SEPARADOR =
  /\s*(?:,|;|\/|\+|\sy\s(?=(?:secretar|departamento|despacho|oficina|unidad|subsecretar|subdirec|dagma|alcald)))\s*/i;
/** ceOrganismos. */
export function organismos(txt: Celda): [string, string][] {
  if (txt == null) return [];
  const out: [string, string][] = [];
  pyStr(txt)
    .split(SEPARADOR)
    .forEach(p => {
      if (!p || !p.trim()) return;
      const k = organismoOficial(p) ?? [p.trim().replace(/\s+/g, ' '), 'Sin clasificar'];
      if (!out.some(o => o[0] === k[0])) out.push(k);
    });
  return out;
}
/** Días hábiles en (a, b]; negativo si b < a (busday_count de numpy con festivos de Colombia) (ceHabiles). */
export function habiles(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const cuenta = (x: string, y: string) => {
    let d = x,
      n = 0;
    while (d < y) {
      d = sumarDias(d, 1);
      const w = diaSemana(d);
      const anio = +d.slice(0, 4);
      // Igual que el ETL: festivos desde 2023 (fechas anteriores son errores de digitación del año)
      if (w !== 0 && w !== 6 && !(anio >= 2023 && festivosColombia(anio).has(d))) n++;
    }
    return n;
  };
  return b >= a ? cuenta(a, b) : -cuenta(b, a);
}
const NO_APLICA = /^(n\/?a|no aplica|no aplic\w*|sin respuesta|ninguno)$/i;
const SIN_NUMERO = /^(sin n[uú]mero|sin numero|s\/?n|none|nan|)$/i;
const fichas = (x: Celda) =>
  new Set(
    pyStr(x == null ? '' : x)
      .replace(/(\d)\.0\b/g, '$1')
      .match(/\d{12,}/g) ?? []
  );

// =====================================================================
// 3. LECTURA DE UN LIBRO (etl/load.py)
// =====================================================================
const ENCABEZADOS_2026: Readonly<Record<number, string>> = {
  0: 'no. orden',
  1: 'radicado ente',
  2: 'ente externo',
  3: 'radicacion en',
  4: 'fecha radicacion',
  5: 'clase',
  6: 'organismo',
  7: 'asunto',
  8: 'dias habiles',
  9: 'fecha maxima',
  10: 'orfeo',
  11: 'fecha de respuesta',
  12: 'estado',
  13: 'observaciones'
};
/** Una hoja ya convertida: filas de celdas (al menos 16 columnas). */
export type Hoja = readonly (readonly Celda[])[];
export interface Inicio {
  fila: number;
  nuevo: boolean;
  faltan: string[];
}
/** ceInicio: formato 2026 en adelante (debajo de "No. Orden") o 2024-2025 (desde la fila 6). */
export function inicio(filas: Hoja): Inicio {
  for (let i = 0; i < Math.min(15, filas.length); i++) {
    const fila = filas[i] ?? [];
    const a = plegarEncabezado(fila[0]);
    if (a.startsWith('no. orden') || a === 'no orden') {
      const faltan = Object.entries(ENCABEZADOS_2026)
        .filter(([c, t]) => !plegarEncabezado(fila[+c]).includes(t))
        .map(([c, t]) => String.fromCharCode(65 + +c) + ': "' + t + '"');
      return { fila: i + 2, nuevo: true, faltan };
    }
  }
  return { fila: 6, nuevo: false, faltan: [] };
}
export interface Registro {
  vigencia: number;
  hoja: 'CONTROL' | 'NO RESPUESTA';
  fila_excel: number;
  rad_ente: Celda;
  fecha_oficio: Celda;
  ente: Celda;
  orfeo_entrada: Celda;
  fecha_radicacion: Celda;
  fecha_daci: Celda;
  dirigido: Celda;
  asunto: Celda;
  dias_habiles: Celda;
  fecha_max: Celda;
  responde: Celda;
  orfeo_resp: Celda;
  fecha_resp: Celda;
  estado: Celda;
  obs: Celda;
  clase: Celda;
}
const c = (r: readonly Celda[], i: number): Celda => r[i] ?? null;
/** ceLeerControl. */
export function leerControl(filas: Hoja, vig: number, ini: Inicio): Registro[] {
  const out: Registro[] = [];
  for (let i = ini.fila; i <= filas.length; i++) {
    const r = filas[i - 1] ?? [];
    if (!ini.nuevo) {
      if (!r.slice(1, 15).some(verdad)) continue;
      out.push({
        vigencia: vig,
        hoja: 'CONTROL',
        fila_excel: i,
        rad_ente: c(r, 1),
        fecha_oficio: c(r, 2),
        ente: c(r, 3),
        orfeo_entrada: c(r, 4),
        fecha_radicacion: c(r, 5),
        fecha_daci: c(r, 6),
        dirigido: c(r, 7),
        asunto: c(r, 8),
        dias_habiles: c(r, 9),
        fecha_max: c(r, 10),
        responde: c(r, 11),
        orfeo_resp: c(r, 12),
        fecha_resp: c(r, 13),
        estado: c(r, 14),
        obs: c(r, 15),
        clase: null
      });
    } else {
      if (!r.slice(1, 13).some(verdad)) continue;
      out.push({
        vigencia: vig,
        hoja: 'CONTROL',
        fila_excel: i,
        rad_ente: c(r, 1),
        fecha_oficio: null,
        ente: c(r, 2),
        orfeo_entrada: c(r, 3),
        fecha_radicacion: c(r, 4),
        fecha_daci: null,
        dirigido: c(r, 6),
        asunto: c(r, 7),
        dias_habiles: c(r, 8),
        fecha_max: c(r, 9),
        responde: null,
        orfeo_resp: c(r, 10),
        fecha_resp: c(r, 11),
        estado: c(r, 12),
        obs: c(r, 13),
        clase: c(r, 5)
      });
    }
  }
  return out;
}
const llaveAsunto = (ente: Celda, frad: Celda, asunto: Celda) =>
  [
    plegar(pyStr(ente)).slice(0, 40),
    (fecha(frad).d ?? 'NaT').slice(0, 10),
    plegar(pyStr(asunto)).slice(0, 40)
  ].join('\u0001');
/**
 * ceNoRespuesta (2024 y 2025): la hoja "NO RESPUESTA" registra oficios que no exigen respuesta; se incorporan como
 * "No requiere respuesta" los que no estén ya en CONTROL (mismo ORFEO de entrada, mismo número del ente, o mismo
 * ente + misma fecha + mismo inicio del asunto).
 */
export function noRespuesta(filasNR: Hoja | null, control: readonly Registro[], vig: number): Registro[] {
  if (!filasNR) return [];
  const T = new Set<string>(),
    R = new Set<string>(),
    A = new Set<string>();
  for (const x of control) {
    fichas(x.orfeo_entrada).forEach(t => T.add(t));
    if (!SIN_NUMERO.test(pyStr(verdad(x.rad_ente) ? x.rad_ente : '').trim()))
      R.add(pyStr(x.rad_ente).trim().toLowerCase());
    A.add(llaveAsunto(x.ente, x.fecha_radicacion, x.asunto));
  }
  const vistos = new Set<string>(),
    out: Registro[] = [];
  for (let i = 6; i <= filasNR.length; i++) {
    const r = filasNR[i - 1] ?? [];
    if (!r.slice(1, 9).some(verdad)) continue;
    const nr = {
      rad_ente: c(r, 1),
      fecha_oficio: c(r, 2),
      ente: c(r, 3),
      orfeo_entrada: c(r, 4),
      fecha_radicacion: c(r, 5),
      fecha_daci: c(r, 6),
      dirigido: c(r, 7),
      asunto: c(r, 8)
    };
    const t = fichas(nr.orfeo_entrada),
      rad = pyStr(verdad(nr.rad_ente) ? nr.rad_ente : '')
        .trim()
        .toLowerCase();
    if ((t.size && [...t].some(x => T.has(x))) || (rad && !SIN_NUMERO.test(rad) && R.has(rad))) continue;
    if (A.has(llaveAsunto(nr.ente, nr.fecha_radicacion, nr.asunto))) continue;
    const k = [[...t].sort().join(','), rad, plegar(pyStr(nr.asunto)).slice(0, 60)].join('\u0001');
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({
      vigencia: vig,
      hoja: 'NO RESPUESTA',
      fila_excel: i,
      ...nr,
      dias_habiles: null,
      fecha_max: null,
      responde: null,
      orfeo_resp: null,
      fecha_resp: null,
      estado: 'No requiere respuesta',
      obs: null,
      clase: 'Informativo'
    });
  }
  return out;
}

// =====================================================================
// 4. CLASIFICACIÓN (build() de etl/clean.py)
// =====================================================================
/** ceCorte: la fecha más reciente de radicación o respuesta. */
export function corte(regs: readonly Registro[]): string | null {
  let max: string | null = null;
  for (const r of regs)
    for (const v of [r.fecha_radicacion, r.fecha_resp]) {
      const f = fecha(v).d;
      if (f && (!max || f > max)) max = f;
    }
  return max;
}
/** Fila lista para public.historico_requerimientos (columnas de supabase/16_carga_excel.sql). */
export interface FilaHistorico {
  vigencia: number;
  hoja_excel: string;
  radicacion_ente: string | null;
  ente: string | null;
  orfeo_entrada: string | null;
  fecha_recibo: string | null;
  organismo: string;
  tipo_organismo: string;
  asunto: string | null;
  termino_dias_habiles: number | null;
  fecha_maxima: string | null;
  orfeo_respuesta: string | null;
  fecha_respuesta: string | null;
  respondio: string;
  tardia: string;
  oportunidad: string;
  retraso_dias_habiles: number | null;
  dias_habiles_responder: number | null;
  estado_excel: string | null;
  observaciones: string | null;
  fila_excel: number;
}
export interface FilaCalidad {
  vigencia: number;
  hoja: string;
  fila_excel: number;
  rad_ente: string | null;
  tipo: string;
  detalle: string;
}
/** ceClasificar: oportunidad, retrasos y filas para revisar. `hoy` es el corte de la medición. */
export function clasificar(
  regs: readonly Registro[],
  hoy: string
): { filas: FilaHistorico[]; calidad: FilaCalidad[] } {
  const out: FilaHistorico[] = [],
    calidad: FilaCalidad[] = [];
  for (const r of regs) {
    const q = (tipo: string, detalle: string) =>
      calidad.push({
        vigencia: r.vigencia,
        hoja: r.hoja,
        fila_excel: r.fila_excel,
        rad_ente: idStr(r.rad_ente),
        tipo,
        detalle
      });
    const fm = fecha(r.fecha_max),
      fr = fecha(r.fecha_resp),
      frad = fecha(r.fecha_radicacion).d,
      fdaci = fecha(r.fecha_daci).d;
    const fmax = fm.d,
      fresp = fr.d,
      frecibo = fdaci || frad;
    const dh = entero(r.dias_habiles);
    const requiere = r.hoja === 'NO RESPUESTA' ? false : r.vigencia >= 2026 ? dh != null && dh > 0 : true;
    if (r.vigencia < 2026 && dh == null)
      q('Término sin dato', 'Días hábiles vacío o no numérico: ' + pyStr(r.dias_habiles));
    const base = verdad(r.responde) ? r.responde : r.dirigido;
    let orgs = organismos(base);
    if (!orgs.length) orgs = organismos(r.dirigido);
    let org: string, nivel: string;
    const primero = orgs[0];
    if (primero) [org, nivel] = primero;
    else {
      org = 'Sin dato';
      nivel = 'Otro';
      q('Organismo vacío', 'No hay organismo responsable registrado');
    }
    if (nivel === 'Sin clasificar') q('Organismo sin clasificar', pyStr(base));
    const orfeoTxt = r.orfeo_resp == null || NO_APLICA.test(pyStr(r.orfeo_resp)) ? null : pyStr(r.orfeo_resp);
    const cerrado = pyStr(r.estado).toLowerCase() === 'cerrado';
    if (fr.malo) q('Fecha de respuesta ilegible', 'Valor en Excel: ' + fr.malo);
    if (fm.malo && requiere) q('Fecha máxima ilegible', 'Valor en Excel: ' + fm.malo);
    const respondio = !!fresp || (cerrado && orfeoTxt != null);
    let oport: string;
    if (requiere) {
      if (fresp && fmax) oport = fresp <= fmax ? 'A tiempo' : 'Tardía';
      else if (respondio) {
        oport = 'Respondida (sin fecha para medir)';
        q(
          'Respondida sin fecha medible',
          'Tiene ORFEO/estado cerrado pero la fecha de respuesta falta o es ilegible'
        );
      } else if (!fmax) {
        oport = 'Pendiente en término';
        q('Sin fecha máxima', 'No se puede evaluar el vencimiento');
      } else if (fmax < hoy) oport = 'Sin respuesta (vencida)';
      else oport = 'Pendiente en término';
    } else oport = 'No requiere respuesta';
    if (requiere && cerrado && !respondio)
      q('Cerrado sin respuesta', 'Estado Cerrado pero sin fecha ni radicado ORFEO de respuesta');
    if (requiere && !cerrado && respondio && r.estado != null)
      q('Abierto con respuesta', 'Estado "Abierto" pero ya tiene respuesta registrada');
    if (fresp && frecibo && fresp < frecibo)
      q('Respuesta anterior a recepción', 'Fecha de respuesta menor a la fecha de recibo');
    const retraso =
      oport === 'Tardía'
        ? habiles(fmax, fresp)
        : oport === 'Sin respuesta (vencida)'
          ? habiles(fmax, hoy)
          : null;
    const tiempo = requiere && fresp ? habiles(frecibo, fresp) : null;
    out.push({
      vigencia: r.vigencia,
      hoja_excel: r.hoja,
      radicacion_ente: idStr(r.rad_ente),
      ente: texto(r.ente),
      orfeo_entrada: idStr(r.orfeo_entrada),
      fecha_recibo: frecibo || null,
      organismo: org,
      tipo_organismo: nivel,
      asunto: texto(r.asunto),
      termino_dias_habiles: dh,
      fecha_maxima: fmax || null,
      orfeo_respuesta: orfeoTxt,
      fecha_respuesta: fresp || null,
      respondio: requiere ? (respondio ? 'Sí' : 'No') : 'No aplica',
      tardia: requiere ? (oport === 'Tardía' ? 'Sí' : 'No') : 'No aplica',
      oportunidad: oport,
      retraso_dias_habiles: retraso,
      dias_habiles_responder: tiempo,
      estado_excel: texto(r.estado),
      observaciones: texto(r.obs),
      fila_excel: r.fila_excel
    });
  }
  return { filas: out, calidad };
}
/** ceVigencia: la del nombre del archivo ("Vigencia 2026") o, si no, el año más frecuente de radicación. */
export function vigenciaDelLibro(nombreArchivo: string, regs: readonly Registro[]): number | null {
  const m = /vigencia[\s_-]*(20\d\d)/i.exec(nombreArchivo || '');
  if (m) return +(m[1] as string);
  const n: Record<string, number> = {};
  for (const r of regs) {
    const f = fecha(r.fecha_radicacion).d;
    if (f) n[f.slice(0, 4)] = (n[f.slice(0, 4)] ?? 0) + 1;
  }
  const y = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return y ? +y[0] : null;
}
export interface Libro {
  archivo: string;
  vigencia: number;
  control: Registro[];
  norep: Registro[];
  registros: Registro[];
}
/**
 * ceLeerLibro: lee un libro completo (sus hojas ya convertidas en celdas; null si la hoja no existe). Devuelve los
 * registros sin clasificar: la clasificación necesita el corte de todos los libros.
 */
export function leerLibro(
  hojas: { control: Hoja | null; noRespuesta: Hoja | null },
  nombreArchivo: string,
  vigForzada?: number
): Libro {
  const ctl = hojas.control;
  if (!ctl) throw new Error('«' + nombreArchivo + '» no tiene la hoja CONTROL.');
  const ini = inicio(ctl);
  let vig = vigForzada ?? null;
  const control = leerControl(ctl, vig ?? 0, ini);
  if (!vig) vig = vigenciaDelLibro(nombreArchivo, control);
  if (!vig)
    throw new Error(
      'No se pudo saber la vigencia de «' +
        nombreArchivo +
        '». Inclúyala en el nombre del archivo, por ejemplo "Vigencia 2026".'
    );
  if (ini.nuevo && ini.faltan.length)
    throw new Error(
      `Vigencia ${vig}: la hoja CONTROL cambió de columnas en la fila ${ini.fila - 1}. No coinciden: ${ini.faltan.join('; ')}`
    );
  if (!ini.nuevo && vig >= 2026)
    throw new Error(`Vigencia ${vig}: no se encontró la fila de encabezados "No. Orden" en la hoja CONTROL.`);
  for (const x of control) x.vigencia = vig;
  const norep = noRespuesta(vig < 2026 ? hojas.noRespuesta : null, control, vig);
  return { archivo: nombreArchivo, vigencia: vig, control, norep, registros: control.concat(norep) };
}

// =====================================================================
// 5. COMPARACIÓN CON LO CARGADO (ceVistaPrevia) Y ARCHIVO DE REVISIÓN (ceDescargarCalidad)
// =====================================================================
/** ceClave: la misma llave del histórico (vigencia|ORFEO de entrada|radicado del ente|organismo). */
export const llaveFila = (
  f: Pick<FilaHistorico, 'vigencia' | 'orfeo_entrada' | 'radicacion_ente' | 'organismo'>
) => [f.vigencia, f.orfeo_entrada || '', f.radicacion_ente || '', f.organismo].join('|');
export const OPORTUNIDAD_ABIERTA = ['Sin respuesta (vencida)', 'Pendiente en término'];

export const archivoCalidad = (vigs: readonly number[]) => 'filas_para_revisar_' + vigs.join('_') + '.csv';
export function filasCsvCalidad(calidad: readonly FilaCalidad[]): unknown[][] {
  return [
    ['Vigencia', 'Hoja', 'Fila del Excel', 'Radicado del ente', 'Problema', 'Detalle'],
    ...calidad.map(q => [q.vigencia, q.hoja, q.fila_excel, q.rad_ente || '', q.tipo, q.detalle])
  ];
}
/** Tipos de problema que se muestran en rojo y los que se cuentan como graves. */
export const esProblemaRojo = (tipo: string) => /ilegible|vacío|Cerrado sin/.test(tipo);
export const esProblemaGrave = (tipo: string) => /ilegible|vacío/.test(tipo);

/** Resumen de cada vigencia frente a lo ya cargado (ceVistaPrevia de la 2.x). */
export interface ResumenVigencia {
  vigencia: number;
  archivo: string;
  n: number;
  ctl: number;
  nr: number;
  nuevos: number;
  cambian: number;
  salen: number;
  abN: number;
  abA: number;
  hay: number;
}
export function compararConCargado(
  libros: readonly Libro[],
  filas: readonly FilaHistorico[],
  cargado: readonly {
    v: number;
    orfE: string | null;
    rad: string | null;
    org: string;
    opo: number;
    cerradaApp?: boolean;
  }[],
  nombreOportunidad: readonly string[]
): ResumenVigencia[] {
  return libros.map(l => {
    const nuevas = filas.filter(f => f.vigencia === l.vigencia);
    const antes = cargado.filter(r => r.v === l.vigencia);
    const llaveAntes = (r: (typeof antes)[number]) => [r.v, r.orfE || '', r.rad || '', r.org].join('|');
    const kAntes = new Map(antes.map(r => [llaveAntes(r), r])),
      kNuevas = new Map(nuevas.map(f => [llaveFila(f), f]));
    let nuevos = 0,
      cambian = 0;
    for (const f of nuevas) {
      const a = kAntes.get(llaveFila(f));
      if (!a) nuevos++;
      else if (!a.cerradaApp && nombreOportunidad[a.opo] !== f.oportunidad) cambian++;
    }
    const salen = antes.filter(r => !kNuevas.has(llaveAntes(r))).length;
    return {
      vigencia: l.vigencia,
      archivo: l.archivo,
      n: nuevas.length,
      ctl: l.control.length,
      nr: l.norep.length,
      nuevos,
      cambian,
      salen,
      abN: nuevas.filter(f => OPORTUNIDAD_ABIERTA.includes(f.oportunidad)).length,
      abA: antes.filter(r => r.opo === 2 || r.opo === 3).length,
      hay: antes.length
    };
  });
}
/** Corte de la medición: lo más reciente de los archivos o de lo ya cargado, nunca después de hoy (ceLeerArchivos). */
export function corteDeCarga(registros: readonly Registro[], corteCargado: string, hoy: string): string {
  let c = corte(registros) || '';
  if (corteCargado && corteCargado > c) c = corteCargado;
  if (!c || c > hoy) c = hoy;
  return c;
}
