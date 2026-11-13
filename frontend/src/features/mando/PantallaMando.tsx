// Centro de mando del Alcalde (2.x: vMando, renderBrief, buildTreemap, paintTreemap, renderTmDet, tmPlay y
// renderQueue de src/js/12-centro-de-mando.js, y las acciones tmFilter, tmSel, tmVentana, qVig y openOrg de
// 18-acciones.js). Solo supervisión (admin, alcalde y Control Interno) lo tiene en el menú. Mismo HTML y clases de
// la 2.x (cmd, states, tm, tile, tm-det, ticker, trio, brief, seg, tbl).
// Pendiente para pantallas posteriores: tarjeta de planes de mejoramiento (pmResumenMando, con Planes) y los botones
// de WhatsApp "Modo despacho" y "Notificar" (con Notificaciones).
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Perfil } from '../../datos/contratos';
import { abiertosSinDescartar, datosCruce } from '../../dominio/cruces';
import { porcentaje1, UMBRALES } from '../../dominio/cumplimiento';
import {
  claveOrganismo,
  estadoContacto,
  formatoCelular,
  nombreCorto,
  normalizarCelular,
  type Responsable
} from '../../dominio/directorio';
import { formatoCorto } from '../../dominio/historico';
import { formatoFechaHora } from '../../dominio/auditoria';
import {
  cifrasMando,
  cintaSeguimiento,
  colaAccion,
  enteConMasSinRespuesta,
  estadisticasVentana,
  etiquetaMes,
  finVentana,
  mesesTablero,
  NOMBRE_COLOR,
  ordenTablero,
  pintarTablero,
  textoVentana,
  titularTablero,
  ventanaGuardada,
  VENTANAS,
  VIGENCIAS_MANDO,
  type ColorTecla,
  type Tecla,
  type Ventana
} from '../../dominio/mando';
import { Aviso, Icono } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');
const SUPERVISION = ['admin', 'alcalde', 'control_interno'];

function leerVentana(): Ventana {
  try {
    return ventanaGuardada(localStorage.getItem('ce_ventana'));
  } catch {
    return 6;
  }
}

