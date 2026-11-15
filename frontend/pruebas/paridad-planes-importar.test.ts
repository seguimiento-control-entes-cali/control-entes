// Paridad con la 2.x · Planes, importación (entrega 3). Con datos FICTICIOS: los planes de la demo exportados por el
// código REAL de la 2.x (pmSheetPM01, pmSheetPM02, pmSheetsF14), libros armados a mano con los casos difíciles (celdas
// combinadas, números repetidos, filas que continúan, avance 0..1, Formulario 14.1 sin responsable) y un informe final
// en PDF ficticio. La 2.x (pmParseWorkbook, pmParseInformePdf, pmImpCheck) y la 3.0 deben leer exactamente lo mismo.
import { describe, expect, it } from 'vitest';
import * as X from 'xlsx';
import cargarApp from '../../tests/cargar-app.cjs';
import { DEPENDENCIAS_DEMO } from '../src/datos/demo/catalogos-semilla';
import { semillaPlanes } from '../src/datos/demo/planes-semilla';
import { filasDeHoja } from '../src/features/planes/leer-plan';
import {
  cargaImportacion,
  depImportada,
  depSugerida,
  leerInformePdf,
  leerLibroPlan,
  mapearEncabezado,
  revisarImportacion,
  type HojaPlan,
  type Importacion,
  type TrozoPdf
} from '../src/dominio/planes-importar';

const dos = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const HOY = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const st = semillaPlanes(HOY);
const deps = DEPENDENCIAS_DEMO.map(x => ({ id: x.id, nombre: x.nombre }));
const previos = { planes: st.planes, hallazgos: st.hallazgos };

type Hoja2 = X.WorkSheet;
const d2 = cargarApp([
  'S',
  'PM',
  'pmParseWorkbook',
  'pmParseInformePdf',
  'pmImpCheck',
  'pmMapHeader',
  'pmDepImport',
  'pmDepSugerida',
  'pmSheetPM01',
  'pmSheetPM02',
  'pmSheetsF14'
]) as {
  S: { deps: unknown[] };
  PM: Record<string, unknown>;
  pmParseWorkbook: (x: typeof X, wb: X.WorkBook, nombre: string) => Importacion;
  pmParseInformePdf: (paginas: TrozoPdf[][], nombre: string) => Importacion;
  pmImpCheck: (imp: Importacion) => unknown;
  pmMapHeader: (fila: unknown[]) => Record<string, number>;
  pmDepImport: (resp: string, lugar: string) => number | null;
  pmDepSugerida: (t: unknown[]) => number | null;
  pmSheetPM01: (x: typeof X, p: unknown, corte: string) => Hoja2;
  pmSheetPM02: (x: typeof X, p: unknown, corte: string) => Hoja2;
  pmSheetsF14: (x: typeof X, p: unknown, corte: string) => [Hoja2, Hoja2];
};
d2.S.deps = deps;
Object.assign(d2.PM, {
  planes: st.planes,
  hall: st.hallazgos,
  acc: st.acciones,
  av: st.avances,
  v19: true
});
const plano = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

/** Escribe el libro como .xlsx y lo lee dos veces (la lectura rellena las celdas combinadas). */
function ambos(wb: X.WorkBook, nombre: string) {
  const bin = X.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const leer = () => X.read(new Uint8Array(bin), { type: 'array', cellDates: false });
  const w2 = leer();
  const w3 = leer();
  const hojas: HojaPlan[] = w3.SheetNames.map(n => ({
    nombre: n,
    filas: filasDeHoja(X, w3.Sheets[n] as Hoja2)
  }));
  let r2: unknown, r3: unknown;
  try {
    r2 = d2.pmParseWorkbook(X, w2, nombre);
  } catch (e) {
    r2 = { error: (e as Error).message };
  }
  try {
    r3 = leerLibroPlan(hojas, nombre, deps, previos);
  } catch (e) {
    r3 = { error: (e as Error).message };
  }
  return { r2, r3 };
}
const libro = (...hojas: [string, unknown[][], X.Range[]?][]) => {
  const wb = X.utils.book_new();
  for (const [n, aoa, merges] of hojas) {
    const ws = X.utils.aoa_to_sheet(aoa);
    if (merges) ws['!merges'] = merges;
    X.utils.book_append_sheet(wb, ws, n);
  }
  return wb;
};

