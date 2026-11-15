// Paridad con la 2.x · Planes, entrega 2 (formularios): pmNum y pmFecha con el código REAL de la 2.x, y las
// validaciones de pmSavePlan, pmSaveHall, pmSaveAcc, pmSaveAv y pmDoReview con los mismos mensajes.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import fuente from '../../src/js/19-planes-de-mejoramiento.js?raw';
import {
  fechaPlan,
  numero,
  puedeEditarPlanes,
  puedeReportar,
  validarAccion,
  validarAvance,
  validarDevolucion,
  validarHallazgo,
  validarPlan
} from '../src/dominio/planes';

const d2 = cargarApp(['pmNum', 'pmFecha']) as {
  pmNum: (v: unknown) => number;
  pmFecha: (v: unknown) => string | null;
};

describe('paridad con la 2.x · lectura de números y fechas de los planes', () => {
  it('mismo número para los formatos que llegan de Excel y de los formularios', () => {
    const casos: unknown[] = [
      12,
      0,
      -3.5,
      Infinity,
      '1.234,5',
      '1,234.5',
      '45%',
      '$ 300',
      '300.000',
      '2,5',
      '',
      null,
      undefined,
      'abc',
      '12 unidades',
      '  7 '
    ];
    for (const c of casos) expect(numero(c), String(c)).toEqual(d2.pmNum(c));
  });

  it('misma fecha para número de serie, texto y nombres de mes; mismas fechas rechazadas', () => {
    const casos: unknown[] = [
      45000,
      19999,
      80001,
      44926.5,
      '30/06/2022',
      '2022-06-30',
      '2022/6/3',
      '30-jun-2022',
      '30/jun./2022',
      '30 de junio de 2022',
      '15 diciembre del 2022',
      'junio 30 de 2022',
      'Diciembre 1 del 2023',
      '31/02/2024',
      '29/02/2024',
      '29/02/2023',
      '1/1/22',
      '01-13-2022',
      '(30/06/2022)',
      'sin fecha',
      '',
      null,
      new Date(2024, 1, 29)
    ];
    for (const c of casos) expect(fechaPlan(c), String(c)).toBe(d2.pmFecha(c));
  });
});

