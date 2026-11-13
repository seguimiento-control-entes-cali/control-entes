// Ventanas "Notificar a …" y "Modo despacho" (2.x: notifyModal, sendWa, sendMail y despachoModal de
// src/js/14-notificaciones.js). Se usan desde el Centro de mando, el Expediente y Notificaciones WhatsApp.
// Diferencia a propósito con la 2.x: si el responsable no tiene celular válido la casilla queda vacía (la 2.x
// mostraba "—", que luego no servía como número).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  cargoPorNivel,
  claveOrganismo,
  formatoCelular,
  nombreCorto,
  normalizarCelular,
  normalizarCorreo,
  type Responsable
} from '../../dominio/directorio';
import { colaAccion } from '../../dominio/mando';
import {
  asuntoCorreo,
  casosNotificados,
  construirMensaje,
  enlaceGmail,
  enlaceWhatsApp,
  notificadaHoy,
  PLANTILLAS,
  plantillaSugerida
} from '../../dominio/notificaciones';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const VIGS = [2026, 2025, 2024] as const;
const dos = (n: number) => String(n).padStart(2, '0');
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

function useDatosNotificar() {
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
  return {
    filas: datos.data?.filas ?? [],
    corte: datos.data?.corte ?? '',
    responsables: resp.data ?? [],
    notificaciones: notifs.data ?? []
  };
}

const contactosDe = (lista: readonly Responsable[], org: string) =>
  lista.filter(x => claveOrganismo(x.organismo) === claveOrganismo(org));

