// Planes · memoria (entrega 4b): archivo documental y papelera. Reglas iguales a la 2.x (pmDocNombreSeguro con el
// código REAL), demo con permisos y Supabase simulado (depósito «archivo», archivo_documentos, pm_papelera, pm_restaurar).
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';
import { nombreSeguro, radicadoOrfeo, revisarDocumento, rutaDocumento } from '../src/dominio/planes-memoria';

const archivo = (name: string, texto: string, size?: number) => {
  const buf = Uint8Array.from(texto, c => c.charCodeAt(0)).buffer;
  return { name, size: size ?? buf.byteLength, arrayBuffer: () => Promise.resolve(buf) };
};
/** El valor, o falla la prueba si no está. */
function hay<T>(x: T | undefined | null): T {
  if (x == null) throw new Error('falta un valor esperado');
  return x;
}
async function demo(correo: string) {
  const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
  await d.auth.ingresar(correo, CLAVE_DEMO);
  if (correo.startsWith('admin')) await d.auth.verificarCodigo(CODIGO_DEMO);
  return d;
}

describe('memoria · reglas iguales a la 2.x', () => {
  const d2 = cargarApp(['pmDocNombreSeguro']) as { pmDocNombreSeguro: (n: unknown) => string };
  it('nombre seguro para el depósito', () => {
    for (const n of [
      'Informe final Nº 12 (versión 2).pdf',
      '  ',
      'ñandú.xlsx',
      'a/b\\c.docx',
      'x'.repeat(200) + '.pdf'
    ])
      expect(nombreSeguro(n), n).toBe(d2.pmDocNombreSeguro(n));
  });
  it('tipos y tamaño permitidos, ruta y radicado ORFEO', () => {
    expect(revisarDocumento('a.PDF', 10)).toEqual({ mime: 'application/pdf' });
    expect(revisarDocumento('a.exe', 10)).toEqual({
      error: 'Tipo de archivo no permitido: use PDF, Excel, Word o CSV'
    });
    expect(revisarDocumento('a.pdf', 50 * 1024 * 1024 + 1)).toEqual({ error: 'El archivo supera 50 MB' });
    expect(rutaDocumento('pm-1', '2026-11-15', 36, 'Oficio Nº 1.pdf')).toBe('pm-1/2026/10-Oficio_N_1.pdf');
    expect(rutaDocumento(null, '2026-11-15', 35, 'x.csv')).toBe('general/2026/z-x.csv');
    expect(radicadoOrfeo('2026-000-000-001')).toEqual({ ok: '2026000000001' });
    expect(radicadoOrfeo('123')).toEqual({ error: 'El radicado ORFEO debe tener entre 10 y 20 dígitos' });
  });
});

