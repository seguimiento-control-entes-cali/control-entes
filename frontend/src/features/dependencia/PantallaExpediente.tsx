// Expediente de dependencia (2.x: vDependencia, svgDonut y svgTrend de src/js/13-expediente-dependencia.js y la acción
// depCsv de 18-acciones.js). Secretario y enlace ven solo su dependencia ("Mi dependencia"); la base lo exige además
// por RLS. Mismo HTML y clases de la 2.x (card, field, pill, g-kpi, g-2, list-row, bar, tbl-wrap/tbl).
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Perfil } from '../../datos/contratos';
import { porcentaje1, semaforoHistorico, UMBRALES } from '../../dominio/cumplimiento';
import { claveOrganismo, formatoCelular, normalizarCelular } from '../../dominio/directorio';
import {
  anillo,
  archivoReporte,
  colorSemaforo,
  decimal1,
  dependenciaInicial,
  dependenciasDelHistorico,
  estadisticas,
  filasReporte,
  incumplimientoPorEnte,
  MAX_PENDIENTES,
  pendientesYVencidos,
  tendenciaMensual,
  vigenciasConDatos,
  type PuntoTendencia
} from '../../dominio/expediente';
import {
  alcanceOrganismo,
  formatoCorto,
  ocultarDatosPersonales,
  pildoraDe,
  type RadicadoHistorico
} from '../../dominio/historico';
import { textoCorto } from '../../dominio/actividad';
import { descargarCsv } from '../../shared/lib';
import { Aviso, Icono, Modal } from '../../shared/ui';
import { DetalleRadicado } from '../historico/PantallaHistorico';
import { useNotificar } from '../notificaciones/Ventanas';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');

/** Anillo de "a tiempo" (svgDonut de la 2.x). */
function Anillo({ p, color, texto }: { p: number; color: string; texto: string }) {
  const { r, C, off } = anillo(p);
  return (
    <svg
      viewBox="0 0 140 140"
      width="150"
      height="150"
      style={{ fontFamily: 'Arial,sans-serif' }}
      role="img"
      aria-label={texto + ' a tiempo'}
    >
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(148,170,210,.14)" strokeWidth="14" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={off}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill="#F2F6FF">
        {texto}
      </text>
      <text x="70" y="88" textAnchor="middle" fontSize="10" fill="#93A4C3">
        a tiempo
      </text>
    </svg>
  );
}

