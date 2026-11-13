// Paridad con la 2.x · Configuración: rpFecha REAL de la 2.x y los textos y validaciones de saveCfg, guardarResumen
// y guardarAvisos.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import {
  esRespaldo,
  fechaRespaldo,
  textoAvisosGuardado,
  textoResumenGuardado,
  tieneAvisos,
  validarCopiaAvisos,
  validarDiasRojo
} from '../src/dominio/configuracion';

describe('paridad con la 2.x · Configuración', () => {
  it('misma fecha legible de cada copia de seguridad (rpFecha)', () => {
    const d2 = cargarApp(['rpFecha']) as { rpFecha: (n: string) => string };
    for (const n of [
      'respaldo_2026-10-25_2300.json.gz',
      'respaldo_2026-11-08_0005.json.gz',
      'respaldo_2026-11-09_1200.json.gz',
      'respaldo_2026-11-09_1201.json.gz',
      'otro.txt'
    ])
      expect(fechaRespaldo(n), n).toBe(d2.rpFecha(n));
    expect(fechaRespaldo('respaldo_2026-10-25_2300.json.gz')).toBe('25/10/2026, 11:00 p. m.');
    expect(esRespaldo('respaldo_2026-10-25_2300.json.gz')).toBe(true);
    expect(esRespaldo('restaurar.sql')).toBe(false);
  });

  it('validaciones y mensajes con los textos de la 2.x', () => {
    expect(validarDiasRojo(0)).toBe('Los días deben estar entre 1 y 30');
    expect(validarDiasRojo(31)).toBe('Los días deben estar entre 1 y 30');
    expect(validarDiasRojo(5)).toBeNull();
    expect(validarCopiaAvisos(' Control.Interno@cali.gov.co ')).toEqual({
      copia: 'control.interno@cali.gov.co',
      error: null
    });
    expect(validarCopiaAvisos('ci@gmail.com').error).toBe(
      'El correo de copia a Control Interno debe ser @cali.gov.co'
    );
    expect(validarCopiaAvisos('')).toEqual({ copia: '', error: null });
    expect(textoResumenGuardado(true)).toBe(
      'Resumen semanal activado: se enviará los lunes a las 7:00 a. m.'
    );
    expect(textoAvisosGuardado(false)).toBe('Aviso diario desactivado');
    // Sin el script 24 la columna no llega: la pantalla muestra cómo instalarlo
    expect(tieneAvisos({ dias_rojo: 5, correo_disciplinario: '' })).toBe(false);
  });
});
