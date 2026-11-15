// Carga del Excel de control con Supabase simulado: lo que se envía a cargar_historico y el aviso si falta el script 16.
import { describe, expect, it } from 'vitest';
import { datosSupabase } from '../src/datos/supabase';

const C = { vigencias: [2026], archivos: ['Control Vigencia 2026.xlsx'], corte: '2026-11-13', filas: [] };
function cliente(r: { data?: unknown; error?: { message: string } | null }) {
  const llamadas: unknown[] = [];
  const sb = {
    rpc: (f: string, a: unknown) => (
      llamadas.push([f, a]), Promise.resolve({ data: null, error: null, ...r })
    )
  };
  return { h: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).historico, llamadas };
}

describe('Excel de control · Supabase simulado', () => {
  it('envía vigencias, archivos, corte y filas en un solo llamado y devuelve el resultado', async () => {
    const x = cliente({ data: { registros: 10, abiertos_nuevos: 2 } });
    expect(await x.h.cargarVigencias(C)).toEqual({ registros: 10, abiertos_nuevos: 2 });
    expect(x.llamadas).toEqual([['cargar_historico', { p: C }]]);
  });

  it('si la función no existe, dice qué script falta', async () => {
    const x = cliente({
      error: { message: 'Could not find the function public.cargar_historico(p) in the schema cache' }
    });
    await expect(x.h.cargarVigencias(C)).rejects.toThrow(
      'Falta ejecutar en Supabase el script supabase/16_carga_excel.sql'
    );
  });
});