describe('validaciones de los formularios de planes (mensajes de la 2.x)', () => {
  const mensajes: string[] = [];
  const m = (x: string | null) => {
    if (x) mensajes.push(x);
    return x;
  };
  const accionOk = {
    accion: 'Capacitar',
    unidad_medida: 'Capacitaciones',
    cantidad: 2,
    fecha_inicio: '2026-01-01',
    fecha_fin: '2026-06-30',
    dependencia_id: 21
  };
  const avOk = {
    fecha_corte: '2026-11-01',
    cantidad: 1,
    descripcion: 'Avance de prueba',
    radicado_orfeo: ''
  };
  const pdf = { nombre: 's.pdf', tipo: 'application/pdf', tamano: 1000 };

  it('plan', () => {
    const p = { contraloria: 'CGSC', ejercicio: 'Auditoría', fecha_suscripcion: '2026-01-01' };
    expect(m(validarPlan(p))).toBeNull();
    expect(m(validarPlan({ ...p, contraloria: '' }))).toBe('Indica la contraloría');
    expect(m(validarPlan({ ...p, ejercicio: 'Aud' }))).toBe(
      'Escribe el nombre del ejercicio de fiscalización'
    );
    expect(m(validarPlan({ ...p, fecha_suscripcion: '' }))).toBe('Indica la fecha de suscripción del plan');
    expect(m(validarPlan({ ...p, fecha_informe: '31/02/2026' }))).toBe('La fecha del informe no es válida');
  });

  it('hallazgo', () => {
    const h = { numero: '1', descripcion: 'Hallazgo', cuantiaTexto: '', cuantia: null };
    expect(m(validarHallazgo(h))).toBeNull();
    expect(m(validarHallazgo({ ...h, numero: '' }))).toBe('Indica el número del hallazgo');
    expect(m(validarHallazgo({ ...h, descripcion: 'x' }))).toBe('Describe el hallazgo');
    expect(m(validarHallazgo({ ...h, cuantiaTexto: 'abc', cuantia: NaN }))).toBe(
      'La cuantía debe ser un número'
    );
    expect(m(validarHallazgo({ ...h, cuantiaTexto: '1.000', cuantia: 1000 }))).toBeNull();
  });

  it('acción', () => {
    expect(m(validarAccion(accionOk))).toBeNull();
    expect(m(validarAccion({ ...accionOk, accion: 'x' }))).toBe('Describe la acción');
    expect(m(validarAccion({ ...accionOk, unidad_medida: '' }))).toBe('Indica la unidad de medida');
    expect(m(validarAccion({ ...accionOk, cantidad: 0 }))).toBe(
      'La cantidad de la meta debe ser mayor que cero'
    );
    expect(m(validarAccion({ ...accionOk, fecha_fin: '' }))).toBe(
      'Indica las fechas de inicio y de terminación'
    );
    expect(m(validarAccion({ ...accionOk, fecha_fin: '2025-12-31' }))).toBe(
      'La fecha de terminación no puede ser anterior a la de inicio'
    );
    expect(m(validarAccion({ ...accionOk, dependencia_id: null }))).toBe(
      'Asigna la dependencia responsable: sin ella nadie podrá reportar el avance'
    );
  });

  it('avance y devolución', () => {
    const hoy = '2026-11-15';
    expect(m(validarAvance(avOk, pdf, hoy))).toBeNull();
    expect(m(validarAvance({ ...avOk, fecha_corte: '' }, pdf, hoy))).toBe('Indica la fecha de corte');
    expect(m(validarAvance({ ...avOk, fecha_corte: '2026-11-16' }, pdf, hoy))).toBe(
      'La fecha de corte no puede ser futura'
    );
    expect(m(validarAvance({ ...avOk, cantidad: -1 }, pdf, hoy))).toBe(
      'El avance debe ser un número mayor o igual a cero'
    );
    expect(m(validarAvance({ ...avOk, descripcion: 'corto' }, pdf, hoy))).toBe(
      'Describe el avance (mínimo 10 caracteres)'
    );
    expect(m(validarAvance({ ...avOk, radicado_orfeo: '123' }, pdf, hoy))).toBe(
      'El radicado ORFEO debe tener entre 10 y 20 dígitos'
    );
    expect(m(validarAvance(avOk, null, hoy))).toBe('Adjunta el PDF del soporte o indica el radicado ORFEO');
    expect(m(validarAvance({ ...avOk, radicado_orfeo: '2026000000001' }, null, hoy))).toBeNull();
    expect(m(validarAvance(avOk, { nombre: 'a.docx', tipo: 'application/msword', tamano: 1 }, hoy))).toBe(
      'El soporte debe ser un archivo PDF'
    );
    expect(m(validarAvance(avOk, { ...pdf, tamano: 11 * 1024 * 1024 }, hoy))).toBe('El PDF supera 10 MB');
    expect(m(validarDevolucion('devuelto', 'no'))).toBe(
      'Indica a la dependencia por qué se devuelve el avance'
    );
    expect(validarDevolucion('validado', '')).toBeNull();
  });

  it('cada mensaje está escrito igual en la 2.x', () => {
    expect(mensajes.length).toBeGreaterThan(20);
    for (const x of new Set(mensajes)) expect(fuente.includes(x), x).toBe(true);
  });

  it('quién reporta y quién edita (pmCanReport y pmCanEdit)', () => {
    const a = { dependencia_id: 21 };
    expect(puedeReportar(a, 'admin', null)).toBe(true);
    expect(puedeReportar(a, 'control_interno', null)).toBe(true);
    expect(puedeReportar(a, 'enlace', 21)).toBe(true);
    expect(puedeReportar(a, 'secretario', 22)).toBe(false);
    expect(puedeReportar(a, 'consulta', 21)).toBe(false);
    expect(puedeReportar(null, 'admin', null)).toBe(false);
    expect(['admin', 'control_interno', 'secretario', 'enlace'].map(puedeEditarPlanes)).toEqual([
      true,
      true,
      false,
      false
    ]);
  });
});
