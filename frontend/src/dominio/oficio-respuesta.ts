// «Proyectar respuesta» (script 30, aprobado el 24-nov-2026): borrador del oficio de respuesta a un requerimiento,
// armado sobre la plantilla ORFEO de la dependencia (.docx con membrete, pie y recuadro de radicado).
//  · El recuadro de ORFEO (*RAD_S*, *F_RAD_S*, *TRD_S*, *RAD_E_PADRE*) NO se toca: lo llena ORFEO al radicar.
//  · Si la plantilla trae el formato oficial (NOMBRE COMPLETO, Cargo, Razón Social, Asunto, Saludo, Texto…), se
//    reemplaza cada línea; si viene con el cuerpo vacío (Despacho, Secretaría Privada), se agrega el oficio completo
//    debajo del recuadro.
//  · Lo que debe completar la dependencia queda RESALTADO EN AMARILLO (la respuesta de fondo, anexos, etc.).
// Sin dependencias nuevas: el .docx (un ZIP) se abre y se escribe con el CFB de SheetJS, como formato-causas.ts.
import type * as XLSX from 'xlsx';
import { esHabil } from './dias-habiles';
import { sumarDias } from './fechas';

type SheetJS = typeof XLSX;

// Sin depender de las definiciones del navegador (esta capa también se compila para Node)
const G = globalThis as unknown as {
  TextDecoder: new (etiqueta?: string) => { decode(b: Uint8Array): string };
  TextEncoder: new () => { encode(s: string): Uint8Array };
};

export interface DatosOficio {
  radicado: string;
  /** Fechas ISO (AAAA-MM-DD). */
  fechaRadicacion: string;
  fechaLimite: string;
  asunto: string;
  ente: string;
  titularNombre: string;
  titularCargo: string;
  dependencia: string;
  remitenteNombre: string;
  remitenteCargo: string;
  /** Quien genera el oficio (línea «Proyectó»). */
  proyecto: string;
  ciudad?: string;
}

export interface Linea {
  texto: string;
  /** true: lo completa la dependencia (resaltado en amarillo). */
  pendiente: boolean;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
];

