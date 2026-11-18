// El Formato PM_01 que exporta la app sale igual a la plantilla oficial de la Contraloría
// (FORMATO_202001_PM_CGSC plantilla.xlsx, entregada el 17-nov-2026): columnas B a S, evaluación de U a Y y hoja LISTA.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { semillaPlanes } from './planes-semilla';
import { hojaListaPM, hojaPM01, LISTA_PM_CGSC } from '../../dominio/planes-exportar';

const d = semillaPlanes('2026-06-30');
const plan = d.planes.find(p => p.formato === 'PM_01_CGSC') ?? d.planes[0];
if (!plan) throw new Error('La demo no trae planes');
const ctx = { d, dep: () => 'Dependencia demo', usuario: 'demo', v19: true };
const ws = hojaPM01(XLSX, plan, '2026-06-30', ctx, { conAvance: true });
const formulacion = hojaPM01(XLSX, plan, '2026-06-30', ctx);
const v = (ref: string) => (ws[ref] as XLSX.CellObject | undefined)?.v;
const f = (ref: string) => (ws[ref] as XLSX.CellObject | undefined)?.f;
const uniones = (ws['!merges'] ?? []).map(m => XLSX.utils.encode_range(m));

describe('Formato PM_01 igual a la plantilla de la Contraloría', () => {
  it('títulos y datos del plan en las mismas celdas', () => {
    expect(v('A1')).toBeUndefined();
    expect(v('B1')).toBe('CONTRALORÍA GENERAL DE SANTIAGO DE CALI');
    expect(v('B2')).toBe('FORMATO PM_01 CGSC - PLAN ');
    expect(v('B5')).toBe('Entidad auditada (1): ');
    expect(String(v('D5'))).toMatch(/[A-Z]/);
    expect(String(v('B6'))).toMatch(/^Nombre de la actuación de control fiscal \(2\): /);
    expect(v('B7')).toBe('Tipo de actuación de control fiscal (3):');
    expect(String(v('B8'))).toMatch(/^Fecha de suscripción \(4\): /);
    expect(v('D8')).toBe('Vigencia PVCFT (5)');
    expect(v('B10')).toBe('FORMULACIÓN DEL PLAN DE MEJORAMIENTO');
    expect(v('L10')).toBe('AVANCE DEL PLAN DE MEJORAMIENTO');
  });

  it('los 18 encabezados de la fila 11, de la B a la S', () => {
    const fila = 'BCDEFGHIJKLMNOPQRS'.split('').map(c => v(c + '11'));
    expect(fila).toEqual([
      'N° hallazgo (6)',
      'Descripción de la condición y causa del hallazgo \n(7)',
      'Connotación del hallazgo \n(8)',
      'Macroproceso, criterio u otro\n(9)',
      'Acción de Correctiva\n(10)',
      'Meta \n(11)',
      'Fuente de verificación\n(12)',
      'Lugar de verificación\n(13)',
      'Fecha terminación de la Actividad\n(14)',
      'Responsable (Nombre y Cargo)\n(15)',
      'Descripción del avance de la acción\n(16)',
      'CUMPLIMIENTO\n20%',
      'EFECTIVIDAD\n80%',
      'ESTADO DE LA ACCIÓN\n(Cerrada-C / Abierta-A)',
      'DIRECCIÓN TECNICA RESPONSABLE',
      'OBSERVACIÓN SEGUIMIENTO',
      'Fecha de Corte del Avance \n(17)',
      '% de Avance\n(18)'
    ]);
  });

  it('cuadro de evaluación de la U a la Y con las fórmulas de la plantilla', () => {
    expect(v('U3')).toBe('RESULTADO EVALUACIÓN PLAN DE MEJORAMIENTO');
    expect([v('U4'), v('W4'), v('X4'), v('Y4')]).toEqual([
      'VARIABLES A EVALUAR',
      'Calificación Parcial',
      'Ponderación',
      'Puntaje Atribuido'
    ]);
    expect([f('W5'), v('X5'), f('Y5')]).toEqual(['+M9', 0.2, 'W5*X5']);
    expect([f('W7'), v('X7'), f('Y7')]).toEqual(['+N9', 0.8, 'W7*X7']);
    expect([f('X8'), f('Y8'), f('M8')]).toEqual(['SUM(X5:X7)', 'SUM(Y5:Y7)', '+M9*0.2+N9*0.8']);
    expect(f('M9')).toBe('IF(COUNT(M12:M696)>0,AVERAGE(M12:M696)*100/2,0)');
    expect(f('N9')).toBe('IF(COUNT(N12:N696)>0,AVERAGE(N12:N696)*100/2,0)');
    expect(f('X9')).toBe('IF(AND((Y8)<=100,(Y8)>=80),W13,IF(AND((Y8)<80,(Y8)>=0),W14,W13))');
    expect(['Cumple', 'No Cumple']).toContain(v('X9'));
    expect([v('U12'), v('W12'), v('U13'), v('W13'), v('U14'), v('W14')]).toEqual([
      'RANGOS DE CALIFICACIÓN ',
      'Concepto',
      '80 o más puntos',
      'Cumple',
      'Menos de 80 puntos',
      'No Cumple'
    ]);
    // el valor guardado coincide con lo que calcula Excel
    expect(v('Y8')).toBeCloseTo((v('M9') as number) * 0.2 + (v('N9') as number) * 0.8, 6);
  });

  it('las uniones principales de la plantilla', () => {
    for (const u of [
      'B1:G1',
      'B2:G2',
      'U3:Y3',
      'D5:E5',
      'B6:E6',
      'D7:E7',
      'B8:C8',
      'M8:N8',
      'B10:K10',
      'L10:S10',
      'X9:Y9'
    ])
      expect(uniones).toContain(u);
  });

  it('el plan va desde la fila 12; con avance, la fecha de corte (R) y el % (S)', () => {
    expect(v('B12')).not.toBeUndefined();
    let conAvance = 0;
    for (let r = 12; r < 200; r++) {
      const corte = ws['R' + r] as XLSX.CellObject | undefined;
      if (!corte) continue;
      conAvance++;
      expect(corte.z).toBe('dd/mm/yyyy');
      expect((ws['S' + r] as XLSX.CellObject).z).toBe('0%');
    }
    expect(conAvance).toBeGreaterThan(0);
  });

  it('por defecto (archivo para el SIA) solo la formulación: B a K llenas, L a S vacías', () => {
    expect(formulacion['B12']?.v).toBeDefined();
    expect(formulacion['F12']?.v).toBeDefined();
    for (let r = 12; r < 200; r++)
      for (const c of 'LMNOPQRS') expect(formulacion[c + r], `${c}${r} vacía`).toBeUndefined();
  });

  it('anchos de columna de la plantilla (A angosta)', () => {
    const anchos = (ws['!cols'] ?? []).map(c => c.wch);
    expect(anchos.slice(0, 4)).toEqual([1, 13, 53, 25]);
    expect(anchos[16]).toBe(42); // Q: observación seguimiento
  });

  it('hoja LISTA con las listas oficiales', () => {
    const l = hojaListaPM(XLSX);
    expect(l['A1']?.v).toBe('INCIDENCIA');
    expect(l['D2']?.v).toBe('DISTRITO DE SANTIAGO DE CALI');
    expect(LISTA_PM_CGSC).toHaveLength(21);
  });
});
