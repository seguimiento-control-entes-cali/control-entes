// Paridad con la 2.x · Planes de mejoramiento (reglas centrales), con el código REAL de la 2.x: pmIndic, pmEstado,
// pmCounts, pmCalCgsc, pmCalAcc, pmMetaTxt, pmRes, pmAccIssues y pmCalidad de src/js/19-planes-*.js. Mismos datos
// (la semilla FICTICIA de la demo) en las dos versiones, en varias fechas de evaluación.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { semillaPlanes } from '../src/datos/demo/planes-semilla';
import {
  calidadPlan,
  calificacionAccion,
  calificacionCgsc,
  conteos,
  estadoAccion,
  indicadores,
  metaTxt,
  problemasAccion,
  resolucion,
  type Accion
} from '../src/dominio/planes';

const dos = (n: number) => String(n).padStart(2, '0');
const d = new Date();
// La 2.x cuenta los días contra la fecha local del navegador (today0)
const HOY = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const st = semillaPlanes(HOY);
// Algunas calificaciones manuales y una observación de Control Interno, para cubrir esas ramas
const acc0 = st.acciones[0] as Accion;
acc0.cal_efectividad = 2;
(st.acciones[1] as Accion).cal_cumplimiento = 1;
(st.acciones[1] as Accion).cal_efectividad = 0;
(st.acciones[2] as Accion).obs_ci = 'Revisar evidencia';
(st.acciones[2] as Accion).obs_ci_estado = 'pendiente';

type PM2 = {
  planes: unknown[];
  hall: unknown[];
  acc: unknown[];
  av: unknown[];
  tras: unknown[];
  trasOk: boolean;
};
const d2 = cargarApp([
  'PM',
  'pmIndic',
  'pmEstado',
  'pmCounts',
  'pmCalCgsc',
  'pmCalAcc',
  'pmMetaTxt',
  'pmRes',
  'pmAccIssues',
  'pmCalidad'
]) as {
  PM: PM2;
  pmIndic: (l: unknown[], f: string) => unknown;
  pmEstado: (a: unknown) => unknown;
  pmCounts: (l: unknown[]) => unknown;
  pmCalCgsc: (l: unknown[], f: string) => unknown;
  pmCalAcc: (a: unknown, f: string) => unknown;
  pmMetaTxt: (a: unknown) => string;
  pmRes: (p: unknown) => string;
  pmAccIssues: (a: unknown, p: unknown) => string[];
  pmCalidad: (p: unknown, h: unknown[], a: unknown[]) => unknown[];
};
Object.assign(d2.PM, {
  planes: st.planes,
  hall: st.hallazgos,
  acc: st.acciones,
  av: st.avances,
  tras: [{ hallazgo_id: 'h-pm-demo-1-1', tipo: 'disciplinaria' }],
  trasOk: true
});
const plano = (x: unknown) => JSON.parse(JSON.stringify(x)) as unknown;

describe('paridad con la 2.x · Planes de mejoramiento (reglas centrales)', () => {
  const fechas = [HOY, '2025-12-31', '2027-06-30'];

  it('mismos indicadores del Formulario 14.1 (CPM y AP) por plan, por dependencia y en total', () => {
    const grupos: Accion[][] = [
      st.acciones,
      ...st.planes.map(p => st.acciones.filter(a => a.plan_id === p.id)),
      ...[...new Set(st.acciones.map(a => a.dependencia_id))].map(dp =>
        st.acciones.filter(a => a.dependencia_id === dp)
      )
    ];
    for (const f of fechas)
      for (const g of grupos)
        expect(plano(indicadores(g, f, st.avances)), f).toEqual(plano(d2.pmIndic(g, f)));
    const t = indicadores(st.acciones, HOY, st.avances);
    expect(t.cpm).not.toBeNull();
    expect(t.ap).toBeGreaterThan(0);
  });

  it('mismo estado, conteos, meta y calificación CGSC de cada acción', () => {
    for (const a of st.acciones) {
      expect(plano(estadoAccion(a, HOY)), a.accion).toEqual(plano(d2.pmEstado(a)));
      expect(metaTxt(a), a.accion).toBe(d2.pmMetaTxt(a));
      for (const f of fechas)
        expect(plano(calificacionAccion(a, f, st.avances))).toEqual(plano(d2.pmCalAcc(a, f)));
    }
    expect(plano(conteos(st.acciones, HOY, st.avances))).toEqual(plano(d2.pmCounts(st.acciones)));
    for (const f of fechas)
      for (const p of st.planes) {
        const l = st.acciones.filter(a => a.plan_id === p.id);
        expect(plano(calificacionCgsc(l, f, st.avances)), f).toEqual(plano(d2.pmCalCgsc(l, f)));
      }
    const k = conteos(st.acciones, HOY, st.avances);
    expect(k.cumplida && k.vencida && k.proxima && k.termino && k.pend).toBeTruthy();
  });

  it('misma resolución aplicable y misma revisión de calidad de datos', () => {
    for (const f of ['2023-12-01', '2024-01-24', '2024-12-31', '2025-01-01'])
      for (const formato of ['PM_01_CGSC', 'F14_CGR']) {
        const p = { formato, fecha_suscripcion: f, resolucion: '' };
        expect(resolucion(p), `${formato} ${f}`).toBe(d2.pmRes(p));
      }
    for (const p of st.planes) {
      const hall = st.hallazgos.filter(h => h.plan_id === p.id);
      const acc = st.acciones.filter(a => a.plan_id === p.id);
      for (const a of acc) expect(problemasAccion(a, p), a.accion).toEqual(d2.pmAccIssues(a, p));
      const nuestra = calidadPlan(
        p,
        hall,
        acc,
        st.acciones,
        st.avances,
        [{ hallazgo_id: 'h-pm-demo-1-1', tipo: 'disciplinaria' }],
        HOY
      );
      expect(plano(nuestra), p.ejercicio).toEqual(plano(d2.pmCalidad(p, hall, acc)));
    }
  });
});
