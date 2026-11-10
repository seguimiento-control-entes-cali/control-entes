// Directorio con un cliente de Supabase simulado (sin red ni base real).
import { describe, expect, it } from 'vitest';
import { datosSupabase } from '../src/datos/supabase';

function cliente(filasHistorico: number, errorGuardar?: string) {
  const llamadas: string[] = [];
  const historico = Array.from({ length: filasHistorico }, (_, i) => ({
    organismo: 'Org ' + (i % 3),
    tipo_organismo: i % 3 === 2 ? null : 'Secretaría'
  }));
  const sb = {
    from: (tabla: string) => {
      const q = {
        select: () => q,
        order: () =>
          tabla === 'directorio'
            ? Promise.resolve({
                data: [
                  {
                    organismo: 'Org 0',
                    cargo: 'Director(a)',
                    nombre: 'Ana Pérez',
                    telefono: '573001234567',
                    correo: null
                  }
                ],
                error: null
              })
            : q,
        range: (a: number, b: number) => {
          llamadas.push(`range ${a}-${b}`);
          return Promise.resolve({ data: historico.slice(a, b + 1), error: null });
        },
        upsert: (fila: Record<string, string>, o: { onConflict: string }) => {
          llamadas.push(`upsert ${fila.organismo}|${fila.cargo} ${o.onConflict}`);
          return Promise.resolve({ error: errorGuardar ? { message: errorGuardar } : null });
        }
      };
      return q;
    }
  };
  return { d: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).directorio, llamadas };
}

describe('capa de datos · Supabase · directorio', () => {
  it('lee el histórico por páginas de 1000 y deja cada organismo una vez con su tipo', async () => {
    const c = cliente(2500);
    const orgs = await c.d.organismos();
    expect(c.llamadas).toEqual(['range 0-999', 'range 1000-1999', 'range 2000-2999']);
    expect(orgs).toEqual([
      { nombre: 'Org 0', nivel: 'Secretaría' },
      { nombre: 'Org 1', nivel: 'Secretaría' },
      { nombre: 'Org 2', nivel: '' }
    ]);
  });

  it('responsables: el correo vacío queda como texto vacío', async () => {
    expect((await cliente(0).d.responsables())[0]).toMatchObject({ correo: '', telefono: '573001234567' });
  });

  it('guarda por dependencia y cargo; sin permiso da un mensaje claro', async () => {
    const c = cliente(0);
    await c.d.guardar({
      organismo: 'Org 0',
      cargo: 'Director(a)',
      nombre: 'Ana Pérez',
      telefono: '',
      correo: ''
    });
    expect(c.llamadas).toEqual(['upsert Org 0|Director(a) organismo,cargo']);
    await expect(
      cliente(0, 'new row violates row-level security policy').d.guardar({
        organismo: 'X',
        cargo: 'Y',
        nombre: '',
        telefono: '',
        correo: ''
      })
    ).rejects.toMatchObject({
      codigo: 'sin_permiso',
      message: 'No tiene permiso para editar el directorio.'
    });
  });
});
