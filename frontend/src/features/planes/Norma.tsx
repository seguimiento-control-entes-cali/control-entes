// Norma de la CGSC en los planes (2.x: pmNormaHtml, pmInformesHomeHtml, pmInfModal/pmInfGuardar, pmProrModal/
// pmProrGuardar, pmProrResolverModal/pmProrResolver, pmProrLinea y pmNuevoPlanModal/pmNuevoPlanCrear de
// src/js/19-planes-norma-y-memoria.js). Mismo HTML y clases (pm-norma, pm-norma-r, pm-inf, pm-req-list, pm-note).
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { textoCorto } from '../../dominio/actividad';
import { diasEntre, formatoCorto } from '../../dominio/fechas';
import {
  RESOLUCIONES,
  calificacionAccion,
  fechaPlan,
  resolucion,
  type Accion,
  type DatosPlanes,
  type Plan,
  type Prorroga
} from '../../dominio/planes';
import { radicadoOrfeo } from '../../dominio/planes-memoria';
import {
  ESTADO_INFORME,
  TITULO_PRORROGA,
  accionesBajo100,
  cargaNuevoPlan,
  duracionAccion,
  informes,
  informesPendientes,
  lineaProrroga,
  nuevaFinAccion,
  presentacion,
  requisitosProrroga,
  type ContextoProrroga,
  type TipoProrroga
} from '../../dominio/planes-norma';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import { useOficios } from './Oficio';

export type VentanaNorma =
  | { t: 'pror'; tipo: TipoProrroga; ctx: ContextoProrroga }
  | { t: 'resolver'; pr: Prorroga }
  | { t: 'inf'; p: Plan }
  | { t: 'nuevo'; p: Plan; fev: string };

function useRefrescar() {
  const cliente = useQueryClient();
  return () =>
    Promise.all([
      cliente.invalidateQueries({ queryKey: ['planes'] }),
      cliente.invalidateQueries({ queryKey: ['auditoria'] })
    ]);
}

/** pmNormaHtml: tarjeta de plazos de la norma en el encabezado del plan. */
export function TarjetaNorma({
  p,
  d,
  edita,
  hoy,
  abrir
}: {
  p: Plan;
  d: DatosPlanes;
  edita: boolean;
  hoy: string;
  abrir: (v: VentanaNorma) => void;
}) {
  const oficios = useOficios();
  const ri = RESOLUCIONES[resolucion(p)];
  if (!ri || !d.v20) return null;
  const pror = d.prorrogas ?? [];
  const oficio = p.requerimiento_id
    ? (oficios.find(x => String(x.id) === String(p.requerimiento_id)) ?? null)
    : null;
  const pres = presentacion(p, pror, oficio);
  const filas: React.ReactNode[] = [];
  if (pres && pres.base) {
    const dd = diasEntre(hoy, pres.limite);
    filas.push(
      <div className="pm-norma-r" key="pres">
        <span>
          <small>Presentación del plan</small>
          Radicación del informe {formatoCorto(pres.base)} · límite <b>{formatoCorto(pres.limite)}</b> (15
          días hábiles, art. 7)
          {pres.prorroga &&
            (pres.prorroga.estado === 'concedida'
              ? ` · prórroga concedida (art. 15; sin ella: ${formatoCorto(pres.limiteNorma)})`
              : ' · prórroga solicitada, pendiente de respuesta')}
          {pres.reqLimite && (
            <span className="pm-chip y">
              El oficio tiene registrada otra fecha límite: {formatoCorto(pres.reqLimite)}
            </span>
          )}
        </span>
        {pres.presentado ? (
          pres.tarde ? (
            <span className="pill amarillo">Suscrito fuera de término</span>
          ) : (
            <span className="pill verde">Presentado</span>
          )
        ) : (
          <span className={'pill ' + (dd < 0 ? 'rojo' : dd <= 5 ? 'amarillo' : 'neutral')}>
            {dd < 0 ? `Vencido hace ${-dd} d` : dd === 0 ? 'Vence hoy' : `Faltan ${dd} d`}
          </span>
        )}
        {!pres.presentado && edita && !pres.prorroga && (
          <button
            type="button"
            className="btn sm"
            onClick={() => abrir({ t: 'pror', tipo: 'presentacion', ctx: { p, venc: pres.limiteNorma } })}
          >
            Prórroga
          </button>
        )}
        {pres.prorroga && pres.prorroga.estado === 'solicitada' && edita && (
          <button
            type="button"
            className="btn sm"
            onClick={() => abrir({ t: 'resolver', pr: pres.prorroga as Prorroga })}
          >
            Resolver prórroga
          </button>
        )}
      </div>
    );
  } else if (pres && !pres.base)
    filas.push(
      <div className="pm-norma-r" key="pres">
        <span>
          <small>Presentación del plan</small>Registre la fecha de radicación del informe final (Editar plan)
          para controlar los 15 días hábiles del art. 7.
        </span>
      </div>
    );
  const infs = informes(p, pror, d.informes ?? [], hoy).slice(-3);
  if (infs.length)
    filas.push(
      <div className="pm-norma-r" key="inf">
        <span>
          <small>Informes semestrales de avance (art. 11)</small>
          {infs.map(i => {
            const [c, t] = ESTADO_INFORME[i.estado];
            return (
              <span className="pm-inf" key={i.corte}>
                <span className={'pill ' + c}>{t}</span> Corte {formatoCorto(i.corte)} · vence{' '}
                {formatoCorto(i.vence)}
                {i.inf && (
                  <>
                    {' '}
                    · enviado {formatoCorto(i.inf.fecha_envio)}
                    {i.inf.radicado_orfeo && (
                      <>
                        {' '}
                        · <span className="mono">{i.inf.radicado_orfeo}</span>
                      </>
                    )}
                  </>
                )}
                {i.prorroga && ` · prórroga ${i.prorroga.estado}`}
              </span>
            );
          })}
        </span>
        {edita && (
          <button type="button" className="btn sm" onClick={() => abrir({ t: 'inf', p })}>
            Registrar informe
          </button>
        )}
      </div>
    );
  return (
    <div className="pm-norma">
      <div className="pm-norma-h">
        <b>{ri.nombre}</b>
        {!p.resolucion && <span className="muted">aplicada según la fecha de suscripción</span>}
      </div>
      {filas}
    </div>
  );
}

