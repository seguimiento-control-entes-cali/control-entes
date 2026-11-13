// Notificaciones: registro de una notificación enviada (logNotif de la 2.x) en la demostración y en Supabase simulado.
import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';

const N = {
  org: 'Secretaría de Cultura',
  nombre: 'Ana Pérez',
  tel: '573001234567',
  tpl: 'vencidos',
  n: 3,
  mensaje: 'Hola'
};

describe('notificaciones · demostración', () => {
  it('queda en la bitácora (la más reciente primero) y en la auditoría; el remitente viene de la configuración', async () => {
    const d = crearDatos({
      variante: 'demo',
      supabaseUrl: '',
      supabaseAnonKey: '',
      remitente: 'r@cali.gov.co'
    });
    expect(d.remitente).toBe('r@cali.gov.co');
    await d.auth.ingresar('enlace.demo@cali.gov.co', CLAVE_DEMO);
    await d.actividad.registrarNotificacion(N);
    await d.actividad.registrarNotificacion({ ...N, org: 'Otra', canal: 'correo', correo: 'a@cali.gov.co' });
    const l = await d.actividad.notificaciones();
    expect(l.map(x => x.org)).toEqual(['Otra', 'Secretaría de Cultura']);
    expect(l[1]).toMatchObject({ ...N, usuario: 'enlace.demo@cali.gov.co' });
    expect((await d.auditoria.eventos()).filter(e => e.tabla === 'notificaciones')).toHaveLength(2);
  });
});

describe('notificaciones · Supabase simulado', () => {
  it('inserta con las mismas columnas de la 2.x (WhatsApp por defecto) y un error da mensaje claro', async () => {
    const llamadas: unknown[] = [];
    const cliente = (error?: string) =>
      datosSupabase({
        from: (t: string) => ({
          insert: (fila: unknown) => {
            llamadas.push([t, fila]);
            return Promise.resolve({ error: error ? { message: error } : null });
          }
        })
      } as unknown as Parameters<typeof datosSupabase>[0]).actividad;
    await cliente().registrarNotificacion(N);
    expect(llamadas[0]).toEqual([
      'notificaciones',
      {
        organismo: N.org,
        destinatario: 'Ana Pérez',
        telefono: '573001234567',
        correo: '',
        plantilla: 'vencidos',
        n_items: 3,
        canal: 'whatsapp',
        mensaje: 'Hola'
      }
    ]);
    await expect(
      cliente('new row violates row-level security policy').registrarNotificacion(N)
    ).rejects.toMatchObject({ codigo: 'sin_permiso' });
  });
});