/** Cifra grande que sube de 0 al valor en 1,1 s (sin animación si el sistema pide reducir movimiento). */
function CifraAnimada({ valor }: { valor: number }) {
  const f1 = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const reducir = typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(() => f1(reducir ? valor : 0));
  useEffect(() => {
    if (reducir) {
      setT(f1(valor));
      return;
    }
    let id = 0;
    const t0 = performance.now();
    const paso = (ahora: number) => {
      const k = Math.min(1, (ahora - t0) / 1100);
      setT(f1(valor * (1 - Math.pow(1 - k, 3))));
      if (k < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [valor, reducir]);
  return <span id="bigNum">{t}</span>;
}

function Detalle({ x, ventana, abrir }: { x: Tecla | null; ventana: Ventana; abrir: (o: string) => void }) {
  if (!x)
    return (
      <div className="tm-det vacio" id="tmDet" aria-live="polite">
        Toca una tecla para ver el detalle de la dependencia.
      </div>
    );
  const ancho = Math.max(2, Math.round(x.tasa * 100));
  return (
    <div className={'tm-det ' + x.sem} id="tmDet" aria-live="polite">
      <div className="tmd-h">
        <div>
          <b>{x.org}</b>
          <span className="tmd-e">
            {NOMBRE_COLOR[x.sem]}
            {x.ev
              ? `: ${x.inc} de ${x.ev} requerimientos respondidos tarde o vencidos (${porcentaje1(x.tasa)})`
              : ''}
          </span>
        </div>
        <button type="button" className="btn primary" onClick={() => abrir(x.org)}>
          <Icono nombre="fa-folder-open" /> Abrir expediente
        </button>
      </div>
      {x.sem === 'gris' ? (
        <p className="tmd-n">
          {x.ev
            ? 'Con menos de 3 casos evaluados no se asigna color, para no dar una lectura injusta.'
            : 'No tuvo requerimientos evaluados en esta ventana de ' + ventana + ' meses.'}
        </p>
      ) : (
        <>
          <div className="tmd-trk" role="img" aria-label={'Incumplimiento ' + porcentaje1(x.tasa)}>
            <i style={{ width: ancho + '%' }} />
          </div>
          <div className="tmd-esc">
            <span>0 %</span>
            <span>
              Cambia de color en {UMBRALES.verde_lt * 100} % y {UMBRALES.rojo_ge * 100} %
            </span>
            <span>100 %</span>
          </div>
        </>
      )}
    </div>
  );
}

export function PantallaMando({ perfil, demo = false }: { perfil: Perfil; demo?: boolean }) {
  const { historico, directorio, cruces, actividad } = useDatos();
  const ir = useNavigate();
  const datos = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const responsables = useQuery({ queryKey: ['directorio'], queryFn: () => directorio.responsables() });
  const man = useQuery({ queryKey: ['temas-manuales'], queryFn: () => cruces.temasManuales() });
  const revs = useQuery({ queryKey: ['revisiones-cruce'], queryFn: () => cruces.revisiones() });
  const notifs = useQuery({
    queryKey: ['notificaciones'],
    queryFn: () => actividad.notificaciones().catch(() => [])
  });

  const [ventana, setVentana] = useState<Ventana>(leerVentana);
  const [vigs, setVigs] = useState<number[]>([2026]);
  const [idx, setIdx] = useState(-1);
  const [filtro, setFiltro] = useState<ColorTecla | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [jugando, setJugando] = useState(false);
  const [revelar, setRevelar] = useState(true);
  const detRef = useRef<HTMLDivElement>(null);

  const todas = useMemo(() => datos.data?.filas ?? [], [datos.data]);
  const corte = datos.data?.corte ?? '';
  const meses = useMemo(() => mesesTablero(todas, corte), [todas, corte]);
  const i = idx < 0 || idx > meses.length - 1 ? Math.max(0, meses.length - 1) : idx;
  const mes = meses[i];
  // El orden de las teclas se fija al dibujar la pantalla (buildTreemap) y no cambia al mover el mes
  const [idxOrden, setIdxOrden] = useState(-1);
  const mesOrden =
    meses[idxOrden < 0 || idxOrden > meses.length - 1 ? Math.max(0, meses.length - 1) : idxOrden];
  const orden = useMemo(
    () =>
      mesOrden ? ordenTablero(todas, estadisticasVentana(todas, finVentana(mesOrden, corte), ventana)) : [],
    [todas, mesOrden, corte, ventana]
  );
  const tablero = useMemo(
    () =>
      mes
        ? pintarTablero(orden, estadisticasVentana(todas, finVentana(mes, corte), ventana))
        : pintarTablero(orden, new Map()),
    [orden, todas, mes, corte, ventana]
  );

  useEffect(() => {
    const t = setTimeout(() => setRevelar(false), 1400);
    return () => clearTimeout(t);
  }, [ventana, vigs]);
  useEffect(() => {
    if (!jugando) return;
    const t = setInterval(() => {
      setIdx(actual => {
        const a = actual < 0 || actual > meses.length - 1 ? meses.length - 1 : actual;
        if (a >= meses.length - 1) {
          setJugando(false);
          return a;
        }
        return a + 1;
      });
    }, 650);
    return () => clearInterval(t);
  }, [jugando, meses.length]);

  if (datos.isPending || man.isPending || revs.isPending)
    return <p className="cargando">Cargando el centro de mando…</p>;
  if (datos.isError) return <Aviso>No se pudo cargar el histórico: {(datos.error as Error).message}</Aviso>;
  if (!todas.length)
    return (
      <div className="card">
        <div className="empty">
          <Icono nombre="fa-database" />
          Aún no hay datos históricos cargados. Importa <b>historico_requerimientos.csv</b> en Supabase (ver
          README).
        </div>
      </div>
    );

  const redibujar = () => {
    setIdxOrden(i);
    setRevelar(true);
  };
  const cambiarVentana = (n: Ventana) => {
    setJugando(false);
    setVentana(n);
    try {
      localStorage.setItem('ce_ventana', String(n));
    } catch {
      /* sin almacenamiento: solo en esta sesión */
    }
    redibujar();
  };
  const cambiarVig = (y: number) => {
    setJugando(false);
    setVigs(v => (v.includes(y) ? v.filter(x => x !== y) : [...v, y]));
    redibujar();
  };
  const abrir = (org: string) => ir('/dependencia', { state: { org } });
  const elegir = (org: string) => {
    setSel(s => (s === org ? null : org));
    if (sel !== org && innerWidth <= 520)
      setTimeout(() => detRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 0);
  };
  const reproducir = () => {
    if (jugando) return setJugando(false);
    if (i >= meses.length - 1) setIdx(0);
    setJugando(true);
  };

  const { g, venc, pend } = cifrasMando(todas, vigs);
  const cinta = cintaSeguimiento(todas, vigs);
  const cola = colaAccion(todas, vigs);
  const resp: Responsable[] = responsables.data ?? [];
  const contactosDe = (org: string) => resp.filter(x => claveOrganismo(x.organismo) === claveOrganismo(org));
  const ultima = (org: string) => (notifs.data ?? []).find(n => n.org === org);
  const [h1, h2] = titularTablero(tablero.rojo, tablero.amarillo);
  const detalle = sel ? (tablero.teclas.find(t => t.org === sel) ?? null) : null;
  const notifica = SUPERVISION.includes(perfil.rol);

  // Lectura del corte (renderBrief)
  const tot = cola.reduce((s, o) => s + o.venc, 0),
    top = cola[0],
    eTop = enteConMasSinRespuesta(todas, vigs),
    sinCel = cola.filter(o => !contactosDe(o.org).some(x => estadoContacto(x) === 'ok')).length;
  const d = man.data ? datosCruce(todas, man.data) : null;
  const rev = revs.data ?? {};
  const cxA = d ? d.casos.filter(c => rev[c.clave]?.estado !== 'descartado') : [],
    cxT = d ? abiertosSinDescartar(d.conc, rev) : 0;

  const itemCinta = (r: (typeof cinta)[number], k: string) => (
    <span key={k}>
      <b>{nombreCorto(r.org)}</b> {r.ente}{' '}
      {r.opo === 3
        ? 'vence el ' + formatoCorto(r.fmax)
        : 'vencido, ' + (r.ret ?? 0) + ' días hábiles de retraso'}{' '}
      <em>{r.rad ?? ''}</em>
    </span>
  );

  return (
    <>
      <section className="cmd">
        <div className="cmd-line">
          <span className="pulso-vivo" />
          Corte {formatoCorto(corte)}
          {demo ? ' · datos de ejemplo' : ''}
        </div>
        <div className="cmd-fig">
          <h2 className="cmd-head" id="cmdHead">
            {h1}
            <span>{h2}</span>
          </h2>
          <p>
            En el histórico, el{' '}
            <b>
              <CifraAnimada valor={+(g.tasa * 100).toFixed(1)} /> %
            </b>{' '}
            de los {nf(g.ev)} requerimientos evaluados se respondió tarde o sigue sin respuesta. La meta es
            bajar de {UMBRALES.verde_lt * 100} %.
          </p>
        </div>
        <div className="states" id="states">
          {(
            [
              ['rojo', tablero.rojo, 'sw-r', 'Rojo', 'kRojo'],
              ['amarillo', tablero.amarillo, 'sw-y', 'Amarillo', 'kAma'],
              ['verde', tablero.verde, 'sw-g', 'Verde', 'kVer'],
              ['gris', tablero.gris, 'sw-n', 'Sin muestra', 'kGris']
            ] as const
          ).map(([s, n, sw, txt, id]) => (
            <button
              key={s}
              type="button"
              className="st"
              data-s={s}
              aria-pressed={filtro === s}
              onClick={() => setFiltro(f => (f === s ? null : s))}
            >
              <b id={id}>{n}</b>
              <span>
                <i className={sw} />
                {txt}
              </span>
            </button>
          ))}
        </div>
        <div className="cmd-h">
          <b>Tablero de dependencias</b>
          <span>De mayor a menor incumplimiento. Toca una tecla para ver su detalle</span>
        </div>
        <div className="tmbar">
          <button type="button" className="btn sm" id="tmPlay" onClick={reproducir}>
            <Icono nombre={jugando ? 'fa-pause' : 'fa-play'} /> {jugando ? 'Pausar' : 'Reproducir'}
          </button>
          <input
            type="range"
            id="tmRange"
            min={0}
            max={Math.max(0, meses.length - 1)}
            value={i}
            aria-label="Mes"
            onChange={e => setIdx(+e.target.value)}
          />
          <span className="tmlabel" id="tmLabel">
            {mes ? etiquetaMes(mes, ventana) : ''}
          </span>
          <div className="seg tm-vent" role="group" aria-label="Ventana de tiempo">
            {VENTANAS.map(n => (
              <button
                key={n}
                type="button"
                className={ventana === n ? 'on' : ''}
                aria-pressed={ventana === n}
                onClick={() => cambiarVentana(n)}
              >
                {n} meses
              </button>
            ))}
          </div>
        </div>
        <div className={'tm' + (revelar ? ' reveal' : '') + (filtro ? ' filtering' : '')} id="tm">
          {tablero.teclas.map((t, k) => (
            <button
              key={t.org}
              type="button"
              className={'tile ' + t.sem + (filtro === t.sem ? ' match' : '') + (sel === t.org ? ' on' : '')}
              style={{ ['--i' as string]: k }}
              aria-pressed={sel === t.org}
              title={t.title}
              onClick={() => elegir(t.org)}
            >
              <b>{nombreCorto(t.org)}</b>
              <span className="tl-f">
                <span className="num">{t.num}</span>
                <small>{t.sub}</small>
              </span>
            </button>
          ))}
        </div>
        <div ref={detRef}>
          <Detalle x={detalle} ventana={ventana} abrir={abrir} />
        </div>
        <div className="cmd-legend">
          <span>
            <i className="sw-r" />
            Rojo, desde {UMBRALES.rojo_ge * 100} %
          </span>
          <span>
            <i className="sw-y" />
            Amarillo, de {UMBRALES.verde_lt * 100} % a {UMBRALES.rojo_ge * 100} %
          </span>
          <span>
            <i className="sw-g" />
            Verde, menos de {UMBRALES.verde_lt * 100} %
          </span>
          <span>
            <i className="sw-n" />
            Sin muestra: menos de 3 casos evaluados
          </span>
          <span className="cmd-legend-w">Ventana de {textoVentana(ventana)}</span>
        </div>
        {cinta.length > 0 && (
          <div className="ticker" aria-label="Requerimientos en seguimiento">
            <span className="tk-lbl">En seguimiento</span>
            <div className="tk-track">
              {cinta.map((r, k) => itemCinta(r, 'a' + k))}
              {cinta.map((r, k) => itemCinta(r, 'b' + k))}
            </div>
          </div>
        )}
      </section>
      <div className="trio">
        <button type="button" onClick={() => ir('/historico')}>
          <b className="t-r">{nf(venc)}</b>
          <small>sin respuesta registrada</small>
        </button>
        <button type="button" onClick={() => ir('/historico')}>
          <b className="t-y">{nf(pend)}</b>
          <small>por vencer en término</small>
        </button>
        <button type="button" onClick={() => ir('/cumplimiento')}>
          <b className="t-b">{porcentaje1(g.tasa)}</b>
          <small>incumplimiento histórico</small>
        </button>
      </div>
      <div className="card brief" id="brief">
        <div className="brief-h">
          <Icono nombre="fa-chart-line" />
          Lectura del corte
        </div>
        {top && tot > 0 && (
          <p>
            <mark>{nombreCorto(top.org)}</mark> concentra {nf(top.venc)} de los {nf(tot)} requerimientos sin
            respuesta registrada ({porcentaje1(top.venc / tot)}).
          </p>
        )}
        <p>
          <mark className="r">{tablero.rojo} dependencias</mark> están en rojo en la ventana de{' '}
          {textoVentana(ventana)}; {cola.length} tienen casos sin respuesta en las vigencias seleccionadas.
        </p>
        {eTop && (
          <p>
            El ente con más requerimientos sin respuesta es <mark>{eTop[0]}</mark> ({nf(eTop[1])}).
          </p>
        )}
        {sinCel > 0 && (
          <p>
            <mark className="r">{sinCel} dependencia(s)</mark> de la cola no tienen responsable completo en el
            directorio; complétalo para poder notificarlas por WhatsApp.
          </p>
        )}
        {(cxA.length > 0 || cxT > 0) && (
          <p>
            <mark className="r">{cxA.length} caso(s)</mark> fueron requeridos por más de un ente de control
            con el mismo número de contrato, expediente o radicado
            {cxT ? (
              <>
                , y hay <mark>{cxT} alerta(s) de mismo tema</mark> con pendientes
              </>
            ) : null}
            .
          </p>
        )}
        <div className="brief-a">
          {sinCel > 0 && notifica && (
            <button type="button" className="btn" onClick={() => ir('/directorio')}>
              <Icono nombre="fa-address-book" /> Completar directorio
            </button>
          )}
          {(cxA.length > 0 || cxT > 0) && (
            <button type="button" className="btn" onClick={() => ir('/cruces')}>
              <Icono nombre="fa-code-merge" /> Ver cruces
            </button>
          )}
        </div>
      </div>
      <div className="card">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3>Cola de acción</h3>
            <div className="sub" style={{ margin: '2px 0 0' }}>
              Dependencias con requerimientos sin respuesta registrada. Notifica a cada secretario o director
              por WhatsApp.
            </div>
          </div>
        </div>
        <div className="seg" style={{ margin: '6px 0 12px' }}>
          {VIGENCIAS_MANDO.map(y => (
            <button
              key={y}
              type="button"
              className={vigs.includes(y) ? 'on' : ''}
              aria-pressed={vigs.includes(y)}
              onClick={() => cambiarVig(y)}
            >
              Vigencia {y}
            </button>
          ))}
        </div>
        <div id="queue">
          {!cola.length ? (
            <div className="empty">
              <Icono nombre="fa-champagne-glasses" />
              Ninguna dependencia tiene requerimientos sin respuesta en las vigencias seleccionadas
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl" style={{ minWidth: 760 }}>
                <caption className="solo-lector">Cola de acción</caption>
                <thead>
                  <tr>
                    <th>Dependencia</th>
                    <th className="right">Sin respuesta</th>
                    <th className="right">Por vencer</th>
                    <th className="right">Mayor retraso</th>
                    <th>Responsable</th>
                    <th>Última notificación</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cola.map(o => {
                    const ct = contactosDe(o.org)[0],
                      ln = ultima(o.org),
                      cel = ct ? normalizarCelular(ct.telefono) : '';
                    return (
                      <tr key={o.org}>
                        <td>
                          <b>{nombreCorto(o.org)}</b>
                        </td>
                        <td className="right mono" style={{ color: 'var(--redink)' }}>
                          <b>{o.venc}</b>
                        </td>
                        <td className="right mono" style={{ color: 'var(--yelink)' }}>
                          {o.pend}
                        </td>
                        <td className="right mono">{o.maxRet ? o.maxRet + ' d' : '—'}</td>
                        <td>
                          {ct?.nombre ? (
                            <>
                              {ct.nombre}
                              <div className="muted" style={{ fontSize: '.72rem' }}>
                                {cel ? formatoCelular(cel) : 'sin celular'}
                              </div>
                            </>
                          ) : (
                            <span className="faint">Sin directorio</span>
                          )}
                        </td>
                        <td className="muted" style={{ fontSize: '.78rem' }}>
                          {ln ? formatoFechaHora(ln.ts) : 'Nunca'}
                        </td>
                        <td className="right" style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="btn sm" onClick={() => abrir(o.org)}>
                            Expediente
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