describe('paridad con la 2.x · importar planes desde Excel', () => {
  it('lee igual los planes de la demo exportados por la 2.x (PM_01 + PM_02 y Formularios 14 y 14.1)', () => {
    for (const p of st.planes) {
      const wb = X.utils.book_new();
      if (p.formato === 'F14_CGR') {
        const [a, b] = d2.pmSheetsF14(X, p, HOY);
        X.utils.book_append_sheet(wb, a, 'Informe Plan de mejoramiento ');
        X.utils.book_append_sheet(wb, b, 'Avance Plan de Mejoramiento');
      } else {
        X.utils.book_append_sheet(wb, d2.pmSheetPM01(X, p, HOY), 'Formato PM_01 CGSC - PLAN ');
        X.utils.book_append_sheet(wb, d2.pmSheetPM02(X, p, HOY), 'Formato PM_02 CGSC - AVANCE ');
      }
      const { r2, r3 } = ambos(wb, 'plan-' + p.id + '.xlsx');
      expect(plano(r3), p.ejercicio).toEqual(plano(r2));
      const imp = r3 as Importacion;
      expect(imp.hall.length, p.ejercicio).toBeGreaterThan(0);
      expect(plano(revisarImportacion(imp, previos, HOY))).toEqual(plano(d2.pmImpCheck(imp)));
    }
  });

  it('casos difíciles de un PM_01: combinadas, número repetido, fila que continúa, avance 0..1, totales y firmas', () => {
    const enc = [
      'N° hallazgo (6)',
      'Descripción de la condición y causa del hallazgo (7)',
      'Connotación del hallazgo (8)',
      'Macroproceso (9)',
      'Acción de Correctiva (10)',
      'Meta (11)',
      'Fuente de verificación (12)',
      'Lugar de verificación (13)',
      'Fecha terminación de la Actividad (14)',
      'Responsable (Nombre y Cargo) (15)',
      'Descripción del avance de la acción (16)',
      'Fecha de corte (17)',
      '% de avance (18)',
      'Observaciones DACI'
    ];
    const aoa: unknown[][] = [
      ['CONTRALORÍA GENERAL DE SANTIAGO DE CALI'],
      ['FORMATO PM_01 CGSC - PLAN DE MEJORAMIENTO'],
      ['Entidad auditada (1): ', '', 'DISTRITO DE SANTIAGO DE CALI'],
      [
        'Nombre de la actuación de control fiscal (2): ',
        '',
        'Auditoría ficticia de prueba a la gestión 2025'
      ],
      ['Tipo de actuación de control fiscal (3):', '', 'Auditoría de cumplimiento'],
      ['Fecha de suscripción (4): 15 de enero de 2026', '', '', 'Vigencia PVCFT (5)', 2026],
      enc,
      ['(6)', '(7)', '(8)', '(9)', '(10)', '(11)', '(12)', '(13)', '(14)', '(15)', '(16)', '(17)', '(18)'],
      [
        '1',
        'Los expedientes contractuales no tienen lista de chequeo. Lo anterior, causado por la falta de un procedimiento de revisión documental en la oficina, lo cual genera riesgo de pérdida de documentos.',
        'Administrativa disciplinaria',
        'Gestión contractual',
        'Adoptar lista de chequeo',
        'Lista adoptada',
        'Acta',
        'Departamento Administrativo de Contratación Pública',
        46203,
        'Jefe de oficina - Departamento Administrativo de Contratación Pública',
        'Se adoptó la lista',
        '30/06/2026',
        0.5,
        'Precisar la meta'
      ],
      [
        '',
        '',
        '',
        '',
        'Capacitar al equipo',
        '2 capacitaciones',
        'Listas',
        'DACP',
        '31/12/2026',
        'DACP',
        '',
        '',
        ''
      ],
      [
        '1',
        'Otra condición distinta con el mismo número',
        'Administrativa fiscal',
        '',
        'Recuperar los recursos',
        'Recursos recuperados',
        'Recibo',
        'Secretaría de Salud Pública',
        '2026-09-30',
        'Secretario de Salud Pública',
        '(Avance validado 40 % con corte 31/05/2026)',
        '',
        ''
      ],
      [
        'Hallazgo No 7 AGEI Especial a la contratación de la vigencia 2025',
        'Hallazgo con número dentro de un texto largo. Lo anterior, causado por la falta de un procedimiento de revisión documental en la oficina, lo cual genera reprocesos.',
        'Administrativa',
        '',
        'Actualizar el procedimiento',
        'Procedimiento',
        'Documento',
        'Secretaría de Gobierno',
        'fecha mala',
        'Secretario',
        '',
        '',
        ''
      ],
      [],
      ['TOTALES'],
      ['Nombre y firma del Representante Legal']
    ];
    const merges = [
      X.utils.decode_range('A9:A10'),
      X.utils.decode_range('B9:B10'),
      X.utils.decode_range('C9:C10')
    ];
    const { r2, r3 } = ambos(libro(['Formato PM_01 CGSC - PLAN ', aoa, merges]), 'pm01-dificil.xlsx');
    expect(plano(r3)).toEqual(plano(r2));
    const imp = r3 as Importacion;
    expect(imp.hall.map(h => h.numero)).toEqual(['1', '1 (2)', '7']);
    expect(imp.hall[0]?.acciones).toHaveLength(2);
    expect(imp.hall[0]?.acciones[0]?.avance).toBe(50);
    expect(imp.hall[1]?.acciones[0]).toMatchObject({ avance: 40, fecha_corte: '2026-05-31' });
    expect(plano(revisarImportacion(imp, previos, HOY))).toEqual(plano(d2.pmImpCheck(imp)));
  });

  it('Formulario 14.1 sin área responsable: la toma del Formulario 14 del mismo libro', () => {
    const cab = [
      'No.',
      'Código hallazgo',
      'Descripción hallazgo',
      'Causa del hallazgo',
      'Efecto del hallazgo',
      'Acción de mejoramiento',
      'Propósito de la Acción de Mejora',
      'Descripción de las Actividades',
      'Denominación de la Unidad de medida de la Actividad',
      'Cantidad de Medida de la Actividad',
      'Fecha iniciación de la Actividad',
      'Fecha terminación de la Actividad'
    ];
    const meta = (form: string) => [
      ['INFORME PRESENTADO A LA CONTRALORIA GENERAL DE LA REPUBLICA'],
      [form],
      ['ENTIDAD:', 'Distrito de Santiago de Cali', '', 'NIT:', '890399011'],
      ['MODALIDAD DE AUDITORIA:', 'Auditoría financiera ficticia'],
      ['FECHA DE SUSCRIPCIÓN:', 46050],
      ['Fecha de Evaluación:', '', '30/06/2026']
    ];
    const fila = (n: number, cod: string, acc: string) => [
      n,
      cod,
      'Los reportes ' + cod + ' no se publicaron a tiempo',
      'Falta de seguimiento a los plazos',
      'Riesgo de sanción',
      acc,
      'Cumplir los plazos de publicación',
      'Publicar un reporte cada trimestre',
      'Informes',
      4,
      46050,
      46400
    ];
    const f14 = [
      ...meta('FORMULARIO No 14'),
      [...cab, 'Area Responsable'],
      [...fila(1, 'H1', 'Elaborar informes'), 'Secretaría de Salud Pública'],
      [...fila(2, 'H2', 'Conciliar saldos'), 'Departamento Administrativo de Hacienda']
    ];
    const f141 = [
      ...meta('FORMULARIO No 14.1'),
      [...cab, 'Plazo en semanas', 'Avance fisico de ejecución de las Actividades', 'Observaciones'],
      [...fila(1, 'H1', 'Elaborar informes'), 50, 2, 'Dos informes'],
      [...fila(2, 'H2', 'Conciliar saldos'), 50, '', '']
    ];
    const { r2, r3 } = ambos(libro(['F14', f14], ['F14.1', f141]), 'f14.xlsx');
    expect(plano(r3)).toEqual(plano(r2));
    const imp = r3 as Importacion;
    expect((r3 as { error?: string }).error).toBeUndefined();
    expect(imp.formato).toBe('F14_CGR');
    expect(imp.hall[0]?.acciones[0]).toMatchObject({ avance: 2, fecha_corte: '2026-06-30' });
  });

  it('mismos mensajes cuando el archivo no sirve', () => {
    for (const wb of [
      libro(['Hoja1', [['Hola'], ['sin tabla']]]),
      libro(['Hoja1', [['N° hallazgo', 'Descripción del hallazgo', 'Acción', 'Meta', 'Responsable']]])
    ]) {
      const { r2, r3 } = ambos(wb, 'malo.xlsx');
      expect(r3).toEqual(r2);
      expect((r3 as { error?: string }).error).toBeTruthy();
    }
  });

  it('mismo mapa de encabezados y misma dependencia reconocida', () => {
    for (const fila of [
      [
        'N° hallazgo (6)',
        'Descripción (7)',
        'Acción de Correctiva (10)',
        'Meta (11)',
        'Fecha de corte',
        '% avance'
      ],
      ['Código hallazgo', 'Acción de mejoramiento', 'Avance fisico de ejecución', 'Puntaje logrado (PLAI)'],
      ['No.', 'Actividades', 'Unidad de medida', 'Cantidad', 'Fecha limite', 'Observaciones OCI']
    ])
      expect(mapearEncabezado(fila)).toEqual(d2.pmMapHeader(fila));
    const textos = [
      ['Jefe de oficina - Departamento Administrativo de Contratación Pública', ''],
      ['Subsecretario', 'Secretaría de Salud Pública'],
      ['Profesional DAGMA', ''],
      ['Gobierno', 'Oficina de planeación'],
      ['', ''],
      ['Nadie conocido', 'Lugar desconocido']
    ];
    for (const [r, l] of textos) {
      expect(depImportada(r as string, l as string, deps), r).toBe(d2.pmDepImport(r as string, l as string));
      expect(depSugerida([r, l], deps), r).toBe(d2.pmDepSugerida([r, l]));
    }
  });
});

