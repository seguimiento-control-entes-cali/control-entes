// Evaluación OFICIAL de la Contraloría (script 28): quien determina si el plan cumple es la Contraloría cuando le
// hace seguimiento (lo explicó Control Interno). Control Interno (o el Super administrador) registra su resultado:
// el puntaje del plan, la fecha y, por hallazgo, si la acción fue efectiva, parcialmente efectiva o no efectiva, con
// la observación de la Contraloría (como su hoja «BD PM EVALUADOS»). Solo con el script 28 (d.v28).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { EVALUACIONES_CGSC } from '../../dominio/formulacion';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto } from '../../dominio/historico';
import type { Hallazgo, Plan } from '../../dominio/planes';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const TONO: Record<string, string> = {
  efectiva: 'verde',
  parcialmente_efectiva: 'amarillo',
  no_efectiva: 'rojo'
};
const texto = (k: string | undefined) => EVALUACIONES_CGSC.find(([v]) => v === k)?.[1] ?? '';

/** Etiqueta del hallazgo con la calificación de la Contraloría (si ya la registró Control Interno). */
export function EtiquetaEvaluacion({ h }: { h: Hallazgo }) {
  if (!h.eval_cgsc) return null;
  return (
    <span
      className={'pill ' + (TONO[h.eval_cgsc] ?? 'neutral')}
      title={(h.eval_cgsc_obs ? 'Observación de la Contraloría: ' + h.eval_cgsc_obs : '') || undefined}
    >
      Contraloría: {texto(h.eval_cgsc)}
    </span>
  );
}

/** Resumen en el plan y botón para registrar (Control Interno o el Super administrador). */
export function EvaluacionContraloria({
  p,
  hallazgos,
  registra
}: {
  p: Plan;
  hallazgos: readonly Hallazgo[];
  registra: boolean;
}) {
  const [abierta, setAbierta] = useState(false);
  const cuenta = (k: string) => hallazgos.filter(h => h.eval_cgsc === k).length;
  const hay = p.puntaje_cgsc != null || hallazgos.some(h => h.eval_cgsc);
  if (!hay && !registra) return null;
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, flex: 1 }}>Evaluación de la Contraloría</h3>
        {registra && (
          <button type="button" className="btn sm" onClick={() => setAbierta(true)}>
            <Icono nombre="fa-scale-balanced" /> {hay ? 'Editar evaluación' : 'Registrar evaluación'}
          </button>
        )}
      </div>
      {hay ? (
        <div style={{ marginTop: 6 }}>
          {p.puntaje_cgsc != null && (
            <>
              <b className="mono">{Number(p.puntaje_cgsc).toLocaleString('es-CO')} puntos</b>{' '}
              <span className={'pill ' + (Number(p.puntaje_cgsc) >= 80 ? 'verde' : 'rojo')}>
                {Number(p.puntaje_cgsc) >= 80 ? 'Cumple' : 'No cumple'}
              </span>
              {p.eval_cgsc_fecha && (
                <span className="muted"> · evaluado el {formatoCorto(p.eval_cgsc_fecha)}</span>
              )}
            </>
          )}
          <div className="muted" style={{ fontSize: '.82rem', marginTop: 4 }}>
            {cuenta('efectiva')} efectivas · {cuenta('parcialmente_efectiva')} parcialmente efectivas ·{' '}
            {cuenta('no_efectiva')} no efectivas · {hallazgos.filter(h => !h.eval_cgsc).length} sin calificar
          </div>
        </div>
      ) : (
        <div className="hint" style={{ marginTop: 6 }}>
          Cuando la Contraloría haga el seguimiento a este plan, registre aquí su resultado oficial (puntaje y
          calificación de cada hallazgo). Cumple desde 80 puntos.
        </div>
      )}
      {abierta && <VentanaEvaluacion p={p} hallazgos={hallazgos} alCerrar={() => setAbierta(false)} />}
    </div>
  );
}

