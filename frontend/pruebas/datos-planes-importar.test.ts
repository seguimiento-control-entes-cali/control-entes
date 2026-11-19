// Planes · importar (entrega 3a): la demo crea el plan con hallazgos, acciones y avances validados (pmImportar de la
// 2.x) y solo para quien edita planes; con Supabase se envía la carga completa a pm_importar.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';
import { cargaImportacion, leerLibroPlan } from '../src/dominio/planes-importar';

const HOY = '2026-11-15';
// Hoja PM_01 FICTICIA, ya en filas (como la entrega leer-plan.ts)
const filas = [
  ['CONTRALORÍA GENERAL DE SANTIAGO DE CALI'],
  ['Nombre de la actuación de control fiscal (2): ', 'Auditoría ficticia de importación'],
  ['Fecha de suscripción (4): 15 de enero de 2026'],
  [
    'N° hallazgo (6)',
    'Descripción de la condición y causa del hallazgo (7)',
    'Connotación del hallazgo (8)',
    'Acción de Correctiva (10)',
    'Meta (11)',
    'Lugar de verificación (13)',
    'Fecha terminación de la Actividad (14)',
    'Responsable (Nombre y Cargo) (15)',
    'Descripción del avance de la acción (16)',
    'Fecha de corte (17)',
    '% de avance (18)',
    'Observaciones DACI'
  ],
  [
    '1',
    'Los expedientes no tienen lista de chequeo',
    'Administrativa',
    'Adoptar lista de chequeo',
    'Lista adoptada',
    'Secretaría de Salud Pública',
    '31/12/2026',
    'Secretario de Salud Pública',
    'Se adoptó la lista',
    '30/06/2026',
    '50%',
    'Precisar la meta'
  ],
  [
    '2',
    'Pagos sin soporte',
    'Administrativa fiscal',
    'Conciliar pagos',
    'Conciliaciones',
    '',
    '30/09/2026',
    '',
    '',
    '',
    '',
    ''
  ]
];
const deps = [{ id: 21, nombre: 'Secretaría de Salud Pública' }];
const imp = leerLibroPlan([{ nombre: 'PM_01', filas }], 'plan-ficticio.xlsx', deps, {
  planes: [],
  hallazgos: []
});
const carga = cargaImportacion(imp, [{ id: 3, nombre: 'Contraloría General de Santiago de Cali' }], HOY);

describe('planes · importar en la demostración', () => {
  it('lee la hoja ficticia como la 2.x (dos hallazgos, avance 50 con corte, dependencia reconocida)', () => {
    expect(carga.plan).toMatchObject({
      ejercicio: 'Auditoría ficticia de importación',
      fecha_suscripcion: '2026-01-15',
      ente_id: 3,
      estado: 'en_ejecucion'
    });
    expect(carga.hallazgos.map(h => h.acciones[0])).toMatchObject([
      { dependencia_id: 21, avance: 50, fecha_corte: '2026-06-30', obs_ci: 'Precisar la meta' },
      { dependencia_id: null, avance: null, fecha_corte: null }
    ]);
  });

  it('el Super administrador importa: avance validado, observación pendiente y auditoría', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO);
    await d.auth.verificarCodigo(CODIGO_DEMO);
    const id = await d.planes.importar(carga);
    const x = await d.planes.datos();
    expect(x.planes.find(p => p.id === id)?.ejercicio).toBe('Auditoría ficticia de importación');
    expect(x.hallazgos.filter(h => h.plan_id === id).map(h => h.numero)).toEqual(['1', '2']);
    const acc = x.acciones.filter(a => a.plan_id === id);
    expect(acc[0]).toMatchObject({ avance: 50, fecha_corte: '2026-06-30', obs_ci_estado: 'pendiente' });
    expect(acc[1]).toMatchObject({ avance: 0, fecha_corte: null, obs_ci_estado: '' });
    const av = x.avances.filter(v => v.plan_id === id);
    expect(av).toHaveLength(1);
    expect(av[0]).toMatchObject({
      estado: 'validado',
      cantidad: 50,
      descripcion: 'Se adoptó la lista',
      observacion: 'Importado del archivo plan-ficticio.xlsx'
    });
    // Un plan importado se puede eliminar aunque tenga esos avances (solo los importados)
    const ev = await d.auditoria.eventos();
    expect(ev[0]).toMatchObject({ tabla: 'pm_planes', accion: 'INSERT', registro_id: id });
    await d.planes.eliminarPlan(id);
    expect((await d.planes.datos()).planes.some(p => p.id === id)).toBe(false);
  });

  it('el enlace importa (script 29), pero debe escribir el número del informe; el Alcalde no importa', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    const sinNumero = { ...carga, plan: { ...carga.plan, numero_informe: '' } };
    await expect(d.planes.importar(sinNumero)).rejects.toThrow('Escriba el número del informe final');
    const id = await d.planes.importar({ ...carga, plan: { ...carga.plan, numero_informe: 'INF-ENL-9' } });
    expect((await d.planes.datos()).planes.find(p => p.id === id)?.estado).toBe('formulacion');
    const a = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await a.auth.ingresar('despacho.demo@cali.gov.co', CLAVE_DEMO);
    await expect(a.planes.importar(carga)).rejects.toThrow('Su rol no puede importar planes');
  });
});

describe('planes · importar con Supabase simulado', () => {
  it('envía la carga a pm_importar y devuelve el id del plan', async () => {
    const llamadas: [string, unknown][] = [];
    const sb = {
      rpc: (f: string, args: unknown) => {
        llamadas.push([f, args]);
        return Promise.resolve({ data: 'plan-9', error: null });
      }
    };
    const p = datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes;
    expect(await p.importar(carga)).toBe('plan-9');
    expect(llamadas).toEqual([['pm_importar', { p: carga }]]);
  });
  it('traduce el error de número de hallazgo repetido', async () => {
    const sb = {
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { message: 'duplicate key value violates unique constraint "pm_hallazgos_numero_unq"' }
        })
    };
    const p = datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes;
    await expect(p.importar(carga)).rejects.toThrow('Ya existe un hallazgo con ese número en el plan');
  });
});
