// Actividad con un cliente de Supabase simulado: último acceso por cuenta, notificaciones e informes (sin red).
import { describe, expect, it } from 'vitest';
import { datosSupabase } from '../src/datos/supabase';

const TABLAS: Record<string, unknown[]> = {
  profiles: [{ id: 'u1', email: 'a@cali.gov.co', rol: 'admin', dependencia_id: null, activo: true }],
  accesos: [
    { user_id: 'u1', created_at: '2026-11-11T15:00:00Z' },
    { user_id: 'u2', created_at: '2026-11-10T15:00:00Z' },
    { user_id: 'u1', created_at: '2026-11-01T15:00:00Z' }
  ],
  notificaciones: [
    {
      created_at: '2026-11-09T12:00:00Z',
      organismo: 'Salud',
      enviado_por: 'u1',
      n_items: 4,
      destinatario: 'Ana',
      plantilla: 'vencidos',
      telefono: '573001234567',
      correo: null,
      canal: null,
      mensaje: 'Hola'
    }
  ],
  informes: [
    {
      created_at: '2026-11-08T12:00:00Z',
      generado_por: 'u1',
      alcance: 'Todas',
      vigencias: '2026',
      n_registros: 10,
      huella: 'abc'
    }
  ]
};

function cliente(fallan: string[] = []) {
  const sb = {
    from: (tabla: string) => {
      const r = () =>
        Promise.resolve(
          fallan.includes(tabla)
            ? { data: null, error: { message: 'x' } }
            : { data: TABLAS[tabla], error: null }
        );
      const q = { select: () => q, order: () => Object.assign(r(), { limit: r }), limit: r };
      return q;
    }
  };
  return datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).actividad;
}

describe('capa de datos · Supabase · actividad', () => {
  it('toma el último acceso de cada cuenta y convierte notificaciones e informes', async () => {
    const a = cliente();
    expect(await a.perfiles()).toHaveLength(1);
    expect(await a.ultimosAccesos()).toEqual({ u1: '2026-11-11T15:00:00Z', u2: '2026-11-10T15:00:00Z' });
    expect(await a.notificaciones()).toEqual([
      {
        ts: '2026-11-09T12:00:00Z',
        org: 'Salud',
        usuario: 'u1',
        n: 4,
        nombre: 'Ana',
        tpl: 'vencidos',
        tel: '573001234567',
        correo: '',
        canal: 'whatsapp',
        mensaje: 'Hola'
      }
    ]);
    expect(await a.informes()).toEqual([
      { ts: '2026-11-08T12:00:00Z', usuario: 'u1', alcance: 'Todas', vigencias: '2026', n: 10, huella: 'abc' }
    ]);
  });
  it('si fallan accesos, notificaciones o informes, la pantalla sigue con listas vacías (igual que la 2.x)', async () => {
    const a = cliente(['accesos', 'notificaciones', 'informes']);
    expect(await a.ultimosAccesos()).toEqual({});
    expect(await a.notificaciones()).toEqual([]);
    expect(await a.informes()).toEqual([]);
  });
});
