// Traslados de hallazgos (2.x: pmTrasHtml, pmTrasModal, pmSaveTras y pmDelTras de src/js/19-planes-de-mejoramiento.js;
// script 18). Mismo HTML y clases (pm-tras, pm-tras-h, pm-tras-r, pm-conn, pm-chip).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { fechaColombia, formatoCorto } from '../../dominio/fechas';
import { incidencias, txt, type DatosPlanes, type Hallazgo, type Traslado } from '../../dominio/planes';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

export const ESTADO_TRASLADO: Readonly<Record<string, string>> = {
  trasladado: 'Trasladado',
  en_indagacion: 'En indagación',
  en_investigacion: 'En investigación',
  archivado: 'Archivado',
  con_decision: 'Con decisión de fondo'
};
/** Destinos según la incidencia (Res. 24.043, art. 2); se puede escribir cualquier otro. */
export const DESTINOS_TRASLADO = [
  'Personería Distrital de Santiago de Cali',
  'Departamento Administrativo de Control Disciplinario Interno',
  'Procuraduría General de la Nación',
  'Fiscalía General de la Nación',
  'Contraloría General de Santiago de Cali (responsabilidad fiscal)',
  'Contraloría General de la República (responsabilidad fiscal)',
  'Dirección de Impuestos y Aduanas Nacionales (DIAN)',
  'Ministerio de Salud y Protección Social',
  'Superintendencia Nacional de Salud',
  'Superintendencia de Industria y Comercio',
  'Superintendencia de Servicios Públicos Domiciliarios',
  'Administradora de los Recursos del Sistema General de Seguridad Social en Salud (ADRES)'
];

export function TrasladosHallazgo({
  h,
  d,
  edita,
  abrir
}: {
  h: Hallazgo;
  d: DatosPlanes;
  edita: boolean;
  abrir: (t: Traslado | null) => void;
}) {
  const inc = incidencias(h);
  const lista = (d.traslados ?? []).filter(t => t.hallazgo_id === h.id);
  if (!inc.length && !lista.length) return null;
  if (d.traslados === null)
    return (
      <div className="pm-tras">
        <span className="muted">
          Traslados: disponible al ejecutar el script{' '}
          <span className="mono">18_planes_pdf_y_traslados.sql</span>.
        </span>
      </div>
    );
  const falta = inc.filter(c => !lista.some(t => t.tipo === c));
  return (
    <div className="pm-tras">
      <div className="pm-tras-h">
        <b>Traslados</b>
        {falta.length ? (
          <span className="pm-chip y">Sin registrar: {falta.join(', ')}</span>
        ) : (
          <span className="pm-chip g">Registrados</span>
        )}
        {edita && (
          <button type="button" className="btn sm" onClick={() => abrir(null)}>
            <Icono nombre="fa-share-from-square" /> Registrar traslado
          </button>
        )}
      </div>
      {lista.map(t => (
        <div className="pm-tras-r" key={t.id}>
          <span className={'pm-conn c-' + t.tipo}>{t.tipo}</span>
          <span>
            {t.destino}
            {t.radicado && (
              <>
                {' '}
                · <span className="mono">{t.radicado}</span>
              </>
            )}
            {t.fecha ? ' · ' + formatoCorto(t.fecha) : ''}
          </span>
          <span className="pm-chip">{ESTADO_TRASLADO[t.estado ?? ''] || t.estado}</span>
          {edita && (
            <button
              type="button"
              className="icon-btn"
              title="Editar traslado"
              aria-label="Editar traslado"
              onClick={() => abrir(t)}
            >
              <Icono nombre="fa-pen" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function VentanaTraslado({
  t,
  h,
  alCerrar
}: {
  t: Traslado | null;
  h: Hallazgo;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const cliente = useQueryClient();
  const inc = incidencias(h);
  const tipos = inc.length ? inc : ['disciplinaria', 'fiscal', 'penal', 'sancionatoria', 'otra'];
  const [f, setF] = useState({
    tipo: t?.tipo ?? tipos[0] ?? 'disciplinaria',
    estado: t?.estado ?? 'trasladado',
    destino: t?.destino ?? '',
    radicado: t?.radicado ?? '',
    fecha: t?.fecha ?? fechaColombia(new Date()),
    observaciones: t?.observaciones ?? ''
  });
  const cambiar = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });
  const refrescar = () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: ['planes'] }),
      cliente.invalidateQueries({ queryKey: ['auditoria'] })
    ]);
  const guardar = async () => {
    const o = {
      plan_id: h.plan_id,
      hallazgo_id: h.id,
      tipo: f.tipo,
      estado: f.estado,
      destino: txt(f.destino),
      radicado: txt(f.radicado),
      fecha: f.fecha || null,
      observaciones: txt(f.observaciones)
    };
    if (o.destino.length < 3) return avisar('Indique a quién se trasladó', 'error');
    try {
      await planes.guardar('tras', o, t?.id ?? null);
      avisar('Traslado guardado', 'ok');
      await refrescar();
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  const eliminar = async () => {
    if (!t?.id || !window.confirm('¿Eliminar este traslado?')) return;
    try {
      await planes.eliminar('tras', t.id);
      avisar('Traslado eliminado', 'ok');
      await refrescar();
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      titulo={(t ? 'Editar traslado' : 'Registrar traslado') + ' · hallazgo ' + h.numero}
      alCerrar={alCerrar}
      pie={
        <>
          {t && (
            <button
              type="button"
              className="btn"
              style={{ marginRight: 'auto' }}
              onClick={() => void eliminar()}
            >
              <Icono nombre="fa-trash" /> Eliminar
            </button>
          )}
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => void guardar()}>
            <Icono nombre="fa-floppy-disk" /> Guardar
          </button>
        </>
      }
    >
      <div className="row2">
        <div className="field">
          <label htmlFor="pmTTipo">Incidencia *</label>
          <select id="pmTTipo" value={f.tipo} onChange={cambiar('tipo')}>
            {tipos.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pmTEst">Estado *</label>
          <select id="pmTEst" value={f.estado} onChange={cambiar('estado')}>
            {Object.entries(ESTADO_TRASLADO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmTDes">Trasladado a *</label>
        <input id="pmTDes" list="pmTDests" value={f.destino} onChange={cambiar('destino')} />
        <datalist id="pmTDests">
          {DESTINOS_TRASLADO.map(x => (
            <option key={x}>{x}</option>
          ))}
        </datalist>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="pmTRad">Radicado del traslado</label>
          <input id="pmTRad" inputMode="numeric" value={f.radicado} onChange={cambiar('radicado')} />
        </div>
        <div className="field">
          <label htmlFor="pmTFec">Fecha</label>
          <input id="pmTFec" type="date" value={f.fecha ?? ''} onChange={cambiar('fecha')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmTObs">Observaciones</label>
        <textarea id="pmTObs" rows={2} value={f.observaciones} onChange={cambiar('observaciones')} />
        <div className="hint">Por ejemplo, el número del proceso abierto o la decisión tomada</div>
      </div>
    </Modal>
  );
}
