import { describe, expect, it } from 'vitest';
import { errorClaveNueva, esLlegadaParaClave, exigenciaVerificacion, leerEnlaceConfirmar } from './seguridad';
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
  it('lee el enlace protegido (#confirmar=1&token_hash=…&tipo=…) y rechaza lo que no lo es', () => {
    expect(leerEnlaceConfirmar('#confirmar=1&token_hash=pkce_abc123DEF456&tipo=invite')).toEqual({
      tokenHash: 'pkce_abc123DEF456',
      tipo: 'invite'
    });
    expect(leerEnlaceConfirmar('#confirmar=1&tipo=recovery&token_hash=0123456789abcdef')).toEqual({
      tokenHash: '0123456789abcdef',
      tipo: 'recovery'
    });
    expect(leerEnlaceConfirmar('#confirmar=1&token_hash=0123456789abcdef&tipo=signup')).toBeNull();
    expect(leerEnlaceConfirmar('#confirmar=1&token_hash=<script>&tipo=invite')).toBeNull();
    expect(leerEnlaceConfirmar('#token_hash=0123456789abcdef&tipo=invite')).toBeNull();
    expect(leerEnlaceConfirmar('#/mando')).toBeNull();
    expect(leerEnlaceConfirmar('')).toBeNull();
  });
});
