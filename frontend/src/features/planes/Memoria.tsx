// Archivo documental del plan y papelera (2.x: pmTabDocumentos, pmDocNuevoModal/pmDocGuardar, pmDocDescargar,
// pmDocMover, pmDocPurgar, pmPapeleraModal y pmRestaurar de src/js/19-planes-norma-y-memoria.js). Mismo HTML y clases.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ArchivoDocumento } from '../../datos/contratos';
import { textoCorto } from '../../dominio/actividad';
import { formatoFechaHora } from '../../dominio/auditoria';
import { huellaArchivo } from '../../dominio/huella-archivo';
import type { DatosPlanes, DocumentoArchivo, Plan } from '../../dominio/planes';
import {
  TIPOS_DOCUMENTO,
  TIPOS_PAPELERA,
  radicadoOrfeo,
  type MetaDocumento
} from '../../dominio/planes-memoria';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

function useRefrescar() {
  const cliente = useQueryClient();
  return () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: ['planes'] }),
      cliente.invalidateQueries({ queryKey: ['auditoria'] })
    ]);
}

/** pmDocCopia: guarda una copia sin interrumpir lo principal; si falla, avisa pero no deshace la operación. */
export function useCopiaDocumento() {
  const { planes } = useDatos();
  const avisar = useAvisos();
  return async (archivo: ArchivoDocumento | null, meta: MetaDocumento, v20: boolean | undefined) => {
    if (!archivo || !v20) return;
    try {
      await planes.subirDocumento(archivo, meta);
    } catch (e) {
      avisar(
        'La operación se hizo, pero no se pudo guardar la copia en el archivo documental: ' +
          (e as Error).message,
        'error'
      );
    }
  };
}