function VentanaEvaluacion({
  p,
  hallazgos,
  alCerrar
}: {
  p: Plan;
  hallazgos: readonly Hallazgo[];
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const hoy = fechaColombia(new Date());
  const [puntaje, setPuntaje] = useState(p.puntaje_cgsc == null ? '' : String(p.puntaje_cgsc));
  const [fecha, setFecha] = useState(p.eval_cgsc_fecha || hoy);
  const [cal, setCal] = useState<Record<string, { eval_cgsc: string; eval_cgsc_obs: string }>>(() =>
    Object.fromEntries(
      hallazgos.map(h => [h.id, { eval_cgsc: h.eval_cgsc || '', eval_cgsc_obs: h.eval_cgsc_obs || '' }])
    )
  );
  const [ocupado, setOcupado] = useState(false);
  const n = puntaje.trim() === '' ? null : Number(puntaje.replace(',', '.'));
  const error =
    n != null && (isNaN(n) || n < 0 || n > 100)
      ? 'El puntaje va de 0 a 100'
      : !fecha || fecha > hoy
        ? 'La fecha de la evaluación no puede ser futura'
        : '';

  const guardar = async () => {
    if (error) return avisar(error, 'error');
    setOcupado(true);
    try {
      await planes.guardar('plan', { puntaje_cgsc: n, eval_cgsc_fecha: fecha }, p.id);
      for (const h of hallazgos) {
        const c = cal[h.id];
        if (!c) continue;
        if (c.eval_cgsc === (h.eval_cgsc || '') && c.eval_cgsc_obs.trim() === (h.eval_cgsc_obs || ''))
          continue;
        await planes.guardar(
          'hall',
          {
            eval_cgsc: c.eval_cgsc,
            eval_cgsc_obs: c.eval_cgsc_obs.trim(),
            eval_cgsc_fecha: c.eval_cgsc ? fecha : null
          },
          h.id
        );
      }
      await cliente.invalidateQueries({ queryKey: ['planes'] });
      avisar('Evaluación de la Contraloría registrada', 'ok');
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      abierto
      ancha
      titulo="Evaluación de la Contraloría"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={ocupado || !!error}
            onClick={() => void guardar()}
          >
            <Icono nombre="fa-floppy-disk" /> Guardar
          </button>
        </>
      }
    >
      <div className="hint" style={{ marginBottom: 10 }}>
        Resultado oficial del seguimiento que hizo la Contraloría a este plan. Quien determina si cumple es la
        Contraloría; aquí se registra para el seguimiento de Control Interno.
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="evPuntaje">Puntaje atribuido al plan (0 a 100)</label>
          <input
            id="evPuntaje"
            inputMode="decimal"
            value={puntaje}
            onChange={e => setPuntaje(e.target.value)}
            placeholder="Por ejemplo 81,28"
          />
        </div>
        <div className="field">
          <label htmlFor="evFecha">Fecha de la evaluación</label>
          <input id="evFecha" type="date" max={hoy} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>
      {error && <div className="hint err">{error}</div>}
      <div className="tbl-wrap" style={{ marginTop: 8 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Hallazgo</th>
              <th>Calificación</th>
              <th>Observación de la Contraloría</th>
            </tr>
          </thead>
          <tbody>
            {hallazgos.map(h => (
              <tr key={h.id}>
                <td className="mono">{h.numero}</td>
                <td>
                  <select
                    aria-label={'Calificación del hallazgo ' + h.numero}
                    value={cal[h.id]?.eval_cgsc ?? ''}
                    onChange={e =>
                      setCal(x => ({
                        ...x,
                        [h.id]: { eval_cgsc: e.target.value, eval_cgsc_obs: x[h.id]?.eval_cgsc_obs ?? '' }
                      }))
                    }
                  >
                    <option value="">— Sin calificar —</option>
                    {EVALUACIONES_CGSC.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    aria-label={'Observación del hallazgo ' + h.numero}
                    value={cal[h.id]?.eval_cgsc_obs ?? ''}
                    onChange={e =>
                      setCal(x => ({
                        ...x,
                        [h.id]: { eval_cgsc: x[h.id]?.eval_cgsc ?? '', eval_cgsc_obs: e.target.value }
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
