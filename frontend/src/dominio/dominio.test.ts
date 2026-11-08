import { describe, expect, it } from 'vitest';
import { diasEntre, fechaColombia, formatoCorto, sumarDias } from './fechas';
import { esHabil, festivosColombia, pascua, sumarHabiles } from './dias-habiles';
import { calcularSemaforo, ETIQUETA_SEMAFORO } from './semaforo';
import { esRol, esSupervision, NOMBRE_ROL } from './roles';

describe('fechas', () => {
  it('suma días y cruza meses, años y bisiestos', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(diasEntre('2026-11-08', '2026-11-10')).toBe(2);
    expect(diasEntre('2026-11-10', '2026-11-08')).toBe(-2);
  });

  it('fecha de Colombia (UTC-5), igual que la verificación del script 22', () => {
    expect(fechaColombia(new Date('2026-10-31T04:00:00Z'))).toBe('2026-10-30'); // 30-oct 11:00 p. m. en Cali
    expect(fechaColombia(new Date('2026-10-30T04:59:59Z'))).toBe('2026-10-29');
    expect(fechaColombia(new Date('2026-10-30T05:00:00Z'))).toBe('2026-10-30');
  });

  it('formato corto', () => {
    expect(formatoCorto('2026-11-08')).toBe('08/11/2026');
    expect(formatoCorto(null)).toBe('—');
  });
});

describe('días hábiles en Colombia', () => {
  it('Pascua', () => {
    expect(pascua(2026)).toBe('2026-04-05');
    expect(pascua(2027)).toBe('2027-03-28');
  });

  it('festivos de 2026 (19, con el 9 de julio de la Ley 2578)', () => {
    const f = festivosColombia(2026);
    expect(f.size).toBe(19);
    for (const d of [
      '2026-01-01',
      '2026-01-12',
      '2026-04-02',
      '2026-04-03',
      '2026-07-13',
      '2026-07-20',
      '2026-11-16',
      '2026-12-08'
    ])
      expect(f.has(d), d).toBe(true);
  });

  it('antes de 2026 no existe el festivo del 9 de julio (2025: 17, San Pedro y Sagrado Corazón el 30-jun)', () => {
    expect(festivosColombia(2025).has('2025-07-14')).toBe(false);
    expect(festivosColombia(2025).has('2025-06-30')).toBe(true);
    expect(festivosColombia(2025).size).toBe(17);
  });

  it('esHabil y sumarHabiles', () => {
    expect(esHabil('2026-11-16')).toBe(false); // festivo (Independencia de Cartagena, trasladado)
    expect(esHabil('2026-11-14')).toBe(false); // sábado
    expect(esHabil('2026-11-17')).toBe(true);
    expect(sumarHabiles('2026-11-13', 1)).toBe('2026-11-17'); // viernes + 1 hábil salta sábado, domingo y festivo
    expect(sumarHabiles('2026-06-30', 15)).toBe('2026-07-23'); // informe semestral: corte 30-jun (13 y 20 de julio festivos)
  });
});

describe('semáforo', () => {
  const hoy = '2026-11-08';
  it('cerrado siempre es verde', () => {
    expect(calcularSemaforo({ estado: 'cerrado', fechaLimite: '2026-01-01' }, hoy).semaforo).toBe('verde');
  });
  it('rojo con 5 días o menos, amarillo con más', () => {
    expect(calcularSemaforo({ estado: 'abierto', fechaLimite: '2026-11-13' }, hoy)).toEqual({
      dias: 5,
      semaforo: 'rojo',
      vencido: false
    });
    expect(calcularSemaforo({ estado: 'abierto', fechaLimite: '2026-11-14' }, hoy).semaforo).toBe('amarillo');
    expect(calcularSemaforo({ estado: 'abierto', fechaLimite: '2026-11-07' }, hoy)).toEqual({
      dias: -1,
      semaforo: 'rojo',
      vencido: true
    });
  });
  it('umbral configurable; 0 usa el valor por defecto como en la 2.x', () => {
    expect(calcularSemaforo({ estado: 'abierto', fechaLimite: '2026-11-18' }, hoy, 10).semaforo).toBe('rojo');
    expect(calcularSemaforo({ estado: 'abierto', fechaLimite: '2026-11-13' }, hoy, 0).semaforo).toBe('rojo');
  });
  it('etiquetas', () => {
    expect(ETIQUETA_SEMAFORO.rojo).toBe('Crítico');
  });
});

describe('roles', () => {
  it('supervisión: admin, alcalde y control interno', () => {
    expect(esSupervision('admin')).toBe(true);
    expect(esSupervision('control_interno')).toBe(true);
    expect(esSupervision('secretario')).toBe(false);
    expect(esSupervision('enlace')).toBe(false);
  });
  it('esRol rechaza valores desconocidos', () => {
    expect(esRol('alcalde')).toBe(true);
    expect(esRol('root')).toBe(false);
    expect(esRol(null)).toBe(false);
    expect(NOMBRE_ROL.enlace).toBe('Enlace operativo');
  });
});
