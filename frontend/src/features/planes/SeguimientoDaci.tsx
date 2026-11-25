// Seguimiento del DACI a las metas cumplidas (script 31). Va en la ficha del plan, debajo de «Cumplimiento de
// metas vencidas» y antes de la calificación CGSC. Control Interno y el Super administrador verifican; los demás lo ven.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { textoCorto } from '../../dominio/actividad';
import { formatoCorto } from '../../dominio/historico';
import type { Accion } from '../../dominio/planes';
import {
  cambiosDaci,
  errorDaci,
  estadoDaci,
  metasCumplidas,
  resumenDaci,
  TEXTO_DACI
} from '../../dominio/seguimiento-daci';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const pct = (x: number | null) => (x == null ? '—' : Math.round(x * 1000) / 10 + ' %');

export function SeguimientoDaci({
  acciones,
  hoy,
  verifica,
  correo
}: {
  acciones: Accion[];
  hoy: string;
  /** Control Interno o Super administrador. */
  verifica: boolean;
  correo: string;
}) {
  const [ventana, setVentana] = useState<Accion | null>(null);
  const cumplidas = metasCumplidas(acciones, hoy);
  const r = resumenDaci(cumplidas);
  return (
    <div className="pm-cgsc pm-daci" aria-label="Seguimiento del DACI a las metas cumplidas">
      <div className="pm-cgsc-h">
        <b>Seguimiento del DACI a las metas cumplidas</b>
        <span className="muted">
          Departamento Administrativo de Control Interno · verificación de cada meta cumplida
        </span>
      </div>
      <div className="pm-cgsc-g">
        <div>
          <small>Metas cumplidas</small>
          <b className="mono">{r.cumplidas}</b>
          <span className="muted">con avance validado al 100 %</span>
        </div>
        <div>
          <small>Verificadas por el DACI</small>
          <b className="mono">{r.verificadas}</b>
          <span className="muted">{pct(r.pct)} de las cumplidas</span>
        </div>
        <div>
          <small>No verificadas</small>
          <b className="mono">{r.noVerificadas}</b>
          <span className="muted">con observación</span>
        </div>
        <div>
          <small>Pendientes de verificar</small>
          <b className="mono">{r.pendientes}</b>
          <span className="muted">sin revisar todavía</span>
        </div>
      </div>
      {cumplidas.length === 0 ? (
        <div className="hint">Todavía no hay metas cumplidas para verificar en este plan.</div>
      ) : (
        <div className="pm-daci-l">
          {cumplidas.map(a => {
            const e = estadoDaci(a);
            return (
              <div key={a.id} className="pm-daci-f">
                <span className="pm-daci-t" title={a.accion}>
                  {textoCorto(a.accion, 110)}
                </span>
                <span className={'pill ' + TEXTO_DACI[e].pill}>{TEXTO_DACI[e].txt}</span>
                {a.daci_fecha && <span className="muted">{formatoCorto(a.daci_fecha)}</span>}
                {a.daci_observacion && (
                  <span className="muted" title={a.daci_observacion}>
                    · {textoCorto(a.daci_observacion, 60)}
                  </span>
                )}
                {verifica && (
                  <button
                    type="button"
                    className="btn sm"
                    aria-label={'Verificar meta: ' + textoCorto(a.accion, 60)}
                    onClick={() => setVentana(a)}
                  >
                    <Icono nombre="fa-clipboard-check" /> {e === 'pendiente' ? 'Verificar' : 'Cambiar'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {ventana && <VentanaDaci a={ventana} hoy={hoy} correo={correo} alCerrar={() => setVentana(null)} />}
    </div>
  );
}

function VentanaDaci({
  a,
  hoy,
  correo,
  alCerrar
}: {
  a: Accion;
  hoy: string;
  correo: string;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [estado, setEstado] = useState<string>(a.daci_verificacion ?? 'verificada');
  const [fecha, setFecha] = useState(a.daci_fecha ?? hoy);
  const [obs, setObs] = useState(a.daci_observacion ?? '');
  const [ocupado, setOcupado] = useState(false);
  const guardar = async (quitar?: boolean) => {
    const malo = quitar ? null : errorDaci(estado, fecha, obs);
    if (malo) return avisar(malo, 'error');
    setOcupado(true);
    try {
      await planes.guardar(
        'acc',
        cambiosDaci(quitar ? null : (estado as 'verificada' | 'no_verificada'), fecha, obs, correo),
        a.id
      );
      avisar(quitar ? 'Verificación quitada' : 'Verificación del DACI registrada', 'ok');
      await Promise.all([['planes'], ['auditoria']].map(k => cliente.invalidateQueries({ queryKey: k })));
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
      setOcupado(false);
    }
  };
  return (
    <Modal
      abierto
      titulo="Verificación del DACI · meta cumplida"
      alCerrar={alCerrar}
      pie={
        <>
          {a.daci_verificacion && (
            <button type="button" className="btn" disabled={ocupado} onClick={() => void guardar(true)}>
              Dejar pendiente
            </button>
          )}
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={ocupado} onClick={() => void guardar()}>
            <Icono nombre="fa-floppy-disk" /> Guardar
          </button>
        </>
      }
    >
      <div className="muted" style={{ marginBottom: 10 }}>
        {textoCorto(a.accion, 180)}
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="pmDaciE">Resultado de la verificación</label>
          <select id="pmDaciE" value={estado} onChange={e => setEstado(e.target.value)}>
            <option value="verificada">Verificada: la meta se cumplió y está soportada</option>
            <option value="no_verificada">No verificada: falta soporte o no se cumplió</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pmDaciF">Fecha de la verificación</label>
          <input
            id="pmDaciF"
            type="date"
            value={fecha}
            max="2100-12-31"
            onChange={e => setFecha(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmDaciO">
          {estado === 'no_verificada' ? 'Observación (obligatoria)' : 'Observación (opcional)'}
        </label>
        <textarea id="pmDaciO" rows={3} value={obs} onChange={e => setObs(e.target.value)} />
      </div>
      <div className="hint">Queda registrado quién hizo la verificación y cuándo, en la auditoría.</div>
    </Modal>
  );
}
