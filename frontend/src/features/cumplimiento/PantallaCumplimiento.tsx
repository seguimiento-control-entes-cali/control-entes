// Cumplimiento por secretaría (2.x: vCumplimiento y drillModal de src/js/09-cumplimiento-e-historico.js y las
// acciones cSort, drill y cumCsv de 18-acciones.js). Mismo HTML y clases de la 2.x (toolbar, seg, g-kpi, top3,
// legend, tbl con barra stack y semáforo, ventana ancha con los radicados incumplidos).
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  agruparPorOrganismo,
  filasCsvCumplimiento,
  ordenarCumplimiento,
  porcentaje1,
  radicadosIncumplidos,
  totalesCumplimiento,
  UMBRALES,
  type NivelCumplimiento,
  type OrdenCumplimiento,
  type SemaforoHistorico
} from '../../dominio/cumplimiento';
import { formatoCorto, pildoraDe } from '../../dominio/historico';
import { Aviso, Boton, Icono, Kpi, Modal } from '../../shared/ui';
import { descargarCsv } from '../../shared/lib';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');

function PildoraSemaforo({ s }: { s: SemaforoHistorico }) {
  if (s === 'muestra') return <span className="pill neutral">MUESTRA INSUFICIENTE</span>;
  return (
    <span className={'pill ' + s}>
      <i />
      {s.toUpperCase()}
    </span>
  );
}

