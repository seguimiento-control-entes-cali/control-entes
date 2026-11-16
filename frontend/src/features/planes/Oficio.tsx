// Planes (entrega 4c-2): oficio de remisión del informe (pmReqHtml/pmEnlazarReq), aprobar y suscribir el plan
// (pmAprobarModal/pmAprobar) y notificar a la dependencia (pmNotifyModal/pmSendNotif) de la 2.x. Mismo HTML y clases.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { textoCorto } from '../../dominio/actividad';
import { claveOrganismo, nombreCorto, normalizarCelular, normalizarCorreo } from '../../dominio/directorio';
import { diasEntre, fechaColombia, formatoCorto } from '../../dominio/fechas';
import { enlaceGmail, enlaceWhatsApp } from '../../dominio/notificaciones';
import { fechaPlan, type DatosPlanes, type Plan } from '../../dominio/planes';
import {
  mensajeDependencia,
  oficioSugerido,
  revisionAprobacion,
  type OficioReq
} from '../../dominio/planes-oficio';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { calcularSemaforo } from '../../dominio/semaforo';
import { PildoraSemaforo } from '../requerimientos/comun';
import { useDatos } from '../sesion/contexto';

/** Requerimientos de la vigencia actual (S.reqs de la 2.x), para enlazar el oficio. */
export function useOficios() {
  const { requerimientos } = useDatos();
  const vig = Number(fechaColombia(new Date()).slice(0, 4));
  const q = useQuery({ queryKey: ['requerimientos', vig], queryFn: () => requerimientos.lista(vig) });
  return (q.data ?? []) as unknown as (OficioReq & { orfeo_salida?: string | null })[];
}

function diasTxt(d: number) {
  return d < 0 ? `Vencido hace ${-d} d` : d === 0 ? 'Vence hoy' : d === 1 ? 'Vence mañana' : `En ${d} días`;
}