describe('memoria · demostración', () => {
  it('sube, descarga el mismo contenido, envía a la papelera, restaura y solo el admin borra definitivamente', async () => {
    const d = await demo('admin.demo@cali.gov.co');
    await expect(
      d.planes.subirDocumento(archivo('a.exe', 'x'), { plan_id: 'pm-demo-1', tipo: 'otro' })
    ).rejects.toThrow('Tipo de archivo no permitido');
    const id = await d.planes.subirDocumento(archivo('Oficio.pdf', '%PDF-oficio'), {
      plan_id: 'pm-demo-1',
      tipo: 'oficio',
      radicado_orfeo: '2026000000001'
    });
    let doc = (await d.planes.datos()).documentos?.find(x => x.id === id);
    expect(doc).toMatchObject({
      nombre: 'Oficio.pdf',
      tipo: 'oficio',
      mime: 'application/pdf',
      eliminado_at: null
    });
    expect(doc?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const bytes = new Uint8Array(await d.planes.contenidoDocumento(hay(doc)));
    expect(String.fromCharCode(...bytes)).toBe('%PDF-oficio');
    await d.planes.moverDocumento(id, true);
    doc = (await d.planes.datos()).documentos?.find(x => x.id === id);
    expect(doc?.eliminado_at).toBeTruthy();
    await d.planes.purgarDocumento(hay(doc));
    expect((await d.planes.datos()).documentos?.some(x => x.id === id)).toBe(false);
  });

  it('el enlace no sube documentos ni ve el archivo documental', async () => {
    const e = await demo('enlace.demo@cali.gov.co');
    await expect(
      e.planes.subirDocumento(archivo('a.pdf', 'x'), { plan_id: 'pm-demo-1', tipo: 'otro' })
    ).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
    expect((await e.planes.datos()).documentos).toEqual([]);
  });

  it('papelera: una acción eliminada vuelve; un hallazgo exige que exista su plan', async () => {
    const d = await demo('admin.demo@cali.gov.co');
    const pid = await d.planes.guardar('plan', {
      contraloria: 'CGSC',
      formato: 'PM_01_CGSC',
      ejercicio: 'Plan ficticio de papelera',
      fecha_suscripcion: '2026-10-01',
      estado: 'formulacion'
    });
    const hid = await d.planes.guardar('hall', {
      plan_id: pid,
      numero: '1',
      descripcion: 'Hallazgo ficticio'
    });
    const aid = await d.planes.guardar('acc', {
      plan_id: pid,
      hallazgo_id: hid,
      accion: 'Acción ficticia',
      cantidad: 1
    });
    await d.planes.eliminar('acc', aid);
    let pap = await d.planes.papelera();
    expect(pap[0]).toMatchObject({ tabla: 'pm_acciones', registro_id: aid, dependientes: 0 });
    expect(await d.planes.restaurar(hay(pap[0]).audit_id)).toBe('1 registro(s) restaurado(s)');
    expect((await d.planes.datos()).acciones.some(a => a.id === aid)).toBe(true);
    await expect(d.planes.restaurar(hay(pap[0]).audit_id)).rejects.toThrow('Este elemento ya fue restaurado');
    await d.planes.eliminar('hall', hid);
    await d.planes.eliminarPlan(pid);
    pap = await d.planes.papelera();
    const hall = pap.find(x => x.tabla === 'pm_hallazgos');
    const plan = pap.find(x => x.tabla === 'pm_planes');
    await expect(d.planes.restaurar(hay(hall).audit_id)).rejects.toThrow(
      'Primero restaure el plan al que pertenece'
    );
    await d.planes.restaurar(hay(plan).audit_id);
    await d.planes.restaurar(hay(hall).audit_id);
    const x = await d.planes.datos();
    expect([
      x.planes.some(p => p.id === pid),
      x.hallazgos.some(h => h.id === hid),
      x.acciones.some(a => a.id === aid)
    ]).toEqual([true, true, true]);
  });
});

describe('memoria · Supabase simulado', () => {
  function simulado(fallaInsert = false) {
    const log: string[] = [];
    const sb = {
      auth: { getUser: () => Promise.resolve({ data: { user: { email: 'ci@cali.gov.co' } } }) },
      from: (t: string) => {
        const q = {
          insert: (o: Record<string, unknown>) => (
            log.push(`insert ${t} ${String(o.path)} ${String(o.subido_email)}`), q
          ),
          update: (o: unknown) => (log.push(`update ${t} ${JSON.stringify(o).slice(0, 15)}`), q),
          delete: () => (log.push(`delete ${t}`), q),
          select: () => q,
          single: () =>
            Promise.resolve(
              fallaInsert
                ? { data: null, error: { message: 'permiso denegado' } }
                : { data: { id: 'doc-1' }, error: null }
            ),
          eq: (c: string, v: string) => (
            log.push(`eq ${c}=${v}`), Promise.resolve({ data: null, error: null })
          )
        };
        return q;
      },
      rpc: (f: string, a?: unknown) => {
        log.push(`rpc ${f} ${JSON.stringify(a ?? null)}`);
        return Promise.resolve({
          data: f === 'pm_papelera' ? [{ audit_id: 7, tabla: 'pm_acciones' }] : '3 registros',
          error: null
        });
      },
      storage: {
        from: (b: string) => ({
          upload: (p: string) => (log.push(`upload ${b}/${p}`), Promise.resolve({ data: {}, error: null })),
          remove: (p: string[]) => (
            log.push(`remove ${b}/${p.join(',')}`), Promise.resolve({ data: {}, error: null })
          )
        })
      }
    };
    return { p: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes, log };
  }
  it('sube al depósito «archivo» y registra con el correo de quien sube', async () => {
    const s = simulado();
    expect(
      await s.p.subirDocumento(archivo('Plan.xlsx', 'xlsx'), { plan_id: 'pm-9', tipo: 'plan_excel' })
    ).toBe('doc-1');
    expect(s.log[0]).toMatch(/^upload archivo\/pm-9\/\d{4}\/[0-9a-z]+-Plan\.xlsx$/);
    expect(s.log[1]).toMatch(/^insert archivo_documentos pm-9\/.*Plan\.xlsx ci@cali\.gov\.co$/);
  });
  it('si el registro falla, borra el archivo subido', async () => {
    const s = simulado(true);
    await expect(
      s.p.subirDocumento(archivo('a.pdf', 'x'), { plan_id: 'pm-9', tipo: 'otro' })
    ).rejects.toThrow();
    expect(s.log.at(-1)).toMatch(/^remove archivo\/pm-9\//);
  });
  it('papelera y restaurar llaman a sus funciones del script 20', async () => {
    const s = simulado();
    expect(await s.p.papelera()).toEqual([{ audit_id: '7', tabla: 'pm_acciones' }]);
    expect(await s.p.restaurar('7')).toBe('3 registros');
    expect(s.log).toEqual(['rpc pm_papelera null', 'rpc pm_restaurar {"p_audit_id":7}']);
  });
});
