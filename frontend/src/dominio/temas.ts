// Temas de los requerimientos y cruces entre entes. Copia de la 2.x: src/js/11-cruces-y-temas.js (TEMA_DEF, TEMA_PESO,
// TEMA_LBL, TEMA_SUST, FAMILIAS, nrmTxt, famOf, temasAuto, RX_CONTRATO, RX_PROCESO, RX_IDS, ID_LBL, idsOf, idShow,
// rowKey y fechaOf). La lista de palabras se copió con un programa, sin cambios. Paridad en pruebas/paridad-cruces.test.ts.
// Reglas fijas sobre el asunto, sin adivinar: si ninguna aplica, el requerimiento queda "Sin clasificar".
import type { RadicadoHistorico } from './historico';

/** [clave, nombre, patrones] de cada tema, en el orden de la 2.x (en empate gana el primero). */
const DEFINICION: readonly (readonly [string, string, readonly string[]])[] = [
  [
    'contractual',
    'Contractual',
    [
      'contrat',
      'contractual',
      'convenio',
      'licitaci',
      'proceso de seleccion',
      'secop',
      'sia observa',
      'interventor',
      'contratistas?',
      'orden de (compra|servicio|prestacion)',
      'liquidacion del? (contrato|convenio)',
      'comodato',
      'muestra contractual',
      'gestion contractual',
      'colombia compra',
      'acuerdo marco',
      '\\brup\\b'
    ]
  ],
  [
    'fiscal',
    'Fiscal y presupuestal',
    [
      'fiscal',
      'presupuest',
      'auditoria financiera',
      '\\bafgr\\b',
      '\\baef\\b',
      'ejecucion de (los )?recursos',
      'recursos (publicos|del sgp|asignados|girados)',
      '\\bsgp\\b',
      'sistema general de participaciones',
      'regalias',
      '\\bpoai\\b',
      'vigencias? futuras',
      'estados? financieros?',
      'tesoreria',
      '\\bdeuda\\b',
      'hallazgo',
      'detrimento',
      'patrimonio publico',
      'impuesto',
      'predial',
      'cartera',
      'rendicion (de la )?cuenta',
      '\\bprf\\b',
      'responsabilidad fiscal',
      'certificacion de ingresos',
      'pagos?\\b',
      'giros?\\b'
    ]
  ],
  [
    'disciplinario',
    'Disciplinario y judicial',
    [
      'disciplinari',
      '\\bius\\b',
      '\\biuc\\b',
      '\\biucd\\b',
      'sinproc',
      'indagacion',
      'investigacion',
      'proceso penal',
      '\\bspoa\\b',
      'fiscalia',
      'tutela',
      'fallo',
      'accion popular',
      'accion de cumplimiento',
      'juzgado',
      'tribunal',
      'sentencia',
      'desacato',
      'medida cautelar',
      'pliego de cargos',
      'ley 1437',
      'conciliacion',
      '\\b\\d{3}-\\d{4}-\\d{5}-\\d{2}\\b',
      '\\b\\d{4}-\\d{5}-\\d{2}\\b'
    ]
  ],
  [
    'peticion',
    'Peticiones y quejas ciudadanas',
    [
      'derecho de peticion',
      '\\bpeticion',
      '\\btraslado\\b',
      'queja',
      'pqrs',
      'denuncia ciudadana',
      'traslado por competencia',
      'remision por competencia',
      'rem.si.n por competencia',
      'peticionari',
      'reclamo',
      'veeduria',
      'ciudadan[oa]s?\\b'
    ]
  ],
  [
    'ddhh',
    'Derechos humanos y protección',
    [
      'defensorial',
      'ruta de proteccion',
      'amenaza',
      'victima',
      'derechos humanos',
      'desplazad',
      'migrant',
      'indigena',
      'afro',
      'personas trans',
      'lgbt',
      'ninez',
      'ninos',
      'adolescente',
      'adulto mayor',
      'discapacidad',
      'alerta temprana',
      'mujer(es)?\\b',
      'genero',
      'habitantes? de (la )?calle',
      'restitucion de tierra',
      'conflicto armado',
      'lideres sociales',
      'proteccion'
    ]
  ],
  [
    'obras',
    'Obras, bienes e infraestructura',
    [
      '\\bobras?\\b',
      'elefantes? blancos?',
      'proyectos? criticos?',
      'infraestructura',
      'adecuacion',
      'reparacion',
      'mantenimiento',
      'inmuebles?',
      'predios?',
      'plaza de mercado',
      '\\bvias?\\b',
      'malla vial',
      'puentes?',
      'escenarios?',
      'instalaciones',
      'construccion',
      'espacio publico',
      'alumbrado',
      'parques?',
      'calle \\d'
    ]
  ],
  [
    'administrativo',
    'Administrativo y de gestión',
    [
      'informe de gestion',
      'plan de mejoramiento',
      'accion preventiva',
      'preventivo',
      'auditoria de cumplimiento',
      'auditoria de desempeno',
      'talento humano',
      'planta de personal',
      'nomina',
      'funcionari',
      'archivo',
      'gestion documental',
      'plan(es)? de desarrollo',
      '\\bmetas?\\b',
      'indicadores',
      'control interno',
      'manual de funciones',
      'empleos?',
      'carrera administrativa',
      'concurso',
      'transparencia',
      'pagina web',
      'informe anual',
      'certificaci'
    ]
  ],
  [
    'servicios',
    'Servicios sociales, salud y ambiente',
    [
      'salud',
      '\\beps\\b',
      'hospital',
      'educacion',
      'colegio',
      'instituci[oa]n educativa',
      '\\bpae\\b',
      'alimentacion escolar',
      'vivienda',
      'subsidio',
      'servicios publicos',
      '\\bagua\\b',
      'ambient',
      'recursos naturales',
      'arbol',
      'residuos',
      'basuras?',
      'movilidad',
      'transito',
      'seguridad',
      'camaras',
      'cultura',
      'deporte',
      'programa',
      'ola invernal',
      'emergencia',
      'riesgo'
    ]
  ]
];
export const TEMAS = DEFINICION.map(([k, l, ps]) => ({ k, l, rx: ps.map(p => new RegExp(p)) }));

