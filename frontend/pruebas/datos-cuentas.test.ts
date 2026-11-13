// Cuentas: llamada a la función gestion-cuentas con Supabase simulado (mensajes y errores como la 2.x) y permisos
// de la demostración.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';

const cliente = (r: { data?: unknown; error?: unknown }) => {
  const llamadas: unknown[] = [];
  const sb = {
    functions: {
      invoke: (f: string, o: unknown) => (
        llamadas.push([f, o]), Promise.resolve({ data: null, error: null, ...r })
      )
    }
  };
  return { c: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).cuentas, llamadas };
};

describe('cuentas · Supabase simulado', () => {
  it('envía la acción y los datos a gestion-cuentas y devuelve su mensaje', async () => {
    const x = cliente({ data: { ok: true, mensaje: 'Cuenta preparada.' } });
    expect(await x.c.gestionar('preparar', { correo: 'a@cali.gov.co' })).toEqual({
      mensaje: 'Cuenta preparada.'
    });
    expect(x.llamadas).toEqual([
      ['gestion-cuentas', { body: { accion: 'preparar', correo: 'a@cali.gov.co' } }]
    ]);
  });

  it('usa el error que manda la función; si no está desplegada lo dice claro', async () => {
    const conCuerpo = cliente({
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: () => Promise.resolve({ error: 'Ese correo ya existe.' }) }
      }
    });
    await expect(conCuerpo.c.gestionar('invitar', {})).rejects.toThrow('Ese correo ya existe.');
    await expect(
      cliente({ error: { message: 'Failed to send a request to the Edge Function' } }).c.gestionar(
        'invitar',
        {}
      )
    ).rejects.toThrow('La función gestion-cuentas no está desplegada en Supabase');
    await expect(
      cliente({ data: { error: 'Rol no permitido.' } }).c.gestionar('invitar', {})
    ).rejects.toThrow('Rol no permitido.');
  });
});

describe('cuentas · demostración', () => {
  it('solo el Super administrador gestiona cuentas', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('despacho.demo@cali.gov.co', CLAVE_DEMO);
    await expect(d.cuentas.gestionar('invitar', { correo: 'x@cali.gov.co' })).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
  });
});
