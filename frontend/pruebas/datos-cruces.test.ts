// Cruces y temas: decisiones guardadas en la demostración y en Supabase simulado (sin red ni base real).
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';

const demo = () => crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });

describe('cruces · demostración (como saveTemaManual y saveCruceRev de la 2.x)', () => {
  it('el Super administrador corrige un tema, revisa un cruce y todo queda en la auditoría', async () => {
    const d = demo();
    await d.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO);
    await d.auth.verificarCodigo(CODIGO_DEMO);
    await d.cruces.guardarTema('2025|1|R|Org', 'fiscal');
    await d.cruces.guardarRevision('ID|contrato:1', 'descartado', 'no aplica');
    expect(await d.cruces.temasManuales()).toMatchObject({
      '2025|1|R|Org': { tema: 'fiscal', usuario: 'admin.demo@cali.gov.co' }
    });
    expect(await d.cruces.revisiones()).toMatchObject({
      'ID|contrato:1': { estado: 'descartado', nota: 'no aplica' }
    });
    await d.cruces.guardarTema('2025|1|R|Org', '');
    await d.cruces.guardarRevision('ID|contrato:1', '');
    expect(await d.cruces.temasManuales()).toEqual({});
    expect(await d.cruces.revisiones()).toEqual({});
    const ev = await d.auditoria.eventos();
    expect(ev.filter(e => e.tabla === 'tema_manual').map(e => e.accion)).toEqual(['DELETE', 'UPDATE']);
    expect(ev.filter(e => e.tabla === 'cruce_revision').map(e => e.accion)).toEqual(['DELETE', 'UPDATE']);
  });

  it('un enlace no puede clasificar', async () => {
    const d = demo();
    await d.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    await expect(d.cruces.guardarTema('k', 'fiscal')).rejects.toMatchObject({ codigo: 'sin_permiso' });
  });
});

function cliente(error?: string) {
  const llamadas: string[] = [];
  const filas: Record<string, unknown[]> = {
    tema_manual: [
      { row_key: 'k', tema: 'obras', usuario: 'a@cali.gov.co', updated_at: '2026-11-01T10:00:00Z' }
    ],
    cruce_revision: [
      { clave: 'c', estado: 'confirmado', nota: null, usuario: null, updated_at: '2026-11-02T10:00:00Z' }
    ]
  };
  const sb = {
    from: (tabla: string) => ({
      select: (c: string) => {
        llamadas.push(`select ${tabla} ${c}`);
        return Promise.resolve(
          error ? { data: null, error: { message: error } } : { data: filas[tabla], error: null }
        );
      },
      upsert: (fila: unknown, o: unknown) => {
        llamadas.push(`upsert ${tabla} ${JSON.stringify(fila)} ${JSON.stringify(o)}`);
        return Promise.resolve({ error: error ? { message: error } : null });
      },
      delete: () => ({
        eq: (c: string, v: string) => {
          llamadas.push(`delete ${tabla} ${c}=${v}`);
          return Promise.resolve({ error: null });
        }
      })
    })
  };
  return { c: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).cruces, llamadas };
}

describe('cruces · Supabase simulado', () => {
  it('lee las decisiones; si la tabla no responde, sigue sin ellas (igual que la 2.x)', async () => {
    const x = cliente();
    expect(await x.c.temasManuales()).toEqual({
      k: { tema: 'obras', usuario: 'a@cali.gov.co', ts: '2026-11-01T10:00:00Z' }
    });
    expect(await x.c.revisiones()).toEqual({
      c: { estado: 'confirmado', nota: '', usuario: null, ts: '2026-11-02T10:00:00Z' }
    });
    expect(await cliente('relation does not exist').c.revisiones()).toEqual({});
  });

  it('guardar = upsert por llave; vacío = borrar', async () => {
    const x = cliente();
    await x.c.guardarTema('k', 'fiscal');
    await x.c.guardarTema('k', '');
    await x.c.guardarRevision('c', 'confirmado');
    await x.c.guardarRevision('c', '');
    expect(x.llamadas).toEqual([
      'upsert tema_manual {"row_key":"k","tema":"fiscal"} {"onConflict":"row_key"}',
      'delete tema_manual row_key=k',
      'upsert cruce_revision {"clave":"c","estado":"confirmado","nota":""} {"onConflict":"clave"}',
      'delete cruce_revision clave=c'
    ]);
  });

  it('sin permiso (RLS) da un mensaje claro', async () => {
    await expect(
      cliente('new row violates row-level security policy').c.guardarTema('k', 'fiscal')
    ).rejects.toMatchObject({ codigo: 'sin_permiso', message: 'No tiene permiso para editar los temas.' });
  });
});