export function PantallaCumplimiento() {
  const { historico } = useDatos();
  const datos = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const [vig, setVig] = useState('todas');
  const [niv, setNiv] = useState<NivelCumplimiento>('principal');
  const [orden, setOrden] = useState<OrdenCumplimiento>('inc');
  const [detalle, setDetalle] = useState<string | null>(null);

  const lista = useMemo(
    () => ordenarCumplimiento(agruparPorOrganismo(datos.data?.filas ?? [], vig, niv), orden),
    [datos.data, vig, niv, orden]
  );
  const t = useMemo(() => totalesCumplimiento(lista), [lista]);

  if (datos.isPending) return <p className="cargando">Cargando el cumplimiento…</p>;
  if (datos.isError) return <Aviso>No se pudo cargar el histórico: {(datos.error as Error).message}</Aviso>;

  const top = lista.filter(o => o.sem === 'rojo').slice(0, 3);
  const incumplidos = detalle ? radicadosIncumplidos(datos.data.filas, detalle, vig) : [];

  return (
    <>
      <div className="toolbar">
        <select aria-label="Vigencia" value={vig} onChange={e => setVig(e.target.value)}>
          {['todas', '2026', '2025', '2024'].map(y => (
            <option key={y} value={y}>
              {y === 'todas' ? 'Todas las vigencias' : 'Vigencia ' + y}
            </option>
          ))}
        </select>
        <select
          aria-label="Organismos"
          value={niv}
          onChange={e => setNiv(e.target.value as NivelCumplimiento)}
        >
          <option value="principal">Secretarías, departamentos y UAE</option>
          <option value="todos">Todos los organismos</option>
        </select>
        <div className="seg" role="group" aria-label="Ordenar">
          <button type="button" className={orden === 'inc' ? 'on' : ''} onClick={() => setOrden('inc')}>
            Por n.º de incumplimientos
          </button>
          <button type="button" className={orden === 'tasa' ? 'on' : ''} onClick={() => setOrden('tasa')}>
            Por % de incumplimiento
          </button>
        </div>
        <span className="spacer" />
        <Boton
          variante="secundario"
          icono="fa-file-csv"
          className="no-print"
          onClick={() => descargarCsv('cumplimiento_por_organismo.csv', filasCsvCumplimiento(lista))}
        >
          Exportar
        </Boton>
      </div>

      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <Kpi etiqueta="Evaluados" valor={nf(t.ev)} />
        <Kpi tono="verde" etiqueta="A tiempo" valor={nf(t.ok)} />
        <Kpi tono="amarillo" etiqueta="Respondidos tarde" valor={nf(t.tar)} />
        <Kpi tono="rojo" etiqueta="Sin respuesta (vencidos)" valor={nf(t.sin)} />
        <Kpi
          tono={t.sem === 'rojo' ? 'rojo' : t.sem === 'amarillo' ? 'amarillo' : 'verde'}
          etiqueta="% de incumplimiento"
          valor={porcentaje1(t.tasa)}
        />
      </div>

      {top.length > 0 && (
        <div className="top3">
          {top.map((o, i) => (
            <div className="top-card" key={o.org}>
              <span className="pill rojo">
                <i />
                ALERTA {i + 1}
              </span>
              <div className="n" style={{ marginTop: 10 }}>
                {o.inc}
              </div>
              <b>{o.org}</b>
              <small className="muted">
                {o.tar} tarde · {o.sin} sin respuesta · {porcentaje1(o.tasa)} de incumplimiento
              </small>
            </div>
          ))}
        </div>
      )}

      <div className="legend">
        <span>
          <i style={{ background: '#38D99A' }} />A tiempo
        </span>
        <span>
          <i style={{ background: '#FFC44D' }} />
          Tarde
        </span>
        <span>
          <i style={{ background: '#FF5C70' }} />
          Sin respuesta vencida
        </span>
        <span className="faint">
          Semáforo: verde menos de {UMBRALES.verde_lt * 100}% · rojo desde {UMBRALES.rojo_ge * 100}% · mínimo{' '}
          {UMBRALES.min} casos evaluados · corte de datos {formatoCorto(datos.data.corte)}
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="tbl" style={{ minWidth: 980 }}>
          <caption className="solo-lector">Cumplimiento por organismo</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Organismo</th>
              <th scope="col" style={{ width: 170 }}>
                Oportunidad
              </th>
              <th scope="col" className="right">
                A tiempo
              </th>
              <th scope="col" className="right">
                Tarde
              </th>
              <th scope="col" className="right">
                Sin resp.
              </th>
              <th scope="col" className="right">
                Incumpl.
              </th>
              <th scope="col" className="right">
                %
              </th>
              <th scope="col">Semáforo</th>
              <th scope="col" className="right">
                Retraso prom.
              </th>
              <th scope="col" className="right">
                2024 / 2025 / 2026
              </th>
            </tr>
          </thead>
          <tbody>
            {lista.length ? (
              lista.map((o, i) => (
                <tr
                  key={o.org}
                  className="click"
                  tabIndex={0}
                  onClick={() => setDetalle(o.org)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') setDetalle(o.org);
                  }}
                >
                  <td className="mono muted">{i + 1}</td>
                  <td style={{ minWidth: 250 }}>
                    <span className="org">{o.org}</span>
                  </td>
                  <td>
                    <div className="stack">
                      <span className="ok" style={{ width: (o.ok * 100) / o.ev + '%' }} />
                      <span className="tar" style={{ width: (o.tar * 100) / o.ev + '%' }} />
                      <span className="sin" style={{ width: (o.sin * 100) / o.ev + '%' }} />
                    </div>
                  </td>
                  <td className="right mono">{o.ok}</td>
                  <td className="right mono" style={{ color: 'var(--yelink)' }}>
                    {o.tar}
                  </td>
                  <td className="right mono" style={{ color: 'var(--redink)' }}>
                    {o.sin}
                  </td>
                  <td className="right mono">
                    <b>{o.inc}</b>
                  </td>
                  <td className="right mono">{porcentaje1(o.tasa)}</td>
                  <td>
                    <PildoraSemaforo s={o.sem} />
                  </td>
                  <td className="right mono">{o.tar ? o.ret.toFixed(1).replace('.', ',') + ' d' : '—'}</td>
                  <td className="right mono muted">
                    {o.y[2024]} / {o.y[2025]} / {o.y[2026]}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={11}>
                  <div className="empty" role="status">
                    <Icono nombre="fa-inbox" />
                    Sin datos
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: '.78rem' }}>
        Toca una fila para ver los radicados que incumplieron. &quot;Retraso prom.&quot; = días hábiles
        promedio de las respuestas tardías.
      </div>

      <Modal abierto={!!detalle} titulo={detalle ?? ''} alCerrar={() => setDetalle(null)} ancha>
        <div className="muted" style={{ fontSize: '.8rem', marginBottom: 10 }}>
          {incumplidos.length} radicado(s) con respuesta tardía o sin respuesta
          {vig === 'todas' ? '' : ' en la vigencia ' + vig}. Ordenados por mayor retraso.
        </div>
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 640 }}>
            <caption className="solo-lector">Radicados incumplidos</caption>
            <thead>
              <tr>
                <th scope="col">Vig.</th>
                <th scope="col">N.º radicación ente</th>
                <th scope="col">Fecha máx.</th>
                <th scope="col">Fecha respuesta</th>
                <th scope="col">ORFEO respuesta</th>
                <th scope="col" className="right">
                  Retraso
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {incumplidos.slice(0, 200).map(r => {
                const p = pildoraDe(r.opo);
                return (
                  <tr key={r.i}>
                    <td className="mono">{r.v}</td>
                    <td className="mono">{r.rad || '—'}</td>
                    <td>{formatoCorto(r.fmax)}</td>
                    <td>{formatoCorto(r.fresp)}</td>
                    <td className="mono" style={{ fontSize: '.76rem' }}>
                      {r.orfR || '—'}
                    </td>
                    <td className="right mono">{r.ret == null ? '—' : r.ret + ' d'}</td>
                    <td>
                      <span className={'pill ' + p[0]}>{p[1]}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {incumplidos.length > 200 && (
          <div className="muted" style={{ fontSize: '.76rem', marginTop: 8 }}>
            Se muestran los 200 con mayor retraso. El detalle completo está en Histórico de radicados.
          </div>
        )}
      </Modal>
    </>
  );
}
