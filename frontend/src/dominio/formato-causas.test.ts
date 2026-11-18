// El formato de Calidad MEDE01.05.02.P019.F002 se llena en sus 4 pestañas conservando el diseño oficial.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import formatoBase from '../../plantillas/MEDE01.05.02.P019.F002_base.xlsx?inline';
import {
  celdasFormato,
  formatoConDatos,
  llenarFormatoCausas,
  nombreFormatoCausas,
  ponerValor,
  type DetalleCausas
} from './formato-causas';

const bytes = Uint8Array.from(atob(formatoBase.split(',')[1] ?? ''), ch => ch.charCodeAt(0));

/** Ejemplo ficticio con las 4 herramientas diligenciadas. */
export const EJEMPLO_CAUSAS: DetalleCausas = {
  macroproceso: 'Gestión jurídica',
  macroproceso_codigo: 'MAGJ01',
  proceso: 'Gestión contractual',
  proceso_codigo: 'MAGJ01.03',
  subproceso: 'Supervisión de contratos',
  subproceso_codigo: 'MAGJ01.03.02',
  participantes: ['Persona ficticia uno', 'Persona ficticia dos', 'Persona ficticia tres'],
  no_conformidad: 'PRUEBA · Publicación extemporánea en el SECOP de los informes de supervisión',
  lluvia: [
    { idea: 'No hay lista de chequeo de publicación' },
    { idea: 'Los supervisores no conocen el plazo de 3 días' },
    {
      idea: 'Rotación de contratistas de apoyo',
      descartada: 'No considerada: no aplica a todos los contratos'
    }
  ],
  causa_raiz_lluvia: 'Ausencia de un control de publicación oportuna en la supervisión',
  espina: {
    materiales: ['Formatos de informe desactualizados'],
    mano_obra: ['Supervisores sin capacitación en SECOP', 'Alta carga de contratos por supervisor'],
    maquinaria: ['Fallas de conexión con SECOP'],
    medio_ambiente: ['Cierres de vigencia con alto volumen'],
    metodo: ['Sin lista de chequeo de publicación'],
    medicion: ['No se mide la oportunidad de publicación']
  },
  cinco_porques: [
    {
      problema: 'Informes publicados fuera de término',
      porques: [
        'El supervisor no los publica a tiempo',
        'No sabe que el plazo es de 3 días',
        'No recibió inducción en SECOP',
        'No existe procedimiento de inducción',
        'No se ha formalizado en el proceso'
      ],
      resultado: 'Falta procedimiento de inducción a supervisores'
    }
  ],
  arbol: [
    {
      problema: 'Publicación extemporánea',
      causa: 'Desconocimiento del plazo',
      subcausa: 'Sin inducción',
      efecto: 'Hallazgo disciplinario'
    }
  ]
};

const bin = llenarFormatoCausas(XLSX, bytes, EJEMPLO_CAUSAS);
const libro = XLSX.read(bin, { type: 'array' });
const v = (hoja: string, ref: string) => (libro.Sheets[hoja]?.[ref] as XLSX.CellObject | undefined)?.v;
const zip = XLSX.CFB.read(bin, { type: 'array' });
const xml = (p: string) => {
  const e = zip.FileIndex[zip.FullPaths.findIndex((x: string) => x.endsWith('/' + p))];
  return e ? new TextDecoder().decode(e.content as Uint8Array) : '';
};

