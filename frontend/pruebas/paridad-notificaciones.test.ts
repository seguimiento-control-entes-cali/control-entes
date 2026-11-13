// Paridad con la 2.x · Notificaciones, con los radicados de la demo y el código REAL de la 2.x (TPL y buildMsg de
// src/js/14-notificaciones.js): el mismo mensaje para cada dependencia, plantilla y combinación de vigencias.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import demo from '../../datos/demo/historico.json';
import { dependenciasDelHistorico } from '../src/dominio/expediente';
import { fechaDeCorte, type RadicadoHistorico } from '../src/dominio/historico';
import {
  asuntoCorreo,
  casosNotificados,
  construirMensaje,
  enlaceGmail,
  enlaceWhatsApp,
  filasCsvNotificaciones,
  notificadaHoy,
  PLANTILLAS,
  plantillaSugerida
} from '../src/dominio/notificaciones';

const d2 = cargarApp(['buildMsg', 'TPL', 'statsOf', 'HIST', 'histFromPayload']) as {
  buildMsg: (org: string, tpl: string, vigs: number[], ct: { nombre: string } | null) => string;
  TPL: Record<string, [string]>;
  statsOf: (f: RadicadoHistorico[]) => { sin: number; pend: number; tasa: number; ev: number };
  HIST: { rows: RadicadoHistorico[]; corte: string };
  histFromPayload: (j: unknown) => { rows: RadicadoHistorico[] };
};
const filas = d2.histFromPayload(demo).rows;
const CORTE = fechaDeCorte(filas);
d2.HIST.rows = filas;
d2.HIST.corte = CORTE;

describe('paridad con la 2.x · Notificaciones', () => {
  const orgs = dependenciasDelHistorico(filas);
  const combos = [[2026], [2025], [2024], [2026, 2025], [2025, 2026, 2024]];

  it('mismas plantillas, en el mismo orden', () => {
    expect(Object.entries(PLANTILLAS)).toEqual(Object.entries(d2.TPL).map(([k, v]) => [k, v[0]]));
  });

  it('el mismo mensaje para cada dependencia, plantilla y vigencias, con y sin destinatario', () => {
    let n = 0,
      largos = 0;
    for (const org of orgs)
      for (const tpl of Object.keys(PLANTILLAS))
        for (const vigs of combos)
          for (const ct of [null, { nombre: 'Responsable Ejemplo' }]) {
            const m = construirMensaje(filas, CORTE, org, tpl, vigs, ct);
            expect(m, `${org} · ${tpl} · ${vigs.join()}`).toBe(d2.buildMsg(org, tpl, vigs, ct));
            if (m.includes('más (el detalle está disponible')) largos++;
            n++;
          }
    expect(n).toBeGreaterThan(500);
    expect(largos).toBeGreaterThan(0); // hay mensajes recortados por el límite de 10 casos o 1.500 caracteres
  });

  it('plantilla sugerida igual a la regla de notifyModal', () => {
    for (const org of orgs) {
      const st = d2.statsOf(filas.filter(r => r.org === org && r.v === 2026));
      const esperada =
        st.sin > 0
          ? 'vencidos'
          : st.pend > 0
            ? 'preventivo'
            : st.tasa < 0.2 && st.ev >= 10
              ? 'reconocimiento'
              : 'desempeno';
      expect(plantillaSugerida(filas, org, [2026]), org).toBe(esperada);
    }
  });

  it('asunto, casos, enlaces, "notificada hoy" y CSV', () => {
    expect(asuntoCorreo('vencidos', 'Secretaría de Cultura')).toBe(
      'Requerimientos de entes de control vencidos · Cultura'
    );
    const org = orgs[0] as string;
    const v = filas.filter(r => r.org === org && r.v === 2026);
    expect(casosNotificados(filas, org, [2026], 'vencidos')).toBe(v.filter(r => r.opo === 2).length);
    expect(casosNotificados(filas, org, [2026], 'preventivo')).toBe(v.filter(r => r.opo === 3).length);
    expect(casosNotificados(filas, org, [2026], 'desempeno')).toBe(
      v.filter(r => r.opo === 2 || r.opo === 3).length
    );
    expect(enlaceWhatsApp('573001234567', 'Hola a todos')).toBe(
      'https://wa.me/573001234567?text=Hola%20a%20todos'
    );
    expect(enlaceGmail('a@cali.gov.co', 'b@cali.gov.co', 'Asunto', 'Texto')).toBe(
      'https://mail.google.com/mail/?authuser=a%40cali.gov.co&view=cm&fs=1&tf=1&to=b%40cali.gov.co&su=Asunto&body=Texto'
    );
    const lista = [
      { ts: '2026-11-13T15:00:00Z', org, usuario: 'x', n: 1, tpl: 'vencidos', tel: '57300', mensaje: 'm' }
    ];
    expect(notificadaHoy(lista, org, '2026-11-13')).toBe(true);
    expect(notificadaHoy(lista, org, '2026-11-12')).toBe(false);
    expect(filasCsvNotificaciones(lista)[1]).toEqual([
      '2026-11-13T15:00:00Z',
      org,
      undefined,
      '57300',
      'Requerimientos sin respuesta (vencidos)',
      1,
      'x',
      'm'
    ]);
  });
});
