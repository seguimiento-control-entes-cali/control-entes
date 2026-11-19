// Scripts 28 y 29 en la demostración: la dependencia importa el informe (plan en formulación, solo sus acciones,
// sin avances), el informe repetido se rechaza, y la evaluación de la Contraloría la registra Control Interno.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import type { CargaPlan } from '../src/dominio/planes-importar';

async function demo(correo: string) {
  const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
  await d.auth.ingresar(correo, CLAVE_DEMO);
  if (correo.startsWith('admin')) await d.auth.verificarCodigo?.(CODIGO_DEMO);
  return d;
}
const SALUD = 21;
const OTRA = 7;
const carga = (numero: string): CargaPlan =>
  ({
    archivo: 'informe.xlsx',
    plan: {
      formato: 'PM_01_CGSC',
      contraloria: 'Contraloría General de Santiago de Cali',
      ejercicio: 'PRUEBA · informe importado por la dependencia',
      fecha_suscripcion: '2026-11-01',
      numero_informe: numero,
      estado: 'en_ejecucion'
    },
    hallazgos: [
      {
        numero: '1',
        descripcion: 'PRUEBA · hallazgo de Salud',
        dependencia_id: SALUD,
        acciones: [
          {
            accion: 'Acción de Salud',
            dependencia_id: SALUD,
            fecha_inicio: '2026-12-01',
            fecha_fin: '2027-06-30',
            avance: 40,
            fecha_corte: '2026-12-15'
          },
          {
            accion: 'Acción de otra dependencia',
            dependencia_id: OTRA,
            fecha_inicio: '2026-12-01',
            fecha_fin: '2027-06-30'
          }
        ]
      }
    ]
  }) as unknown as CargaPlan;

describe('planes · la dependencia carga el informe (script 29)', () => {
  it('queda en formulación, con solo sus acciones y sin avances; lo ve y lo puede formular', async () => {
    const d = await demo('enlace.demo@cali.gov.co');
    const id = await d.planes.importar(carga('INF-DEP-1'));
    const x = await d.planes.datos();
    const p = x.planes.find(q => q.id === id);
    expect(p?.estado).toBe('formulacion');
    const acc = x.acciones.filter(a => a.plan_id === id);
    expect(acc.map(a => a.accion)).toEqual(['Acción de Salud']);
    expect(acc[0]?.dependencia_id).toBe(SALUD);
    expect(x.avances.filter(v => v.plan_id === id)).toHaveLength(0);
    expect(x.hallazgos.find(h => h.plan_id === id)?.formulacion_estado).toBe('borrador');
  });

  it('el mismo informe no se carga dos veces (aunque cambien mayúsculas o espacios)', async () => {
    const d = await demo('enlace.demo@cali.gov.co');
    await d.planes.importar(carga('INF-DEP-2'));
    await expect(d.planes.importar(carga(' inf-dep-2 '))).rejects.toThrow(/ya fue cargado/);
    expect(await d.planes.buscarInforme('Contraloría General de Santiago de Cali', 'INF-DEP-2')).toHaveLength(
      1
    );
  });

  it('Control Interno importa como siempre: todas las acciones y sus avances', async () => {
    const d = await demo('control.interno.demo@cali.gov.co');
    const id = await d.planes.importar(carga('INF-CI-1'));
    const x = await d.planes.datos();
    expect(x.planes.find(q => q.id === id)?.estado).toBe('en_ejecucion');
    expect(x.acciones.filter(a => a.plan_id === id)).toHaveLength(2);
    expect(x.avances.filter(v => v.plan_id === id)).toHaveLength(1);
  });
});

describe('planes · evaluación de la Contraloría (script 28)', () => {
  it('Control Interno registra el puntaje del plan y la calificación de cada hallazgo', async () => {
    const d = await demo('control.interno.demo@cali.gov.co');
    await d.planes.guardar('plan', { puntaje_cgsc: 81.28, eval_cgsc_fecha: '2026-11-10' }, 'pm-demo-1');
    const h = (await d.planes.datos()).hallazgos.find(q => q.plan_id === 'pm-demo-1');
    if (!h) throw new Error('la demo trae hallazgos');
    await d.planes.guardar(
      'hall',
      { eval_cgsc: 'parcialmente_efectiva', eval_cgsc_obs: 'Faltan soportes', eval_cgsc_fecha: '2026-11-10' },
      h.id
    );
    const x = await d.planes.datos();
    expect(x.planes.find(q => q.id === 'pm-demo-1')?.puntaje_cgsc).toBe(81.28);
    expect(x.hallazgos.find(q => q.id === h.id)?.eval_cgsc).toBe('parcialmente_efectiva');
  });

  it('la dependencia no registra la evaluación de la Contraloría', async () => {
    const d = await demo('enlace.demo@cali.gov.co');
    const h = (await d.planes.datos()).hallazgos.find(q => q.formulacion_estado === 'borrador');
    if (!h) throw new Error('la demo trae un hallazgo en formulación');
    await expect(d.planes.guardar('hall', { eval_cgsc: 'efectiva' }, h.id)).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
  });
});
