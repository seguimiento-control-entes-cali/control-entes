// Histórico de la demostración: datos/demo/historico.json (los mismos datos ficticios de la demo de la 2.x), en el
// formato compacto que lee histFromPayload de la 2.x. Se importa aparte para no cargarlo si no se abre el histórico.
import carga from '../../../../datos/demo/historico.json';
import type { RadicadoHistorico } from '../../dominio/historico';

type Fila = [
  number,
  string,
  number,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
  number,
  number,
  number | null,
  number | null
];

export function radicadosDemo(): { filas: RadicadoHistorico[]; corte: string } {
  const j = carga as unknown as { corte: string; entes: string[]; orgs: [string, string][]; rows: Fila[] };
  const filas = j.rows.map((a, i) => ({
    i,
    v: a[0],
    rad: a[1],
    ente: j.entes[a[2]] || '—',
    orfE: a[3],
    rec: a[4],
    org: (j.orgs[a[5]] ?? ['', ''])[0],
    niv: (j.orgs[a[5]] ?? ['', ''])[1],
    asu: a[6],
    term: a[7],
    fmax: a[8],
    orfR: a[9],
    fresp: a[10],
    resp: a[11] as 0 | 1 | 2,
    opo: a[12],
    ret: a[13],
    tiem: a[14]
  }));
  return { filas, corte: j.corte };
}