/** Aviso de acciones con calificación inferior a 100 (art. 12, par. 5). */
export function AvisoBajo100({
  p,
  d,
  edita,
  fev,
  abrir
}: {
  p: Plan;
  d: DatosPlanes;
  edita: boolean;
  fev: string;
  abrir: (v: VentanaNorma) => void;
}) {
  if (!d.v20 || !edita || !resolucion(p)) return null;
  const n = accionesBajo100(p, d.acciones, d.avances, fev).length;
  if (!n) return null;
  return (
    <div className="pm-note y" style={{ marginTop: 8 }}>
      <Icono nombre="fa-copy" /> {n} acción(es) calificadas con menos de 100 puntos: requieren un nuevo plan
      (art. 12, par. 5).{' '}
      <button type="button" className="btn sm" onClick={() => abrir({ t: 'nuevo', p, fev })}>
        Crear nuevo plan
      </button>
    </div>
  );
}

/** pmInformesHomeHtml: informes semestrales por presentar o vencidos (pantalla principal de planes). */
export function TarjetaInformes({
  d,
  hoy,
  abrirPlan
}: {
  d: DatosPlanes;
  hoy: string;
  abrirPlan: (id: string) => void;
}) {
  if (!d.v20) return null;
  const l = informesPendientes(d, hoy);
  if (!l.length) return null;
  return (
    <div className="card">
      <h3>Informes semestrales de avance</h3>
      <div className="sub">
        Se presentan dentro de los 15 días hábiles siguientes al 30 de junio y al 31 de diciembre (art. 11)
      </div>
      {l.map(i => (
        <div className="list-row" key={i.p.id + i.corte}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{textoCorto(i.p.ejercicio, 90)}</b>
            <div className="muted" style={{ fontSize: '.76rem' }}>
              Corte {formatoCorto(i.corte)} · vence {formatoCorto(i.vence)}
            </div>
          </div>
          <span className={'pill ' + ESTADO_INFORME[i.estado][0]}>{ESTADO_INFORME[i.estado][1]}</span>
          <button type="button" className="btn sm" onClick={() => abrirPlan(i.p.id)}>
            Abrir
          </button>
        </div>
      ))}
    </div>
  );
}