// ---------- informe final en PDF (ficticio) ----------
/** Una página de líneas: cada línea es un trozo (o dos, para probar cómo se unen). */
function pagina(lineas: string[]): TrozoPdf[] {
  const out: TrozoPdf[] = [];
  lineas.forEach((t, i) => {
    const y = 760 - i * 14;
    if (t.length > 30 && i % 2 === 0) {
      const k = t.indexOf(' ', 20);
      out.push({ s: t.slice(0, k), x: 72, y, w: k * 5, h: 11 });
      out.push({ s: t.slice(k + 1), x: 72 + k * 5 + 3, y: y + 0.5, w: (t.length - k) * 5, h: 11 });
    } else out.push({ s: t, x: 72, y, w: t.length * 5, h: 11 });
  });
  return out;
}
const PDF: TrozoPdf[][] = [
  pagina([
    'INFORME FINAL',
    'AUDITORÍA FINANCIERA Y DE GESTIÓN FICTICIA',
    'A LA SECRETARÍA DE SALUD PÚBLICA VIGENCIA 2025',
    '0300.08.01.26.012',
    'Santiago de Cali, 15 de marzo de 2026',
    'Contraloría General de Santiago de Cali'
  ]),
  pagina([
    'TABLA DE CONTENIDO',
    '3.1 HALLAZGO ADMINISTRATIVO N° 1 ........................ 12',
    '3.2 HALLAZGO ADMINISTRATIVO N° 2 ........................ 14',
    'Página 2 de 9'
  ]),
  pagina([
    'SECRETARÍA DE SALUD PÚBLICA',
    '3.1 HALLAZGO ADMINISTRATIVO N° 1 – CON PRESUNTA INCIDENCIA DISCIPLINARIA - DEBILIDADES EN LA',
    'SUPERVISIÓN DE CONTRATOS',
    'En la revisión de los contratos ficticios se encontró que los informes de supervisión no',
    'tienen soportes. Lo anterior, causado por la falta de controles en la supervisión, lo cual genera',
    'riesgo de pagos sin el cumplimiento del objeto. Lo anterior, contraviniendo lo establecido en la norma.',
    'DEPARTAMENTO ADMINISTRATIVO DE HACIENDA'
  ]),
  pagina([
    '3.2 HALLAZGO ADMINISTRATIVO N° 2 – CON PRESUNTA INCIDENCIA FISCAL - PAGOS SIN SOPORTE',
    'Se pagaron facturas ficticias por $7.854.441, conllevando a un detrimento patrimonial.',
    'Lo anterior, ocasionado por la ausencia de conciliaciones, lo cual ocasiona pérdida de recursos.',
    '3.3 HALLAZGO ADMINISTRATIVO N° 3 – OTRA INCIDENCIA - ARCHIVO',
    'El archivo ficticio no está organizado.',
    '4. RELACIÓN DE HALLAZGOS',
    'Administrativos 4 Disciplinarios 1 Fiscales 1'
  ])
];

