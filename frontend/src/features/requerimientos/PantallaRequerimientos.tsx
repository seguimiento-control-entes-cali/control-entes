// Requerimientos (2.x: vReqs, renderReqRows, detailModal, newReqModal y saveReq de src/js/07-vistas-operacion.js, y
// las acciones detail, closeFor y openPdf de 18-acciones.js). Mismo HTML y clases (toolbar, tbl, pill, kv).
// "Cerrar" y "Registrar respuesta" llevan a Cargar respuesta ORFEO con el caso ya elegido.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Perfil } from '../../datos/contratos';
import { formatoFechaHora } from '../../dominio/auditoria';
import { sumarHabiles } from '../../dominio/dias-habiles';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto } from '../../dominio/historico';
import {
  filtrarRequerimientos,
  textoDias,
  validarNuevo,
  type FiltroRequerimientos,
  type RequerimientoVivo
} from '../../dominio/requerimientos';
import { Aviso, Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import { PildoraSemaforo, PUEDE_CERRAR, PUEDE_REGISTRAR, useRequerimientosVivos } from './comun';

const activos = <T extends { activo?: boolean }>(l: readonly T[]) => l.filter(x => x.activo !== false);

function Detalle({
  r,
  cierra,
  demo,
  alCerrar,
  registrar
}: {
  r: RequerimientoVivo;
  cierra: boolean;
  demo: boolean;
  alCerrar: () => void;
  registrar: () => void;
}) {
  const { requerimientos } = useDatos();
  const avisar = useAvisos();
  const verSoporte = async () => {
    try {
      window.open(await requerimientos.urlSoporte(r.soporte_path ?? ''), '_blank', 'noopener');
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      titulo={r.radicado}
      alCerrar={alCerrar}
      pie={
        <>
          {r.soporte_path && !demo && (
            <button type="button" className="btn" onClick={() => void verSoporte()}>
              <Icono nombre="fa-file-pdf" /> Ver soporte
            </button>
          )}
          {r.estado === 'abierto' && cierra && (
            <button type="button" className="btn primary" onClick={registrar}>
              <Icono nombre="fa-check" /> Registrar respuesta
            </button>
          )}
          <button type="button" className="btn" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 10 }}>
        <PildoraSemaforo sem={r.sem} />
      </div>
      <dl className="kv">
        <div>
          <dt>Ente de control</dt>
          <dd>{r.ente_n}</dd>
        </div>
        <div>
          <dt>Dependencia</dt>
          <dd>{r.dep_n}</dd>
        </div>
        <div>
          <dt>Asunto</dt>
          <dd>{r.asunto}</dd>
        </div>
        <div>
          <dt>Radicación</dt>
          <dd>{formatoCorto(r.fecha_radicacion)}</dd>
        </div>
        <div>
          <dt>Fecha límite</dt>
          <dd>
            {formatoCorto(r.fecha_limite)}
            {r.estado === 'abierto' ? ' · ' + textoDias(r.dias) : ''}
          </dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{r.estado === 'cerrado' ? 'Cerrado' : 'Abierto'}</dd>
        </div>
        {r.orfeo_salida && (
          <>
            <div>
              <dt>ORFEO de salida</dt>
              <dd className="mono">{r.orfeo_salida}</dd>
            </div>
            <div>
              <dt>Fecha de envío</dt>
              <dd>{formatoCorto(r.fecha_cierre)}</dd>
            </div>
          </>
        )}
        {r.soporte_hash && (
          <div>
            <dt>SHA-256 del soporte</dt>
            <dd className="mono" style={{ fontSize: '.72rem' }}>
              {r.soporte_hash.slice(0, 32)}…
            </dd>
          </div>
        )}
        {r.escalado_at && (
          <div>
            <dt>Escalado</dt>
            <dd>{formatoFechaHora(r.escalado_at)}</dd>
          </div>
        )}
      </dl>
    </Modal>
  );
}

function Nuevo({
  perfil,
  vigencia,
  existentes,
  entes,
  deps,
  alCerrar
}: {
  perfil: Perfil;
  vigencia: number;
  existentes: readonly RequerimientoVivo[];
  entes: readonly { id: number; nombre: string; activo?: boolean }[];
  deps: readonly { id: number; nombre: string; activo?: boolean }[];
  alCerrar: () => void;
}) {
  const { requerimientos } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const hoy = fechaColombia(new Date());
  const entesA = activos(entes),
    depsA = activos(deps);
  const [rad, setRad] = useState('');
  const [ente, setEnte] = useState(String(entesA[0]?.id ?? ''));
  const [dep, setDep] = useState(String(perfil.dependenciaId ?? depsA[0]?.id ?? ''));
  const [asunto, setAsunto] = useState('');
  const [fr, setFr] = useState(hoy);
  const [termino, setTermino] = useState('10');
  const [fl, setFl] = useState(() => sumarHabiles(hoy, 10));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // La fecha límite se recalcula con el término en días hábiles, salvo que se haya escrito a mano
  const recalcular = (f: string, t: string) => {
    const n = parseInt(t, 10);
    if (f && n > 0) setFl(sumarHabiles(f, n));
  };
  const guardar = async () => {
    const radicado = rad.trim().toUpperCase();
    const e = validarNuevo({ radicado, asunto, fechaRadicacion: fr, fechaLimite: fl }, vigencia, existentes);
    if (e) return setError(e);
    setGuardando(true);
    try {
      await requerimientos.crear({
        radicado,
        vigencia: +fr.slice(0, 4),
        ente_id: +ente,
        dependencia_id: +dep,
        asunto: asunto.trim(),
        fecha_radicacion: fr,
        fecha_limite: fl
      });
      void cliente.invalidateQueries({ queryKey: ['requerimientos'] });
      avisar('Requerimiento ' + radicado + ' registrado', 'ok');
      alCerrar();
    } catch (er) {
      setError((er as Error).message);
      setGuardando(false);
    }
  };
  return (
    <Modal
      abierto
      titulo="Nuevo requerimiento"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={guardando} onClick={() => void guardar()}>
            <Icono nombre="fa-floppy-disk" /> Guardar
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="nrRad">Radicado de entrada</label>
        <input
          id="nrRad"
          className="mono"
          placeholder={vigencia + 'EE004812'}
          maxLength={16}
          style={{ textTransform: 'uppercase' }}
          value={rad}
          onChange={e => setRad(e.target.value)}
        />
        <div className="hint">Formato: año + 2 letras + consecutivo (ej. {vigencia}EE004812)</div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="nrEnte">Ente de control</label>
          <select id="nrEnte" value={ente} onChange={e => setEnte(e.target.value)}>
            {entesA.map(x => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nrDep">Dependencia responsable</label>
          <select id="nrDep" value={dep} onChange={e => setDep(e.target.value)}>
            {depsA.map(x => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="nrAsu">Asunto</label>
        <textarea
          id="nrAsu"
          placeholder="Describe el requerimiento…"
          value={asunto}
          onChange={e => setAsunto(e.target.value)}
        />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="nrFr">Fecha de radicación</label>
          <input
            id="nrFr"
            type="date"
            max={hoy}
            value={fr}
            onChange={e => {
              setFr(e.target.value);
              recalcular(e.target.value, termino);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="nrTe">Término para responder (días hábiles)</label>
          <input
            id="nrTe"
            type="number"
            min={1}
            max={90}
            inputMode="numeric"
            value={termino}
            onChange={e => {
              setTermino(e.target.value);
              recalcular(fr, e.target.value);
            }}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="nrFl">Fecha límite de respuesta</label>
        <input id="nrFl" type="date" value={fl} onChange={e => setFl(e.target.value)} />
        <div className="hint">
          Calculada sin sábados, domingos ni festivos de Colombia. Puede ajustarla si el oficio indica otra
          fecha.
        </div>
      </div>
      {error && (
        <div className="err" role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}

const INICIAL: FiltroRequerimientos = { q: '', sem: '', ente: '', dep: '' };

export function PantallaRequerimientos({ perfil, demo = false }: { perfil: Perfil; demo?: boolean }) {
  const { vigencia, vivos, entes, deps, cargando, error } = useRequerimientosVivos();
  const ir = useNavigate();
  const [f, setF] = useState<FiltroRequerimientos>(INICIAL);
  const [detalle, setDetalle] = useState<RequerimientoVivo | null>(null);
  const [nuevo, setNuevo] = useState(false);
  if (cargando) return <p className="cargando">Cargando los requerimientos…</p>;
  if (error) return <Aviso>No se pudieron cargar los requerimientos: {error.message}</Aviso>;
  const lista = filtrarRequerimientos(vivos, f);
  const cierra = PUEDE_CERRAR.includes(perfil.rol);
  const cerrar = (r: RequerimientoVivo) => ir('/carga', { state: { id: r.id } });
  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <Icono nombre="fa-magnifying-glass" />
          <input
            id="fq"
            aria-label="Buscar"
            placeholder="Buscar radicado, asunto, ente o dependencia…"
            value={f.q}
            onChange={e => setF({ ...f, q: e.target.value })}
          />
        </div>
        <select
          id="fsem"
          aria-label="Estado"
          value={f.sem}
          onChange={e => setF({ ...f, sem: e.target.value as FiltroRequerimientos['sem'] })}
        >
          <option value="">Todos los estados</option>
          <option value="rojo">Crítico</option>
          <option value="amarillo">En término</option>
          <option value="verde">Cerrado</option>
        </select>
        <select
          id="fente"
          aria-label="Ente"
          value={f.ente}
          onChange={e => setF({ ...f, ente: e.target.value })}
        >
          <option value="">Todos los entes</option>
          {entes.map(x => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
        <select
          id="fdep"
          aria-label="Dependencia"
          value={f.dep}
          onChange={e => setF({ ...f, dep: e.target.value })}
        >
          <option value="">Todas las dependencias</option>
          {deps.map(x => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
        </select>
        {PUEDE_REGISTRAR.includes(perfil.rol) && (
          <button type="button" className="btn primary" onClick={() => setNuevo(true)}>
            <Icono nombre="fa-plus" /> Nuevo
          </button>
        )}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <caption className="solo-lector">Requerimientos de la vigencia</caption>
          <thead>
            <tr>
              <th>Estado</th>
              <th>Radicado</th>
              <th>Ente</th>
              <th>Dependencia</th>
              <th>Asunto</th>
              <th>Límite</th>
              <th className="req-acc" />
            </tr>
          </thead>
          <tbody id="reqBody">
            {lista.length ? (
              lista.map(r => (
                <tr key={r.id} className="click" onClick={() => setDetalle(r)}>
                  <td>
                    <PildoraSemaforo sem={r.sem} />
                  </td>
                  <td className="mono">{r.radicado}</td>
                  <td>{r.ente_s || r.ente_n}</td>
                  <td>{r.dep_n}</td>
                  <td className="asunto">{r.asunto}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {formatoCorto(r.fecha_limite)}
                    <div className="muted" style={{ fontSize: '.72rem' }}>
                      {r.estado === 'abierto' ? textoDias(r.dias) : 'Cerrado ' + formatoCorto(r.fecha_cierre)}
                    </div>
                  </td>
                  <td className="right req-acc">
                    {r.estado === 'abierto' && cierra && (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={e => {
                          e.stopPropagation();
                          cerrar(r);
                        }}
                      >
                        <Icono nombre="fa-check" /> Cerrar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>
                  <div className="empty">
                    <Icono nombre="fa-inbox" />
                    Sin resultados
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: '.78rem' }} id="reqCount">
        {lista.length} de {vivos.length} requerimientos · vigencia {vigencia}
      </div>
      {detalle && (
        <Detalle
          r={detalle}
          cierra={cierra}
          demo={demo}
          alCerrar={() => setDetalle(null)}
          registrar={() => cerrar(detalle)}
        />
      )}
      {nuevo && (
        <Nuevo
          perfil={perfil}
          vigencia={vigencia}
          existentes={vivos}
          entes={entes}
          deps={deps}
          alCerrar={() => setNuevo(false)}
        />
      )}
    </>
  );
}
