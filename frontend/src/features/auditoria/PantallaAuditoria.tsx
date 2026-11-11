// Auditoría (2.x: vAuditoria y verifyChain de src/js/08-vistas-catalogos-y-seguridad.js y la acción tamper de
// 18-acciones.js). Pista inmutable con cadena de custodia SHA-256: cada evento lleva la huella del anterior.
// Mismo HTML y clases de la 2.x (card con chain-ok / chain-bad, tbl con píldora y huella abreviada).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorDatos } from '../../datos/contratos';
import { formatoFechaHora } from '../../dominio/auditoria';
import { Aviso, Boton, Icono, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');
type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'verificando' }
  | { tipo: 'ok'; total: number }
  | { tipo: 'roto'; id: number | null }
  | { tipo: 'error'; texto: string };

export function PantallaAuditoria() {
  const { auditoria } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const eventos = useQuery({ queryKey: ['auditoria'], queryFn: () => auditoria.eventos() });
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicio' });

  async function verificar() {
    setEstado({ tipo: 'verificando' });
    try {
      const r = await auditoria.verificar();
      setEstado(r.ok ? { tipo: 'ok', total: r.total } : { tipo: 'roto', id: r.primer_id_roto });
    } catch (e) {
      setEstado({
        tipo: 'error',
        texto: e instanceof ErrorDatos ? e.message : 'No se pudo verificar la cadena.'
      });
    }
  }
  async function simular() {
    if (!auditoria.simularManipulacion) return;
    if (await auditoria.simularManipulacion()) {
      avisar('Se alteró en memoria el evento #2. Verifica la integridad.', 'ok');
      await cliente.invalidateQueries({ queryKey: ['auditoria'] });
    } else avisar('Genera primero algún evento (por ejemplo, guarda un responsable del directorio)', 'error');
  }

  if (eventos.isPending)
    return (
      <div className="empty">
        <Icono nombre="fa-spinner fa-spin" />
        Cargando pista de auditoría…
      </div>
    );
  if (eventos.isError)
    return <Aviso>No se pudo cargar la auditoría: {(eventos.error as Error).message}</Aviso>;

  const clase = estado.tipo === 'ok' ? ' chain-ok' : estado.tipo === 'roto' ? ' chain-bad' : '';
  return (
    <>
      <div
        className={'card' + clase}
        style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3>
            <i className="fa-solid fa-link" style={{ color: 'var(--glow)' }} aria-hidden="true" /> Cadena de
            custodia SHA-256
          </h3>
          <div className="sub" style={{ margin: '4px 0 0' }} role="status">
            {estado.tipo === 'inicio' &&
              'Cada registro contiene la huella del anterior. Alterar o borrar un evento rompe la cadena. Pulsa verificar para comprobarla.'}
            {estado.tipo === 'verificando' && 'Verificando…'}
            {estado.tipo === 'ok' && (
              <>
                <b style={{ color: 'var(--glow)' }}>Cadena íntegra.</b> {nf(estado.total)} evento(s)
                verificados; ninguno fue alterado ni eliminado.
              </>
            )}
            {estado.tipo === 'roto' && (
              <>
                <b style={{ color: 'var(--redink)' }}>Integridad comprometida.</b> La cadena se rompe en el
                evento #{estado.id}.
              </>
            )}
            {estado.tipo === 'error' && estado.texto}
          </div>
        </div>
        {auditoria.simularManipulacion && (
          <Boton variante="secundario" icono="fa-user-secret" onClick={simular}>
            Simular manipulación
          </Boton>
        )}
        <Boton icono="fa-shield-halved" onClick={verificar} disabled={estado.tipo === 'verificando'}>
          Verificar integridad
        </Boton>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="solo-lector">Pista de auditoría</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Fecha</th>
              <th scope="col">Usuario</th>
              <th scope="col">Acción</th>
              <th scope="col">Tabla</th>
              <th scope="col">Registro</th>
              <th scope="col">Huella</th>
            </tr>
          </thead>
          <tbody>
            {eventos.data.length ? (
              eventos.data.map(r => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatoFechaHora(r.created_at)}</td>
                  <td className="ellipsis" style={{ maxWidth: 200 }}>
                    {r.usuario}
                  </td>
                  <td>
                    <span className="pill neutral">{r.accion}</span>
                  </td>
                  <td>{r.tabla}</td>
                  <td className="mono faint">{String(r.registro_id).slice(0, 13)}</td>
                  <td className="mono faint" title={r.hash}>
                    {r.hash.slice(0, 14)}…
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty" role="status">
                    <Icono nombre="fa-inbox" />
                    Aún no hay eventos registrados
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
