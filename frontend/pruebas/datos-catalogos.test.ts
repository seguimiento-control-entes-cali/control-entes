// Catálogos (entes y dependencias): demostración y Supabase simulado (sin red ni base real).
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';

const demo = () => crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });

describe('catálogos · demostración (como saveCatalog de la 2.x)', () => {
  it('las dependencias traen secretario, correo y teléfono vacíos', async () => {
    const deps = await demo().catalogos.dependencias();
    expect(deps[0]).toMatchObject({ secretarioNombre: '', correo: '', telefono: '' });
  });

  it('el Super administrador agrega con el id siguiente, edita y todo queda en la auditoría', async () => {
    const d = demo();
    await d.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO);
    await d.auth.verificarCodigo(CODIGO_DEMO);
    await d.catalogos.guardarEnte({
      nombre: 'Contraloría de prueba',
      sigla: 'CP',
      tipo: 'Fiscal',
      activo: true
    });
    const entes = await d.catalogos.entes();
    expect(entes).toHaveLength(11);
    expect(entes.find(x => x.id === 11)).toMatchObject({ nombre: 'Contraloría de prueba' });
    // Mismo orden que la base: por nombre
    const nombres = entes.map(x => x.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    await d.catalogos.guardarDependencia({
      id: 1,
      nombre: 'Departamento Administrativo de Contratación Pública',
      secretarioNombre: 'Responsable Ejemplo',
      correo: '',
      telefono: '',
      activo: false
    });
    expect((await d.catalogos.dependencias()).find(x => x.id === 1)).toMatchObject({
      secretarioNombre: 'Responsable Ejemplo',
      activo: false
    });
    const ev = await d.auditoria.eventos();
    const dep = ev.find(e => e.tabla === 'dependencias');
    expect(dep?.accion).toBe('UPDATE');
    expect(dep?.cambios).toEqual({
      secretarioNombre: { de: '', a: 'Responsable Ejemplo' },
      activo: { de: true, a: false }
    });
    expect(ev.some(e => e.tabla === 'entes' && e.accion === 'INSERT')).toBe(true);
  });

  it('otros roles no pueden editar', async () => {
    const d = demo();
    await d.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    await expect(
      d.catalogos.guardarEnte({ nombre: 'X', sigla: '', tipo: 'Otro', activo: true })
    ).rejects.toMatchObject({ codigo: 'sin_permiso' });
  });
});

function cliente(errorGuardar?: string) {
  const llamadas: string[] = [];
  const sb = {
    from: (tabla: string) => {
      const q = {
        select: (c: string) => {
          llamadas.push(`select ${tabla} ${c}`);
          return q;
        },
        order: () =>
          Promise.resolve({
            data: [
              {
                id: 3,
                nombre: 'Dep',
                secretario_nombre: null,
                correo: 'a@cali.gov.co',
                telefono: '',
                activo: true
              }
            ],
            error: null
          }),
        insert: (fila: unknown) => {
          llamadas.push(`insert ${tabla} ${JSON.stringify(fila)}`);
          return Promise.resolve({ error: errorGuardar ? { message: errorGuardar } : null });
        },
        update: (fila: unknown) => {
          llamadas.push(`update ${tabla} ${JSON.stringify(fila)}`);
          return {
            eq: (c: string, v: number) => (llamadas.push(`eq ${c}=${v}`), Promise.resolve({ error: null }))
          };
        }
      };
      return q;
    }
  };
  return { c: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).catalogos, llamadas };
}

describe('catálogos · Supabase simulado', () => {
  it('lee las columnas de la dependencia y convierte los nombres', async () => {
    const x = cliente();
    expect(await x.c.dependencias()).toEqual([
      { id: 3, nombre: 'Dep', secretarioNombre: '', correo: 'a@cali.gov.co', telefono: '', activo: true }
    ]);
    expect(x.llamadas[0]).toBe('select dependencias id, nombre, secretario_nombre, correo, telefono, activo');
  });

  it('nuevo = insert; con id = update por id (igual que la 2.x)', async () => {
    const x = cliente();
    await x.c.guardarEnte({ nombre: 'E', sigla: 'S', tipo: 'Fiscal', activo: true });
    await x.c.guardarDependencia({
      id: 7,
      nombre: 'D',
      secretarioNombre: 'N',
      correo: 'c@cali.gov.co',
      telefono: '3001234567',
      activo: true
    });
    expect(x.llamadas).toEqual([
      'insert entes {"nombre":"E","sigla":"S","tipo":"Fiscal","activo":true}',
      'update dependencias {"nombre":"D","secretario_nombre":"N","correo":"c@cali.gov.co","telefono":"3001234567","activo":true}',
      'eq id=7'
    ]);
  });

  it('sin permiso (RLS) da un mensaje claro', async () => {
    await expect(
      cliente('new row violates row-level security policy').c.guardarEnte({
        nombre: 'E',
        sigla: '',
        tipo: 'Otro',
        activo: true
      })
    ).rejects.toMatchObject({
      codigo: 'sin_permiso',
      message: 'No tiene permiso para editar los catálogos.'
    });
  });
});
