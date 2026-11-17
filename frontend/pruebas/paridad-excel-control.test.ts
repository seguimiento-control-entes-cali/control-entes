// Paridad con la 2.x · carga del Excel de control. Libros de prueba con datos FICTICIOS (nada real) en los dos formatos
// (2024-2025 desde la fila 6 con hoja NO RESPUESTA, y 2026 con encabezados "No. Orden"), leídos con SheetJS 0.20.3 y
// procesados por el código REAL de la 2.x (ceLeerLibro, ceClasificar, ceOrganismos, ceHabiles y ceFecha de
// src/js/20-carga-excel.js) y por la 3.0. Deben dar exactamente los mismos registros, clasificación y filas a revisar.
import { describe, expect, it } from 'vitest';
import * as X from 'xlsx';
import cargarApp from '../../tests/cargar-app.cjs';
import { hojaComoCeldas } from '../src/features/configuracion/leer-excel';
import {
  clasificar,
  corte,
  fecha,
  habiles,
  leerLibro,
  organismos,
  type Celda
} from '../src/dominio/excel-control/lectura';

const d2 = cargarApp(['ceLeerLibro', 'ceClasificar', 'ceCorte', 'ceOrganismos', 'ceHabiles', 'ceFecha']) as {
  ceLeerLibro: (x: typeof X, wb: X.WorkBook, nombre: string) => { registros: unknown[]; vigencia: number };
  ceClasificar: (regs: unknown[], hoy: string) => { filas: unknown[]; calidad: unknown[] };
  ceCorte: (regs: unknown[]) => string | null;
  ceOrganismos: (t: unknown) => [string, string][];
  ceHabiles: (a: string, b: string) => number | null;
  ceFecha: (v: unknown) => { d: string | null; malo: string | null };
};
const plano = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;
const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

/** Escribe el libro como .xlsx y lo vuelve a leer como lo hace la app (cellNF y bookFiles). */
function libro(hojas: Record<string, unknown[][]>): X.WorkBook {
  const wb = X.utils.book_new();
  for (const [n, filas] of Object.entries(hojas))
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(filas, { cellDates: true }), n);
  const bin = X.write(wb, { type: 'array', bookType: 'xlsx', cellDates: false }) as ArrayBuffer;
  return X.read(new Uint8Array(bin), { type: 'array', cellNF: true, bookFiles: true });
}
const vacias = (n: number) => Array.from({ length: n }, () => [] as unknown[]);

// Formato 2024-2025: 16 columnas desde la fila 6 (A: orden … P: observaciones)
const F2025 = [
  ...vacias(5),
  [
    1,
    'CGR-001',
    D(2025, 1, 10),
    'Contraloría General de la República',
    '20254100012345',
    D(2025, 1, 13),
    null,
    'Secretaría de Salud',
    'Solicitud de información de prueba',
    10,
    D(2025, 1, 27),
    null,
    '20254100099999',
    D(2025, 1, 24),
    'Cerrado',
    null
  ],
  [
    2,
    'PGN 77',
    '15-ene-2025',
    'Procuraduría General de la Nación',
    '20254100012346',
    '16-ene-25',
    null,
    'Secretaria de Educacion, Secretaría de Salud',
    'Otra solicitud ficticia',
    5,
    '23/01/2025',
    null,
    'N/A',
    null,
    'Abierto',
    'sin respuesta'
  ],
  [
    3,
    'SN',
    null,
    'Personería Municipal',
    '20254100012347',
    D(2025, 2, 3),
    D(2025, 2, 4),
    'despacho alcalde',
    'Tercera solicitud',
    'diez',
    D(2025, 2, 17),
    'Oficina inexistente de prueba',
    null,
    D(2025, 2, 20),
    'Cerrado',
    null
  ],
  [
    4,
    'CB-9',
    null,
    'Contraloría de Bogotá',
    '20254100012348',
    D(2025, 3, 3),
    null,
    'Secretaría de Movilidad',
    'Cuarta solicitud',
    10,
    '32/13/2025',
    null,
    '20254100088888',
    null,
    'Cerrado',
    null
  ],
  [
    5,
    'DP-1',
    null,
    'Defensoría del Pueblo',
    '20254100012349',
    D(2025, 6, 2),
    null,
    '',
    'Quinta solicitud',
    10,
    D(2025, 6, 16),
    null,
    null,
    null,
    'Abierto',
    null
  ],
  [
    6,
    'CGR-002',
    null,
    'Contraloría General de la República',
    '20254100012350',
    D(2025, 12, 1),
    null,
    'Departamento Administrativo de Hacienda',
    'Sexta solicitud',
    10,
    D(2025, 12, 15),
    null,
    null,
    D(2025, 12, 1),
    'Abierto',
    null
  ],
  [
    7,
    'CGR-003',
    null,
    'Contraloría General de la República',
    '20254100012351',
    D(2025, 7, 1),
    null,
    'Secretaría de Cultura',
    'Cerrado sin respuesta',
    10,
    D(2025, 7, 15),
    null,
    null,
    null,
    'Cerrado',
    null
  ]
];
const NR2025 = [
  ...vacias(5),
  [
    1,
    'CGR-001',
    null,
    'Contraloría General de la República',
    '20254100012345',
    D(2025, 1, 13),
    null,
    'Secretaría de Salud',
    'Duplicado por ORFEO'
  ],
  [
    2,
    'INF-1',
    null,
    'Contraloría General de la República',
    '20254100077777',
    D(2025, 4, 1),
    null,
    'Secretaría de Cultura',
    'Oficio informativo de prueba'
  ],
  [
    3,
    'INF-1',
    null,
    'Contraloría General de la República',
    '20254100077777',
    D(2025, 4, 1),
    null,
    'Secretaría de Cultura',
    'Oficio informativo de prueba'
  ]
];
// Formato 2026: encabezados en la fila 3 y datos desde la 4
const F2026 = [
  [],
  ['CONTROL DE REQUERIMIENTOS (ficticio)'],
  [
    'No. Orden',
    'Radicado ente',
    'Ente externo',
    'Radicación en ORFEO',
    'Fecha radicación',
    'Clase',
    'Organismo',
    'Asunto',
    'Días hábiles',
    'Fecha máxima',
    'ORFEO respuesta',
    'Fecha de respuesta',
    'Estado',
    'Observaciones'
  ],
  [
    1,
    'X-1',
    'Contraloría General de Santiago de Cali',
    20264100000001,
    D(2026, 1, 13),
    'Requerimiento',
    'Secretaría de Turismo',
    'Primera de 2026',
    10,
    D(2026, 1, 27),
    20264100000555,
    D(2026, 2, 3),
    'Cerrado',
    null
  ],
  [
    2,
    'X-2',
    'Personería',
    20264100000002,
    D(2026, 3, 2),
    'Informativo',
    'Secretaría de Turismo',
    'Sin término',
    0,
    null,
    null,
    null,
    'Abierto',
    null
  ],
  [
    3,
    'X-3',
    'Procuraduría',
    20264100000003,
    D(2026, 10, 1),
    'Requerimiento',
    'teatro municipal',
    'Vencida',
    5,
    D(2026, 10, 8),
    null,
    null,
    'Abierto',
    null
  ]
];

