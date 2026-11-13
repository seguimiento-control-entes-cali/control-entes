// Cruces y temas (2.x: vCruces y caseCard de src/js/11-cruces-y-temas.js y las acciones cxTab, cxCell, cxPage, cxRev
// y cxCsv de 18-acciones.js). Secretario y enlace ven solo lo de su dependencia; clasificar y revisar cruces solo
// Super administrador, Despacho y Control Interno (la base lo exige además por RLS). Mismo HTML y clases de la 2.x.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import type { Perfil } from '../../datos/contratos';
import { textoCorto } from '../../dominio/actividad';
import { porcentaje1 } from '../../dominio/cumplimiento';
import {
  abiertosSinDescartar,
  casoDe,
  datosCruce,
  enAlcance,
  filasCsvCruces,
  filtrarTemas,
  matrizTemas,
  POR_PAGINA_CRUCES,
  puedeClasificar,
  temaAGuardar,
  type Caso,
  type DatosCruce,
  type FiltroCruces,
  type InfoFila,
  type PestanaCruces,
  type RevisionCruce
} from '../../dominio/cruces';
import { nombreCorto } from '../../dominio/directorio';
import { dependenciasDelHistorico } from '../../dominio/expediente';
import {
  alcanceOrganismo,
  formatoCorto,
  ocultarDatosPersonales,
  pildoraDe,
  type RadicadoHistorico
} from '../../dominio/historico';
import {
  CLAVES_TEMA,
  FAMILIAS,
  fechaDe,
  llaveFila,
  mostrarId,
  NOMBRE_ID,
  NOMBRE_TEMA,
  normalizarTexto
} from '../../dominio/temas';
import { descargarCsv } from '../../shared/lib';
import { Aviso, Icono, Modal, useAvisos } from '../../shared/ui';
import { DetalleRadicado } from '../historico/PantallaHistorico';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');
const INICIAL: FiltroCruces = { tab: 'exactos', tema: '', fam: '', org: '', vig: '', q: '' };
const CLAVES = [...CLAVES_TEMA, 'sin'];

function Familia({ f }: { f: string }) {
  return <span className={'fam fam-' + normalizarTexto(f).slice(0, 5)}>{f}</span>;
}
function Tema({ k, man = false }: { k: string; man?: boolean }) {
  return (
    <span className={'tema tema-' + k}>
      {NOMBRE_TEMA[k] || k}
      {man && (
        <>
          {' '}
          <i className="fa-solid fa-user-pen" title="Clasificado manualmente" aria-hidden="true" />
        </>
      )}
    </span>
  );
}
function Vacia({ icono, children }: { icono: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="empty" role="status">
        <Icono nombre={icono} />
        {children}
      </div>
    </div>
  );
}

