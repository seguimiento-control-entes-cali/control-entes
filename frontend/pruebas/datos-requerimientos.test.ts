// Requerimientos: demostración (permisos como la RLS) y Supabase simulado (páginas de 1000 y errores de la 2.x).
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase, errorRequerimiento } from '../src/datos/supabase';

const Y = new Date().getFullYear();
const demo = () => crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
const NUEVO = {
  radicado: `${Y}EE900001`,
  vigencia: Y,
  ente_id: 1,
  dependencia_id: 21,
  asunto: 'Prueba',
  fecha_radicacion: `${Y}-01-10`,
  fecha_limite: `${Y}-01-24`
};

describe('requerimientos · demostración', () => {
  it('el Super administrador ve todos; el enlace solo su dependencia y registra solo en ella', async () => {
    const a = demo();
    await a.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO);
    await a.auth.verificarCodigo(CODIGO_DEMO);
    const todos = await a.requerimientos.lista(Y - 1);
    expect(todos.length).toBeGreaterThan(0);
    const e = demo();
    await e.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    const propios = await e.requerimientos.lista(Y);
    expect(propios.every(r => r.dependencia_id === 21)).toBe(true);
    await e.requerimientos.crear(NUEVO);
    expect((await e.requerimientos.lista(Y)).some(r => r.radicado === NUEVO.radicado)).toBe(true);
    await expect(e.requerimientos.crear(NUEVO)).rejects.toThrow(`El radicado ${NUEVO.radicado} ya existe`);
    await expect(
      e.requerimientos.crear({ ...NUEVO, radicado: `${Y}EE900002`, dependencia_id: 12 })
    ).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
    expect(
      (await e.auditoria.eventos()).some(
        x => x.tabla === 'requerimientos' && x.accion === 'INSERT' && x.registro_id !== 'seed'
      )
    ).toBe(true);
  });
});

describe('requerimientos · Supabase simulado', () => {
  it('lee por páginas de 1000 ordenadas por fecha límite e id', async () => {
    const llamadas: string[] = [];
    const filas = Array.from({ length: 1500 }, (_, i) => ({ id: String(i) }));
    const consulta = {
      select: () => consulta,
      eq: (c: string, v: unknown) => (llamadas.push(`eq ${c}=${String(v)}`), consulta),
      order: (c: string) => (llamadas.push(`order ${c}`), consulta),
      range: (a: number, b: number) => {
        llamadas.push(`range ${a}-${b}`);
        return Promise.resolve({ data: filas.slice(a, b + 1), error: null });
      }
    };
    const sb = { from: (t: string) => (llamadas.push('from ' + t), consulta) };
    const r = await datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).requerimientos.lista(
      2026
    );
    expect(r).toHaveLength(1500);
    expect(llamadas.filter(x => x.startsWith('range'))).toEqual(['range 0-999', 'range 1000-1999']);
    expect(llamadas.slice(0, 4)).toEqual([
      'from v_requerimientos',
      'eq vigencia=2026',
      'order fecha_limite',
      'order id'
    ]);
  });

  it('los errores de la base se traducen como en la 2.x', () => {
    expect(
      errorRequerimiento({
        message: 'duplicate key value violates unique constraint "requerimientos_radicado_key"'
      }).message
    ).toBe('Ese radicado ya existe en el sistema');
    expect(errorRequerimiento({ message: 'duplicate key value violates "uq_orfeo_salida"' }).message).toBe(
      'Ese radicado ORFEO ya fue registrado en otro requerimiento'
    );
    expect(errorRequerimiento({ message: 'new row violates row-level security policy' })).toMatchObject({
      codigo: 'sin_permiso',
      message: 'Tu rol no tiene permiso para esta operación'
    });
  });
});
