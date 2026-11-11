// Histórico con un cliente de Supabase simulado: lectura por páginas y cierres hechos en la app (sin red).
import { describe, expect, it } from 'vitest';
import { datosSupabase } from '../src/datos/supabase';

const fila = (i: number, extra: Record<string, unknown> = {}) => ({
  vigencia: 2025,
  radicacion_ente: 'R-' + i,
  ente: 'Contraloría',
  orfeo_entrada: '2025' + String(i).padStart(10, '0'),
  fecha_recibo: '2025-03-03',
  organismo: 'Secretaría de Salud Pública',
  tipo_organismo: 'Secretaría',
  asunto: 'Asunto ' + i,
  termino_dias_habiles: 10,
  fecha_maxima: '2025-03-17',
  orfeo_respuesta: null,
  fecha_respuesta: null,
  respondio: 'No',
  oportunidad: 'Sin respuesta (vencida)',
  retraso_dias_habiles: null,
  dias_habiles_responder: null,
  ...extra
});

function cliente(total: number, cierres: { hist_key: string; orfeo_salida: string; fecha_cierre: string }[]) {
  const llamadas: string[] = [];
  const filas = Array.from({ length: total }, (_, i) => fila(i));
  const sb = {
    from: (tabla: string) => {
      const q = {
        select: () => q,
        order: () => q,
        not: () => q,
        eq: () => Promise.resolve({ data: tabla === 'requerimientos' ? cierres : [], error: null }),
        range: (a: number, b: number) => {
          llamadas.push(`range ${a}-${b}`);
          return Promise.resolve({ data: filas.slice(a, b + 1), error: null });
        }
      };
      return q;
    }
  };
  return { h: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).historico, llamadas };
}

describe('capa de datos · Supabase · histórico', () => {
  it('lee por páginas de 1000 y calcula la fecha de corte', async () => {
    const c = cliente(2001, []);
    const r = await c.h.radicados();
    expect(c.llamadas).toEqual(['range 0-999', 'range 1000-1999', 'range 2000-2999']);
    expect(r.filas).toHaveLength(2001);
    expect(r.filas[0]).toMatchObject({ v: 2025, opo: 2, resp: 0, org: 'Secretaría de Salud Pública' });
    expect(r.corte).toBe('2025-03-03');
  });

  it('aplica el cierre hecho en la app (igual que aplicarCierresApp de la 2.x)', async () => {
    const llave = ['2025', '2025' + '0'.repeat(10), 'R-0', 'Secretaría de Salud Pública'].join('|');
    const c = cliente(2, [
      { hist_key: llave, orfeo_salida: '20251234567890', fecha_cierre: '2025-03-20T00:00:00' }
    ]);
    const r = await c.h.radicados();
    expect(r.filas[0]).toMatchObject({
      opo: 1,
      resp: 1,
      orfR: '20251234567890',
      fresp: '2025-03-20',
      ret: 3,
      cerradaApp: true
    });
    expect(r.filas[1]).toMatchObject({ opo: 2, resp: 0 });
    expect(r.corte).toBe('2025-03-20');
  });
});