/** Tendencia mensual con las bandas del semáforo (svgTrend de la 2.x). */
function Tendencia({ pts }: { pts: PuntoTendencia[] }) {
  const W = 620,
    H = 190,
    L = 34,
    R = 10,
    T = 12,
    B = 26,
    n = pts.length;
  if (n < 2)
    return (
      <div className="muted" style={{ padding: 20, fontSize: '.82rem' }}>
        Sin datos suficientes para la tendencia.
      </div>
    );
  const X0 = (i: number) => L + ((W - L - R) * i) / (n - 1),
    Y0 = (v: number) => T + (H - T - B) * (1 - Math.min(1, v));
  const y20 = Y0(UMBRALES.verde_lt),
    y40 = Y0(UMBRALES.rojo_ge);
  const linea = pts
    .map((p, i) => (p.v == null ? null : `${X0(i).toFixed(1)},${Y0(p.v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const paso = Math.ceil(n / 8);
  const etiqueta = (y: number, t: string) => (
    <text x="4" y={y + 3} fontSize="9" fill="#93A4C3">
      {t}
    </text>
  );
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ fontFamily: 'Arial,sans-serif' }}
      role="img"
      aria-label="Tendencia mensual de incumplimiento"
    >
      <rect x={L} y={T} width={W - L - R} height={y40 - T} fill="rgba(255,92,112,.06)" />
      <rect x={L} y={y20} width={W - L - R} height={H - B - y20} fill="rgba(56,217,154,.05)" />
      <line x1={L} x2={W - R} y1={y40} y2={y40} stroke="#FF5C70" strokeDasharray="4 4" strokeOpacity=".55" />
      <line x1={L} x2={W - R} y1={y20} y2={y20} stroke="#38D99A" strokeDasharray="4 4" strokeOpacity=".55" />
      {etiqueta(y40, '40%')}
      {etiqueta(y20, '20%')}
      {etiqueta(Y0(1), '100%')}
      {etiqueta(Y0(0), '0%')}
      <polyline
        points={linea}
        fill="none"
        stroke="#4C8DFF"
        strokeWidth="2.2"
        filter="drop-shadow(0 0 4px rgba(76,141,255,.7))"
        strokeLinejoin="round"
      />
      {pts.map((p, i) =>
        p.v == null ? null : (
          <circle
            key={'p' + i}
            cx={X0(i).toFixed(1)}
            cy={Y0(p.v).toFixed(1)}
            r="4"
            fill={colorSemaforo(semaforoHistorico(Math.max(p.ev, UMBRALES.min), p.v))}
            stroke="#0B1630"
            strokeWidth="1.5"
          >
            <title>{`${p.label}: ${porcentaje1(p.v)} (${p.inc} de ${p.ev})`}</title>
          </circle>
        )
      )}
      {pts.map((p, i) =>
        i % paso === 0 ? (
          <text key={'t' + i} x={X0(i).toFixed(1)} y={H - 8} textAnchor="middle" fontSize="9" fill="#93A4C3">
            {p.short}
          </text>
        ) : null
      )}
    </svg>
  );
}

function Vacio({ icono, children }: { icono: string; children: ReactNode }) {
  return (
    <div className="card">
      <div className="empty" role="status">
        <Icono nombre={icono} />
        {children}
      </div>
    </div>
  );
}

export function PantallaExpediente({ perfil }: { perfil: Perfil }) {
  const { historico, catalogos, directorio } = useDatos();
  const datos = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const responsables = useQuery({ queryKey: ['directorio'], queryFn: () => directorio.responsables() });
  // Desde el Centro de mando ("Abrir expediente") llega la dependencia elegida, como X.org en la 2.x
  const llegada = (useLocation().state as { org?: string } | null)?.org ?? null;
  const [elegida, setElegida] = useState<string | null>(llegada);
  const [detalle, setDetalle] = useState<RadicadoHistorico | null>(null);
  const { notificar, ventanas } = useNotificar();
  const notifica = ['admin', 'alcalde', 'control_interno'].includes(perfil.rol);

  const todas = useMemo(() => datos.data?.filas ?? [], [datos.data]);
  const nombreDep = deps.data?.find(d => d.id === perfil.dependenciaId)?.nombre ?? null;
  const propia = alcanceOrganismo(perfil.rol, nombreDep, todas);
  const orgs = useMemo(() => dependenciasDelHistorico(todas), [todas]);
  const org =
    propia ?? (elegida && orgs.includes(elegida) ? elegida : (dependenciaInicial(todas) ?? orgs[0] ?? ''));
  const filas = useMemo(() => todas.filter(r => r.org === org), [todas, org]);

  if (datos.isPending || deps.isPending) return <p className="cargando">Cargando el expediente…</p>;
  if (datos.isError) return <Aviso>No se pudo cargar el histórico: {(datos.error as Error).message}</Aviso>;
  if (!todas.length) return <Vacio icono="fa-database">Aún no hay datos históricos cargados.</Vacio>;
  if (propia !== null && !filas.length)
    return (
      <Vacio icono="fa-circle-info">
        No hay requerimientos registrados para tu dependencia
        {propia.startsWith('\u0000') ? ' (tu cuenta aún no tiene dependencia asignada)' : ''}.
      </Vacio>
    );

  const st = estadisticas(filas);
  const contactos = (responsables.data ?? []).filter(
    x => claveOrganismo(x.organismo) === claveOrganismo(org)
  );
  const pts = tendenciaMensual(filas);
  const entes = incumplimientoPorEnte(filas);
  const maxEnte = entes[0]?.[1] ?? 1;
  const abiertos = pendientesYVencidos(filas);

  return (
    <>
      <div
        className="card"
        style={{ marginBottom: 14, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          {propia === null && (
            <div className="field" style={{ marginBottom: 10, maxWidth: 420 }}>
              <label htmlFor="depSel">Dependencia</label>
              <select id="depSel" value={org} onChange={e => setElegida(e.target.value)}>
                {orgs.map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          )}
          <h2 style={{ fontSize: '1.25rem', marginBottom: 6 }}>{org}</h2>
          {contactos.length ? (
            contactos.map(x => {
              const cel = normalizarCelular(x.telefono);
              return (
                <div key={x.cargo + x.nombre} className="muted" style={{ fontSize: '.84rem' }}>
                  {x.cargo}:{' '}
                  <b style={{ color: 'var(--ink)' }}>{x.nombre || 'sin nombre en el directorio'}</b>
                  {cel ? ' · ' + formatoCelular(cel) : ''}
                </div>
              );
            })
          ) : (
            <div className="muted" style={{ fontSize: '.84rem' }}>
              Sin responsable cargado en el directorio.
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className={'pill ' + (st.sem === 'muestra' ? 'neutral' : st.sem)}>
              {st.sem === 'muestra' ? (
                'MUESTRA INSUFICIENTE'
              ) : (
                <>
                  <i />
                  {'SEMÁFORO ' + st.sem.toUpperCase()}
                </>
              )}
            </span>
            <button
              type="button"
              className="btn sm"
              onClick={() => descargarCsv(archivoReporte(org), filasReporte(todas, org))}
            >
              <Icono nombre="fa-file-csv" /> Descargar mi reporte
            </button>
            {notifica && (
              <button type="button" className="btn sm primary" onClick={() => notificar(org)}>
                <Icono nombre="fa-whatsapp" tipo="brands" /> Notificar por WhatsApp
              </button>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Anillo
            p={st.ev ? st.ok / st.ev : 0}
            color={colorSemaforo(st.sem)}
            texto={st.ev ? Math.round((st.ok * 100) / st.ev) + '%' : '—'}
          />
        </div>
      </div>

      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <div className="card kpi">
          <small>Evaluados</small>
          <b>{nf(st.ev)}</b>
        </div>
        <div className="card kpi g">
          <small>A tiempo</small>
          <b>{nf(st.ok)}</b>
        </div>
        <div className="card kpi y">
          <small>Respondidos tarde</small>
          <b>{nf(st.tar)}</b>
        </div>
        <div className="card kpi r">
          <small>Sin respuesta</small>
          <b>{nf(st.sin)}</b>
        </div>
        <div className="card kpi">
          <small>Retraso promedio</small>
          <b>
            {st.tar ? decimal1(st.ret) : '0'}
            <span style={{ fontSize: '.9rem' }}> d</span>
          </b>
        </div>
        <div className="card kpi">
          <small>Tarda en responder</small>
          <b>
            {st.tiemN ? decimal1(st.tiem) : '—'}
            <span style={{ fontSize: '.9rem' }}> d háb.</span>
          </b>
        </div>
      </div>

      <div className="grid g-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>Tendencia mensual de incumplimiento</h3>
          <div className="sub">
            Por mes de vencimiento. Línea punteada: umbrales del semáforo (20% y 40%).
          </div>
          <Tendencia pts={pts} />
        </div>
        <div className="card">
          <h3>Qué ente exige más y se incumple más</h3>
          <div className="sub">Respuestas tardías o sin respuesta, por ente de control</div>
          {entes.length ? (
            entes.map(([e, n]) => (
              <div key={e} className="list-row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                  <b style={{ fontSize: '.82rem' }}>{e}</b>
                  <span className="mono muted">{n}</span>
                </div>
                <div className="bar">
                  <span style={{ width: (n * 100) / maxEnte + '%', background: '#9ad7ff' }} />
                </div>
              </div>
            ))
          ) : (
            <div className="empty">
              <Icono nombre="fa-circle-check" />
              Sin incumplimientos
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Pendientes y vencidos de esta dependencia</h3>
        <div className="sub">
          Sin respuesta registrada o por vencer. Vigencias con datos: {vigenciasConDatos(filas).join(', ')}.
          Corte {formatoCorto(datos.data.corte)}.
        </div>
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 760 }}>
            <caption className="solo-lector">Pendientes y vencidos de {org}</caption>
            <thead>
              <tr>
                <th scope="col">Vig.</th>
                <th scope="col">N.º radicación del ente</th>
                <th scope="col">Ente</th>
                <th scope="col">Asunto</th>
                <th scope="col">Fecha máx.</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {abiertos.length ? (
                abiertos.slice(0, MAX_PENDIENTES).map(r => {
                  const p = pildoraDe(r.opo);
                  return (
                    <tr
                      key={r.i}
                      className="click"
                      tabIndex={0}
                      onClick={() => setDetalle(r)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') setDetalle(r);
                      }}
                    >
                      <td className="mono">{r.v}</td>
                      <td className="mono">{r.rad || '—'}</td>
                      <td>{r.ente}</td>
                      <td className="asunto">{textoCorto(ocultarDatosPersonales(r.asu), 90)}</td>
                      <td>{formatoCorto(r.fmax)}</td>
                      <td>
                        <span className={'pill ' + p[0]}>{p[1]}</span>
                        {r.ret ? (
                          <div className="muted" style={{ fontSize: '.72rem', marginTop: 3 }}>
                            {r.ret} d hábiles
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty" role="status">
                      <Icono nombre="fa-champagne-glasses" />
                      No tiene requerimientos pendientes ni vencidos
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {abiertos.length > MAX_PENDIENTES && (
          <div className="muted" style={{ fontSize: '.76rem', marginTop: 8 }}>
            Se muestran {MAX_PENDIENTES} de {abiertos.length}. El resto está en Histórico de radicados.
          </div>
        )}
      </div>

      <Modal abierto={!!detalle} titulo={detalle?.rad || 'Sin número'} alCerrar={() => setDetalle(null)}>
        {detalle && <DetalleRadicado r={detalle} />}
      </Modal>
      {ventanas}
    </>
  );
}
