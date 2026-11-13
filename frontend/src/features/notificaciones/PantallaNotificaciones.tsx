// Notificaciones WhatsApp (2.x: vNotificaciones de src/js/14-notificaciones.js y la acción notifCsv de 18-acciones.js):
// bitácora de notificaciones enviadas, exportación y "Modo despacho". Solo supervisión la tiene en el menú.
// Mismo HTML y clases de la 2.x (toolbar, tbl-wrap, tbl, empty).
import { useQuery } from '@tanstack/react-query';
import { formatoFechaHora } from '../../dominio/auditoria';
import { claveOrganismo, formatoCelular, nombreCorto, normalizarCelular } from '../../dominio/directorio';
import { dependenciasDelHistorico } from '../../dominio/expediente';
import { filasCsvNotificaciones, nombrePlantilla } from '../../dominio/notificaciones';
import { descargarCsv } from '../../shared/lib';
import { Aviso, Icono } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import { useNotificar } from './Ventanas';

export function PantallaNotificaciones() {
  const { historico, directorio, actividad } = useDatos();
  const datos = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const resp = useQuery({ queryKey: ['directorio'], queryFn: () => directorio.responsables() });
  const notifs = useQuery({
    queryKey: ['notificaciones'],
    queryFn: () => actividad.notificaciones().catch(() => [])
  });
  const { despacho, ventanas } = useNotificar();

  if (datos.isPending || notifs.isPending) return <p className="cargando">Cargando las notificaciones…</p>;
  if (datos.isError) return <Aviso>No se pudo cargar el histórico: {(datos.error as Error).message}</Aviso>;

  const lista = notifs.data ?? [];
  const orgs = dependenciasDelHistorico(datos.data.filas);
  const conCelular = orgs.filter(o =>
    (resp.data ?? []).some(
      x => claveOrganismo(x.organismo) === claveOrganismo(o) && normalizarCelular(x.telefono)
    )
  ).length;

  return (
    <>
      <div className="toolbar">
        <span className="muted">
          {lista.length} notificación(es) registrada(s) · directorio con celular en {conCelular} de{' '}
          {orgs.length} dependencias
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="btn no-print"
          onClick={() => descargarCsv('notificaciones.csv', filasCsvNotificaciones(lista))}
        >
          <Icono nombre="fa-file-csv" /> Exportar
        </button>
        <button type="button" className="btn danger" onClick={despacho}>
          <Icono nombre="fa-paper-plane" /> Modo despacho
        </button>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="solo-lector">Notificaciones registradas</caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Dependencia</th>
              <th>Destinatario</th>
              <th>Mensaje</th>
              <th className="right">Casos</th>
              <th>Enviado por</th>
            </tr>
          </thead>
          <tbody>
            {lista.length ? (
              lista.map((n, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatoFechaHora(n.ts)}</td>
                  <td>{nombreCorto(n.org)}</td>
                  <td>
                    {n.nombre || '—'}
                    <div className="muted mono" style={{ fontSize: '.72rem' }}>
                      {n.canal === 'correo' ? (
                        <>
                          <Icono nombre="fa-envelope" /> {n.correo ?? ''}
                        </>
                      ) : (
                        <>
                          <Icono nombre="fa-whatsapp" tipo="brands" /> {formatoCelular(n.tel ?? '')}
                        </>
                      )}
                    </div>
                  </td>
                  <td>{nombrePlantilla(n.tpl)}</td>
                  <td className="right mono">{n.n}</td>
                  <td className="muted" style={{ fontSize: '.78rem' }}>
                    {n.usuario || '—'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <Icono nombre="fa-inbox" />
                    Aún no se ha enviado ninguna notificación
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {ventanas}
    </>
  );
}
