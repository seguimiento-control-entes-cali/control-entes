// Planes · escritura (entrega 2): formular planes, hallazgos y acciones; reportar, validar y devolver avances; eliminar.
// En la demostración con sus permisos (como la RLS) y con Supabase simulado (tablas, funciones y depósito soportes).
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';
import { semillaPlanes } from '../src/datos/demo/planes-semilla';

const pdf = (texto: string) => ({
  name: 'soporte.pdf',
  arrayBuffer: () => Promise.resolve(Uint8Array.from(texto, c => c.charCodeAt(0)).buffer)
});
const HOY = '2026-11-15';

async function demo(correo: string) {
  const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
  await d.auth.ingresar(correo, CLAVE_DEMO);
  if (correo.startsWith('admin')) await d.auth.verificarCodigo(CODIGO_DEMO);
  return d;
}
const plan = {
  contraloria: 'CGSC',
  formato: 'PM_01_CGSC',
  ejercicio: 'Auditoría de prueba',
  fecha_suscripcion: '2026-10-01',
  estado: 'formulacion'
};
const accion = (planId: string, hallId: string) => ({
  plan_id: planId,
  hallazgo_id: hallId,
  accion: 'Capacitar al equipo de prueba',
  unidad_medida: 'Capacitaciones',
  cantidad: 2,
  fecha_inicio: '2026-10-01',
  fecha_fin: '2026-12-31',
  dependencia_id: 21
});
const avance = (cantidad: number, validar: boolean) => ({
  fecha_corte: HOY,
  cantidad,
  descripcion: 'Avance de prueba con soporte',
  radicado_orfeo: '',
  validar
});