/** 2026-11-23 → «23 de noviembre de 2026». */
export function fechaLarga(f: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || '');
  if (!m) return f || '';
  return `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

/** Días hábiles entre la radicación (sin contarla) y la fecha límite (contándola), sin fines de semana ni festivos. */
export function plazoHabiles(desde: string, hasta: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta <= desde) return 0;
  let n = 0;
  for (let f = sumarDias(desde, 1); f <= hasta && n < 400; f = sumarDias(f, 1)) if (esHabil(f)) n++;
  return n;
}

const UNIDADES = [
  'cero',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve'
];
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta'];
/** Número en letras (1 a 69), para «quince (15) días hábiles». Fuera de ese rango, el número. */
export function enLetras(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 69) return String(n);
  if (n < 30) return UNIDADES[n] ?? String(n);
  const d = DECENAS[Math.floor(n / 10)] ?? '',
    u = n % 10;
  return u ? `${d} y ${UNIDADES[u]}` : d;
}

/** «la Secretaría…», «el Departamento…» (DA = Departamento Administrativo; Despacho y Concejo, masculinos). */
export const conArticulo = (dep: string) =>
  (/^(Departamento|DA\b|Despacho|Concejo)/i.test(dep.trim()) ? 'el ' : 'la ') + dep.trim();

const pendienteSi = (v: string, relleno: string): Linea =>
  v.trim() ? { texto: v.trim(), pendiente: false } : { texto: relleno, pendiente: true };

/** Líneas del oficio, una por cada campo del formato oficial de comunicaciones. */
export function lineasOficio(d: DatosOficio) {
  const plazo = plazoHabiles(d.fechaRadicacion, d.fechaLimite);
  const termino = plazo
    ? `, y dentro del término de ${enLetras(plazo)} (${plazo}) días hábiles concedido, que vence el ${fechaLarga(d.fechaLimite)}`
    : d.fechaLimite
      ? `, dentro del término concedido, que vence el ${fechaLarga(d.fechaLimite)}`
      : '';
  const proyecto = d.proyecto.trim();
  return {
    titular: d.titularNombre.trim()
      ? { texto: 'Doctor(a) ' + d.titularNombre.trim(), pendiente: false }
      : { texto: 'Doctor(a) [NOMBRE DEL TITULAR DEL ENTE]', pendiente: true },
    cargoTitular: pendienteSi(d.titularCargo, '[Cargo del titular del ente]'),
    ente: pendienteSi(d.ente, '[Nombre del ente de control]'),
    ciudad: { texto: d.ciudad?.trim() || 'Santiago de Cali', pendiente: false },
    asunto: {
      texto: `Asunto: Respuesta al requerimiento radicado No. ${d.radicado} del ${fechaLarga(d.fechaRadicacion)} – ${d.asunto.trim()}`,
      pendiente: false
    },
    saludo: { texto: 'Respetado(a) doctor(a):', pendiente: false },
    introduccion: {
      texto:
        `En atención a su comunicación radicada en la Alcaldía de Santiago de Cali con el No. ${d.radicado} del ` +
        `${fechaLarga(d.fechaRadicacion)}, relacionada con «${d.asunto.trim()}»${termino}, ${conArticulo(d.dependencia)} ` +
        'se permite dar respuesta en los siguientes términos:',
      pendiente: false
    },
    fondo: {
      texto:
        '[Escriba aquí la respuesta de fondo: lo que hizo la dependencia, las cifras y los soportes que la respaldan, punto por punto según lo solicitado.]',
      pendiente: true
    },
    despedida: { texto: 'Atentamente,', pendiente: false },
    remitente: d.remitenteNombre.trim()
      ? { texto: d.remitenteNombre.trim().toUpperCase(), pendiente: false }
      : { texto: '[NOMBRE DE QUIEN FIRMA]', pendiente: true },
    cargoRemitente: pendienteSi(d.remitenteCargo, '[Cargo de quien firma]'),
    dependencia: { texto: d.dependencia.trim(), pendiente: false },
    anexos: { texto: 'Anexos: [indique formato y número de folios, o borre esta línea]', pendiente: true },
    copia: { texto: 'CC. [opcional: nombre – cargo, o borre esta línea]', pendiente: true },
    proyecto: proyecto
      ? { texto: 'Proyectó: ' + proyecto, pendiente: false }
      : { texto: 'Proyectó: [nombre completo – cargo]', pendiente: true },
    elaboro: { texto: 'Elaboró: [nombre completo – cargo]', pendiente: true },
    reviso: { texto: 'Revisó: [nombre completo – cargo]', pendiente: true }
  } satisfies Record<string, Linea>;
}
type Clave = keyof ReturnType<typeof lineasOficio>;

// ---------- XML de Word ----------
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Texto visible de un párrafo (une los w:t). */
const textoDe = (p: string) =>
  [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
    .map(m => m[1])
    .join('')
    .replace(/&amp;/g, '&');

/** Párrafos de primer nivel del cuerpo (los del recuadro de ORFEO viven DENTRO de un párrafo: se respetan). */
export function parrafosPrincipales(xml: string): { ini: number; fin: number }[] {
  const re = /<w:p[\s>]|<\/w:p>/g;
  const r: { ini: number; fin: number }[] = [];
  let nivel = 0,
    ini = -1;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0] === '</w:p>') {
      nivel--;
      if (nivel === 0 && ini >= 0) {
        r.push({ ini, fin: m.index + 6 });
        ini = -1;
      }
    } else {
      // <w:pPr> y <w:pStyle> no coinciden (exigen espacio o «>»); un párrafo vacío <w:p .../> no abre nada
      const cierre = xml.indexOf('>', m.index);
      if (xml[cierre - 1] === '/') continue;
      if (nivel === 0) ini = m.index;
      nivel++;
    }
  }
  return r;
}

// Orden de los hijos de <w:rPr> (esquema de Word): highlight va antes de estos
const DESPUES_DE_HIGHLIGHT = [
  'w:u',
  'w:effect',
  'w:bdr',
  'w:shd',
  'w:fitText',
  'w:vertAlign',
  'w:rtl',
  'w:cs',
  'w:em',
  'w:lang',
  'w:eastAsianLayout',
  'w:specVanish',
  'w:oMath'
];
function conResaltado(rPr: string, amarillo: boolean): string {
  let x = rPr.replace(/<w:highlight\b[^>]*\/>/g, '');
  if (!amarillo) return x;
  if (!x) return '<w:rPr><w:highlight w:val="yellow"/></w:rPr>';
  const pos = DESPUES_DE_HIGHLIGHT.map(t => x.search(new RegExp(`<${t}[\\s/>]`)))
    .filter(i => i >= 0)
    .sort((a, b) => a - b)[0];
  const corte = pos ?? x.lastIndexOf('</w:rPr>');
  x = x.slice(0, corte) + '<w:highlight w:val="yellow"/>' + x.slice(corte);
  return x;
}

/** Reemplaza el contenido de un párrafo conservando su formato (pPr) y el formato de su primer texto (rPr). */
function reescribir(p: string, l: Linea): string {
  const pPr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(p)?.[0] ?? '';
  const primerRun = /<w:r[\s>][\s\S]*?<\/w:r>/.exec(p)?.[0] ?? '';
  const rPr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(primerRun)?.[0] ?? '';
  const abre = /^<w:p(?:\s[^>]*)?>/.exec(p)?.[0] ?? '<w:p>';
  return `${abre}${pPr}<w:r>${conResaltado(rPr, l.pendiente)}<w:t xml:space="preserve">${esc(l.texto)}</w:t></w:r></w:p>`;
}
// Párrafos agregados (plantillas con el cuerpo vacío): Arial 12 sin negrilla, como el formato oficial
const LETRA =
  '<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:b w:val="0"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
const nuevoParrafo = (l: Linea | null) =>
  l
    ? `<w:p><w:pPr><w:jc w:val="both"/></w:pPr><w:r>${conResaltado(LETRA, l.pendiente)}<w:t xml:space="preserve">${esc(l.texto)}</w:t></w:r></w:p>`
    : '<w:p/>';

/** Qué campo del formato oficial es este párrafo (por su texto de ejemplo). */
function campoDe(t: string, cargos: number): Clave | 'cargo' | null {
  const s = t.trim();
  if (!s) return null;
  if (s === 'NOMBRE COMPLETO') return 'titular';
  if (s === 'Cargo') return cargos === 0 ? 'cargoTitular' : 'cargoRemitente';
  if (s === 'Razón Social') return 'ente';
  if (s.startsWith('Ciudad y/o Direcci')) return 'ciudad';
  if (s.startsWith('Asunto:')) return 'asunto';
  if (s === 'Saludo') return 'saludo';
  if (s.startsWith('Texto')) return 'introduccion';
  if (/^\.{4}/.test(s)) return 'fondo';
  if (s === 'Despedida') return 'despedida';
  if (s === 'NOMBRE DEL REMITENTE') return 'remitente';
  if (s === 'Organismo/Dependencia') return 'dependencia';
  if (s.startsWith('Anexos:')) return 'anexos';
  if (s.startsWith('CC.')) return 'copia';
  if (s.startsWith('Proyectó:')) return 'proyecto';
  if (s.startsWith('Elaboró:')) return 'elaboro';
  if (s.startsWith('Revisó:')) return 'reviso';
  return null;
}

const esOrfeo = (p: string) => /RAD_S|RAD_E_PADRE|Al contestar/.test(p);

/** Llena el cuerpo del documento (word/document.xml). Devuelve el XML nuevo y cuántos campos llenó. */
export function llenarDocumentoXml(
  xml: string,
  d: DatosOficio
): { xml: string; campos: number; modo: 'formato' | 'agregado' } {
  const L = lineasOficio(d);
  const ps = parrafosPrincipales(xml);
  let salida = '',
    desde = 0,
    campos = 0,
    cargos = 0;
  const usados = new Set<string>();
  for (const { ini, fin } of ps) {
    const p = xml.slice(ini, fin);
    if (esOrfeo(p)) continue;
    const c = campoDe(textoDe(p), cargos);
    if (!c || usados.has(c)) continue;
    if (c === 'cargoTitular' || c === 'cargoRemitente') cargos++;
    usados.add(c);
    salida += xml.slice(desde, ini) + reescribir(p, L[c as Clave]);
    desde = fin;
    campos++;
  }
  salida += xml.slice(desde);
  if (usados.has('asunto')) return { xml: salida, campos, modo: 'formato' };

  // Plantilla sin el formato oficial en el cuerpo: se agrega el oficio completo debajo del recuadro de ORFEO
  const orden: (Clave | null)[] = [
    'titular',
    'cargoTitular',
    'ente',
    'ciudad',
    null,
    'asunto',
    null,
    'saludo',
    null,
    'introduccion',
    null,
    'fondo',
    null,
    'despedida',
    null,
    null,
    null,
    'remitente',
    'cargoRemitente',
    'dependencia',
    null,
    'anexos',
    'copia',
    'proyecto',
    'elaboro',
    'reviso'
  ];
  const bloque = '<w:p/>' + orden.map(c => nuevoParrafo(c ? L[c] : null)).join('');
  const recuadro = ps.find(({ ini, fin }) => esOrfeo(xml.slice(ini, fin)));
  const pos = recuadro ? recuadro.fin : xml.indexOf('<w:body>') + 8;
  return {
    xml: xml.slice(0, pos) + bloque + xml.slice(pos),
    campos: orden.filter(Boolean).length,
    modo: 'agregado'
  };
}

/** Llena la plantilla (.docx) y devuelve el .docx del oficio. */
export function llenarOficio(
  X: SheetJS,
  plantilla: Uint8Array,
  d: DatosOficio
): { docx: Uint8Array; campos: number; modo: 'formato' | 'agregado' } {
  const z = X.CFB.read(plantilla, { type: 'array' });
  const i = z.FullPaths.findIndex(
    (x: string) => x.endsWith('/word/document.xml') || x === 'word/document.xml'
  );
  const e = z.FileIndex[i];
  if (i < 0 || !e) throw new Error('La plantilla no es un documento de Word (.docx) válido.');
  const r = llenarDocumentoXml(new G.TextDecoder().decode(e.content as Uint8Array), d);
  e.content = new G.TextEncoder().encode(r.xml) as unknown as typeof e.content;
  e.size = (e.content as Uint8Array).length;
  const salida = X.CFB.write(z, { type: 'array', fileType: 'zip', compression: true }) as unknown;
  return {
    docx: salida instanceof Uint8Array ? salida : new Uint8Array(salida as ArrayLike<number>),
    campos: r.campos,
    modo: r.modo
  };
}

/** Nombre del archivo: Respuesta_<radicado>_<dependencia>.docx */
export const nombreOficio = (radicado: string, dependencia: string) =>
  `Respuesta_${radicado}_${dependencia}`.replace(/[^A-Za-z0-9ÁÉÍÓÚáéíóúÑñ_-]+/g, '_').slice(0, 120) + '.docx';

/** Ruta de la plantilla de una dependencia en el depósito «plantillas». */
export const rutaPlantilla = (dependenciaId: number) => `oficio/dep-${dependenciaId}.docx`;

/** ¿El archivo parece un .docx? (ZIP con word/document.xml, sin abrirlo entero). */
export const pareceDocx = (b: Uint8Array) =>
  b.length > 4 &&
  b[0] === 0x50 &&
  b[1] === 0x4b &&
  new G.TextDecoder('latin1').decode(b).includes('word/document.xml');
