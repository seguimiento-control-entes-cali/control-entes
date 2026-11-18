// La exportación del Formato PM_01 llena la plantilla oficial (diseño de la Contraloría) con los datos del plan.
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { semillaPlanes } from './planes-semilla';
import { hojaPM01 } from '../../dominio/planes-exportar';
import { llenarPlantillaPM01 } from '../../dominio/plantilla-cgsc';

const BASE = path.join(__dirname, '..', '..', '..', 'plantillas', 'FORMATO_202001_PM_CGSC_base.xlsx');
const d = semillaPlanes('2026-06-30');
const plan = d.planes.find(p => p.formato === 'PM_01_CGSC') ?? d.planes[0];
if (!plan) throw new Error('La demo no trae planes');
const ctx = { d, dep: () => 'Dependencia demo', usuario: 'demo', v19: true };
const ws = hojaPM01(XLSX, plan, '2026-06-30', ctx);
const bin = llenarPlantillaPM01(XLSX, new Uint8Array(fs.readFileSync(BASE)), ws);
const libro = XLSX.read(bin, { type: 'array', cellFormula: true, cellStyles: true });
const hoja = libro.Sheets['Formato PM_01 CGSC - PLAN '];
const v = (ref: string) => (hoja?.[ref] as XLSX.CellObject | undefined)?.v;
const zip = XLSX.CFB.read(bin, { type: 'array' });
const xml = (p: string) => {
  const e = zip.FileIndex[zip.FullPaths.findIndex(x => x.endsWith('/' + p))];
  return e ? new TextDecoder().decode(e.content as Uint8Array) : '';
};

describe('Formato PM_01 con el diseño oficial', () => {
  it('conserva las hojas de la plantilla (sin «Ppto») y el logo', () => {
    expect(libro.SheetNames).toEqual(['Formato PM_01 CGSC - PLAN ', 'LISTA', 'Formato PM_02 CGSC - AVANCE ']);
    expect(zip.FullPaths.some(p => p.endsWith('xl/media/image1.png'))).toBe(true);
    expect(xml('xl/worksheets/sheet1.xml')).toContain('<dataValidation ');
  });

  it('los datos del plan van en las celdas de la plantilla', () => {
    expect(v('B1')).toBe('CONTRALORÍA GENERAL DE SANTIAGO DE CALI');
    expect(v('D5')).toBe(ws['D5']?.v);
    expect(v('B6')).toBe(ws['B6']?.v);
    expect(v('B8')).toBe(ws['B8']?.v);
    expect(v('B11')).toBe('N° hallazgo (6)');
    expect(v('B12')).toBe(ws['B12']?.v);
    expect(v('C12')).toBe(ws['C12']?.v);
    // los valores de ejemplo de la plantilla ya no están
    expect(v('K12')).not.toBe('XXXXXXXXX');
  });

  it('las filas del plan llevan los estilos de la plantilla y el % con formato 0 %', () => {
    const s1 = xml('xl/worksheets/sheet1.xml');
    expect(s1).toMatch(/<c r="B12" s="30"/);
    expect(s1).toMatch(/<c r="J12" s="10"/);
    const nEstilos = Number(/<cellXfs count="(\d+)"/.exec(xml('xl/styles.xml'))?.[1]);
    expect(s1).toContain(`<c r="S12" s="${nEstilos - 1}"`);
  });

  it('fórmulas de la plantilla con su valor y rangos de calificación intactos', () => {
    expect(hoja?.['M9']?.f).toBe('IF(COUNT(M12:M696)>0,AVERAGE(M12:M696)*100/2,0)');
    expect(['Cumple', 'No Cumple']).toContain(v('X9'));
    expect([v('U13'), v('W13'), v('U14'), v('W14')]).toEqual([
      '80 o más puntos',
      'Cumple',
      'Menos de 80 puntos',
      'No Cumple'
    ]);
    expect(xml('xl/workbook.xml')).toContain('fullCalcOnLoad="1"');
  });

  it('sin nombres de personas en los metadatos', () => {
    expect(xml('docProps/core.xml')).not.toMatch(/Erika|Torres|GRISALES/i);
  });

  it('muestra para revisar (solo si se pide con MUESTRA_SALIDA)', () => {
    if (process.env.MUESTRA_SALIDA) fs.writeFileSync(process.env.MUESTRA_SALIDA, bin);
  });
});
