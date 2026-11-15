// Paridad con la 2.x · Planes, norma de la CGSC (entrega 4a). Con datos FICTICIOS (semilla de la demo, prórrogas e
// informes inventados), el código REAL de la 2.x (pmPresentacion, pmCortes, pmInformes, pmInformesPendientes,
// pmProrRequisitos, pmAccionesBajo100) y la 3.0 deben dar lo mismo en varias fechas.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { semillaPlanes } from '../src/datos/demo/planes-semilla';
import type { Accion, DatosPlanes, InformeAvance, Plan, Prorroga } from '../src/dominio/planes';
import {
  accionesBajo100,
  cargaNuevoPlan,
  cortes,
  informes,
  informesPendientes,
  presentacion,
  requisitosProrroga,
  type TipoProrroga
} from '../src/dominio/planes-norma';

const dos = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const HOY = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const st: DatosPlanes = semillaPlanes(HOY);
const [p1, p2] = st.planes as [Plan, Plan];
// Planes con distintas resoluciones y estados (ficticios)
Object.assign(p1, {
  fecha_radicacion_informe: '2025-02-03',
  fecha_suscripcion: '2025-02-28',
  estado: 'en_ejecucion'
});
const pForm: Plan = {
  ...p1,
  id: 'pm-f',
  estado: 'formulacion',
  fecha_radicacion_informe: '2026-11-03',
  fecha_suscripcion: '2026-11-20'
};
const pViejo: Plan = {
  ...p1,
  id: 'pm-v',
  fecha_suscripcion: '2024-03-15',
  fecha_radicacion_informe: null,
  estado: 'cerrado'
};
const pRes: Plan = { ...p1, id: 'pm-r', resolucion: '24.003', fecha_suscripcion: '2024-06-01' };
st.planes.push(pForm, pViejo, pRes);
const pror: Prorroga[] = [
  {
    id: 'pr1',
    plan_id: 'pm-f',
    tipo: 'presentacion',
    estado: 'concedida',
    fecha_nueva: '2026-12-01',
    created_at: '2026-11-10'
  },
  {
    id: 'pr2',
    plan_id: p1.id,
    tipo: 'informe',
    corte: '2025-06-30',
    estado: 'concedida',
    fecha_nueva: '2025-07-30',
    created_at: '2025-07-01'
  },
  {
    id: 'pr3',
    plan_id: p1.id,
    tipo: 'informe',
    corte: '2025-12-31',
    estado: 'negada',
    fecha_nueva: '2026-01-30',
    created_at: '2026-01-02'
  },
  {
    id: 'pr4',
    plan_id: p1.id,
    accion_id: (st.acciones[0] as Accion).id,
    tipo: 'accion',
    estado: 'solicitada',
    fecha_nueva: '2026-12-31',
    created_at: '2026-10-01'
  }
];
const inf: InformeAvance[] = [
  { id: 'i1', plan_id: p1.id, corte: '2025-06-30', fecha_envio: '2025-07-25' },
  { id: 'i2', plan_id: p1.id, corte: '2025-12-31', fecha_envio: '2026-02-20' }
];
st.prorrogas = pror;
st.informes = inf;
st.v20 = true;
(st.acciones[0] as Accion).cal_efectividad = 2;
(st.acciones[1] as Accion).cal_cumplimiento = 1;
(st.acciones[1] as Accion).cal_efectividad = 0;

type F = (...a: unknown[]) => unknown;
const d2 = cargarApp([
  'PM',
  'pmPresentacion',
  'pmCortes',
  'pmInformes',
  'pmInformesPendientes',
  'pmProrRequisitos',
  'pmAccionesBajo100'
]) as Record<string, F> & { PM: Record<string, unknown> };
Object.assign(d2.PM, {
  planes: st.planes,
  hall: st.hallazgos,
  acc: st.acciones,
  av: st.avances,
  pror,
  inf,
  v19: true,
  v20: true,
  eval: HOY
});
const plano = (x: unknown) => JSON.parse(JSON.stringify(x ?? null)) as unknown;
// La 2.x deja «ok» en null cuando falta una fecha (corto circuito de pmFecha); la 3.0 usa false: mismo significado
const req = (l: unknown) => (l as { ok: unknown; txt: string }[]).map(x => ({ ok: !!x.ok, txt: x.txt }));
const FECHAS = [HOY, '2025-07-10', '2025-08-15', '2026-01-20', '2026-03-01', '2027-07-31'];

