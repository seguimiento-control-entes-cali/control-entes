// Paridad con la 2.x · Actividad y cambios: compara dominio/actividad.ts con el código REAL de la 2.x.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import {
  detalleCambio,
  diferencias,
  ETIQUETA_ACCION,
  ETIQUETA_CAMPO,
  ETIQUETA_TABLA,
  etiquetaUsuario,
  queCambio,
  seguimientoNotificaciones,
  textoCorto,
  type PerfilActividad
} from '../src/dominio/actividad';
import type { EventoAuditoria } from '../src/dominio/auditoria';

const d2 = cargarApp([
  'auditWhat',
  'auditDetail',
  'userLabel',
  'shortTxt',
  'diff',
  'TABLA_LBL',
  'ACC_LBL',
  'FIELD_LBL',
  'ACT'
]) as {
  auditWhat: (a: unknown) => string;
  auditDetail: (a: unknown) => string;
  userLabel: (u: unknown) => string;
  shortTxt: (s: unknown, n: number) => string;
  diff: (a: unknown, b: unknown) => unknown;
  TABLA_LBL: Record<string, string>;
  ACC_LBL: Record<string, string>;
  FIELD_LBL: Record<string, string>;
  ACT: { profs: PerfilActividad[] };
};
const PERFILES: PerfilActividad[] = [
  { id: 'u-1', email: 'ana@cali.gov.co', rol: 'admin', dependencia_id: null, activo: true },
  { id: 'u-2', email: 'luis@cali.gov.co', rol: 'enlace', dependencia_id: 21, activo: false }
];
d2.ACT.profs = PERFILES;

const ev = (x: Partial<EventoAuditoria>): EventoAuditoria => ({
  id: 1,
  tabla: 'requerimientos',
  accion: 'INSERT',
  registro_id: 'abc-123-456-789-000',
  usuario: 'u-1',
  payload: {},
  cambios: {},
  prev_hash: '',
  hash: '',
  created_at: '2026-11-11T10:00:00Z',
  ...x
});
const EVENTOS = [
  ev({ payload: { radicado: 'EJ-2026-0001' } }),
  ev({
    tabla: 'profiles',
    accion: 'UPDATE',
    payload: { email: 'luis@cali.gov.co' },
    cambios: {
      rol: { de: 'enlace', a: 'secretario' },
      activo: { de: true, a: false },
      updated_at: { de: 1, a: 2 }
    }
  }),
  ev({
    tabla: 'directorio',
    accion: 'UPDATE',
    payload: { organismo: 'Secretaría de Salud Pública', cargo: 'Secretario(a) de Despacho' },
    cambios: {
      telefono: { de: '', a: '573001234567' },
      nombre: { de: null, a: 'Ana María Pérez de la Torre Restrepo González' },
      correo: { de: 'a@cali.gov.co', a: 'b@cali.gov.co' },
      cargo: { de: 'x', a: 'y' },
      estado: { de: 'a', a: 'b' }
    }
  }),
  ev({ tabla: 'notificaciones', payload: { destinatario: 'Ana Pérez', canal: 'whatsapp' } }),
  ev({ tabla: 'informes', payload: { alcance: 'Todas', huella: 'abcdef0123456789abcdef' } }),
  ev({ tabla: 'tabla_rara', accion: 'DELETE', registro_id: '42', payload: null }),
  ev({ tabla: 'entes', payload: { nombre: 'Contraloría '.repeat(10) } })
];

describe('paridad con la 2.x · actividad y cambios', () => {
  it('mismas etiquetas de tablas, acciones y campos', () => {
    expect({ ...ETIQUETA_TABLA }).toEqual(d2.TABLA_LBL);
    expect({ ...ETIQUETA_ACCION }).toEqual(d2.ACC_LBL);
    expect({ ...ETIQUETA_CAMPO }).toEqual(d2.FIELD_LBL);
  });
  it('mismo "Qué" y mismo "Detalle del cambio" en cada caso', () => {
    for (const e of EVENTOS) {
      expect(queCambio(e), e.tabla).toBe(d2.auditWhat(e));
      expect(detalleCambio(e), e.tabla).toBe(d2.auditDetail(e));
    }
  });
  it('mismo usuario mostrado, texto corto y diferencias', () => {
    for (const u of ['u-1', 'luis@cali.gov.co', 'sistema', 'desconocido', '', null])
      expect(etiquetaUsuario(PERFILES, u), String(u)).toBe(d2.userLabel(u));
    for (const [s, n] of [
      ['  uno   dos tres  ', 5],
      ['corto', 70],
      ['palabra '.repeat(20), 38]
    ] as [string, number][])
      expect(textoCorto(s, n)).toBe(d2.shortTxt(s, n));
    const a = { x: 1, y: 'a', z: null },
      b = { x: 2, y: 'a', w: true };
    expect(diferencias(a, b)).toEqual(d2.diff(a, b));
  });
  it('seguimiento de notificaciones con los mismos estados de la 2.x', () => {
    const ahora = Date.parse('2026-11-20T12:00:00Z');
    const pend = new Map([
      ['Salud', 5],
      ['Educación', 2],
      ['Turismo', 3],
      ['Sin aviso', 4]
    ]);
    const notifs = [
      { ts: '2026-11-18T10:00:00Z', org: 'Salud', usuario: 'u-1', n: 5 },
      { ts: '2026-11-01T10:00:00Z', org: 'Turismo', usuario: 'u-1', n: 3 },
      { ts: '2026-11-15T10:00:00Z', org: 'Educación', usuario: 'u-1', n: 6 },
      { ts: '2026-11-10T10:00:00Z', org: 'Cultura', usuario: 'u-2', n: 1 }
    ];
    const r = seguimientoNotificaciones(pend, notifs, ahora).map(x => [x.o, x.est[1], x.dias, x.cnt]);
    expect(r).toEqual([
      ['Salud', 'EN PLAZO', 2, 1],
      ['Sin aviso', 'NUNCA NOTIFICADA', null, 0],
      ['Turismo', 'SIN ATENDER', 19, 1],
      ['Educación', 'EN PROGRESO', 5, 1],
      ['Cultura', 'RESUELTA', 10, 1]
    ]);
  });
});
