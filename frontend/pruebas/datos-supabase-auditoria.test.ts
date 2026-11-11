// Auditoría con un cliente de Supabase simulado: los 300 eventos más recientes y la función de verificación.
import { describe, expect, it } from 'vitest';
import { datosSupabase } from '../src/datos/supabase';

function cliente(resultado: unknown[] | null, error?: string) {
  const llamadas: string[] = [];
  const sb = {
    from: (tabla: string) => {
      const q = {
        select: () => q,
        order: (c: string, o: { ascending: boolean }) => {
          llamadas.push(`${tabla} order ${c} ${o.ascending ? 'asc' : 'desc'}`);
          return q;
        },
        limit: (n: number) => {
          llamadas.push('limit ' + n);
          return Promise.resolve({ data: [{ id: 9 }], error: null });
        }
      };
      return q;
    },
    rpc: (f: string) => {
      llamadas.push('rpc ' + f);
      return Promise.resolve(
        error ? { data: null, error: { message: error } } : { data: resultado, error: null }
      );
    }
  };
  return { a: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).auditoria, llamadas };
}

describe('capa de datos · Supabase · auditoría', () => {
  it('pide los 300 eventos más recientes y verifica con verificar_cadena_auditoria', async () => {
    const c = cliente([{ ok: true, total: 344, primer_id_roto: null }]);
    expect(await c.a.eventos()).toEqual([{ id: 9 }]);
    expect(await c.a.verificar()).toEqual({ ok: true, total: 344, primer_id_roto: null });
    expect(c.llamadas).toEqual(['audit_log order id desc', 'limit 300', 'rpc verificar_cadena_auditoria']);
    expect(c.a.simularManipulacion).toBeUndefined();
  });
  it('si la función falla, da un mensaje claro', async () => {
    await expect(cliente(null, 'permission denied').a.verificar()).rejects.toThrow(
      'No se pudo verificar la cadena: permission denied'
    );
  });
});