/** pmDocDescargar: descarga y avisa si la huella no coincide con la registrada. */
function useDescargar() {
  const { planes } = useDatos();
  const avisar = useAvisos();
  return async (d: DocumentoArchivo) => {
    try {
      const buf = await planes.contenidoDocumento(d);
      const sha = await huellaArchivo({ arrayBuffer: () => Promise.resolve(buf) });
      if (sha !== d.sha256)
        avisar('Atención: la huella digital del archivo no coincide con la registrada', 'error');
      const u = URL.createObjectURL(new Blob([buf], { type: d.mime }));
      const a = document.createElement('a');
      a.href = u;
      a.download = d.nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
}

export function TabDocumentos({
  p,
  d,
  edita,
  subir
}: {
  p: Plan;
  d: DatosPlanes;
  edita: boolean;
  subir: () => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const refrescar = useRefrescar();
  const descargar = useDescargar();
  if (!d.v20)
    return (
      <div className="card">
        <div className="empty">
          <Icono nombre="fa-box-archive" />
          El archivo documental estará disponible al ejecutar el script{' '}
          <span className="mono">20_norma_cgsc_y_memoria.sql</span>.
        </div>
      </div>
    );
  const l = (d.documentos ?? [])
    .filter(x => x.plan_id === p.id && !x.eliminado_at)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const aPapelera = async (x: DocumentoArchivo) => {
    if (!window.confirm('¿Enviar este documento a la papelera? Se puede restaurar.')) return;
    try {
      await planes.moverDocumento(x.id, true);
      avisar('Documento enviado a la papelera', 'ok');
      await refrescar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  return (
    <div className="card">
      <div className="toolbar">
        <div className="sub" style={{ flex: 1 }}>
          Copias de trabajo con su huella digital (SHA-256). El archivo oficial sigue siendo ORFEO; cada
          documento conserva su radicado.
        </div>
        {edita && (
          <button type="button" className="btn sm primary" onClick={subir}>
            <Icono nombre="fa-upload" /> Subir documento
          </button>
        )}
      </div>
      {l.length ? (
        <div className="tbl-wrap">
          <table className="tbl" aria-label="Documentos del plan">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Documento</th>
                <th>Radicado</th>
                <th>Guardado</th>
                <th>Huella</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {l.map(x => (
                <tr key={x.id}>
                  <td>{TIPOS_DOCUMENTO[x.tipo] || x.tipo}</td>
                  <td className="asunto">
                    {x.nombre}
                    {x.observaciones && (
                      <div className="muted" style={{ fontSize: '.72rem' }}>
                        {textoCorto(x.observaciones, 90)}
                      </div>
                    )}
                  </td>
                  <td className="mono">{x.radicado_orfeo || '—'}</td>
                  <td>
                    {formatoFechaHora(x.created_at)}
                    <div className="muted" style={{ fontSize: '.72rem' }}>
                      {x.subido_email || ''}
                    </div>
                  </td>
                  <td className="mono" title={x.sha256}>
                    {x.sha256.slice(0, 12)}…
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn sm" onClick={() => void descargar(x)}>
                      <Icono nombre="fa-download" /> Descargar
                    </button>
                    {edita && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="icon-btn"
                          title="Enviar a la papelera"
                          aria-label="Enviar a la papelera"
                          onClick={() => void aPapelera(x)}
                        >
                          <Icono nombre="fa-trash" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <Icono nombre="fa-box-archive" />
          Aún no hay documentos. Al importar el informe o el plan, y al exportar el formato, se guarda una
          copia aquí.
        </div>
      )}
    </div>
  );
}

export function VentanaDocumento({ planId, alCerrar }: { planId: string; alCerrar: () => void }) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const refrescar = useRefrescar();
  const [tipo, setTipo] = useState('oficio');
  const [orfeo, setOrfeo] = useState('');
  const [obs, setObs] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const guardar = async () => {
    if (!archivo) return avisar('Elija el archivo', 'error');
    const r = radicadoOrfeo(orfeo);
    if ('error' in r) return avisar(r.error, 'error');
    setOcupado(true);
    try {
      await planes.subirDocumento(archivo, {
        plan_id: planId,
        tipo,
        radicado_orfeo: r.ok,
        observaciones: obs.trim()
      });
      avisar('Documento guardado en el archivo del plan', 'ok');
      await refrescar();
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
      setOcupado(false);
    }
  };
  return (
    <Modal
      abierto
      titulo="Subir documento al archivo del plan"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={ocupado} onClick={() => void guardar()}>
            <Icono nombre="fa-upload" /> Subir
          </button>
        </>
      }
    >
      <div className="row2">
        <div className="field">
          <label htmlFor="pmDocTipo">Tipo *</label>
          <select id="pmDocTipo" value={tipo} onChange={e => setTipo(e.target.value)}>
            {Object.entries(TIPOS_DOCUMENTO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pmDocOrf">Radicado ORFEO</label>
          <input id="pmDocOrf" inputMode="numeric" value={orfeo} onChange={e => setOrfeo(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmDocFile">Archivo (PDF, Excel, Word o CSV; máx. 50 MB) *</label>
        <input
          id="pmDocFile"
          type="file"
          accept=".pdf,.xlsx,.xls,.docx,.csv"
          onChange={e => setArchivo(e.target.files?.[0] ?? null)}
        />
      </div>
      <div className="field">
        <label htmlFor="pmDocObs">Descripción</label>
        <textarea id="pmDocObs" rows={2} value={obs} onChange={e => setObs(e.target.value)} />
      </div>
    </Modal>
  );
}

export function VentanaPapelera({
  d,
  admin,
  alCerrar
}: {
  d: DatosPlanes;
  admin: boolean;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const refrescar = useRefrescar();
  const lista = useQuery({ queryKey: ['planes', 'papelera'], queryFn: () => planes.papelera() });
  const docs = (d.documentos ?? []).filter(x => x.eliminado_at);
  const hacer = async (f: () => Promise<unknown>, ok: (r: unknown) => string) => {
    try {
      const r = await f();
      avisar(ok(r), 'ok');
      await refrescar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      ancha
      titulo="Papelera"
      alCerrar={alCerrar}
      pie={
        <button type="button" className="btn" onClick={alCerrar}>
          Cerrar
        </button>
      }
    >
      <div className="hint" style={{ marginBottom: 10 }}>
        Lo eliminado se puede restaurar: un plan vuelve con sus hallazgos, acciones, avances y traslados. La
        bitácora de auditoría conserva todo.
      </div>
      <h4 style={{ margin: '6px 0' }}>Planes, hallazgos, acciones y traslados</h4>
      {lista.isError ? (
        <div className="pm-note r">{(lista.error as Error).message}</div>
      ) : lista.data?.length ? (
        <div className="tbl-wrap">
          <table className="tbl" aria-label="Elementos eliminados">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Elemento</th>
                <th>Eliminado</th>
                <th>Incluye</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.data.map(x => (
                <tr key={x.audit_id}>
                  <td>{TIPOS_PAPELERA[x.tabla] || x.tabla}</td>
                  <td className="asunto">{textoCorto(x.descripcion || '', 140)}</td>
                  <td>{formatoFechaHora(x.eliminado_at)}</td>
                  <td className="mono">{x.dependientes ? x.dependientes + ' registros' : '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn sm primary"
                      onClick={() => {
                        if (
                          window.confirm('¿Restaurar este elemento con todo lo que se eliminó junto con él?')
                        )
                          void hacer(
                            () => planes.restaurar(x.audit_id),
                            r => 'Restaurado: ' + String(r)
                          );
                      }}
                    >
                      <Icono nombre="fa-rotate-left" /> Restaurar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted" style={{ padding: '6px 0' }}>
          {lista.isLoading ? 'Cargando…' : 'Nada eliminado.'}
        </div>
      )}
      <h4 style={{ margin: '14px 0 6px' }}>Documentos del archivo</h4>
      {docs.length ? (
        <div className="tbl-wrap">
          <table className="tbl" aria-label="Documentos en la papelera">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Plan</th>
                <th>Enviado a la papelera</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map(x => {
                const p = d.planes.find(y => y.id === x.plan_id);
                return (
                  <tr key={x.id}>
                    <td className="asunto">{x.nombre}</td>
                    <td className="asunto">{p ? textoCorto(p.ejercicio, 70) : '—'}</td>
                    <td>{formatoFechaHora(x.eliminado_at ?? '')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn sm primary"
                        onClick={() =>
                          void hacer(
                            () => planes.moverDocumento(x.id, false),
                            () => 'Documento restaurado'
                          )
                        }
                      >
                        <Icono nombre="fa-rotate-left" /> Restaurar
                      </button>
                      {admin && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="btn sm danger"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `¿Eliminar definitivamente «${x.nombre}»? No se podrá recuperar desde la aplicación.`
                                )
                              )
                                void hacer(
                                  () => planes.purgarDocumento(x),
                                  () => 'Documento eliminado definitivamente'
                                );
                            }}
                          >
                            Eliminar definitivamente
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted" style={{ padding: '6px 0' }}>
          No hay documentos en la papelera.
        </div>
      )}
    </Modal>
  );
}
