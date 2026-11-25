import { describe, expect, it } from 'vitest';
import { cambiosDaci, errorDaci, estadoDaci, metasCumplidas, resumenDaci } from './seguimiento-daci';

const acc = (cantidad: number, avance: number, daci: 'verificada' | 'no_verificada' | null = null) => ({
  cantidad,
  avance,
  fecha_fin: '2026-12-31',
  daci_verificacion: daci
});

describe('seguimiento del DACI a las metas cumplidas', () => {
  it('solo cuentan las metas cumplidas (avance ≥ meta)', () => {
    const l = [acc(10, 10), acc(10, 5), acc(1, 1, 'verificada'), acc(4, 6, 'no_verificada')];
    expect(metasCumplidas(l, '2026-11-24')).toHaveLength(3);
  });
  it('resumen: verificadas, no verificadas, pendientes y porcentaje', () => {
    const r = resumenDaci([
      acc(1, 1, 'verificada'),
      acc(1, 1, 'verificada'),
      acc(1, 1, 'no_verificada'),
      acc(1, 1)
    ]);
    expect(r).toEqual({ cumplidas: 4, verificadas: 2, noVerificadas: 1, pendientes: 1, pct: 0.5 });
    expect(resumenDaci([]).pct).toBeNull();
  });
  it('sin registro es «pendiente»', () => {
    expect(estadoDaci({ daci_verificacion: null })).toBe('pendiente');
    expect(estadoDaci({})).toBe('pendiente');
    expect(estadoDaci({ daci_verificacion: 'verificada' })).toBe('verificada');
  });
  it('guarda fecha, observación y quién; o vuelve a pendiente', () => {
    expect(cambiosDaci('verificada', '2026-11-24', '  Soportes revisados ', 'ci@cali.gov.co')).toEqual({
      daci_verificacion: 'verificada',
      daci_fecha: '2026-11-24',
      daci_observacion: 'Soportes revisados',
      daci_por: 'ci@cali.gov.co'
    });
    expect(cambiosDaci(null, '2026-11-24', 'x', 'y').daci_verificacion).toBeNull();
  });
  it('«No verificada» exige observación; la fecha es obligatoria', () => {
    expect(errorDaci('no_verificada', '2026-11-24', '')).toMatch(/observación/);
    expect(errorDaci('verificada', '', '')).toMatch(/fecha/);
    expect(errorDaci('verificada', '2026-11-24', '')).toBeNull();
  });
});
