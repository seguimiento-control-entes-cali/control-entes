// Actividad y cambios (2.x: src/js/17-actividad.js, vActividad y la acción acTab). Cuatro pestañas: quién modificó
// qué, seguimiento de notificaciones, actividad por usuario e informes generados. Mismo HTML y clases de la 2.x.
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  activosUltimos7Dias,
  detalleCambio,
  ETIQUETA_ACCION,
  ETIQUETA_TABLA,
  etiquetaUsuario,
  filtrarCambios,
  pendientesPorDependencia,
  queCambio,
  seguimientoNotificaciones,
  tonoAccion,
  type FiltroCambios
} from '../../dominio/actividad';
import { formatoFechaHora } from '../../dominio/auditoria';
import { nombreCorto } from '../../dominio/directorio';
import { NOMBRE_ROL, esRol } from '../../dominio/roles';
import { Icono, Kpi } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');
type Pestana = 'cambios' | 'notificaciones' | 'usuarios' | 'informes';
const PESTANAS: [Pestana, string][] = [
  ['cambios', 'Quién modificó qué'],
  ['notificaciones', 'Seguimiento de notificaciones'],
  ['usuarios', 'Actividad por usuario'],
  ['informes', 'Informes generados']
];
const Vacio = ({ texto, cols }: { texto: string; cols: number }) => (
  <tr>
    <td colSpan={cols}>
      <div className="empty" role="status">
        <Icono nombre="fa-inbox" />
        {texto}
      </div>
    </td>
  </tr>
);