describe('paridad con la 2.x · importar el informe final en PDF', () => {
  it('mismas líneas, hallazgos, causas, efectos, cuantía, dependencias y avisos', () => {
    const r2 = d2.pmParseInformePdf(PDF, 'informe-ficticio.pdf');
    const r3 = leerInformePdf(PDF, 'informe-ficticio.pdf', deps);
    expect(plano(r3)).toEqual(plano(r2));
    expect(r3.hall.map(h => h.numero)).toEqual(['1', '2', '3']);
    expect(r3.hall[1]?.cuantia).toBe(7854441);
    expect(r3.plan).toMatchObject({ fecha_informe: '2026-03-15', numero_informe: '0300.08.01.26.012' });
    expect(r3.avisos.some(a => a.n === 'r')).toBe(true); // el informe dice 4 y se leyeron 3
    expect(plano(revisarImportacion(r3, previos, HOY))).toEqual(plano(d2.pmImpCheck(r3)));
  });
  it('mismo mensaje si el PDF no tiene hallazgos', () => {
    const vacio = [pagina(['Documento sin hallazgos'])];
    expect(() => leerInformePdf(vacio, 'x.pdf', deps)).toThrow(/No se encontraron hallazgos en el PDF/);
    expect(() => d2.pmParseInformePdf(vacio, 'x.pdf')).toThrow(/No se encontraron hallazgos en el PDF/);
  });
});

