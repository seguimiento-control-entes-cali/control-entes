// Contraseña nueva y activación de la verificación en dos pasos con un cliente simulado (sin red ni base real).
import { describe, expect, it } from 'vitest';
import { datosSupabase, qrSeguro } from '../src/datos/supabase';

type Factor = { id: string; status: 'verified' | 'unverified'; factor_type: 'totp' };

function cliente(inicial: Factor[] = [], fallaClave = false) {
  const llamadas: string[] = [];
  let factores = [...inicial];
  const sb = {
    auth: {
      updateUser: async ({ password }: { password: string }) => {
        llamadas.push('updateUser ' + password.length);
        return fallaClave ? { error: { message: 'New password should be different' } } : { error: null };
      },
      mfa: {
        listFactors: async () => ({
          data: { totp: factores.filter(f => f.factor_type === 'totp'), all: factores },
          error: null
        }),
        unenroll: async ({ factorId }: { factorId: string }) => {
          llamadas.push('unenroll ' + factorId);
          factores = factores.filter(f => f.id !== factorId);
          return { error: null };
        },
        enroll: async ({ friendlyName }: { friendlyName: string }) => {
          llamadas.push('enroll ' + friendlyName.split(' (')[0]);
          factores.push({ id: 'nuevo', status: 'unverified', factor_type: 'totp' });
          return {
            data: {
              id: 'nuevo',
              totp: { qr_code: 'data:image/svg+xml;utf-8,<svg fill="#000"></svg>', secret: 'ABC123' }
            },
            error: null
          };
        },
        challengeAndVerify: async ({ factorId, code }: { factorId: string; code: string }) => {
          if (code !== '123456') return { error: { message: 'Invalid TOTP' } };
          factores = factores.map(f => (f.id === factorId ? { ...f, status: 'verified' as const } : f));
          return { error: null };
        }
      }
    }
  };
  return { auth: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).auth, llamadas };
}

describe('capa de datos · Supabase · cuenta', () => {
  it('cambia la contraseña con updateUser y traduce el error', async () => {
    const c = cliente();
    await c.auth.cambiarClave('abcde12345');
    expect(c.llamadas).toEqual(['updateUser 10']);
    await expect(cliente([], true).auth.cambiarClave('abcde12345')).rejects.toThrow(/No se pudo guardar/);
  });

  it('activación: quita intentos sin terminar, inscribe, confirma con el código y queda activa', async () => {
    const c = cliente([{ id: 'viejo', status: 'unverified', factor_type: 'totp' }]);
    expect(await c.auth.tieneVerificacion()).toBe(false);
    const ins = await c.auth.iniciarVerificacion();
    expect(c.llamadas).toEqual(['unenroll viejo', 'enroll Celular 1']);
    expect(ins.secreto).toBe('ABC123');
    expect(ins.qr.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    await expect(c.auth.confirmarVerificacion(ins.factorId, '12')).rejects.toMatchObject({
      codigo: 'codigo'
    });
    await expect(c.auth.confirmarVerificacion(ins.factorId, '000000')).rejects.toMatchObject({
      codigo: 'codigo'
    });
    await c.auth.confirmarVerificacion(ins.factorId, '123 456');
    expect(await c.auth.tieneVerificacion()).toBe(true);
  });

  it('un segundo celular se llama "Celular 2"; cancelar quita el intento', async () => {
    const c = cliente([{ id: 'f1', status: 'verified', factor_type: 'totp' }]);
    const ins = await c.auth.iniciarVerificacion();
    expect(c.llamadas).toEqual(['enroll Celular 2']);
    await c.auth.cancelarVerificacion(ins.factorId);
    expect(c.llamadas).toContain('unenroll nuevo');
  });

  it('qrSeguro igual que la 2.x: codifica el SVG y deja intactas las imágenes en base64', () => {
    expect(qrSeguro('data:image/svg+xml;utf-8,<svg fill="#fff"/>')).toBe(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg fill="#fff"/>')
    );
    expect(qrSeguro('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(qrSeguro('data:image/svg+xml;utf-8,%3Csvg%2F%3E')).toBe(
      'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg/>')
    );
  });
});
