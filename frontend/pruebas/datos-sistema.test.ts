// Configuración (repositorio sistema) con Supabase simulado: lectura sin las columnas de scripts no instalados,
// errores de las funciones del servidor como la 2.x y lista de copias.
import { describe, expect, it } from 'vitest';
import { datosSupabase } from '../src/datos/supabase';
import { tieneAvisos, tieneResumen } from '../src/dominio/configuracion';

function cliente(o: {
  config?: Record<string, unknown>;
  funcion?: { data?: unknown; error?: unknown };
  archivos?: unknown[];
}) {
  const sb = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: o.config ?? null, error: null }) })
      })
    }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null, ...o.funcion }) },
    storage: { from: () => ({ list: () => Promise.resolve({ data: o.archivos ?? [], error: null }) }) }
  };
  return datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).sistema;
}

describe('sistema · Supabase simulado', () => {
  it('sin el script 24 no llegan las columnas del aviso diario (la pantalla explica cómo instalarlo)', async () => {
    const c = await cliente({
      config: { id: 1, dias_rojo: 5, correo_disciplinario: '', resumen_activo: false }
    }).general();
    expect(c).not.toHaveProperty('id');
    expect(tieneResumen(c)).toBe(true);
    expect(tieneAvisos(c)).toBe(false);
  });

  it('prueba del resumen: rechazo del servidor de correo y error de la función', async () => {
    await expect(
      cliente({ funcion: { data: { enviados: 0, errores: ['535 auth failed'] } } }).probarResumen()
    ).rejects.toThrow('el servidor de correo respondió: 535 auth failed');
    await expect(
      cliente({ funcion: { data: { error: 'Sin secretos SMTP' } } }).probarResumen()
    ).rejects.toThrow('Sin secretos SMTP');
    expect(await cliente({ funcion: { data: { enviados: 3 } } }).probarResumen()).toEqual({ enviados: 3 });
  });

  it('lista solo los archivos de copia, con su tamaño en KB', async () => {
    const l = await cliente({
      archivos: [
        { name: 'respaldo_2026-11-08_2300.json.gz', metadata: { size: 360448 } },
        { name: 'notas.txt', metadata: { size: 10 } }
      ]
    }).respaldos();
    expect(l).toEqual([{ nombre: 'respaldo_2026-11-08_2300.json.gz', kb: 352 }]);
  });
});
