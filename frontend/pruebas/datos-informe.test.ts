// Informe ejecutivo: registro del informe generado (logInforme de la 2.x) en la demostración y en Supabase simulado.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';

const E = {
  alcance: 'Todas las dependencias',
  vigencias: '2024, 2025, 2026',
  corte: '2026-07-29',
  n: 10,
  huella: 'ab'
};

describe('informe · demostración', () => {
  it('queda en la lista de informes generados y en la auditoría', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    await d.actividad.registrarInforme(E);
    expect(await d.actividad.informes()).toMatchObject([
      { usuario: 'enlace.demo@cali.gov.co', alcance: E.alcance, vigencias: E.vigencias, n: 10, huella: 'ab' }
    ]);
    const ev = await d.auditoria.eventos();
    expect(ev.find(e => e.tabla === 'informes')?.accion).toBe('INSERT');
  });
});

describe('informe · Supabase simulado', () => {
  it('inserta en informes con las mismas columnas de la 2.x; un error da mensaje claro', async () => {
    const llamadas: unknown[] = [];
    const cliente = (error?: string) =>
      datosSupabase({
        from: (t: string) => ({
          insert: (fila: unknown) => {
            llamadas.push([t, fila]);
            return Promise.resolve({ error: error ? { message: error } : null });
          }
        })
      } as unknown as Parameters<typeof datosSupabase>[0]).actividad;
    await cliente().registrarInforme(E);
    expect(llamadas).toEqual([
      [
        'informes',
        { alcance: E.alcance, vigencias: E.vigencias, corte: '2026-07-29', n_registros: 10, huella: 'ab' }
      ]
    ]);
    await expect(
      cliente('new row violates row-level security policy').registrarInforme({ ...E, corte: '' })
    ).rejects.toMatchObject({ codigo: 'sin_permiso' });
    expect(llamadas[1]).toEqual(['informes', expect.objectContaining({ corte: null })]);
  });
});