/** Los sectores generales pesan menos que un tema específico. */
const PESO: Readonly<Record<string, number>> = { servicios: 0.5, administrativo: 0.8 };
export const NOMBRE_TEMA: Readonly<Record<string, string>> = {
  ...Object.fromEntries(TEMAS.map(t => [t.k, t.l])),
  sin: 'Sin clasificar'
};
export const CLAVES_TEMA = TEMAS.map(t => t.k);
/** Temas sustantivos: los únicos que generan alertas de "mismo tema". */
export const TEMAS_SUSTANTIVOS = ['contractual', 'fiscal', 'disciplinario', 'obras'];
export const FAMILIAS = ['Contraloría', 'Procuraduría', 'Personería', 'Defensoría', 'Otro'] as const;

/** Texto sin tildes, en minúsculas y con espacios simples (nrmTxt de la 2.x). */
export const normalizarTexto = (s: unknown) =>
  String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ');

/** Familia del ente de control (famOf de la 2.x). */
export function familiaDe(ente: string): string {
  const t = normalizarTexto(ente);
  return t.includes('contralor')
    ? 'Contraloría'
    : t.includes('procura')
      ? 'Procuraduría'
      : t.includes('personer')
        ? 'Personería'
        : t.includes('defensor')
          ? 'Defensoría'
          : 'Otro';
}

export interface TemaDetectado {
  k: string;
  n: number;
  /** Palabras del asunto que dieron el tema. */
  why: string[];
}

/** Temas del asunto por reglas fijas, del más fuerte al más débil (temasAuto de la 2.x). */
export function temasAuto(asunto: unknown): TemaDetectado[] {
  const t = normalizarTexto(asunto),
    hits: TemaDetectado[] = [];
  for (const d of TEMAS) {
    const why: string[] = [];
    for (const rx of d.rx) {
      const m = t.match(rx);
      if (m) why.push(m[0].trim());
    }
    if (why.length) hits.push({ k: d.k, n: why.length * (PESO[d.k] || 1), why });
  }
  return hits.sort((a, b) => b.n - a.n); // estable: en empate conserva el orden de la lista
}

const RX_CONTRATO =
  /\b(4\d{3})\s?[.,]\s?(\d{3})\s?[.,]\s?(\d{2})\s?[.,]\s?(\d)\s?[.,]\s?(\d{1,5})\s?(?:[-.]|de|del)\s?((?:20)?\d{2})(?!\d)/g;
