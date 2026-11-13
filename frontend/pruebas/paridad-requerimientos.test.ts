// Paridad con la 2.x · módulo operativo (Tablero y Requerimientos), con el código REAL de la 2.x: decorate, counts,
// diasTxt y vTablero (src/js/02, 05 y 07). Mismos requerimientos (la semilla de la demo) en las dos versiones.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { semillaRequerimientos } from '../src/datos/demo/requerimientos-semilla';
import { DEPENDENCIAS_DEMO, ENTES_DEMO } from '../src/datos/demo/catalogos-semilla';
import {
  conteos,
  decorar,
  filtrarRequerimientos,
  resumenTablero,
  textoDias,
  validarNuevo,
  type Requerimiento
} from '../src/dominio/requerimientos';

const dos = (n: number) => String(n).padStart(2, '0');
const d = new Date();
// La 2.x cuenta los días contra la fecha local del navegador (today0); aquí se usa la misma
const HOY = `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

type Fila = Requerimiento & Record<string, unknown>;
const d2 = cargarApp(['decorate', 'counts', 'diasTxt', 'vTablero', 'S']) as {
  decorate: (r: Fila) => Fila;
  counts: (l: Fila[]) => unknown;
  diasTxt: (n: number) => string;
  vTablero: (c: { innerHTML: string }) => void;
  S: { cfg: { dias_rojo: number }; entes: unknown[]; deps: unknown[]; reqs: Fila[] };
};
const semilla = semillaRequerimientos(HOY);
d2.S.entes = ENTES_DEMO.map(e => ({ ...e }));
d2.S.deps = DEPENDENCIAS_DEMO.map(x => ({ ...x }));
const vigencia = +HOY.slice(0, 4);

describe('paridad con la 2.x · Tablero y Requerimientos', () => {
  for (const diasRojo of [5, 3, 10]) {
    it(`semáforo, días y nombres iguales a decorate (umbral ${diasRojo} días)`, () => {
      d2.S.cfg = { dias_rojo: diasRojo };
      for (const r of semilla) {
        const a = decorar(r, HOY, diasRojo, ENTES_DEMO, DEPENDENCIAS_DEMO);
        const b = d2.decorate({ ...r });
        expect(
          { dias: a.dias, sem: a.sem, venc: a.venc, ente_n: a.ente_n, ente_s: a.ente_s, dep_n: a.dep_n },
          r.radicado
        ).toEqual({
          dias: b.dias,
          sem: b.sem,
          venc: b.venc,
          ente_n: b.ente_n,
          ente_s: b.ente_s,
          dep_n: b.dep_n
        });
      }
    });
  }

  it('conteos y textos de días iguales; la semilla tiene los 3 colores y un vencido', () => {
    d2.S.cfg = { dias_rojo: 5 };
    const vivos = semilla
      .filter(r => r.vigencia === vigencia)
      .map(r => decorar(r, HOY, 5, ENTES_DEMO, DEPENDENCIAS_DEMO));
    expect(conteos(vivos)).toEqual(d2.counts(vivos as unknown as Fila[]));
    const k = conteos(vivos);
    expect(k.rojo && k.amarillo && k.verde).toBeTruthy();
    expect(vivos.some(r => r.venc)).toBe(true);
    for (const n of [-12, -1, 0, 1, 2, 30]) expect(textoDias(n)).toBe(d2.diasTxt(n));
  });

  it('el Tablero dice lo mismo que vTablero de la 2.x', () => {
    d2.S.cfg = { dias_rojo: 5 };
    const vivos = semilla
      .filter(r => r.vigencia === vigencia)
      .map(r => decorar(r, HOY, 5, ENTES_DEMO, DEPENDENCIAS_DEMO));
    d2.S.reqs = vivos.map(r => ({ ...r })) as unknown as Fila[];
    const c = { innerHTML: '' };
    d2.vTablero(c);
    const h = c.innerHTML;
    const t = resumenTablero(vivos);
    const kpis = [...h.matchAll(/<small>([^<]+)<\/small><b>([^<]*)<\/b>/g)].map(m => [m[1], m[2]]);
    expect(kpis).toEqual([
      ['Total solicitudes', String(t.k.total)],
      ['Críticas', String(t.k.rojo)],
      ['En término', String(t.k.amarillo)],
      ['Cerradas', String(t.k.verde)],
      ['Cumplimiento', t.pct + '%']
    ]);
    const entes = [...h.matchAll(/<b class="ellipsis" style="font-size:.84rem">([^<]+)<\/b>/g)].map(
      m => m[1]
    );
    expect(entes).toEqual(t.porEnte.map(([n]) => n));
    const radicados = [...h.matchAll(/<small class="mono">([^ ]+) ·/g)].map(m => m[1]);
    expect(radicados).toEqual(t.proximos.map(r => r.radicado));
    const deps = [
      ...h.matchAll(/<div class="grow"><b class="ellipsis">([^<]+)<\/b><small>(\d+) abierto/g)
    ].map(m => m[1]);
    expect(deps).toEqual(t.porDependencia.map(([n]) => n));
  });

  it('filtro y orden de la lista (rojo, amarillo, verde y luego por días) y validaciones de "Nuevo"', () => {
    const vivos = semilla
      .filter(r => r.vigencia === vigencia)
      .map(r => decorar(r, HOY, 5, ENTES_DEMO, DEPENDENCIAS_DEMO));
    const todos = filtrarRequerimientos(vivos, { q: '', sem: '', ente: '', dep: '' });
    const orden = { rojo: 0, amarillo: 1, verde: 2 };
    for (let i = 1; i < todos.length; i++) {
      const a = todos[i - 1] as (typeof todos)[number],
        b = todos[i] as (typeof todos)[number];
      expect(orden[a.sem] < orden[b.sem] || (a.sem === b.sem && a.dias <= b.dias)).toBe(true);
    }
    expect(filtrarRequerimientos(vivos, { q: 'señalización', sem: '', ente: '', dep: '' })).toHaveLength(1);
    expect(
      filtrarRequerimientos(vivos, { q: '', sem: 'verde', ente: '', dep: '' }).every(
        r => r.estado === 'cerrado'
      )
    ).toBe(true);
    const ok = {
      radicado: '2026ee004812',
      asunto: 'Asunto válido',
      fechaRadicacion: '2026-11-10',
      fechaLimite: '2026-11-24'
    };
    expect(validarNuevo(ok, 2026, [])).toBeNull();
    expect(validarNuevo({ ...ok, radicado: '26EE1' }, 2026, [])).toBe(
      'Radicado inválido. Ejemplo: 2026EE004812'
    );
    expect(validarNuevo({ ...ok, asunto: ' ab ' }, 2026, [])).toBe('Escribe el asunto del requerimiento');
    expect(validarNuevo({ ...ok, fechaLimite: '' }, 2026, [])).toBe('Completa las fechas');
    expect(validarNuevo({ ...ok, fechaLimite: '2026-11-01' }, 2026, [])).toBe(
      'La fecha límite no puede ser anterior a la radicación'
    );
    expect(validarNuevo(ok, 2026, [{ radicado: '2026EE004812' }])).toBe(
      'Ese radicado ya existe en esta vigencia'
    );
  });
});
