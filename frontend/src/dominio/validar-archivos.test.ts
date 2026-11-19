// Un archivo renombrado (p. ej. un texto con extensión .pdf) no se acepta como soporte ni como documento.
import { describe, expect, it } from 'vitest';
import { contenidoNoCoincide } from './planes-memoria';
import { validarAvance } from './planes';

const bytes = (s: string | number[]) =>
  typeof s === 'string' ? new TextEncoder().encode(s) : new Uint8Array(s);

describe('contenido real de los archivos', () => {
  it('documentos del archivo del plan e informes semestrales', () => {
    expect(contenidoNoCoincide('a.pdf', bytes('%PDF-1.7 …'))).toBeNull();
    expect(contenidoNoCoincide('a.pdf', bytes('esto no es un pdf'))).toMatch(
      /no corresponde a un PDF válido/
    );
    expect(contenidoNoCoincide('a.xlsx', bytes([0x50, 0x4b, 3, 4]))).toBeNull();
    expect(contenidoNoCoincide('a.xlsx', bytes('%PDF-1.7'))).toMatch(/XLSX/);
    expect(contenidoNoCoincide('a.docx', bytes([0x50, 0x4b, 3, 4]))).toBeNull();
    expect(contenidoNoCoincide('a.xls', bytes([0xd0, 0xcf, 0x11, 0xe0]))).toBeNull();
    expect(contenidoNoCoincide('a.xls', bytes('texto'))).toMatch(/XLS/);
    expect(contenidoNoCoincide('a.csv', bytes('radicado;fecha\n1;2'))).toBeNull();
    expect(contenidoNoCoincide('a.csv', bytes([0x50, 0x4b, 0, 0]))).toMatch(/CSV/);
  });

  it('soporte del avance: debe ser un PDF de verdad', () => {
    const o = {
      fecha_corte: '2026-06-30',
      cantidad: 5,
      descripcion: 'Avance de prueba suficiente',
      radicado_orfeo: ''
    };
    const pdf = { nombre: 's.pdf', tipo: 'application/pdf', tamano: 100 };
    expect(validarAvance(o, { ...pdf, cabecera: '%PDF-' }, '2026-11-18')).toBeNull();
    expect(validarAvance(o, { ...pdf, cabecera: 'esto ' }, '2026-11-18')).toBe(
      'El archivo no parece ser un PDF válido'
    );
    // sin cabecera (llamadas de la paridad con la 2.x) se comporta como antes
    expect(validarAvance(o, pdf, '2026-11-18')).toBeNull();
  });
});
