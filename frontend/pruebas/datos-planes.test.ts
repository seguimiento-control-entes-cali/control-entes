// Planes: lectura con Supabase simulado (las cuatro tablas y los traslados opcionales) y alcance de la demostración.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';
import { columnasInstaladas } from '../src/dominio/planes';

function cliente(sinTraslados: boolean, sin19 = false, sin20 = false) {
  const leidas: string[] = [];
  const sb = {
    from: (t: string) => {
      const q = {
        select: () => q,
        limit: () =>
          Promise.resolve(
            sin19
              ? { data: null, error: { message: 'column direccion_tecnica does not exist' } }
              : { data: [], error: null }
          ),
        order: () => q,
        range: () => {
          leidas.push(t);
          if (sin20 && ['pm_prorrogas', 'pm_informes_avance', 'archivo_documentos'].includes(t))
            return Promise.resolve({ data: null, error: { message: 'relation does not exist' } });
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
      'archivo_documentos',
      'pm_acciones',
      'pm_avances',
      'pm_hallazgos',
      'pm_informes_avance',
      'pm_planes',
      'pm_prorrogas',
      'pm_traslados'
    ]);
    expect([d.v19, d.v20, d.prorrogas?.length, d.documentos?.length]).toEqual([true, true, 1, 1]);
  });
  it('sin los scripts 19 y 20 (como pmLoad de la 2.x): v19 y v20 en falso, sin prórrogas ni documentos', async () => {
    const d = await cliente(false, true, true).p.datos();
    expect([d.v19, d.v20, d.prorrogas, d.informes, d.documentos]).toEqual([false, false, [], [], []]);
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
    // 2 de la 2.x + 1 del plan ficticio en formulación del script 28 (Salud)
    expect(x.acciones).toHaveLength(3);
    expect(x.planes).toHaveLength(2);
    expect(x.avances.every(v => v.dependencia_id === 21)).toBe(true);
  });
});

describe('planes · columnas de los scripts 19 y 20 al guardar (pmSavePlan)', () => {
  const base = () => ({
    ejercicio: 'X',
    resolucion: '24.043',
    fecha_radicacion_informe: '',
    direccion_tecnica: 'D'
  });
  it('sin los scripts no se envían (si se enviaran, guardar fallaría)', () => {
    expect(columnasInstaladas(base(), { v19: false, v20: false })).toEqual({ ejercicio: 'X' });
  });
  it('con los scripts se envían; la fecha de radicación vacía va como null', () => {
    expect(columnasInstaladas(base(), { v19: true, v20: true })).toEqual({
      ...base(),
      fecha_radicacion_informe: null
    });
  });
});
