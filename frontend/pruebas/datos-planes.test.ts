// Planes: lectura con Supabase simulado (las cuatro tablas y los traslados opcionales) y alcance de la demostración.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';

function cliente(sinTraslados: boolean) {
  const leidas: string[] = [];
  const sb = {
    from: (t: string) => {
      const q = {
        select: () => q,
        order: () => q,
        range: () => {
          leidas.push(t);
          if (t === 'pm_traslados' && sinTraslados)
            return Promise.resolve({
              data: null,
              error: { message: 'relation "pm_traslados" does not exist' }
            });
          return Promise.resolve({ data: [{ id: t + '-1' }], error: null });
        }
      };
      return q;
    }
  };
  return { p: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes, leidas };
}

describe('planes · Supabase simulado', () => {
  it('lee planes, hallazgos, acciones, avances y traslados', async () => {
    const x = cliente(false);
    const d = await x.p.datos();
    expect([d.planes.length, d.hallazgos.length, d.acciones.length, d.avances.length]).toEqual([1, 1, 1, 1]);
    expect(d.traslados).toHaveLength(1);
    expect(x.leidas.sort()).toEqual([
      'pm_acciones',
      'pm_avances',
      'pm_hallazgos',
      'pm_planes',
      'pm_traslados'
    ]);
  });
  it('sin la tabla de traslados (script 18) sigue sin ellos', async () => {
    expect((await cliente(true).p.datos()).traslados).toBeNull();
  });
});

describe('planes · demostración', () => {
  it('el enlace solo ve las acciones, hallazgos, planes y avances de su dependencia', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    const x = await d.planes.datos();
    expect(x.acciones.every(a => a.dependencia_id === 21)).toBe(true);
    expect(x.acciones).toHaveLength(2);
    expect(x.planes).toHaveLength(1);
    expect(x.avances.every(v => v.dependencia_id === 21)).toBe(true);
  });
});