describe('planes · escritura en la demostración', () => {
  it('Super administrador: crea plan, hallazgo y acción (avance 0), rechaza el número repetido y deja auditoría', async () => {
    const d = await demo('admin.demo@cali.gov.co');
    const pid = await d.planes.guardar('plan', plan);
    const hid = await d.planes.guardar('hall', {
      plan_id: pid,
      numero: '1',
      descripcion: 'Hallazgo de prueba'
    });
    await expect(
      d.planes.guardar('hall', { plan_id: pid, numero: '1', descripcion: 'Otro' })
    ).rejects.toThrow('Ya existe un hallazgo con el número 1 en este plan');
    const aid = await d.planes.guardar('acc', accion(pid, hid));
    const x = await d.planes.datos();
    expect(x.acciones.find(a => a.id === aid)).toMatchObject({ avance: 0, fecha_corte: null });
    await d.planes.guardar('plan', { ejercicio: 'Auditoría de prueba editada' }, pid);
    expect((await d.planes.datos()).planes.find(p => p.id === pid)?.ejercicio).toBe(
      'Auditoría de prueba editada'
    );
    const ev = await d.auditoria.eventos();
    expect(ev.filter(e => e.tabla.startsWith('pm_')).map(e => `${e.tabla} ${e.accion}`)).toEqual([
      'pm_planes UPDATE',
      'pm_acciones INSERT',
      'pm_hallazgos INSERT',
      'pm_planes INSERT'
    ]);
    // Sin avances se puede eliminar todo
    await d.planes.eliminar('acc', aid);
    await d.planes.eliminar('hall', hid);
    await d.planes.eliminarPlan(pid);
    expect((await d.planes.datos()).planes.some(p => p.id === pid)).toBe(false);
  });

  it('no deja eliminar acciones, hallazgos ni planes con avances reportados', async () => {
    const d = await demo('admin.demo@cali.gov.co');
    const x = await d.planes.datos();
    const v = x.avances[0];
    if (!v) throw new Error('la semilla debe traer avances');
    const a = x.acciones.find(y => y.id === v.accion_id);
    await expect(d.planes.eliminar('acc', v.accion_id)).rejects.toThrow(
      'La acción tiene avances reportados: no se puede eliminar'
    );
    await expect(d.planes.eliminar('hall', a?.hallazgo_id as string)).rejects.toThrow(
      'El hallazgo tiene acciones con avances reportados'
    );
    await expect(d.planes.eliminarPlan(v.plan_id)).rejects.toThrow(
      'El plan tiene avances reportados por las dependencias'
    );
  });

  it('Enlace: carga el informe (el plan queda en formulación), no valida, reporta solo en su dependencia y una vez hasta que lo revisen', async () => {
    const d = await demo('enlace.demo@cali.gov.co');
    // Script 28: la dependencia carga el informe con sus hallazgos; el plan queda en formulación
    const nuevo = await d.planes.guardar('plan', { ...plan, estado: 'en_ejecucion' });
    expect((await d.planes.datos()).planes.find(p => p.id === nuevo)?.estado).toBe('formulacion');
    const ajena = semillaPlanes(HOY).acciones.find(a => a.dependencia_id !== 21);
    if (!ajena) throw new Error('la semilla debe traer acciones de otras dependencias');
    const x = await d.planes.datos();
    const libre = x.acciones.find(
      a => !x.avances.some(v => v.accion_id === a.id && v.estado === 'reportado')
    );
    if (!libre) throw new Error('el enlace debe tener una acción sin avance pendiente');
    const r = await d.planes.reportar(libre, avance(1, true), pdf('%PDF-prueba'));
    expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
    const y = await d.planes.datos();
    // "validar" solo vale para quien edita planes: el del enlace queda por validar
    const pend = y.avances.find(v => v.accion_id === libre.id && v.estado === 'reportado');
    expect(pend).toMatchObject({ soporte_hash: r.hash, reportado_email: 'enlace.demo@cali.gov.co' });
    await expect(d.planes.reportar(libre, avance(1, false), null)).rejects.toThrow(
      'Esta acción ya tiene un avance pendiente de validar'
    );
    await expect(d.planes.reportar(ajena, avance(1, false), null)).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
    await expect(d.planes.revisar(pend?.id as string, 'validado', '')).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
  });

  it('Super administrador: validar actualiza el avance de la acción; devolver exige el motivo', async () => {
    const d = await demo('admin.demo@cali.gov.co');
    const x = await d.planes.datos();
    const pend = x.avances.find(v => v.estado === 'reportado');
    if (!pend) throw new Error('la semilla debe traer un avance por validar');
    await expect(d.planes.revisar(pend.id, 'devuelto', 'no')).rejects.toThrow(
      'Indica a la dependencia por qué se devuelve el avance'
    );
    await d.planes.revisar(pend.id, 'validado', '');
    const y = await d.planes.datos();
    expect(y.avances.find(v => v.id === pend.id)).toMatchObject({
      estado: 'validado',
      revisado_email: 'admin.demo@cali.gov.co'
    });
    expect(y.acciones.find(a => a.id === pend.accion_id)).toMatchObject({
      avance: pend.cantidad,
      fecha_corte: pend.fecha_corte
    });
    await expect(d.planes.revisar(pend.id, 'validado', '')).rejects.toThrow('Este avance ya fue revisado');
    // Registrar y validar en un solo paso (quien edita planes)
    const a = y.acciones.find(z => !y.avances.some(v => v.accion_id === z.id && v.estado === 'reportado'));
    if (!a) throw new Error('debe haber una acción sin avance pendiente');
    await d.planes.reportar(a, avance(7, true), null);
    expect((await d.planes.datos()).acciones.find(z => z.id === a.id)).toMatchObject({
      avance: 7,
      fecha_corte: HOY
    });
  });
});

