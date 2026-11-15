// Planes · norma (entrega 4a): prórrogas e informes semestrales en la demo (una sola prórroga por caso; al conceder
// una de acción cambia la fecha y se conserva la original; art. 16) y pm_resolver_prorroga con Supabase simulado.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';

async function admin() {
  const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
  await d.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO);
  await d.auth.verificarCodigo(CODIGO_DEMO);
  return d;
}

describe('norma · demostración', () => {
  it('registra un informe semestral y una sola prórroga por caso', async () => {
    const d = await admin();
    await d.planes.guardar('inf', {
      plan_id: 'pm-demo-1',
      corte: '2026-06-30',
      fecha_envio: '2026-07-10',
      radicado_orfeo: ''
    });
    expect((await d.planes.datos()).informes).toMatchObject([{ plan_id: 'pm-demo-1', corte: '2026-06-30' }]);
    const pr = {
      plan_id: 'pm-demo-1',
      tipo: 'informe',
      corte: '2026-12-31',
      estado: 'solicitada',
      fecha_nueva: '2027-01-29'
    };
    await d.planes.guardar('pror', pr);
    await expect(d.planes.guardar('pror', pr)).rejects.toThrow(
      'Ya existe una prórroga para este caso: solo se permite una vez'
    );
    // otro corte sí se puede
    await d.planes.guardar('pror', { ...pr, corte: '2027-06-30' });
    expect((await d.planes.datos()).prorrogas).toHaveLength(2);
  });

  it('conceder una prórroga de acción: exige más de la mitad cumplida y el 30 % del plazo; cambia la fecha', async () => {
    const d = await admin();
    const x = await d.planes.datos();
    // acción ficticia con 60 % validado, del 1-ene al 31-dic de 2026 (30 % de 364 días = 110 días)
    const pid = 'pm-demo-1';
    const hid = x.hallazgos.find(h => h.plan_id === pid)?.id as string;
    const aid = await d.planes.guardar('acc', {
      plan_id: pid,
      hallazgo_id: hid,
      accion: 'Acción ficticia',
      unidad_medida: 'Porcentaje',
      cantidad: 100,
      fecha_inicio: '2026-01-01',
      fecha_fin: '2026-12-31'
    });
    await d.planes.guardar('acc', { avance: 60 }, aid);
    const base = {
      plan_id: pid,
      accion_id: aid,
      tipo: 'accion',
      estado: 'solicitada',
      fecha_solicitud: '2026-11-15'
    };
    // 30 % excedido: se puede registrar la solicitud pero no conceder
    await d.planes.guardar('pror', { ...base, fecha_nueva: '2027-06-30' });
    const pr1 = (await d.planes.datos()).prorrogas?.[0];
    await expect(d.planes.resolverProrroga(pr1?.id as string, 'concedida', '', '2026-11-20')).rejects.toThrow(
      'Artículo 16: el nuevo plazo no puede superar el 30 % del inicialmente establecido'
    );
    await d.planes.resolverProrroga(pr1?.id as string, 'negada', '', '2026-11-20');
    await expect(d.planes.resolverProrroga(pr1?.id as string, 'negada', '', '2026-11-20')).rejects.toThrow(
      'La prórroga ya fue resuelta'
    );
    // negada: se puede pedir otra, dentro del 30 %
    await d.planes.guardar('pror', { ...base, fecha_nueva: '2027-03-15' });
    const pr2 = (await d.planes.datos()).prorrogas?.find(p => p.estado === 'solicitada');
    await d.planes.resolverProrroga(pr2?.id as string, 'concedida', '2026000000009', '2026-11-20');
    const a = (await d.planes.datos()).acciones.find(z => z.id === aid);
    expect(a).toMatchObject({ fecha_fin: '2027-03-15', fecha_fin_original: '2026-12-31' });
  });

  it('el enlace no resuelve prórrogas', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    await expect(d.planes.resolverProrroga('x', 'concedida', '', '2026-11-20')).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
  });
});

describe('norma · Supabase simulado', () => {
  it('guarda en pm_prorrogas y pm_informes_avance; resuelve con pm_resolver_prorroga', async () => {
    const log: string[] = [];
    const sb = {
      from: (t: string) => {
        const q = {
          insert: () => (log.push('insert ' + t), q),
          select: () => q,
          single: () => Promise.resolve({ data: { id: 'n1' }, error: null })
        };
        return q;
      },
      rpc: (f: string, a: unknown) => (
        log.push(`rpc ${f} ${JSON.stringify(a)}`), Promise.resolve({ data: null, error: null })
      )
    };
    const p = datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes;
    await p.guardar('pror', { tipo: 'presentacion' });
    await p.guardar('inf', { corte: '2026-06-30' });
    await p.resolverProrroga('pr-1', 'concedida', '123', '2026-11-20');
    expect(log).toEqual([
      'insert pm_prorrogas',
      'insert pm_informes_avance',
      'rpc pm_resolver_prorroga {"p_id":"pr-1","p_estado":"concedida","p_radicado":"123","p_fecha":"2026-11-20"}'
    ]);
  });
});
