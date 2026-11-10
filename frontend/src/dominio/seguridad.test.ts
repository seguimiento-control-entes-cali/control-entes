import { describe, expect, it } from 'vitest';
import { errorClaveNueva, esLlegadaParaClave, exigenciaVerificacion } from './seguridad';
import { ROLES } from './roles';

describe('contraseña nueva (igual que guardarClave de la 2.x)', () => {
  it('exige 10 caracteres con letras y números', () => {
    expect(errorClaveNueva('abc123', 'abc123')).toMatch(/Mínimo 10/);
    expect(errorClaveNueva('abcdefghijk', 'abcdefghijk')).toMatch(/Mínimo 10/); // sin números
    expect(errorClaveNueva('12345678901', '12345678901')).toMatch(/Mínimo 10/); // sin letras
    expect(errorClaveNueva('abcde12345', 'abcde12345')).toBeNull(); // justo 10
  });
  it('las dos deben coincidir', () => {
    expect(errorClaveNueva('abcde12345', 'abcde12346')).toBe('Las dos contraseñas no coinciden.');
  });
});

describe('verificación en dos pasos por rol (mfaRolesObligatorio / mfaRolesRecomendado de la 2.x)', () => {
  it('obligatoria solo para el Super administrador; recomendada para Despacho y Control Interno', () => {
    const r = Object.fromEntries(ROLES.map(x => [x, exigenciaVerificacion(x)]));
    expect(r).toEqual({
      admin: 'obligatoria',
      alcalde: 'recomendada',
      control_interno: 'recomendada',
      secretario: 'opcional',
      enlace: 'opcional'
    });
  });
});

describe('llegada desde el correo', () => {
  it('reconoce la invitación y la recuperación, y nada más', () => {
    expect(esLlegadaParaClave('#access_token=x&expires_in=3600&type=recovery')).toBe(true);
    expect(esLlegadaParaClave('#access_token=x&type=invite')).toBe(true);
    expect(esLlegadaParaClave('#access_token=x&type=signup')).toBe(false);
    expect(esLlegadaParaClave('#/mando')).toBe(false);
    expect(esLlegadaParaClave('')).toBe(false);
  });
});