/** Tarjeta de un cruce exacto o de una alerta de mismo tema (caseCard de la 2.x). */
function TarjetaCaso({
  c,
  rev,
  org,
  clasifica,
  alRevisar,
  alAbrir
}: {
  c: Caso;
  rev: RevisionCruce | undefined;
  org: string | null;
  clasifica: boolean;
  alRevisar: (clave: string, estado: '' | RevisionCruce['estado']) => void;
  alAbrir: (r: RadicadoHistorico) => void;
}) {
  const filas = org ? c.rows.filter(r => r.org === org) : c.rows;
  return (
    <div className={'card cx ' + c.tipo + (rev ? ' rev-' + rev.estado : '')}>
      <div className="cx-h">
        {c.tipo === 'exacto' ? (
          <>
            <span className="pill rojo">
              <i />
              Cruce exacto
            </span>{' '}
            {c.ids.map(x => (
              <span key={x.k + x.v} className="idtag">
                <small>{NOMBRE_ID[x.k] || x.k}</small> <b className="mono">{mostrarId(x)}</b>
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="pill amarillo">
              <i />
              Mismo tema, varios entes
            </span>{' '}
            <span className="idtag">
              <small>Dependencia</small> <b>{nombreCorto(c.org)}</b>
            </span>{' '}
            <Tema k={c.tema} />
          </>
        )}
      </div>
      <div className="cx-m">
        {c.fams.map(f => (
          <Familia key={f} f={f} />
        ))}
        <span className="muted">
          {formatoCorto(c.desde)} a {formatoCorto(c.hasta)} · {c.rows.length} requerimientos
          {c.abierto && (
            <>
              {' · '}
              <b className="t-r">con pendientes</b>
            </>
          )}
        </span>
      </div>
      {c.tipo === 'exacto' && c.temas.length > 0 && (
        <div className="cx-m">
          {c.temas.map(k => (
            <Tema key={k} k={k} />
          ))}
        </div>
      )}
      <div className="cx-rows">
        {filas.map(r => {
          const p = pildoraDe(r.opo);
          return (
            <button key={r.i} type="button" className="cx-row" onClick={() => alAbrir(r)}>
              <span className="cx-d mono">{formatoCorto(fechaDe(r))}</span>
              <span className="cx-t">
                <b>{r.ente}</b>
                <small>
                  {nombreCorto(r.org)} · {r.rad || r.orfE || 'sin número'}
                </small>
                <small className="muted">{textoCorto(ocultarDatosPersonales(r.asu), 120)}</small>
              </span>
              <span className={'pill ' + p[0]}>{p[1]}</span>
            </button>
          );
        })}
        {org && filas.length < c.rows.length && (
          <div className="muted" style={{ fontSize: '.76rem', padding: '6px 0' }}>
            Otros {c.rows.length - filas.length} requerimiento(s) del mismo caso están a cargo de otras
            dependencias.
          </div>
        )}
      </div>
      <div className="cx-f">
        {rev && (
          <span className={'pill ' + (rev.estado === 'confirmado' ? 'verde' : 'neutral')}>
            <i />
            {rev.estado === 'confirmado' ? 'Cruce confirmado' : 'Descartado'} por {rev.usuario || '—'} el{' '}
            {formatoCorto(rev.ts)}
          </span>
        )}
        {clasifica &&
          (rev ? (
            <button type="button" className="btn sm" onClick={() => alRevisar(c.clave, '')}>
              Quitar revisión
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn sm primary"
                onClick={() => alRevisar(c.clave, 'confirmado')}
              >
                <Icono nombre="fa-check" /> Confirmar cruce
              </button>
              <button type="button" className="btn sm" onClick={() => alRevisar(c.clave, 'descartado')}>
                Descartar
              </button>
            </>
          ))}
      </div>
    </div>
  );
}

export function PantallaCruces({ perfil }: { perfil: Perfil }) {
  const { historico, catalogos, cruces } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const datos = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const man = useQuery({ queryKey: ['temas-manuales'], queryFn: () => cruces.temasManuales() });
  const revs = useQuery({ queryKey: ['revisiones-cruce'], queryFn: () => cruces.revisiones() });
  const [f, setF] = useState<FiltroCruces>(INICIAL);
  const [pagina, setPagina] = useState(0);
  const [detalle, setDetalle] = useState<RadicadoHistorico | null>(null);

  const todas = useMemo(() => datos.data?.filas ?? [], [datos.data]);
  const d: DatosCruce | null = useMemo(
    () => (man.data ? datosCruce(todas, man.data) : null),
    [todas, man.data]
  );
  const nombreDep = deps.data?.find(x => x.id === perfil.dependenciaId)?.nombre ?? null;
  const org = alcanceOrganismo(perfil.rol, nombreDep, todas);
  const base = useMemo(() => (org === null ? todas : todas.filter(r => r.org === org)), [todas, org]);
  const clasifica = puedeClasificar(perfil.rol);

  if (datos.isPending || deps.isPending || man.isPending || revs.isPending || !d)
    return <p className="cargando">Cargando los cruces…</p>;
  if (datos.isError) return <Aviso>No se pudo cargar el histórico: {(datos.error as Error).message}</Aviso>;
  if (!todas.length) return <Vacia icono="fa-database">Aún no hay datos históricos cargados.</Vacia>;

  const rev = revs.data ?? {};
  const cas = d.casos.filter(c => enAlcance(c, org)),
    con = d.conc.filter(c => enAlcance(c, org));
  const info = (r: RadicadoHistorico) => d.info.get(r.i) as InfoFila;
  const sinN = base.filter(r => info(r).prim === 'sin').length;
  const clas = base.length - sinN;
  const pestanas: [PestanaCruces, string, number | null][] = [
    ['exactos', 'Cruces exactos', cas.length],
    ['tematicos', 'Mismo tema', con.length],
    ['temas', 'Temas', null],
    ['sin', 'Sin clasificar', sinN]
  ];
  const irA = (tab: PestanaCruces) => {
    setF(x => ({ ...x, tab, tema: tab === 'temas' ? x.tema : '' }));
    setPagina(0);
  };
  const cambiar = (k: keyof FiltroCruces, v: string) => {
    setF(x => ({ ...x, [k]: v }));
    setPagina(0);
  };

  async function revisar(clave: string, estado: '' | RevisionCruce['estado']) {
    if (!clasifica) return;
    try {
      await cruces.guardarRevision(clave, estado, '');
      avisar(
        estado === 'confirmado'
          ? 'Cruce confirmado'
          : estado === 'descartado'
            ? 'Cruce descartado'
            : 'Revisión retirada'
      );
      await cliente.invalidateQueries({ queryKey: ['revisiones-cruce'] });
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }
  async function clasificar(r: RadicadoHistorico, elegido: string) {
    const val = temaAGuardar(r.asu, elegido);
    try {
      await cruces.guardarTema(llaveFila(r), val);
      avisar(val ? 'Tema actualizado a ' + NOMBRE_TEMA[val] : 'Se restableció el tema automático');
      await cliente.invalidateQueries({ queryKey: ['temas-manuales'] });
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  }

  let cuerpo: ReactNode;
  if (f.tab === 'exactos' || f.tab === 'tematicos') {
    const lista = f.tab === 'exactos' ? cas : con;
    cuerpo = lista.length ? (
      lista.map(c => (
        <TarjetaCaso
          key={c.clave}
          c={c}
          rev={rev[c.clave]}
          org={org}
          clasifica={clasifica}
          alRevisar={revisar}
          alAbrir={setDetalle}
        />
      ))
    ) : (
      <Vacia icono="fa-shield-halved">
        {f.tab === 'exactos'
          ? 'No hay requerimientos de entes distintos que citen el mismo contrato, expediente o radicado.'
          : 'No hay dependencias con el mismo tema pedido por entes distintos en 90 días.'}
      </Vacia>
    );
  } else {
    const fams = FAMILIAS.filter(x => base.some(r => info(r).fam === x));
    const M = matrizTemas(base, d, fams, CLAVES);
    const tot = (k: string) => fams.reduce((s, x) => s + (M[k]?.[x] ?? 0), 0),
      mx = Math.max(1, ...CLAVES.map(tot));
    const L = filtrarTemas(base, d, f, org);
    const paginas = Math.max(1, Math.ceil(L.length / POR_PAGINA_CRUCES));
    const pag = Math.min(pagina, paginas - 1);
    const pg = L.slice(pag * POR_PAGINA_CRUCES, (pag + 1) * POR_PAGINA_CRUCES);
    const celda = (tema: string, fam: string) => {
      setF(x => ({ ...x, tab: 'temas', tema, fam }));
      setPagina(0);
    };
    cuerpo = (
      <>
        {f.tab === 'temas' ? (
          <div className="card" style={{ marginBottom: 14 }}>
            <h3>Requerimientos por tema y ente</h3>
            <div className="sub">
              Tema principal de cada requerimiento. Toca una cifra para ver esos requerimientos.
            </div>
            <div className="tbl-wrap">
              <table className="tbl tm-x">
                <caption className="solo-lector">Requerimientos por tema y ente</caption>
                <thead>
                  <tr>
                    <th scope="col">Tema</th>
                    {fams.map(x => (
                      <th key={x} scope="col" className="right">
                        {x}
                      </th>
                    ))}
                    <th scope="col" className="right">
                      Total
                    </th>
                    <th style={{ minWidth: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {CLAVES.map(k => (
                    <tr key={k}>
                      <td>
                        <Tema k={k} />
                      </td>
                      {fams.map(x => (
                        <td key={x} className="right">
                          {M[k]?.[x] ? (
                            <button type="button" className="lnk" onClick={() => celda(k, x)}>
                              {nf(M[k]?.[x] ?? 0)}
                            </button>
                          ) : (
                            <span className="faint">0</span>
                          )}
                        </td>
                      ))}
                      <td className="right">
                        <button type="button" className="lnk" onClick={() => celda(k, '')}>
                          <b>{nf(tot(k))}</b>
                        </button>
                      </td>
                      <td>
                        <div className="bar">
                          <span className={'tb-' + k} style={{ width: (tot(k) / mx) * 100 + '%' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card warn-card" style={{ marginBottom: 14 }}>
            <h3>
              <Icono nombre="fa-circle-question" /> Requerimientos sin clasificar
            </h3>
            <div className="sub" style={{ margin: '4px 0 0' }}>
              El asunto no trae palabras suficientes para asignar un tema con certeza (por ejemplo,
              &quot;Solicitud de información&quot;).{' '}
              {clasifica
                ? 'Asígnales el tema correcto: el cambio queda registrado en la auditoría.'
                : 'Un administrador puede asignarles el tema.'}
            </div>
          </div>
        )}
        <div className="toolbar">
          <div className="grow">
            <Icono nombre="fa-magnifying-glass" />
            <input
              aria-label="Buscar"
              placeholder="Buscar en asunto, radicado u ORFEO"
              value={f.q}
              onChange={e => cambiar('q', e.target.value)}
            />
          </div>
          {f.tab === 'temas' && (
            <select aria-label="Tema" value={f.tema} onChange={e => cambiar('tema', e.target.value)}>
              <option value="">Todos los temas</option>
              {CLAVES.map(k => (
                <option key={k} value={k}>
                  {NOMBRE_TEMA[k]}
                </option>
              ))}
            </select>
          )}
          <select aria-label="Ente" value={f.fam} onChange={e => cambiar('fam', e.target.value)}>
            <option value="">Todos los entes</option>
            {fams.map(x => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <select aria-label="Vigencia" value={f.vig} onChange={e => cambiar('vig', e.target.value)}>
            <option value="">Todas las vigencias</option>
            {[...new Set(base.map(r => String(r.v)))]
              .sort()
              .reverse()
              .map(v => (
                <option key={v}>{v}</option>
              ))}
          </select>
          {org === null && (
            <select aria-label="Dependencia" value={f.org} onChange={e => cambiar('org', e.target.value)}>
              <option value="">Todas las dependencias</option>
              {dependenciasDelHistorico(todas).map(x => (
                <option key={x} value={x}>
                  {nombreCorto(x)}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn"
            onClick={() =>
              descargarCsv('temas_y_cruces.csv', filasCsvCruces(filtrarTemas(base, d, f, org, false), d))
            }
          >
            <Icono nombre="fa-file-csv" /> Exportar
          </button>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="solo-lector">Requerimientos por tema</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Ente</th>
                <th scope="col">Dependencia</th>
                <th scope="col">Asunto</th>
                <th scope="col">Tema</th>
                <th scope="col">Por qué</th>
              </tr>
            </thead>
            <tbody>
              {pg.length ? (
                pg.map(r => {
                  const x = info(r),
                    cs = casoDe(d, r);
                  return (
                    <tr key={r.i}>
                      <td className="mono">{formatoCorto(fechaDe(r))}</td>
                      <td>{r.ente}</td>
                      <td>{nombreCorto(r.org)}</td>
                      <td className="asunto">
                        <button type="button" className="lnk" onClick={() => setDetalle(r)}>
                          {textoCorto(ocultarDatosPersonales(r.asu), 110) || '—'}
                        </button>
                        {cs && (
                          <>
                            {' '}
                            <span className="pill rojo" title="Hace parte de un cruce exacto">
                              <i />
                              Cruce
                            </span>
                          </>
                        )}
                      </td>
                      <td>
                        {clasifica ? (
                          <>
                            <select
                              className="cx-sel"
                              aria-label="Tema del requerimiento"
                              value={x.prim}
                              onChange={e => void clasificar(r, e.target.value)}
                            >
                              {CLAVES.map(k => (
                                <option key={k} value={k}>
                                  {NOMBRE_TEMA[k]}
                                </option>
                              ))}
                            </select>
                            {x.man && (
                              <div className="muted" style={{ fontSize: '.7rem', marginTop: 3 }}>
                                <Icono nombre="fa-user-pen" /> manual
                              </div>
                            )}
                          </>
                        ) : (
                          <Tema k={x.prim} man={x.man} />
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: '.74rem' }}>
                        {x.man
                          ? 'Clasificado por ' + (man.data?.[llaveFila(r)]?.usuario || 'administrador')
                          : x.auto[0]
                            ? x.auto[0].why.slice(0, 3).join(', ')
                            : 'Sin palabras clave'}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty" role="status">
                      <Icono nombre="fa-magnifying-glass" />
                      No hay requerimientos con esos filtros
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span className="muted">{nf(L.length)} requerimientos</span>
          <button type="button" className="btn sm" disabled={!pag} onClick={() => setPagina(pag - 1)}>
            Anterior
          </button>
          <span className="muted">
            {pag + 1} / {paginas}
          </span>
          <button
            type="button"
            className="btn sm"
            disabled={pag >= paginas - 1}
            onClick={() => setPagina(pag + 1)}
          >
            Siguiente
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <button type="button" className="card kpi r" onClick={() => irA('exactos')}>
          <small>Cruces exactos entre entes</small>
          <b>{cas.length}</b>
          <span className="kpi-of">{abiertosSinDescartar(cas, rev)} con pendientes</span>
        </button>
        <button type="button" className="card kpi y" onClick={() => irA('tematicos')}>
          <small>Mismo tema, varios entes</small>
          <b>{con.length}</b>
          <span className="kpi-of">{abiertosSinDescartar(con, rev)} con pendientes</span>
        </button>
        <button type="button" className="card kpi g" onClick={() => irA('temas')}>
          <small>Requerimientos clasificados</small>
          <b>{base.length ? porcentaje1(clas / base.length) : '0%'}</b>
          <span className="kpi-of">
            {nf(clas)} de {nf(base.length)}
          </span>
        </button>
        <button type="button" className="card kpi" onClick={() => irA('sin')}>
          <small>Sin clasificar</small>
          <b>{nf(sinN)}</b>
          <span className="kpi-of">requieren revisión</span>
        </button>
      </div>
      <details className="card cx-help">
        <summary>
          <b>¿Cómo se cruza la información?</b>
        </summary>
        <p className="muted" style={{ margin: '8px 0 0' }}>
          Un <b>cruce exacto</b> ocurre cuando dos o más entes distintos (Contraloría, Procuraduría,
          Personería, Defensoría) citan en el asunto el mismo número de contrato, proceso, expediente,
          radicado o documento de un ciudadano. Una <b>alerta de mismo tema</b> ocurre cuando dos o más entes
          distintos piden a la misma dependencia sobre el mismo tema contractual, fiscal, disciplinario o de
          obras en un lapso de 90 días. El tema se asigna con reglas fijas sobre el asunto; si no hay palabras
          suficientes queda &quot;Sin clasificar&quot; para revisión.
        </p>
      </details>
      <div className="seg cx-tabs" role="group" aria-label="Vista">
        {pestanas.map(([k, l, n]) => (
          <button
            key={k}
            type="button"
            className={f.tab === k ? 'on' : ''}
            aria-pressed={f.tab === k}
            onClick={() => irA(k)}
          >
            {l}
            {n != null && (
              <>
                {' '}
                <span className="cnt">{n}</span>
              </>
            )}
          </button>
        ))}
      </div>
      <div className="cx-body">{cuerpo}</div>

      <Modal abierto={!!detalle} titulo={detalle?.rad || 'Sin número'} alCerrar={() => setDetalle(null)}>
        {detalle && <DetalleRadicado r={detalle} />}
      </Modal>
    </>
  );
}
