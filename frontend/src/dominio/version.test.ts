import { describe, expect, it } from 'vitest';
import { textoVersion } from './version';

describe('textoVersion (paridad con versionApp() de la 2.x)', () => {
  it('arma versión, variante y fecha como en la 2.x', () => {
    expect(textoVersion('3.0.0', 'demo', '2026-11-08')).toBe(
      'Control de Entes versión 3.0.0 · demostración · construida el 08/11/2026'
    );
    expect(textoVersion('2.6.1', 'institucional', '2026-11-05')).toBe(
      'Control de Entes versión 2.6.1 · institucional · construida el 05/11/2026'
    );
  });

  it('omite lo que falta', () => {
    expect(textoVersion('')).toBe('Control de Entes (versión sin dato)');
    expect(textoVersion('3.0.0', undefined, 'no-es-fecha')).toBe('Control de Entes versión 3.0.0');
  });
});