describe('paridad con la 2.x · norma CGSC de planes', () => {
  it('presentación del plan (art. 7) igual', () => {
    for (const p of st.planes)
      expect(plano(presentacion(p, pror)), p.id).toEqual(plano(d2.pmPresentacion(p)));
    expect(presentacion(pForm, pror)).toMatchObject({ limite: '2026-12-01', presentado: false });
  });
  it('cortes e informes semestrales (art. 11) iguales en varias fechas', () => {
    for (const f of FECHAS)
      for (const p of st.planes) {
        expect(cortes(p, f), `${p.id} ${f}`).toEqual(d2.pmCortes(p, f));
        expect(plano(informes(p, pror, inf, f)), `${p.id} ${f}`).toEqual(plano(d2.pmInformes(p, f)));
      }
    // pmInformesPendientes usa la fecha de hoy
    expect(plano(informesPendientes(st, HOY))).toEqual(plano(d2.pmInformesPendientes()));
  });
  it('requisitos de las prórrogas (arts. 15 y 16) iguales', () => {
    const solicitudes = [
      ['2026-10-01', '2026-12-31'],
      ['2026-12-20', '2027-01-05'],
      ['', ''],
      ['2025-06-20', '2025-07-25'],
      ['2026-11-20', '2026-11-27']
    ];
    for (const [s, n] of solicitudes) {
      const f = { fecha_solicitud: s as string, fecha_nueva: n as string };
      for (const a of st.acciones.slice(0, 4))
        expect(req(requisitosProrroga('accion', { a }, f, pror)), a.id).toEqual(
          req(d2.pmProrRequisitos('accion', { a }, f))
        );
      const casos: [TipoProrroga, { p: Plan; venc: string; corte?: string }][] = [
        ['presentacion', { p: pForm, venc: '2026-11-24' }],
        ['informe', { p: p1, venc: '2025-07-22', corte: '2025-06-30' }],
        ['informe', { p: p1, venc: '2026-01-22', corte: '2025-12-31' }],
        ['presentacion', { p: p2, venc: '2026-12-15' }]
      ];
      for (const [t, c] of casos)
        expect(req(requisitosProrroga(t, c, f, pror)), `${t} ${c.p.id}`).toEqual(
          req(d2.pmProrRequisitos(t, c, f))
        );
    }
  });
  it('acciones con calificación inferior a 100 (art. 12, par. 5) iguales', () => {
    for (const p of st.planes)
      expect(
        accionesBajo100(p, st.acciones, st.avances, HOY).map(a => a.id),
        p.id
      ).toEqual((d2.pmAccionesBajo100(p) as Accion[]).map(a => a.id));
  });
  it('carga del nuevo plan: en formulación, enlazado al original, con el 30 % del plazo (Res. 24.043)', () => {
    const l = accionesBajo100(p1, st.acciones, st.avances, HOY);
    expect(l.length).toBeGreaterThan(0);
    const c = cargaNuevoPlan(p1, st, '2026-11-15', HOY);
    expect(c.plan).toMatchObject({
      estado: 'formulacion',
      plan_origen_id: p1.id,
      fecha_suscripcion: '2026-11-15'
    });
    expect(c.plan.ejercicio).toBe('Nuevo plan (art. 12, par. 5) · ' + p1.ejercicio);
    const n = c.hallazgos.flatMap(h => h.acciones).length;
    expect(n).toBe(l.length);
    for (const a of c.hallazgos.flatMap(h => h.acciones))
      expect(a).toMatchObject({ fecha_inicio: '2026-11-15', avance: null });
  });
});
