// Tablero y métricas (2.x: vTablero de src/js/07-vistas-operacion.js). Mismo HTML y clases (g-kpi, kpi, g-2,
// list-row, bar, pill, empty).
import { resumenTablero, textoDias } from '../../dominio/requerimientos';
import { Aviso, Icono } from '../../shared/ui';
import { PildoraSemaforo, useRequerimientosVivos } from './comun';

const nf = (n: number) => n.toLocaleString('es-CO');
function Vacio({ icono, texto }: { icono: string; texto: string }) {
  return (
    <div className="empty">
      <Icono nombre={icono} />
      {texto}
    </div>
  );
}

export function PantallaTablero() {
  const { vivos, diasRojo, cargando, error } = useRequerimientosVivos();
  if (cargando) return <p className="cargando">Cargando el tablero…</p>;
  if (error) return <Aviso>No se pudieron cargar los requerimientos: {error.message}</Aviso>;
  const { k, pct, porEnte, proximos, porDependencia } = resumenTablero(vivos);
  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <div className="card kpi">
          <small>Total solicitudes</small>
          <b>{nf(k.total)}</b>
        </div>
        <div className="card kpi r">
          <small>Críticas</small>
          <b>{nf(k.rojo)}</b>
        </div>
        <div className="card kpi y">
          <small>En término</small>
          <b>{nf(k.amarillo)}</b>
        </div>
        <div className="card kpi g">
          <small>Cerradas</small>
          <b>{nf(k.verde)}</b>
        </div>
        <div className="card kpi g">
          <small>Cumplimiento</small>
          <b>{pct}%</b>
        </div>
      </div>
      <div className="grid g-2">
        <div className="card">
          <h3>Semáforo por ente de control</h3>
          <div className="sub">Crítico / En término / Cerrado</div>
          {porEnte.length ? (
            porEnte.map(([n, q]) => (
              <div key={n} className="list-row" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 7 }}>
                  <b className="ellipsis" style={{ fontSize: '.84rem' }}>
                    {n}
                  </b>
                  <span className="mono muted" style={{ fontSize: '.74rem', whiteSpace: 'nowrap' }}>
                    {q.total} · <span style={{ color: 'var(--redink)' }}>{q.rojo}</span> /{' '}
                    <span style={{ color: 'var(--yelink)' }}>{q.amarillo}</span> /{' '}
                    <span style={{ color: 'var(--glow)' }}>{q.verde}</span>
                  </span>
                </div>
                <div className="bar">
                  <span className="rojo" style={{ width: (q.rojo * 100) / q.total + '%' }} />
                  <span className="amarillo" style={{ width: (q.amarillo * 100) / q.total + '%' }} />
                  <span className="verde" style={{ width: (q.verde * 100) / q.total + '%' }} />
                </div>
              </div>
            ))
          ) : (
            <Vacio icono="fa-inbox" texto="Sin requerimientos en esta vigencia" />
          )}
        </div>
        <div className="card">
          <h3>Próximos vencimientos</h3>
          <div className="sub">Umbral crítico: {diasRojo} días o menos</div>
          {proximos.length ? (
            proximos.map(r => (
              <div key={r.id} className="list-row">
                <div className="grow">
                  <b className="ellipsis">{r.dep_n}</b>
                  <small className="mono">
                    {r.radicado} · {r.ente_s || r.ente_n}
                  </small>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <PildoraSemaforo sem={r.sem} />
                  <div className="muted" style={{ fontSize: '.72rem', marginTop: 4 }}>
                    {textoDias(r.dias)}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <Vacio icono="fa-champagne-glasses" texto="No hay requerimientos abiertos" />
          )}
        </div>
        <div className="card">
          <h3>Dependencias con pendientes</h3>
          <div className="sub">Ordenadas por criticidad</div>
          {porDependencia.length ? (
            porDependencia.map(([n, o]) => (
              <div key={n} className="list-row">
                <div className="grow">
                  <b className="ellipsis">{n}</b>
                  <small>{o.n} abierto(s)</small>
                </div>
                {o.rojo ? (
                  <span className="pill rojo">
                    <i />
                    {o.rojo} CRÍTICO{o.rojo > 1 ? 'S' : ''}
                  </span>
                ) : (
                  <span className="pill amarillo">
                    <i />
                    EN TÉRMINO
                  </span>
                )}
              </div>
            ))
          ) : (
            <Vacio icono="fa-circle-check" texto="Sin pendientes" />
          )}
        </div>
      </div>
    </>
  );
}