describe('Formato MEDE01.05.02.P019.F002 (análisis de causas)', () => {
  it('conserva las 4 pestañas, el encabezado con logo y los textos del formato', () => {
    expect(libro.SheetNames).toEqual(['Lluvia de ideas', 'Causa - efecto', '5 porqué', 'Árbol de problemas']);
    expect(zip.FullPaths.some((p: string) => /xl\/media\/image1\.jpe?g$/.test(p))).toBe(true);
    for (let i = 1; i <= 4; i++) expect(xml(`xl/drawings/drawing${i}.xml`)).toContain('MIPG');
    expect(v('Lluvia de ideas', 'A22')).toBe('CAUSA RAIZ');
    expect(v('Causa - efecto', 'B16')).toBe('MATERIALES');
    expect(v('5 porqué', 'G15')).toBe('RESULTADO DEL ANÁLISIS');
  });

  it('lluvia de ideas en sus celdas', () => {
    const h = 'Lluvia de ideas';
    expect([v(h, 'C3'), v(h, 'E3'), v(h, 'C5')]).toEqual([
      'Gestión jurídica',
      'MAGJ01',
      'Supervisión de contratos'
    ]);
    expect([v(h, 'A9'), v(h, 'A11')]).toEqual(['Persona ficticia uno', 'Persona ficticia tres']);
    expect(String(v(h, 'D9'))).toMatch(/Publicación extemporánea/);
    expect([v(h, 'A14'), v(h, 'B14'), v(h, 'A16'), v(h, 'D16')]).toEqual([
      1,
      'No hay lista de chequeo de publicación',
      3,
      'No considerada: no aplica a todos los contratos'
    ]);
    expect(v(h, 'A23')).toBe('Ausencia de un control de publicación oportuna en la supervisión');
  });

  it('causa-efecto: cada causa sobre su línea y la no conformidad en el recuadro', () => {
    const h = 'Causa - efecto';
    expect(v(h, 'B17')).toBe('Formatos de informe desactualizados');
    expect([v(h, 'C17'), v(h, 'C18')]).toEqual([
      'Supervisores sin capacitación en SECOP',
      'Alta carga de contratos por supervisor'
    ]);
    expect([v(h, 'D17'), v(h, 'B20'), v(h, 'C20'), v(h, 'D20')]).toEqual([
      'Fallas de conexión con SECOP',
      'Cierres de vigencia con alto volumen',
      'Sin lista de chequeo de publicación',
      'No se mide la oportunidad de publicación'
    ]);
    expect(String(v(h, 'E19'))).toMatch(/Publicación extemporánea/);
    expect(v(h, 'B10')).toBe('Gestión jurídica');
  });

  it('5 porqués y árbol de problemas', () => {
    expect([v('5 porqué', 'A16'), v('5 porqué', 'B16'), v('5 porqué', 'F16'), v('5 porqué', 'G16')]).toEqual([
      'Informes publicados fuera de término',
      'El supervisor no los publica a tiempo',
      'No se ha formalizado en el proceso',
      'Falta procedimiento de inducción a supervisores'
    ]);
    expect(v('5 porqué', 'F10')).toBe('MAGJ01');
    const a = 'Árbol de problemas';
    expect([v(a, 'A16'), v(a, 'B16'), v(a, 'C16'), v(a, 'D16')]).toEqual([
      'Publicación extemporánea',
      'Desconocimiento del plazo',
      'Sin inducción',
      'Hallazgo disciplinario'
    ]);
    expect(v(a, 'D10')).toBe('CODIGO: MAGJ01');
  });

  it('las celdas que ya traían estilo lo conservan', () => {
    expect(xml('xl/worksheets/sheet1.xml')).toMatch(/<c r="C3" s="33" t="inlineStr">/);
    expect(xml('xl/worksheets/sheet3.xml')).toMatch(/<c r="B16" s="18" t="inlineStr">/);
  });

  it('respeta los límites impresos del formato y omite lo vacío', () => {
    const m = celdasFormato({
      lluvia: Array.from({ length: 12 }, (_, i) => ({ idea: 'idea ' + i })),
      arbol: []
    });
    expect(Object.keys(m[1]).filter(k => k.startsWith('B'))).toHaveLength(7);
    expect(formatoConDatos({})).toBe(false);
    expect(formatoConDatos({ causa_raiz_lluvia: 'x' })).toBe(true);
    expect(nombreFormatoCausas('3.1 a')).toBe('MEDE01.05.02.P019.F002_analisis_causas_hallazgo_3_1_a.xlsx');
  });

  it('crea la celda en su fila si la plantilla no la traía', () => {
    const x = '<sheetData><row r="2"><c r="A2"/><c r="D2"/></row></sheetData>';
    expect(ponerValor(x, 'B2', 'hola')).toBe(
      '<sheetData><row r="2"><c r="A2"/><c r="B2" t="inlineStr"><is><t xml:space="preserve">hola</t></is></c><c r="D2"/></row></sheetData>'
    );
    expect(ponerValor(x, 'A5', 7)).toBe(
      '<sheetData><row r="2"><c r="A2"/><c r="D2"/></row><row r="5"><c r="A5"><v>7</v></c></row></sheetData>'
    );
  });
});