/** pmProrLinea: línea de la prórroga en la fila de una acción. */
export function LineaProrroga({
  a,
  d,
  edita,
  abrir
}: {
  a: Accion;
  d: DatosPlanes;
  edita: boolean;
  abrir: (v: VentanaNorma) => void;
}) {
  if (!d.v20) return null;
  const l = lineaProrroga(a, d.prorrogas ?? []);
  if (!l) return null;
  return (
    <div className="pm-a-l">
      <Icono nombre="fa-calendar-plus" /> {l.texto}
      {l.pr.estado === 'solicitada' && edita && (
        <>
          {' '}
          <button type="button" className="btn sm" onClick={() => abrir({ t: 'resolver', pr: l.pr })}>
            Resolver
          </button>
        </>
      )}
    </div>
  );
}

export function VentanaProrroga({
  tipo,
  ctx,
  d,
  hoy,
  alCerrar
}: {
  tipo: TipoProrroga;
  ctx: ContextoProrroga;
  d: DatosPlanes;
  hoy: string;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const refrescar = useRefrescar();
  const venc = tipo === 'accion' ? (ctx.a as Accion).fecha_fin : (ctx.venc as string);
  const c = { ...ctx, venc };
  const [sol, setSol] = useState(hoy);
  const [nueva, setNueva] = useState('');
  const [rad, setRad] = useState('');
  const [obs, setObs] = useState('');
  const req = requisitosProrroga(tipo, c, { fecha_solicitud: sol, fecha_nueva: nueva }, d.prorrogas ?? []);
  const guardar = async () => {
    const falla = req.filter(x => !x.ok);
    if (falla.length) return avisar('No cumple: ' + falla.map(x => x.txt).join(' · '), 'error');
    const r = radicadoOrfeo(rad);
    if ('error' in r) return avisar(r.error, 'error');
    try {
      await planes.guardar('pror', {
        plan_id: tipo === 'accion' ? (ctx.a as Accion).plan_id : (ctx.p as Plan).id,
        accion_id: tipo === 'accion' ? (ctx.a as Accion).id : null,
        tipo,
        corte: tipo === 'informe' ? (ctx.corte ?? null) : null,
        fecha_solicitud: sol,
        radicado_solicitud: r.ok,
        fecha_vencimiento_anterior: venc,
        fecha_nueva: nueva,
        estado: 'solicitada',
        observaciones: obs.trim()
      });
      avisar('Solicitud de prórroga registrada', 'ok');
      await refrescar();
      alCerrar();
    } catch (e) {
      const m = (e as Error).message;
      avisar(
        /una_accion|una_present|una_informe|duplicate/i.test(m)
          ? 'Ya existe una prórroga para este caso: solo se permite una vez'
          : m,
        'error'
      );
    }
  };
  return (
    <Modal
      abierto
      titulo={TITULO_PRORROGA[tipo]}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => void guardar()}>
            <Icono nombre="fa-floppy-disk" /> Registrar solicitud
          </button>
        </>
      }
    >
      {tipo === 'accion' && (
        <div className="muted" style={{ marginBottom: 8 }}>
          {textoCorto((ctx.a as Accion).accion, 160)}
        </div>
      )}
      <div className="row2">
        <div className="field">
          <label htmlFor="pmPrSol">Fecha de la solicitud *</label>
          <input id="pmPrSol" type="date" value={sol} onChange={e => setSol(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pmPrNueva">Nueva fecha solicitada *</label>
          <input id="pmPrNueva" type="date" value={nueva} onChange={e => setNueva(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmPrRad">Radicado ORFEO de la solicitud</label>
        <input id="pmPrRad" inputMode="numeric" value={rad} onChange={e => setRad(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pmPrObs">Justificación</label>
        <textarea id="pmPrObs" rows={2} value={obs} onChange={e => setObs(e.target.value)} />
      </div>
      <div className="pm-req-list" aria-label="Requisitos">
        {req.map(x => (
          <div key={x.txt} className={x.ok ? 'ok' : 'no'}>
            <Icono nombre={x.ok ? 'fa-circle-check' : 'fa-circle-xmark'} /> {x.txt}
          </div>
        ))}
      </div>
      <div className="hint">
        La aplicación verifica los requisitos y registra la solicitud; la decisión es de la Dirección Técnica
        de la CGSC y se registra después con «Resolver».
      </div>
    </Modal>
  );
}

export function VentanaResolverProrroga({
  pr,
  hoy,
  alCerrar
}: {
  pr: Prorroga;
  hoy: string;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const refrescar = useRefrescar();
  const [estado, setEstado] = useState<'concedida' | 'negada'>('concedida');
  const [fecha, setFecha] = useState(hoy);
  const [rad, setRad] = useState('');
  const guardar = async () => {
    try {
      await planes.resolverProrroga(pr.id, estado, rad.replace(/\D/g, ''), fecha || hoy);
      avisar(estado === 'concedida' ? 'Prórroga concedida registrada' : 'Prórroga negada registrada', 'ok');
      await refrescar();
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      titulo="Resolver la solicitud de prórroga"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => void guardar()}>
            <Icono nombre="fa-check" /> Guardar
          </button>
        </>
      }
    >
      <div className="muted" style={{ marginBottom: 8 }}>
        Solicitada el {formatoCorto(pr.fecha_solicitud as string)}: de{' '}
        {formatoCorto(pr.fecha_vencimiento_anterior as string)} a {formatoCorto(pr.fecha_nueva)}.
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="pmPrREst">Decisión de la CGSC *</label>
          <select
            id="pmPrREst"
            value={estado}
            onChange={e => setEstado(e.target.value as 'concedida' | 'negada')}
          >
            <option value="concedida">Concedida</option>
            <option value="negada">Negada</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pmPrRFec">Fecha de la respuesta</label>
          <input id="pmPrRFec" type="date" max={hoy} value={fecha} onChange={e => setFecha(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmPrRRad">Radicado ORFEO de la respuesta</label>
        <input id="pmPrRRad" inputMode="numeric" value={rad} onChange={e => setRad(e.target.value)} />
      </div>
      <div className="hint">
        Si se concede una prórroga de acción, la fecha de terminación cambia y se conserva la original.
      </div>
    </Modal>
  );
}

export function VentanaInforme({
  p,
  d,
  hoy,
  alCerrar
}: {
  p: Plan;
  d: DatosPlanes;
  hoy: string;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const refrescar = useRefrescar();
  const pend = informes(p, d.prorrogas ?? [], d.informes ?? [], hoy).filter(
    i => !i.inf && i.estado !== 'futuro' && i.estado !== 'no_aplica'
  );
  const [corte, setCorte] = useState(pend[0]?.corte ?? '');
  const [fecha, setFecha] = useState(hoy);
  const [rad, setRad] = useState('');
  const [obs, setObs] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const guardar = async () => {
    if (!fechaPlan(fecha)) return avisar('Indique la fecha de envío', 'error');
    if (fecha > hoy) return avisar('La fecha de envío no puede ser futura', 'error');
    const r = radicadoOrfeo(rad);
    if ('error' in r) return avisar(r.error, 'error');
    setOcupado(true);
    try {
      let docId: string | null = null;
      if (archivo)
        docId = await planes.subirDocumento(archivo, {
          plan_id: p.id,
          tipo: 'informe_avance',
          radicado_orfeo: r.ok,
          observaciones: 'Informe semestral con corte ' + formatoCorto(corte)
        });
      await planes.guardar('inf', {
        plan_id: p.id,
        corte,
        fecha_envio: fecha,
        radicado_orfeo: r.ok,
        documento_id: docId,
        observaciones: obs.trim()
      });
      avisar('Informe semestral registrado', 'ok');
      await refrescar();
      alCerrar();
    } catch (e) {
      avisar((e as Error).message, 'error');
      setOcupado(false);
    }
  };
  if (!pend.length)
    return (
      <Modal
        abierto
        titulo="Registrar informe semestral de avance"
        alCerrar={alCerrar}
        pie={
          <button type="button" className="btn" onClick={alCerrar}>
            Cerrar
          </button>
        }
      >
        <div className="muted">No hay informes semestrales por registrar en este plan</div>
      </Modal>
    );
  return (
    <Modal
      abierto
      titulo="Registrar informe semestral de avance"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={ocupado} onClick={() => void guardar()}>
            <Icono nombre="fa-floppy-disk" /> Guardar
          </button>
        </>
      }
    >
      <div className="row2">
        <div className="field">
          <label htmlFor="pmInfCorte">Corte *</label>
          <select id="pmInfCorte" value={corte} onChange={e => setCorte(e.target.value)}>
            {pend.map(i => (
              <option key={i.corte} value={i.corte}>
                {formatoCorto(i.corte)} (vence {formatoCorto(i.vence)})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pmInfFecha">Fecha de envío *</label>
          <input
            id="pmInfFecha"
            type="date"
            max={hoy}
            value={fecha}
            onChange={e => setFecha(e.target.value)}
          />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="pmInfOrf">Radicado ORFEO del envío</label>
          <input id="pmInfOrf" inputMode="numeric" value={rad} onChange={e => setRad(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pmInfFile">Informe enviado (PDF o Excel)</label>
          <input
            id="pmInfFile"
            type="file"
            accept=".pdf,.xlsx,.xls,application/pdf"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmInfObs">Observaciones</label>
        <textarea id="pmInfObs" rows={2} value={obs} onChange={e => setObs(e.target.value)} />
      </div>
      <div className="hint">
        El archivo queda guardado en el archivo documental del plan, con su huella digital.
      </div>
    </Modal>
  );
}

export function VentanaNuevoPlan({
  p,
  d,
  fev,
  hoy,
  alCerrar,
  alCrear
}: {
  p: Plan;
  d: DatosPlanes;
  fev: string;
  hoy: string;
  alCerrar: () => void;
  alCrear: (id: string) => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const refrescar = useRefrescar();
  const [ocupado, setOcupado] = useState(false);
  const l = accionesBajo100(p, d.acciones, d.avances, fev);
  const res = resolucion(p);
  const crear = async () => {
    setOcupado(true);
    try {
      const id = await planes.importar(cargaNuevoPlan(p, d, hoy, fev));
      avisar('Nuevo plan creado en formulación', 'ok');
      await refrescar();
      alCrear(id);
    } catch (e) {
      avisar((e as Error).message, 'error');
      setOcupado(false);
    }
  };
  return (
    <Modal
      abierto
      ancha
      titulo="Nuevo plan por acciones con calificación inferior a 100 (art. 12, par. 5)"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={ocupado || !l.length}
            onClick={() => void crear()}
          >
            <Icono nombre="fa-copy" /> Crear el nuevo plan
          </button>
        </>
      }
    >
      <div className={'pm-note ' + (res === '24.043' ? 'b' : 'y')}>
        {res === '24.043'
          ? 'Resolución 24.043: el nuevo plan se suscribe con el 30 % del tiempo inicialmente dispuesto para cada acción. Las fechas propuestas ya aplican esa regla.'
          : 'Resolución 24.003: el nuevo plan se suscribe con la Oficina de Control Interno, conforme al mecanismo adoptado internamente. Revise las fechas propuestas.'}
      </div>
      <div className="tbl-wrap">
        <table className="tbl" aria-label="Acciones para el nuevo plan">
          <thead>
            <tr>
              <th>Hallazgo</th>
              <th>Acción</th>
              <th>Cumpl.</th>
              <th>Efect.</th>
              <th>Nueva fecha de terminación</th>
            </tr>
          </thead>
          <tbody>
            {l.map(a => {
              const h = d.hallazgos.find(x => x.id === a.hallazgo_id);
              const r = calificacionAccion(a, fev, d.avances);
              return (
                <tr key={a.id}>
                  <td className="mono">{h ? h.numero : ''}</td>
                  <td className="asunto">{textoCorto(a.accion, 110)}</td>
                  <td className="mono">{r.c}</td>
                  <td className="mono">{r.e}</td>
                  <td>
                    {formatoCorto(nuevaFinAccion(a, res, hoy))}
                    {res === '24.043' && <span className="muted"> (30 % de {duracionAccion(a)} días)</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="hint">
        Se crea un plan «En formulación» enlazado a este, con los hallazgos y las acciones copiados para que
        Control Interno los ajuste, apruebe y suscriba.
      </div>
    </Modal>
  );
}
