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