export function PantallaActividad() {
  const { actividad, auditoria, historico, catalogos } = useDatos();
  const q = useQuery({
    queryKey: ['actividad'],
    queryFn: async () => {
      // Igual que la 2.x: si una parte falla, la pantalla se muestra con lo demás
      const [audit, profs, acc, notifs, infs, hist, deps] = await Promise.all([
        auditoria.eventos().catch(() => []),
        actividad.perfiles().catch(() => []),
        actividad.ultimosAccesos().catch((): Record<string, string> => ({})),
        actividad.notificaciones().catch(() => []),
        actividad.informes().catch(() => []),
        historico.radicados().catch(() => ({ filas: [], corte: '' })),
        catalogos.dependencias().catch(() => [])
      ]);
      return { audit, profs, acc, notifs, infs, hist, deps, ahora: Date.now() };
    }
  });
  const [tab, setTab] = useState<Pestana>('cambios');
  const [f, setF] = useState<FiltroCambios>({ q: '', u: '', t: '', a: '' });
  const d = q.data;
  const cambios = useMemo(() => (d?.audit ?? []).filter(a => a.tabla !== 'audit_log'), [d]);
  const usuarios = useMemo(
    () => [...new Set(cambios.map(a => etiquetaUsuario(d?.profs ?? [], a.usuario)))].sort(),
    [cambios, d]
  );
  // Cola del Centro de mando: en la 2.x, por defecto solo la vigencia 2026
  const pendientes = useMemo(() => pendientesPorDependencia(d?.hist.filas ?? [], [2026]), [d]);

  if (q.isPending)
    return (
      <div className="empty">
        <Icono nombre="fa-spinner fa-spin" />
        Cargando actividad…
      </div>
    );
  if (!d) return null;
  const usuario = (u: string | null) => etiquetaUsuario(d.profs, u);
  const act7 = activosUltimos7Dias(d.profs, d.acc, d.ahora);
  const sinNotificar = [...pendientes.keys()].filter(o => !d.notifs.some(n => n.org === o)).length;
  const lista = filtrarCambios(cambios, d.profs, f);
  const cambiar = (k: keyof FiltroCambios, v: string) => setF(x => ({ ...x, [k]: v }));

  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <Kpi etiqueta="Cambios registrados" valor={nf(cambios.length)} />
        <Kpi tono="verde" etiqueta="Usuarios con acceso (7 días)" valor={act7} />
        <Kpi tono="amarillo" etiqueta="Notificaciones enviadas" valor={nf(d.notifs.length)} />
        <Kpi tono="rojo" etiqueta="Con pendientes y sin notificar" valor={sinNotificar} />
        <Kpi etiqueta="Informes generados" valor={nf(d.infs.length)} />
      </div>
      <div className="seg" style={{ marginBottom: 14 }} role="tablist" aria-label="Vista">
        {PESTANAS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : ''}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'cambios' && (
        <>
          <div className="toolbar">
            <div className="grow">
              <Icono nombre="fa-magnifying-glass" />
              <input
                aria-label="Buscar"
                placeholder="Buscar por radicado, correo, dependencia…"
                value={f.q}
                onChange={e => cambiar('q', e.target.value)}
              />
            </div>
            <select aria-label="Usuario" value={f.u} onChange={e => cambiar('u', e.target.value)}>
              <option value="">Todos los usuarios</option>
              {usuarios.map(u => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <select aria-label="Tipo de registro" value={f.t} onChange={e => cambiar('t', e.target.value)}>
              <option value="">Todo tipo de registro</option>
              {Object.entries(ETIQUETA_TABLA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select aria-label="Acción" value={f.a} onChange={e => cambiar('a', e.target.value)}>
              <option value="">Toda acción</option>
              {Object.entries(ETIQUETA_ACCION).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: 900 }}>
              <caption className="solo-lector">Quién modificó qué</caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Usuario</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Qué</th>
                  <th scope="col">Detalle del cambio</th>
                </tr>
              </thead>
              <tbody>
                {lista.length ? (
                  lista.slice(0, 300).map(a => (
                    <tr key={a.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatoFechaHora(a.created_at)}</td>
                      <td>{usuario(a.usuario)}</td>
                      <td>
                        <span className={'pill ' + tonoAccion(a.accion)}>
                          {(ETIQUETA_ACCION[a.accion] || a.accion).toUpperCase()}
                        </span>
                      </td>
                      <td>{queCambio(a)}</td>
                      <td className="muted" style={{ fontSize: '.8rem' }}>
                        {detalleCambio(a)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <Vacio cols={5} texto="Sin cambios para este filtro" />
                )}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: '.78rem' }}>
            Cada fila está firmada en la cadena de auditoría SHA-256 (menú Auditoría &gt; Verificar
            integridad). Nadie puede editar ni borrar este historial.
          </div>
        </>
      )}

      {tab === 'notificaciones' && (
        <>
          <div className="tbl-wrap">
            <table className="tbl" style={{ minWidth: 860 }}>
              <caption className="solo-lector">Seguimiento de notificaciones</caption>
              <thead>
                <tr>
                  <th scope="col">Dependencia</th>
                  <th scope="col" className="right">
                    Sin respuesta hoy
                  </th>
                  <th scope="col">Última notificación</th>
                  <th scope="col">Enviada por</th>
                  <th scope="col" className="right">
                    Casos al notificar
                  </th>
                  <th scope="col" className="right">
                    Días
                  </th>
                  <th scope="col" className="right">
                    Veces
                  </th>
                  <th scope="col">Seguimiento</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const filas = seguimientoNotificaciones(pendientes, d.notifs, d.ahora);
                  return filas.length ? (
                    filas.map(r => (
                      <tr key={r.o}>
                        <td>{nombreCorto(r.o)}</td>
                        <td className="right mono">{r.hoy}</td>
                        <td>{r.last ? formatoFechaHora(r.last.ts) : '—'}</td>
                        <td>{r.last ? usuario(r.last.usuario) : '—'}</td>
                        <td className="right mono">{r.last ? r.last.n : '—'}</td>
                        <td className="right mono">{r.dias == null ? '—' : r.dias}</td>
                        <td className="right mono">{r.cnt}</td>
                        <td>
                          <span className={'pill ' + r.est[0]}>
                            <i />
                            {r.est[1]}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <Vacio cols={8} texto="Sin dependencias con pendientes ni notificaciones" />
                  );
                })()}
              </tbody>
            </table>
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: '.78rem' }}>
            Seguimiento: &quot;Sin atender&quot; si pasaron 7 o más días desde el aviso y los casos no
            bajaron; &quot;En progreso&quot; si ya disminuyeron; &quot;Resuelta&quot; si no quedan casos sin
            respuesta (vigencias seleccionadas en el Centro de mando).
          </div>
        </>
      )}

      {tab === 'usuarios' && (
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 860 }}>
            <caption className="solo-lector">Actividad por usuario</caption>
            <thead>
              <tr>
                <th scope="col">Usuario</th>
                <th scope="col">Rol</th>
                <th scope="col">Dependencia</th>
                <th scope="col">Último acceso</th>
                <th scope="col" className="right">
                  Cambios
                </th>
                <th scope="col" className="right">
                  Notificaciones
                </th>
                <th scope="col" className="right">
                  Informes
                </th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {d.profs.length ? (
                d.profs.map(p => {
                  const em = p.email ?? '';
                  const last = d.acc[p.id] || d.acc[em] || '';
                  return (
                    <tr key={p.id}>
                      <td>{em}</td>
                      <td>{esRol(p.rol) ? NOMBRE_ROL[p.rol] : p.rol}</td>
                      <td>{nombreCorto(d.deps.find(x => x.id === p.dependencia_id)?.nombre ?? '—')}</td>
                      <td>{last ? formatoFechaHora(last) : 'Nunca'}</td>
                      <td className="right mono">{cambios.filter(a => usuario(a.usuario) === em).length}</td>
                      <td className="right mono">{d.notifs.filter(n => usuario(n.usuario) === em).length}</td>
                      <td className="right mono">{d.infs.filter(i => usuario(i.usuario) === em).length}</td>
                      <td>
                        {p.activo ? (
                          <span className="pill verde">
                            <i />
                            ACTIVO
                          </span>
                        ) : (
                          <span className="pill neutral">INACTIVO</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="empty">Sin cuentas</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'informes' && (
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 780 }}>
            <caption className="solo-lector">Informes generados</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Generado por</th>
                <th scope="col">Alcance</th>
                <th scope="col">Vigencias</th>
                <th scope="col" className="right">
                  Registros
                </th>
                <th scope="col">Huella SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {d.infs.length ? (
                d.infs.map(i => (
                  <tr key={i.ts + i.huella}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatoFechaHora(i.ts)}</td>
                    <td>{usuario(i.usuario)}</td>
                    <td>{i.alcance}</td>
                    <td>{i.vigencias}</td>
                    <td className="right mono">{nf(i.n)}</td>
                    <td className="mono faint" title={i.huella}>
                      {String(i.huella).slice(0, 16)}…
                    </td>
                  </tr>
                ))
              ) : (
                <Vacio cols={6} texto="Aún no se ha generado ningún informe" />
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
