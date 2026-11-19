// Informe de incumplimiento por dependencia: de mayor a menor, en número y porcentaje.
import { describe, expect, it } from 'vitest';
import {
  filasInformeIncumplimiento,
  incumplimientoPorDependencia,
  pctIncumplimientoTxt,
  totalIncumplimiento
} from './incumplimiento';
import type { Accion } from './planes';

const HOY = '2026-11-19';
let n = 0;
const acc = (dep: number | null, fecha_fin: string, cantidad: number, avance: number): Accion =>
  ({
    id: 'a' + ++n,
    plan_id: 'p',
    hallazgo_id: 'h',
    dependencia_id: dep,
    accion: 'Acción',
    cantidad,
    avance,
    fecha_inicio: '2026-01-01',
    fecha_fin,
    fecha_corte: null
  }) as Accion;
const nombres: Record<number, string> = { 1: 'Salud Pública', 2: 'Hacienda', 3: 'Educación' };

describe('incumplimiento por dependencia', () => {
  const acciones = [
    // Salud: 2 vencidas sin cumplir, 1 cumplida con plazo pasado, 1 por vencer → 2 de 3 = 66,7 %
    acc(1, '2026-06-30', 10, 2),
    acc(1, '2026-09-30', 10, 0),
    acc(1, '2026-03-31', 10, 10),
    acc(1, '2026-12-01', 10, 5),
    // Hacienda: 1 vencida de 1 → 100 %
    acc(2, '2026-10-31', 4, 1),
    // Educación: todo en término → sin porcentaje
    acc(3, '2027-06-30', 1, 0),
    // Sin dependencia: 1 cumplida
    acc(null, '2026-05-01', 1, 1)
  ];
  const filas = incumplimientoPorDependencia(acciones, [], HOY, id => nombres[id ?? 0] ?? '');

  it('ordena de mayor a menor incumplimiento (vencidas, luego porcentaje)', () => {
    expect(filas.map(f => f.dependencia)).toEqual([
      'Salud Pública',
      'Hacienda',
      'Sin dependencia asignada', // 0 % (su acción con plazo terminado está cumplida)
      'Educación' // «—»: ninguna acción ha llegado a su fecha
    ]);
  });

  it('cuenta en número y porcentaje', () => {
    const s = filas[0] as (typeof filas)[number];
    expect([s.acciones, s.cumplidas, s.vencidas, s.proximas, s.plazoVencido]).toEqual([4, 1, 2, 1, 3]);
    expect(s.pctIncumplimiento).toBeCloseTo(2 / 3, 6);
    expect(filas[1]?.pctIncumplimiento).toBe(1);
    expect(filas[2]?.pctIncumplimiento).toBe(0);
    expect(filas.find(x => x.dependencia === 'Educación')?.pctIncumplimiento).toBeNull();
    expect(pctIncumplimientoTxt(2 / 3)).toBe('66,7 %');
    expect(pctIncumplimientoTxt(null)).toBe('—');
  });

  it('totales de la administración y alertas', () => {
    const t = totalIncumplimiento(filas);
    expect([t.acciones, t.vencidas, t.proximas, t.plazoVencido, t.conVencidas, t.conProximas]).toEqual([
      7, 3, 1, 5, 2, 1
    ]);
    expect(t.pctIncumplimiento).toBeCloseTo(3 / 5, 6);
  });

  it('el informe descargable trae encabezado, una fila por dependencia y el total', () => {
    const f = filasInformeIncumplimiento(filas, HOY);
    expect(String(f[0]?.[0])).toMatch(/corte 2026-11-19/);
    expect(f[1]).toContain('% de incumplimiento');
    expect(f[2]?.slice(0, 8)).toEqual([1, 'Salud Pública', 4, 1, 2, 3, '66,7 %', 1]);
    expect(f[f.length - 1]?.[1]).toBe('Total administración');
  });
});