function VentanaNotificar({
  org,
  vigsIniciales,
  alCerrar
}: {
  org: string;
  vigsIniciales: number[];
  alCerrar: () => void;
}) {
  const { directorio, actividad, remitente = '' } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const { filas, corte, responsables } = useDatosNotificar();
  const cts = useMemo(() => contactosDe(responsables, org), [responsables, org]);
  const [ci, setCi] = useState(0);
  const [tpl, setTpl] = useState<string>(() => plantillaSugerida(filas, org, vigsIniciales));
  const [vigs, setVigs] = useState<number[]>(vigsIniciales);
  const c0 = cts[ci] ?? null;
  const celularDe = (c: Responsable | null) => {
    const n = c ? normalizarCelular(c.telefono) : '';
    return n ? formatoCelular(n).replace('+57 ', '') : '';
  };
  const [tel, setTel] = useState(() => celularDe(c0));
  const [correo, setCorreo] = useState(() => c0?.correo ?? '');
  const [asunto, setAsunto] = useState(() => asuntoCorreo(tpl, org));
  const generar = (t: string, v: number[], c: Responsable | null) =>
    construirMensaje(filas, corte, org, t, v.length ? v : [2026], c);
  const [msg, setMsg] = useState(() => generar(tpl, vigs, c0));
  const [enviando, setEnviando] = useState(false);

  const telOk = normalizarCelular(tel),
    mailOk = normalizarCorreo(correo);

  const elegirContacto = (i: number) => {
    setCi(i);
    const c = cts[i] ?? null;
    setTel(celularDe(c));
    setCorreo(c?.correo ?? '');
    setMsg(generar(tpl, vigs, c));
  };
  const elegirPlantilla = (t: string) => {
    setTpl(t);
    setMsg(generar(t, vigs, c0));
    setAsunto(asuntoCorreo(t, org));
  };
  const cambiarVig = (y: number) => {
    const v = vigs.includes(y) ? vigs.filter(x => x !== y) : [...vigs, y];
    setVigs(v);
    setMsg(generar(tpl, v, c0));
  };
  const registrar = async (extra: { tel: string; correo?: string; canal?: string }) => {
    try {
      await actividad.registrarNotificacion({
        org,
        nombre: c0 ? c0.nombre : '',
        tpl,
        n: casosNotificados(filas, org, vigs, tpl),
        mensaje: msg.trim(),
        ...extra
      });
    } catch (e) {
      avisar('La notificación se envió pero no se pudo registrar: ' + (e as Error).message, 'error');
    }
    void cliente.invalidateQueries({ queryKey: ['notificaciones'] });
    void cliente.invalidateQueries({ queryKey: ['actividad'] });
  };

  const whatsapp = async () => {
    const t = normalizarCelular(tel),
      m = msg.trim();
    if (!t) return avisar('Ingresa un celular válido para abrir WhatsApp', 'error');
    if (!m) return avisar('El mensaje está vacío', 'error');
    setEnviando(true);
    // Igual que la 2.x: el celular nuevo queda en el directorio (si el rol no puede editarlo, se avisa y se sigue)
    const nivel = filas.find(r => r.org === org)?.niv ?? '';
    const fila: Responsable | null =
      c0 && normalizarCelular(c0.telefono) !== t
        ? { ...c0, telefono: t }
        : !c0
          ? { organismo: org, cargo: cargoPorNivel(nivel), nombre: '', telefono: t, correo: '' }
          : null;
    if (fila)
      try {
        await directorio.guardar(fila);
        void cliente.invalidateQueries({ queryKey: ['directorio'] });
      } catch (e) {
        avisar((e as Error).message, 'error');
      }
    window.open(enlaceWhatsApp(t, m), '_blank', 'noopener');
    await registrar({ tel: t });
    setEnviando(false);
    alCerrar();
    avisar('Notificación preparada en WhatsApp para ' + nombreCorto(org) + ' y registrada', 'ok');
  };

  const enviarCorreo = async () => {
    const para = normalizarCorreo(correo),
      m = msg.trim(),
      su = asunto.trim() || 'Requerimientos de entes de control · ' + nombreCorto(org);
    if (!para) return avisar('Ingresa el correo institucional (@cali.gov.co) del destinatario', 'error');
    if (!m) return avisar('El mensaje está vacío', 'error');
    setEnviando(true);
    if (c0 && (c0.correo || '') !== para)
      try {
        await directorio.guardar({ ...c0, correo: para });
        void cliente.invalidateQueries({ queryKey: ['directorio'] });
      } catch (e) {
        setEnviando(false);
        return avisar((e as Error).message, 'error');
      }
    window.open(enlaceGmail(remitente, para, su, m), '_blank', 'noopener');
    await registrar({ tel: '', correo: para, canal: 'correo' });
    setEnviando(false);
    alCerrar();
    avisar(
      'Correo listo' +
        (remitente ? ' en ' + remitente : '') +
        ' para ' +
        nombreCorto(org) +
        '. Revisa y pulsa Enviar en Gmail.',
      'ok'
    );
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(msg);
      avisar('Mensaje copiado', 'ok');
    } catch {
      avisar('No se pudo copiar: selecciona el texto y cópialo a mano', 'error');
    }
  };

  return (
    <Modal
      abierto
      ancha
      titulo={'Notificar a ' + nombreCorto(org)}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={() => void copiar()}>
            <Icono nombre="fa-copy" tipo="regular" /> Copiar
          </button>
          <button type="button" className="btn" disabled={enviando} onClick={() => void whatsapp()}>
            <Icono nombre="fa-whatsapp" tipo="brands" /> WhatsApp
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={enviando}
            onClick={() => void enviarCorreo()}
          >
            <Icono nombre="fa-envelope" /> Enviar por correo
          </button>
        </>
      }
    >
      <div className="row2">
        <div className="field">
          <label htmlFor="nCt">Destinatario</label>
          <select id="nCt" value={cts.length ? ci : -1} onChange={e => elegirContacto(+e.target.value)}>
            {cts.length ? (
              cts.map((x, i) => (
                <option key={i} value={i}>
                  {x.cargo}
                  {x.nombre ? ' - ' + x.nombre : ''}
                </option>
              ))
            ) : (
              <option value={-1}>Sin responsable en el directorio</option>
            )}
          </select>
        </div>
        <div className="field">
          <label htmlFor="nTpl">Mensaje</label>
          <select id="nTpl" value={tpl} onChange={e => elegirPlantilla(e.target.value)}>
            {Object.entries(PLANTILLAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="nTel">Celular (WhatsApp)</label>
          <input
            id="nTel"
            className="mono"
            placeholder="3001234567"
            inputMode="tel"
            value={tel}
            onChange={e => setTel(e.target.value)}
          />
          <div className={'hint' + (telOk ? '' : ' err')}>
            {telOk ? 'Se enviará a ' + formatoCelular(telOk) : 'Ingresa un celular colombiano de 10 dígitos'}
          </div>
        </div>
        <div className="field">
          <label htmlFor="nMail">Correo institucional del destinatario</label>
          <input
            id="nMail"
            className="mono"
            placeholder="nombre.apellido@cali.gov.co"
            inputMode="email"
            value={correo}
            onChange={e => setCorreo(e.target.value)}
          />
          <div className={'hint' + (mailOk ? '' : ' err')}>
            {mailOk
              ? (remitente ? 'Se enviará desde ' + remitente + ' a ' : 'Se enviará a ') + mailOk
              : 'Ingresa el correo institucional (@cali.gov.co)'}
          </div>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="nSubj">Asunto del correo</label>
          <input id="nSubj" value={asunto} onChange={e => setAsunto(e.target.value)} />
        </div>
        <div className="field">
          <label>Vigencias a incluir</label>
          <div className="seg" id="nVigs" role="group" aria-label="Vigencias a incluir">
            {VIGS.map(y => (
              <button
                key={y}
                type="button"
                className={vigs.includes(y) ? 'on' : ''}
                aria-pressed={vigs.includes(y)}
                onClick={() => cambiarVig(y)}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="field">
        <label htmlFor="nMsg">Vista previa (editable)</label>
        <textarea
          id="nMsg"
          style={{ minHeight: 230, fontSize: '.84rem' }}
          value={msg}
          onChange={e => setMsg(e.target.value)}
        />
        <div className="hint">{msg.length} caracteres</div>
      </div>
    </Modal>
  );
}

function VentanaDespacho({
  vigs,
  alCerrar,
  preparar
}: {
  vigs: number[];
  alCerrar: () => void;
  preparar: (org: string) => void;
}) {
  const { filas, responsables, notificaciones } = useDatosNotificar();
  const cola = colaAccion(filas, vigs),
    hoy = hoyLocal();
  return (
    <Modal abierto ancha titulo="Modo despacho" alCerrar={alCerrar}>
      <div className="muted" style={{ fontSize: '.82rem', marginBottom: 12 }}>
        Notifica de a una dependencia: cada botón abre el mensaje listo para enviar por correo institucional o
        por WhatsApp. Las ya notificadas hoy aparecen marcadas.
      </div>
      {cola.length ? (
        cola.map(o => {
          const ct = contactosDe(responsables, o.org)[0],
            ok = ct && normalizarCelular(ct.telefono),
            hecha = notificadaHoy(notificaciones, o.org, hoy);
          return (
            <div key={o.org} className="list-row">
              <div className="grow">
                <b>{nombreCorto(o.org)}</b>
                <small>
                  {o.venc} sin respuesta · {o.pend} por vencer · {ct?.nombre ? ct.nombre : 'sin responsable'}
                  {ok ? '' : ' · sin celular'}
                  {ct?.correo ? '' : ' · sin correo'}
                </small>
              </div>
              {hecha && (
                <span className="pill verde">
                  <i />
                  NOTIFICADA HOY
                </span>
              )}
              <button
                type="button"
                className={'btn sm' + (hecha ? '' : ' primary')}
                onClick={() => preparar(o.org)}
              >
                {hecha ? 'Reenviar' : 'Preparar'}
              </button>
            </div>
          );
        })
      ) : (
        <div className="empty">
          <Icono nombre="fa-champagne-glasses" />
          No hay dependencias con pendientes
        </div>
      )}
    </Modal>
  );
}

/**
 * Ventanas de notificación para una pantalla. `vigs` son las vigencias elegidas en esa pantalla (Q.vigs de la 2.x:
 * 2026 por defecto). Devuelve las funciones para abrirlas y el elemento que hay que dibujar.
 */
export function useNotificar(vigs: number[] = [2026]): {
  notificar: (org: string) => void;
  despacho: () => void;
  ventanas: ReactNode;
} {
  const [org, setOrg] = useState<string | null>(null);
  const [desp, setDesp] = useState(false);
  const notificar = useCallback((o: string) => {
    setDesp(false);
    setOrg(o);
  }, []);
  const despacho = useCallback(() => setDesp(true), []);
  useEffect(() => {
    if (org) setDesp(false);
  }, [org]);
  const ventanas = (
    <>
      {org && <VentanaNotificar key={org} org={org} vigsIniciales={vigs} alCerrar={() => setOrg(null)} />}
      {desp && <VentanaDespacho vigs={vigs} alCerrar={() => setDesp(false)} preparar={notificar} />}
    </>
  );
  return { notificar, despacho, ventanas };
}
