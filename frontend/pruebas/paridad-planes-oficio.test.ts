// Paridad con la 2.x · Planes, entrega 4c-2: oficio de remisión sugerido (pmReqSugerido) y mensaje a la dependencia
// (pmMsg), con el código REAL de la 2.x y datos FICTICIOS; requisitos para aprobar el plan.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { DEPENDENCIAS_DEMO } from '../src/datos/demo/catalogos-semilla';
import { semillaPlanes } from '../src/datos/demo/planes-semilla';
import type { DatosPlanes, Plan } from '../src/dominio/planes';
import {
  mensajeDependencia,
  oficioSugerido,
  revisionAprobacion,
  type OficioReq
} from '../src/dominio/planes-oficio';

const dos = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const HOY = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const st: DatosPlanes = semillaPlanes(HOY);
const deps = DEPENDENCIAS_DEMO.map(x => ({ id: x.id, nombre: x.nombre }));
const reqs: OficioReq[] = [
  {
    id: 'r1',
    radicado: '2026-1',
    asunto: 'Remite informe final Denuncia Fiscal 896-2025 (ficticio)',
    estado: 'cerrado'
  },
  {
    id: 'r2',
    radicado: '2026-2',
    asunto: 'Informe final de la denuncia 896 de 2025 (ficticio)',
    estado: 'abierto'
  },
  { id: 'r3', radicado: '2026-3', asunto: 'Solicitud de información 896-2025 (ficticio)', estado: 'abierto' },
  {
    id: 'r4',
    radicado: '2026-4',
    asunto: 'Plan de mejoramiento auditoría 45-2026 (ficticio)',
    estado: 'abierto'
  }
];
const d2 = cargarApp(['S', 'PM', 'pmReqSugerido', 'pmMsg']) as {
  S: { deps: unknown[]; reqs: unknown[] };
  PM: Record<string, unknown>;
  pmReqSugerido: (p: Plan) => OficioReq | null;
  pmMsg: (dep: number) => { n: number; txt: string };
};
d2.S.deps = deps;
d2.S.reqs = reqs;
Object.assign(d2.PM, { planes: st.planes, hall: st.hallazgos, acc: st.acciones, av: st.avances });

describe('paridad con la 2.x · oficio y notificación de planes', () => {
  it('mismo oficio sugerido por el número de la actuación y su año', () => {
    const base = st.planes[0] as Plan;
    const casos: Partial<Plan>[] = [
      { ejercicio: 'Denuncia Fiscal Nº 896, vigencia 2025' },
      { ejercicio: 'DENUNCIA FISCAL No. 896-2025' },
      { ejercicio: 'Auditoría ficticia', numero_informe: '45-2026' },
      { ejercicio: 'Auditoría sin número' },
      { ejercicio: 'Actuación 12', vigencia_pvcft: '2024' }
    ];
    for (const c of casos) {
      const p = { ...base, ...c } as Plan;
      expect(oficioSugerido(p, reqs)?.id ?? null, JSON.stringify(c)).toBe(d2.pmReqSugerido(p)?.id ?? null);
    }
    expect(
      oficioSugerido({ ...base, ejercicio: 'Denuncia Fiscal Nº 896, vigencia 2025' } as Plan, reqs)?.id
    ).toBe('r2');
  });
  it('mismo mensaje para cada dependencia', () => {
    for (const dep of new Set(st.acciones.map(a => a.dependencia_id))) {
      const nombre = deps.find(x => x.id === dep)?.nombre ?? '';
      expect(mensajeDependencia(dep as number, st, nombre, HOY), String(dep)).toEqual(
        d2.pmMsg(dep as number)
      );
    }
  });
  it('aprobar exige acciones en todos los hallazgos y sin observaciones pendientes', () => {
    const p = st.planes[0] as Plan;
    expect(revisionAprobacion(p, st).bloqueos).toEqual([]);
    const x: DatosPlanes = {
      ...st,
      hallazgos: [
        ...st.hallazgos,
        { id: 'h-x', plan_id: p.id, numero: '9', descripcion: 'Sin acciones' } as never
      ],
      acciones: st.acciones.map((a, i) =>
        i === 0 ? { ...a, obs_ci: 'Revisar', obs_ci_estado: 'pendiente' } : a
      )
    };
    expect(revisionAprobacion(p, x).bloqueos).toEqual([
      'Hallazgos sin acciones: 9.',
      '1 observación(es) de Control Interno pendientes.'
    ]);
    expect(revisionAprobacion({ ...p, id: 'vacio' }, st).bloqueos).toEqual(['El plan no tiene acciones.']);
  });
});