// ---------- Supabase simulado ----------
function simulado(fallaRpc?: { message: string; code?: string }) {
  const log: string[] = [];
  const respuesta = (r: unknown) => Promise.resolve({ data: r, error: null });
  const sb = {
    from: (t: string) => {
      const q = {
        insert: (o: unknown) => (log.push(`insert ${t} ${JSON.stringify(o)}`), q),
        update: (o: unknown) => (log.push(`update ${t} ${JSON.stringify(o)}`), q),
        delete: () => (log.push(`delete ${t}`), q),
        select: () => q,
        single: () => respuesta({ id: 'nuevo-1' }),
        eq: (c: string, v: string) => (log.push(`eq ${c}=${v}`), respuesta(null))
      };
      return q;
    },
    rpc: (f: string, args: Record<string, unknown>) => {
      log.push(`rpc ${f} ${JSON.stringify(args)}`);
      return Promise.resolve(fallaRpc ? { data: null, error: fallaRpc } : { data: null, error: null });
    },
    storage: {
      from: (b: string) => ({
        upload: (path: string) => (
          log.push(`upload ${b}/${path}`), Promise.resolve({ data: {}, error: null })
        ),
        remove: (p: string[]) => (
          log.push(`remove ${b}/${p.join(',')}`), Promise.resolve({ data: {}, error: null })
        )
      })
    }
  };
  return { p: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes, log };
}

describe('planes · escritura con Supabase simulado', () => {
  it('guarda en pm_planes, pm_hallazgos y pm_acciones (insertar devuelve el id; editar filtra por id)', async () => {
    const s = simulado();
    expect(await s.p.guardar('plan', plan)).toBe('nuevo-1');
    expect(await s.p.guardar('acc', { cantidad: 3 }, 'a-9')).toBe('a-9');
    await s.p.eliminar('hall', 'h-9');
    await s.p.eliminarPlan('pm-9');
    expect(s.log).toEqual([
      `insert pm_planes ${JSON.stringify(plan)}`,
      'update pm_acciones {"cantidad":3}',
      'eq id=a-9',
      'delete pm_hallazgos',
      'eq id=h-9',
      'rpc pm_eliminar_plan {"p_id":"pm-9"}'
    ]);
  });

  it('reportar sube el PDF a soportes/pm/<plan>/<acción>_<hora>.pdf y llama pm_reportar_avance con la huella', async () => {
    const s = simulado();
    const r = await s.p.reportar({ id: 'a-9', plan_id: 'pm-9' }, avance(1, false), pdf('%PDF-prueba'));
    expect(s.log[0]).toMatch(/^upload soportes\/pm\/pm-9\/a-9_\d+\.pdf$/);
    const args = JSON.parse((s.log[1] as string).replace('rpc pm_reportar_avance ', '')) as Record<
      string,
      unknown
    >;
    expect(args).toMatchObject({
      p_accion: 'a-9',
      p_fecha: HOY,
      p_cantidad: 1,
      p_hash: r.hash,
      p_validar: false
    });
    expect(args.p_path).toBe((s.log[0] as string).replace('upload soportes/', ''));
  });

  it('sin PDF (solo radicado ORFEO) no sube nada', async () => {
    const s = simulado();
    const r = await s.p.reportar(
      { id: 'a-9', plan_id: 'pm-9' },
      { ...avance(1, true), radicado_orfeo: '2026000000001' },
      null
    );
    expect(r.hash).toBeNull();
    expect(s.log).toHaveLength(1);
    expect(s.log[0]).toMatch(/"p_orfeo":"2026000000001","p_path":null,"p_hash":null,"p_validar":true/);
  });

  it('si el registro falla, borra el PDF subido', async () => {
    const s = simulado({ message: 'Esta acción ya tiene un avance pendiente de validar' });
    await expect(
      s.p.reportar({ id: 'a-9', plan_id: 'pm-9' }, avance(1, false), pdf('%PDF'))
    ).rejects.toThrow();
    expect(s.log.at(-1)).toMatch(/^remove soportes\/pm\/pm-9\/a-9_\d+\.pdf$/);
  });

  it('revisar llama pm_revisar_avance; el número de hallazgo repetido da un mensaje claro', async () => {
    const s = simulado();
    await s.p.revisar('v-1', 'devuelto', 'Falta el soporte');
    expect(s.log).toEqual([
      'rpc pm_revisar_avance {"p_id":"v-1","p_estado":"devuelto","p_observacion":"Falta el soporte"}'
    ]);
    const t = simulado({
      message: 'duplicate key value violates unique constraint "pm_hallazgos_numero_unq"',
      code: '23505'
    });
    await expect(t.p.eliminarPlan('x')).rejects.toThrow(/hallazgo/i);
  });
});
