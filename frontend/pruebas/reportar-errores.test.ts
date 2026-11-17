// Errores del navegador en «Salud del sistema» (reportarErrorApp de la 2.x): Supabase llama registrar_error_app con
// el mensaje y el detalle; la demo no registra nada.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { datosSupabase } from '../src/datos/supabase';

describe('registro de errores de la aplicación', () => {
  it('Supabase: llama registrar_error_app (script 17)', async () => {
    const llamadas: [string, unknown][] = [];
    const sb = {
      rpc: (f: string, a: unknown) => {
        llamadas.push([f, a]);
        return Promise.resolve({ data: null, error: null });
      }
    };
    const s = datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).sistema;
    await s.registrarError('falla de prueba', { vista: 'planes', version: '3.0.0' });
    expect(llamadas).toEqual([
      [
        'registrar_error_app',
        { p_mensaje: 'falla de prueba', p_detalle: { vista: 'planes', version: '3.0.0' } }
      ]
    ]);
  });
  it('demo: no registra (no hay servidor)', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await expect(d.sistema.registrarError('x', {})).resolves.toBeUndefined();
  });
});

describe('Mi cuenta · verificación en dos pasos con Supabase simulado', () => {
  it('lista los celulares verificados y quita uno', async () => {
    const quitados: string[] = [];
    const sb = {
      auth: {
        mfa: {
          listFactors: () =>
            Promise.resolve({
              data: {
                totp: [
                  {
                    id: 'f1',
                    status: 'verified',
                    friendly_name: 'Celular 1',
                    created_at: '2026-11-10T15:00:00Z'
                  },
                  {
                    id: 'f2',
                    status: 'unverified',
                    friendly_name: 'Celular 2',
                    created_at: '2026-11-11T15:00:00Z'
                  }
                ]
              },
              error: null
            }),
          unenroll: ({ factorId }: { factorId: string }) => {
            quitados.push(factorId);
            return Promise.resolve({ data: null, error: null });
          }
        }
      }
    };
    const a = datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).auth;
    expect(await a.celularesVerificados()).toEqual([{ id: 'f1', nombre: 'Celular 1', desde: '2026-11-10' }]);
    await a.quitarCelular('f1');
    expect(quitados).toEqual(['f1']);
  });
});