describe('carga que se envía a pm_importar (pmDoImport)', () => {
  it('avance solo si tiene corte no futuro; inicio por defecto la suscripción; unidad por defecto «Unidades»', () => {
    const imp = leerInformePdf(PDF, 'informe-ficticio.pdf', deps);
    const c = cargaImportacion(imp, [{ id: 7, nombre: 'Contraloría General de Santiago de Cali' }], HOY);
    expect(c.plan).toMatchObject({ ente_id: 7, fecha_suscripcion: '2026-03-15', estado: 'formulacion' });
    expect(c.hallazgos[0]).toMatchObject({ dependencia_texto: 'SECRETARÍA DE SALUD PÚBLICA', acciones: [] });
    const ex = {
      ...imp,
      desdePdf: false,
      plan: { ...imp.plan, fecha_suscripcion: '2026-01-15' },
      hall: [
        {
          ...(imp.hall[0] as Importacion['hall'][number]),
          acciones: [
            {
              fila: 9,
              accion: 'A',
              proposito: '',
              actividad: '',
              meta: '',
              unidad_medida: '',
              cantidadRaw: 1,
              cantidad: 1,
              fuente_verificacion: '',
              lugar_verificacion: '',
              finiRaw: '',
              fini: null,
              ffinRaw: '',
              ffin: '2026-12-31',
              responsable: '',
              dependencia_id: null,
              avance: 1,
              fecha_corte: '2999-01-01',
              descripcion_avance: 'futuro',
              obs_ci: ''
            }
          ]
        }
      ]
    };
    const a = cargaImportacion(ex, [], HOY).hallazgos[0]?.acciones[0];
    expect(a).toMatchObject({
      fecha_inicio: '2026-01-15',
      unidad_medida: 'Unidades',
      avance: null,
      fecha_corte: null,
      descripcion_avance: ''
    });
  });
});
