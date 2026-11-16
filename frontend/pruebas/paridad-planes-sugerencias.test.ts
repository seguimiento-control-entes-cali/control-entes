// Paridad con la 2.x · Planes, entrega 4c-1: plantillas de acciones (copiadas por script) y sugerencias según la causa
// (pmSugerencias REAL), y traslados en la demo y con Supabase simulado.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';
import { PLANTILLAS, PLANTILLA_GENERAL, sugerencias, type Plantilla } from '../src/dominio/planes-plantillas';

const d2 = cargarApp(['PM_PLANTILLAS', 'PM_PLANTILLA_GENERAL', 'pmSugerencias']) as {
  PM_PLANTILLAS: Plantilla[];
  PM_PLANTILLA_GENERAL: Plantilla;
  pmSugerencias: (h: unknown) => Plantilla[];
};
// Las expresiones regulares se comparan por su texto (JSON las vuelve {})
const plano = (l: readonly Plantilla[]) =>
  l.map(g => ({ ...g, re: g.re ? g.re.source + '/' + g.re.flags : null }));

describe('paridad con la 2.x · sugerencias de acciones', () => {
  it('las plantillas son idénticas a las de la 2.x (textos, metas, plazos y reglas)', () => {
    expect(plano(PLANTILLAS)).toEqual(plano(d2.PM_PLANTILLAS));
    expect(plano([PLANTILLA_GENERAL])).toEqual(plano([d2.PM_PLANTILLA_GENERAL]));
    expect(PLANTILLAS.length).toBeGreaterThan(4);
  });
  it('mismas sugerencias para causas y descripciones ficticias', () => {
    const casos = [
      { causa: 'Pagos sin registro presupuestal ni contrato perfeccionado', descripcion: '' },
      {
        causa: '',
        descripcion: 'Publicación extemporánea en SECOP II de documentos del proceso contractual'
      },
      { causa: 'Falta de supervisión y de informes del supervisor', descripcion: 'Expedientes incompletos' },
      { causa: 'Desconocimiento del procedimiento', descripcion: 'Inventario de bienes desactualizado' },
      { causa: null, descripcion: null },
      {
        causa: 'Hecho cumplido sin contrato, vigilancia presupuestal deficiente y archivo desorganizado',
        descripcion: ''
      }
    ];
    for (const h of casos)
      expect(
        sugerencias(h).map(g => g.id),
        JSON.stringify(h)
      ).toEqual(d2.pmSugerencias(h).map(g => g.id));
  });
});

describe('traslados de hallazgos', () => {
  it('demo: Control de planes registra, edita y elimina; el enlace no', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO);
    await d.auth.verificarCodigo(CODIGO_DEMO);
    const t = {
      plan_id: 'pm-demo-1',
      hallazgo_id: 'h-pm-demo-1-1',
      tipo: 'disciplinaria',
      estado: 'trasladado',
      destino: 'Procuraduría General de la Nación'
    };
    const id = await d.planes.guardar('tras', t);
    await d.planes.guardar('tras', { estado: 'en_indagacion' }, id);
    expect((await d.planes.datos()).traslados).toMatchObject([
      { id, estado: 'en_indagacion', destino: t.destino }
    ]);
    await d.planes.eliminar('tras', id);
    expect((await d.planes.datos()).traslados).toEqual([]);
    const e = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await e.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    await expect(e.planes.guardar('tras', t)).rejects.toMatchObject({ codigo: 'sin_permiso' });
  });
  it('Supabase: guarda y elimina en pm_traslados', async () => {
    const log: string[] = [];
    const sb = {
      from: (tb: string) => {
        const q = {
          insert: () => (log.push('insert ' + tb), q),
          delete: () => (log.push('delete ' + tb), q),
          select: () => q,
          single: () => Promise.resolve({ data: { id: 't1' }, error: null }),
          eq: () => Promise.resolve({ data: null, error: null })
        };
        return q;
      }
    };
    const p = datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes;
    expect(await p.guardar('tras', { tipo: 'penal' })).toBe('t1');
    await p.eliminar('tras', 't1');
    expect(log).toEqual(['insert pm_traslados', 'delete pm_traslados']);
  });
});