const RX_PROCESO = /\b(4\d{3})\.(\d{3})\.(3\d)\.(\d{3,4})\s?-\s?(\d{4})\b/g;
const RX_IDS: readonly (readonly [string, RegExp, (m: RegExpMatchArray) => string])[] = [
  [
    'ius',
    /\b(iu[sc])\s?-?\s?([a-z])\s?-?\s?(\d{4})\s?-\s?(\d{4,8})\b/g,
    m => `${(m[1] ?? '').toUpperCase()}-${(m[2] ?? '').toUpperCase()}-${m[3]}-${+(m[4] ?? 0)}`
  ],
  [
    'prf',
    /\bprf\s?-\s?(\d{3,6})\s?-\s?(\d{4})\s?-\s?(\d{3,6})\b/g,
    m => `PRF-${+(m[1] ?? 0)}-${m[2]}-${+(m[3] ?? 0)}`
  ],
  [
    'expediente_pgn',
    /\b([de])\s?-\s?(\d{4})\s?-\s?(\d{6,8})\b/g,
    m => `${(m[1] ?? '').toUpperCase()}-${m[2]}-${+(m[3] ?? 0)}`
  ],
  ['sinproc', /sinproc[^0-9]{0,8}(\d{5,8})/g, m => `SINPROC ${+(m[1] ?? 0)}`],
  [
    'cedula',
    /\bc\.?\s?c\.?\s?(?:no\.?)?\s?:?\s?(\d{1,3}(?:\.\d{3}){2,3}|\d{7,10})\b/g,
    m => (m[1] ?? '').replace(/\./g, '')
  ],
  ['radicado', /(?:^|[^\d.-])(\d{10,21})(?![\d.-])/g, m => m[1] ?? '']
];
export const NOMBRE_ID: Readonly<Record<string, string>> = {
  contrato: 'Contrato',
  proceso: 'Proceso de selección',
  ius: 'Expediente IUS/IUC',
  prf: 'Proceso de responsabilidad fiscal',
  expediente_pgn: 'Expediente Procuraduría',
  sinproc: 'SINPROC',
  cedula: 'Ciudadano (documento)',
  radicado: 'Radicado'
};

export interface Identificador {
  k: string;
  v: string;
}

/** Números citados en el asunto: contrato, proceso, expedientes, radicados y documentos (idsOf de la 2.x). */
export function idsDe(asunto: unknown): Identificador[] {
  const t = normalizarTexto(asunto),
    out = new Map<string, Identificador>(),
    add = (k: string, v: string) => out.set(k + ':' + v, { k, v });
  const y4 = (y: string | undefined) => {
    const n = +(y ?? 0);
    return n < 100 ? n + 2000 : n;
  };
  for (const m of t.matchAll(RX_CONTRATO))
    add('contrato', `${m[1]}.${m[2]}.${m[3]}.${m[4]}.${+(m[5] ?? 0)}-${y4(m[6])}`);
  for (const m of t.matchAll(RX_PROCESO)) add('proceso', `${m[1]}.${m[2]}.${m[3]}.${+(m[4] ?? 0)}-${m[5]}`);
  for (const [k, rx, f] of RX_IDS) {
    for (const m of t.matchAll(rx)) {
      const v = f(m);
      if (k === 'radicado' && v.length === 10 && v[0] === '3') continue;
      if (k === 'cedula' && !(v.length >= 6 && v.length <= 10)) continue;
      add(k, v);
    }
  }
  const ced = new Set([...out.values()].filter(x => x.k === 'cedula').map(x => x.v));
  return [...out.values()].filter(x => !(x.k === 'radicado' && ced.has(x.v)));
}

/** Cómo se muestra un identificador: del documento solo los últimos 3 dígitos (idShow de la 2.x). */
export const mostrarId = (x: Identificador) =>
  x.k === 'cedula' ? 'C.C. terminada en ' + x.v.slice(-3) : x.v;

/** Llave estable de un requerimiento del histórico (rowKey de la 2.x; es la llave de tema_manual). */
export const llaveFila = (r: Pick<RadicadoHistorico, 'v' | 'orfE' | 'rad' | 'org'>) =>
  [r.v, r.orfE || '', r.rad || '', r.org].join('|');

/** Fecha del requerimiento: recibo o, si falta, fecha máxima (fechaOf de la 2.x). */
export const fechaDe = (r: Pick<RadicadoHistorico, 'rec' | 'fmax'>) =>
  String(r.rec || r.fmax || '').slice(0, 10);
