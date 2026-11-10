// Paridad con la 2.x (plan §11: "dominio/ con paridad respecto a la 2.x"). Carga el código REAL de la app actual
// (src/js/01 a 20, con tests/cargar-app.cjs, igual que las pruebas de la 2.x) y compara sus resultados con los del
// dominio de la 3.0. La CI la corre en UTC y en America/Bogota (la 2.x usa la hora local; la 3.0 no).
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { sumarDias } from '../src/dominio/fechas';
import { esHabil, festivosColombia, sumarHabiles } from '../src/dominio/dias-habiles';
import { calcularSemaforo, ETIQUETA_SEMAFORO } from '../src/dominio/semaforo';
import { NOMBRE_ROL, ROLES } from '../src/dominio/roles';
import { MENU, menuDe, pantallaInicial } from '../src/dominio/menu';
import { exigenciaVerificacion } from '../src/dominio/seguridad';
import { qrSeguro } from '../src/datos/supabase';

interface Req2x {
  estado: string;
  fecha_limite: string;
  dias?: number;
  sem?: string;
  venc?: boolean;
}
interface App2x {
  festivosCO: (y: number) => Set<string>;
  esHabil: (d: Date) => boolean;
  sumarHabiles: (desde: string, n: number) => string;
  iso: (d: Date) => string;
  today0: () => Date;
  decorate: (r: Req2x) => Req2x;
  S: { cfg: { dias_rojo: number }; entes: unknown[]; deps: unknown[] };
  ROLES: Record<string, string>;
  NAV: { g: string; items: { id: string; label: string; labelScoped?: string; roles: string[] }[] }[];
  SEM: Record<string, string>;
}

const app = cargarApp([
  'festivosCO',
  'esHabil',
  'sumarHabiles',
  'iso',
  'today0',
  'decorate',
  'S',
  'ROLES',
  'SEM',
  'NAV'
]) as App2x;

const local = (f: string) => {
  const [y, m, d] = f.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
};

describe('paridad con la 2.x', () => {
  it('festivos de 2020 a 2035', () => {
    for (let y = 2020; y <= 2035; y++)
      expect([...festivosColombia(y)].sort(), String(y)).toEqual([...app.festivosCO(y)].sort());
  });

  it('esHabil y sumarHabiles (1, 5, 10, 15 y 20 días) para cada día de 2024 a 2031', () => {
    let f = '2024-01-01';
    let n = 0;
    while (f <= '2031-12-31') {
      expect(esHabil(f), f).toBe(app.esHabil(local(f)));
      for (const k of [1, 5, 10, 15, 20])
        expect(sumarHabiles(f, k), `${f} + ${k}`).toBe(app.sumarHabiles(f, k));
      f = sumarDias(f, 1);
      n++;
    }
    expect(n).toBe(2922);
  });

  it('semáforo igual a decorate() con umbrales 1, 5 y 30, de -40 a +40 días', () => {
    const hoy = app.iso(app.today0());
    for (const umbral of [1, 5, 30]) {
      app.S.cfg.dias_rojo = umbral;
      for (let k = -40; k <= 40; k++)
        for (const estado of ['abierto', 'cerrado'] as const) {
          const fechaLimite = sumarDias(hoy, k);
          const viejo = app.decorate({ estado, fecha_limite: fechaLimite });
          const nuevo = calcularSemaforo({ estado, fechaLimite }, hoy, umbral);
          expect([nuevo.dias, nuevo.semaforo, nuevo.vencido], `${estado} ${k} umbral ${umbral}`).toEqual([
            viejo.dias,
            viejo.sem,
            viejo.venc
          ]);
        }
    }
    app.S.cfg.dias_rojo = 5;
  });

  it('menú: mismos grupos, pantallas, textos y roles que NAV', () => {
    const nuevo = MENU.map(g => ({
      g: g.grupo,
      items: g.opciones.map(o => ({
        id: o.id,
        label: o.texto,
        labelScoped: o.textoPropio,
        roles: [...o.roles].sort()
      }))
    }));
    const viejo = app.NAV.map(g => ({
      g: g.g,
      items: g.items.map(i => ({
        id: i.id,
        label: i.label,
        labelScoped: i.labelScoped,
        roles: [...i.roles].sort()
      }))
    }));
    expect(nuevo).toEqual(viejo);
    for (const rol of ROLES)
      expect(pantallaInicial(rol)).toBe(['secretario', 'enlace'].includes(rol) ? 'dependencia' : 'mando');
    expect(menuDe('enlace').flatMap(g => g.opciones.map(o => o.texto))).toContain('Mi dependencia');
  });

  it('textos de roles y del semáforo', () => {
    expect(NOMBRE_ROL).toEqual(app.ROLES);
    expect(ETIQUETA_SEMAFORO).toEqual(app.SEM);
  });
});

describe('paridad con la 2.x · cuenta (contraseña y verificación en dos pasos)', () => {
  const cuenta = cargarApp(['qrSeguro', 'mfaRolesObligatorio', 'mfaRolesRecomendado']) as {
    qrSeguro: (q: string) => string;
    mfaRolesObligatorio: string[];
    mfaRolesRecomendado: string[];
  };
  it('mismos roles con verificación obligatoria y recomendada', () => {
    for (const r of ROLES) {
      const esperado = cuenta.mfaRolesObligatorio.includes(r)
        ? 'obligatoria'
        : cuenta.mfaRolesRecomendado.includes(r)
          ? 'recomendada'
          : 'opcional';
      expect(exigenciaVerificacion(r), r).toBe(esperado);
    }
  });
  it('mismo arreglo del código QR', () => {
    for (const q of [
      'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000" d="M0 0h1"/></svg>',
      'data:image/svg+xml;utf-8,%3Csvg%3E%23%3C%2Fsvg%3E',
      'data:image/png;base64,iVBORw0KGgo=',
      'sin-coma',
      ''
    ])
      expect(qrSeguro(q)).toBe(cuenta.qrSeguro(q));
  });
});
