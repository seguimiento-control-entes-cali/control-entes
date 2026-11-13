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

describe('paridad con la 2.x · Cargar respuesta ORFEO y Alertas', () => {
  const d3 = cargarApp(['waLink', 'decorate', 'S', 'DIRLIST']) as {
    waLink: (r: unknown) => { msg: string; wa: string; mail: string };
    decorate: (r: Fila) => Fila;
    S: { cfg: { dias_rojo: number }; entes: unknown[]; deps: unknown[] };
    DIRLIST: unknown[];
  };
  d3.S.cfg = { dias_rojo: 5 };
  d3.S.entes = ENTES_DEMO.map(e => ({ ...e }));
  d3.S.deps = DEPENDENCIAS_DEMO.map(x => ({ ...x, correo: x.id === 21 ? 'salud@cali.gov.co' : '' }));
  d3.DIRLIST.push({
    organismo: 'Secretaría de Salud Pública',
    cargo: 'Secretario(a) de Despacho',
    nombre: 'Ana Pérez',
    telefono: '573001234567'
  });

  it('mismo mensaje y enlaces de WhatsApp y correo que waLink, para cada requerimiento abierto', async () => {
    const { mensajeAlerta } = await import('../src/dominio/requerimientos');
    const { formatoCorto } = await import('../src/dominio/historico');
    for (const r of semilla.filter(x => x.estado === 'abierto')) {
      const a = decorar(r, HOY, 5, ENTES_DEMO, DEPENDENCIAS_DEMO);
      const b = d3.waLink(d3.decorate({ ...r }));
      const cel = a.dependencia_id === 21 ? '573001234567' : '';
      const correo = a.dependencia_id === 21 ? 'salud@cali.gov.co' : '';
      expect(mensajeAlerta(a, cel, correo, formatoCorto), r.radicado).toEqual(b);
    }
  });

  it('validaciones del cierre en el orden y con los textos de la 2.x', async () => {
    const { validarCarga, rutaSoporte } = await import('../src/dominio/requerimientos');
    const f = (s: string) => s.split('-').reverse().join('/');
    const r = { fecha_radicacion: '2026-11-02' };
    const pdf = { nombre: 'soporte.pdf', tipo: 'application/pdf', tamano: 1000, cabecera: '%PDF-' };
    const base = { orfeo: '2026414301000001', fecha: '2026-11-10', archivo: pdf };
    const v = (x: Partial<typeof base>, ex: { orfeo_salida: string | null }[] = []) =>
      validarCarga({ ...base, ...x }, r, '2026-11-13', ex, f);
    expect(v({})).toBeNull();
    expect(v({ orfeo: '123' })).toBe('El radicado ORFEO debe tener entre 10 y 20 dígitos');
    expect(v({}, [{ orfeo_salida: base.orfeo }])).toBe(
      'Este radicado ORFEO ya está asociado a otro requerimiento'
    );
    expect(v({ fecha: '' })).toBe('Indica la fecha de envío');
    expect(v({ fecha: '2026-11-14' })).toBe('La fecha de envío no puede ser futura');
    expect(v({ fecha: '2026-11-01' })).toBe(
      'La fecha de envío no puede ser anterior a la radicación (02/11/2026)'
    );
    expect(v({ archivo: null as unknown as typeof pdf })).toBe('Adjunta el soporte en PDF');
    expect(v({ archivo: { ...pdf, nombre: 'a.docx', tipo: 'application/msword' } })).toBe(
      'El soporte debe ser un archivo PDF'
    );
    expect(v({ archivo: { ...pdf, tamano: 11 * 1024 * 1024 } })).toBe('El PDF supera los 10 MB');
    expect(v({ archivo: { ...pdf, cabecera: 'PK\u0003\u0004\u0014' } })).toBe(
      'El archivo no parece ser un PDF válido'
    );
    expect(rutaSoporte({ radicado: 'Rad. Nº 12/2026 – Acción', vigencia: 2026 }, 1700000000000)).toBe(
      '2026/Rad._N_12_2026_Accion_1700000000000.pdf'
    );
  });
});