/** pmReqHtml: oficio enlazado o, para quien edita, el posible oficio para enlazar. */
export function TarjetaOficio({
  p,
  d,
  edita,
  hoy
}: {
  p: Plan;
  d: DatosPlanes;
  edita: boolean;
  hoy: string;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const cliente = useQueryClient();
  const ir = useNavigate();
  const reqs = useOficios();
  const { catalogos } = useDatos();
  const config = useQuery({ queryKey: ['configuracion'], queryFn: () => catalogos.configuracion() });
  if (!d.v19) return null;
  const r = p.requerimiento_id ? reqs.find(x => String(x.id) === String(p.requerimiento_id)) : null;
  if (!r) {
    const sug = edita ? oficioSugerido(p, reqs) : null;
    if (!sug) return null;
    const enlazar = async () => {
      try {
        await planes.guardar('plan', { requerimiento_id: sug.id }, p.id);
        avisar('Oficio enlazado al plan', 'ok');
        await cliente.invalidateQueries({ queryKey: ['planes'] });
      } catch (e) {
        avisar((e as Error).message, 'error');
      }
    };
    return (
      <div className="pm-note b" style={{ marginTop: 10 }}>
        <Icono nombre="fa-link" /> Posible oficio de remisión: <span className="mono">{sug.radicado}</span> ·{' '}
        {textoCorto(sug.asunto, 90)}.{' '}
        <button type="button" className="btn sm" onClick={() => void enlazar()}>
          Enlazar
        </button>
      </div>
    );
  }
  const cerrado = r.estado === 'cerrado';
  const diasRojo = config.data?.diasRojo ?? 5;
  const dias = r.fecha_limite ? diasEntre(hoy, r.fecha_limite) : 0;
  return (
    <div className="pm-req">
      <Icono nombre="fa-envelope-open-text" />
      <div>
        <small>Oficio de remisión del informe</small>
        <span>
          <span className="mono">{r.radicado}</span> · {textoCorto(r.asunto, 90)}
        </span>
      </div>
      <PildoraSemaforo
        sem={
          calcularSemaforo(
            { estado: cerrado ? 'cerrado' : 'abierto', fechaLimite: r.fecha_limite ?? hoy },
            hoy,
            diasRojo
          ).semaforo
        }
      />
      <span className="muted">
        {cerrado
          ? 'Respondido' + (r.orfeo_salida ? ' con ' + r.orfeo_salida : '')
          : 'Límite ' + formatoCorto(r.fecha_limite) + ' · ' + diasTxt(dias)}
      </span>
      <button type="button" className="btn sm" onClick={() => ir('/requerimientos', { state: { id: r.id } })}>
        Ver
      </button>
    </div>
  );
}

export function VentanaAprobar({
  p,
  d,
  hoy,
  rol,
  alCerrar
}: {
  p: Plan;
  d: DatosPlanes;
  hoy: string;
  rol: string;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const cliente = useQueryClient();
  const ir = useNavigate();
  const reqs = useOficios();
  const { bloqueos, avisos } = revisionAprobacion(p, d);
  const r = p.requerimiento_id ? reqs.find(x => String(x.id) === String(p.requerimiento_id)) : null;
  const [fs, setFs] = useState(hoy);
  const [orfeo, setOrfeo] = useState(p.radicado_orfeo ?? '');
  const aprobar = async () => {
    const orf = orfeo.replace(/\D/g, '');
    if (!fechaPlan(fs)) return avisar('Indique la fecha de suscripción', 'error');
    try {
      await planes.guardar(
        'plan',
        { estado: 'en_ejecucion', fecha_suscripcion: fs, radicado_orfeo: orf || p.radicado_orfeo || '' },
        p.id
      );
      avisar('Plan aprobado y suscrito: queda en ejecución', 'ok');
      await cliente.invalidateQueries({ queryKey: ['planes'] });
      alCerrar();
      // canClose de la 2.x: Super administrador, secretaría o enlace
      if (
        r &&
        r.estado === 'abierto' &&
        ['admin', 'secretario', 'enlace'].includes(rol) &&
        window.confirm(`¿Registrar ahora la respuesta del oficio ${r.radicado} con el radicado del plan?`)
      )
        ir('/carga', { state: { id: r.id, orfeo: orf, fecha: fs } });
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      titulo="Aprobar y suscribir el plan"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={bloqueos.length > 0}
            onClick={() => void aprobar()}
          >
            <Icono nombre="fa-file-signature" /> Aprobar y suscribir
          </button>
        </>
      }
    >
      {bloqueos.length ? (
        <div className="pm-note r">
          <b>Antes de aprobar:</b>
          {bloqueos.map(b => (
            <div key={b}>{b}</div>
          ))}
        </div>
      ) : (
        <div className="pm-note g">
          <Icono nombre="fa-circle-check" /> Todos los hallazgos tienen acciones y no hay observaciones
          pendientes.
        </div>
      )}
      {avisos.length > 0 && (
        <div className="pm-note y" style={{ marginTop: 8 }}>
          <b>Revise también (no impide aprobar):</b>
          {avisos.map(a => (
            <div key={a}>{a}</div>
          ))}
        </div>
      )}
      <div className="row2" style={{ marginTop: 12 }}>
        <div className="field">
          <label htmlFor="pmApFs">Fecha de suscripción *</label>
          <input id="pmApFs" type="date" value={fs} onChange={e => setFs(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pmApOrf">Radicado ORFEO con el que se envió el plan</label>
          <input id="pmApOrf" inputMode="numeric" value={orfeo} onChange={e => setOrfeo(e.target.value)} />
        </div>
      </div>
      {r && r.estado === 'abierto' && (
        <div className="hint">
          Al aprobar podrá registrar la respuesta del oficio <span className="mono">{r.radicado}</span> con
          este radicado.
        </div>
      )}
    </Modal>
  );
}

/** pmNotifyModal y pmSendNotif: mensaje a la dependencia por WhatsApp o correo, registrado en la bitácora. */
export function VentanaNotificarPlanes({
  depId,
  depNombre,
  d,
  hoy,
  alCerrar
}: {
  depId: number;
  depNombre: string;
  d: DatosPlanes;
  hoy: string;
  alCerrar: () => void;
}) {
  const { directorio, actividad, remitente = '' } = useDatos();
  const avisar = useAvisos();
  const cliente = useQueryClient();
  const resp = useQuery({ queryKey: ['directorio'], queryFn: () => directorio.responsables() });
  const cts = (resp.data ?? []).filter(x => claveOrganismo(x.organismo) === claveOrganismo(depNombre));
  const m = mensajeDependencia(depId, d, depNombre, hoy);
  const [ci, setCi] = useState(0);
  const c = cts[ci];
  const [tel, setTel] = useState<string | null>(null);
  const [correo, setCorreo] = useState<string | null>(null);
  const [msg, setMsg] = useState(m.txt);
  const telV = tel ?? normalizarCelular(c?.telefono) ?? '';
  const correoV = correo ?? c?.correo ?? '';
  const enviar = async (canal: 'whatsapp' | 'correo') => {
    const texto = msg.trim();
    if (!texto) return avisar('El mensaje está vacío', 'error');
    const base = {
      org: depNombre,
      nombre: c?.nombre ?? '',
      tpl: 'Plan de mejoramiento',
      n: m.n,
      mensaje: texto
    };
    if (canal === 'whatsapp') {
      const t = normalizarCelular(telV);
      if (!t) return avisar('Ingresa un celular válido para abrir WhatsApp', 'error');
      window.open(enlaceWhatsApp(t, texto), '_blank', 'noopener');
      await actividad.registrarNotificacion({ ...base, tel: t }).catch(() => undefined);
    } else {
      const to = normalizarCorreo(correoV);
      if (!to) return avisar('Ingresa el correo institucional (@cali.gov.co) del destinatario', 'error');
      const su = 'Planes de mejoramiento · acciones pendientes · ' + nombreCorto(depNombre);
      window.open(enlaceGmail(remitente, to, su, texto), '_blank', 'noopener');
      await actividad
        .registrarNotificacion({ ...base, tel: '', correo: to, canal: 'correo' })
        .catch(() => undefined);
    }
    void cliente.invalidateQueries({ queryKey: ['notificaciones'] });
    alCerrar();
    avisar('Notificación preparada y registrada en la bitácora', 'ok');
  };
  return (
    <Modal
      abierto
      ancha
      titulo={'Notificar a ' + nombreCorto(depNombre)}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={() => void enviar('correo')}>
            <Icono nombre="fa-envelope" /> Correo
          </button>
          <button type="button" className="btn primary" onClick={() => void enviar('whatsapp')}>
            <i className="fa-brands fa-whatsapp" aria-hidden="true" /> WhatsApp
          </button>
        </>
      }
    >
      {cts.length > 1 ? (
        <div className="field">
          <label htmlFor="pmNCt">Destinatario</label>
          <select
            id="pmNCt"
            value={ci}
            onChange={e => {
              setCi(Number(e.target.value));
              setTel(null);
              setCorreo(null);
            }}
          >
            {cts.map((x, i) => (
              <option key={i} value={i}>
                {x.cargo || ''}: {x.nombre || 'sin nombre'}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="muted" style={{ marginBottom: 10 }}>
          Destinatario:{' '}
          <b style={{ color: 'var(--ink)' }}>{c?.nombre || 'sin responsable en el directorio'}</b>
          {c?.cargo ? ' · ' + c.cargo : ''}
        </div>
      )}
      <div className="row2">
        <div className="field">
          <label htmlFor="pmNTel">Celular (WhatsApp)</label>
          <input id="pmNTel" inputMode="tel" value={telV} onChange={e => setTel(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pmNMail">Correo institucional</label>
          <input id="pmNMail" type="email" value={correoV} onChange={e => setCorreo(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pmNMsg">Mensaje</label>
        <textarea id="pmNMsg" rows={12} value={msg} onChange={e => setMsg(e.target.value)} />
      </div>
    </Modal>
  );
}