describe('paridad con la 2.x · lectura y clasificación del Excel de control', () => {
  const casos: [string, X.WorkBook][] = [
    ['Control Vigencia 2025.xlsx', libro({ CONTROL: F2025, 'NO RESPUESTA': NR2025 })],
    ['Control Vigencia 2026.xlsx', libro({ CONTROL: F2026 })]
  ];

  it('mismos registros de cada libro (CONTROL y NO RESPUESTA)', () => {
    for (const [nombre, wb] of casos) {
      const a = d2.ceLeerLibro(X, wb, nombre);
      const b = leerLibro(
        { control: hojaComoCeldas(X, wb, 'CONTROL'), noRespuesta: hojaComoCeldas(X, wb, 'NO RESPUESTA') },
        nombre
      );
      expect(b.vigencia, nombre).toBe(a.vigencia);
      expect(plano(b.registros), nombre).toEqual(plano(a.registros));
      expect(b.registros.length).toBeGreaterThan(2);
    }
  });

  it('misma clasificación, corte y filas para revisar', () => {
    const regs2 = casos.flatMap(([n, wb]) => d2.ceLeerLibro(X, wb, n).registros);
    const regs3 = casos.flatMap(
      ([n, wb]) =>
        leerLibro(
          { control: hojaComoCeldas(X, wb, 'CONTROL'), noRespuesta: hojaComoCeldas(X, wb, 'NO RESPUESTA') },
          n
        ).registros
    );
    expect(corte(regs3)).toBe(d2.ceCorte(regs2));
    for (const hoy of ['2026-11-13', '2025-06-30', '2026-12-31']) {
      const a = d2.ceClasificar(regs2, hoy),
        b = clasificar(regs3, hoy);
      expect(plano(b.filas), hoy).toEqual(plano(a.filas));
      expect(plano(b.calidad), hoy).toEqual(plano(a.calidad));
    }
    const { filas, calidad } = clasificar(regs3, '2026-11-13');
    const tipos = new Set(calidad.map(q => q.tipo));
    // Los libros de prueba cubren las ramas principales de la clasificación
    for (const t of [
      'Término sin dato',
      'Organismo vacío',
      'Organismo sin clasificar',
      'Fecha máxima ilegible',
      'Cerrado sin respuesta'
    ])
      expect(tipos.has(t), t).toBe(true);
    const op = new Set(filas.map(f => f.oportunidad));
    for (const o of ['A tiempo', 'Tardía', 'Sin respuesta (vencida)', 'No requiere respuesta'])
      expect(op.has(o), o).toBe(true);
  });

  it('organismos, días hábiles y fechas iguales en casos sueltos', () => {
    for (const t of [
      'Secretaría de Salud',
      'Secretaria de Educacion y Secretaría de Gobierno',
      'Despacho Alcalde / DAGMA',
      'comiaria de familia',
      'Contravenciones',
      'Oficina inexistente',
      null
    ])
      expect(organismos(t as Celda), String(t)).toEqual(d2.ceOrganismos(t));
    const pares = [
      ['2025-12-20', '2026-01-15'],
      ['2026-03-27', '2026-04-10'],
      ['2026-11-13', '2026-11-01'],
      ['2022-12-30', '2023-01-10']
    ];
    for (const [a, b] of pares)
      expect(habiles(a as string, b as string), `${a} → ${b}`).toBe(d2.ceHabiles(a as string, b as string));
    for (const v of [
      '15-ene-2025',
      '3/2/25',
      '29/02/2025',
      '1 sept 2026',
      'mañana',
      null,
      { d: '2026-03-01', h: '00:00:00' },
      { d: '1900-01-00', h: '00:00:00' }
    ])
      expect(fecha(v as Celda), JSON.stringify(v)).toEqual(d2.ceFecha(v));
  });
});
