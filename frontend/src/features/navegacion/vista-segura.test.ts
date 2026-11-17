import { describe, expect, it } from 'vitest';
import { vistaSegura } from './reportar-errores';

describe('vistaSegura: el reporte de errores no guarda tokens', () => {
  it('conserva la ruta normal', () => {
    expect(vistaSegura('#/planes/12')).toBe('planes/12');
    expect(vistaSegura('')).toBe('');
  });
  it('quita tokens de invitación o recuperación', () => {
    expect(vistaSegura('#access_token=abc.def&type=recovery')).toBe('');
    expect(vistaSegura('#/ingreso?token=xyz')).toBe('ingreso');
    expect(vistaSegura('#/x&refresh_token=1')).toBe('x');
  });
});
