// Reportes y exportación (2.x: vReportes y exportCsv de src/js/08-vistas-catalogos-y-seguridad.js, y la acción print
// de 18-acciones.js). Solo supervisión la tiene en el menú. Mismo HTML y clases (toolbar, card, tbl).
import { archivoCsvRequerimientos, consolidado, filasCsvRequerimientos } from '../../dominio/requerimientos';
import { descargarCsv } from '../../shared/lib';
import { Aviso, Icono } from '../../shared/ui';
import { useRequerimientosVivos } from './comun';

const nf = (n: number) => n.toLocaleString('es-CO');

export function PantallaReportes() {
  const { vigencia, vivos, cargando, error } = useRequerimientosVivos();
  if (cargando) return <p className="cargando">Cargando el consolidado…</p>;
  if (error) return <Aviso>No se pudieron cargar los requerimientos: {error.message}</Aviso>;
  const { k, pct, porEnte } = consolidado(vivos);
  return (
    <>
      <div className="toolbar no-print">
        <span className="muted">Vigencia {vigencia}</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => window.print()}>
          <Icono nombre="fa-print" /> Imprimir
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => descargarCsv(archivoCsvRequerimientos(vigencia), filasCsvRequerimientos(vivos))}
        >
          <Icono nombre="fa-file-csv" /> Exportar CSV
        </button>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Consolidado de cumplimiento — vigencia {vigencia}</h3>
        <div className="sub">
          Total {nf(k.total)} · cerradas {nf(k.verde)} · en término {nf(k.amarillo)} · críticas {nf(k.rojo)} ·
          cumplimiento {pct}%
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="solo-lector">Consolidado por ente de control</caption>
            <thead>
              <tr>
                <th>Ente de control</th>
                <th className="right">Total</th>
                <th className="right">Críticas</th>
                <th className="right">En término</th>
                <th className="right">Cerradas</th>
                <th className="right">Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              {porEnte.length ? (
                porEnte.map(q => (
                  <tr key={q.ente}>
                    <td>{q.ente}</td>
                    <td className="right mono">{q.total}</td>
                    <td className="right mono" style={{ color: 'var(--redink)' }}>
                      {q.rojo}
                    </td>
                    <td className="right mono" style={{ color: 'var(--yelink)' }}>
                      {q.amarillo}
                    </td>
                    <td className="right mono" style={{ color: 'var(--glow)' }}>
                      {q.verde}
                    </td>
                    <td className="right mono">{q.pct}%</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">Sin datos</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
