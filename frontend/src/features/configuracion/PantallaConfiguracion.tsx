// Configuración (2.x: vConfig, guardarResumen, probarResumen, guardarAvisos, previaAvisos, respaldoCargar,
// respaldoCrear, respaldoDescargar, saludCargar y saludRevisado de src/js/08-vistas-catalogos-y-seguridad.js, y la
// acción saveCfg de 18-acciones.js). Solo el Super administrador la tiene en el menú. Mismo HTML y clases.
// Diferencias a propósito con la 2.x:
// - "Conexión a Supabase" solo informa: en la 3.0 el proyecto se fija al construir (configuracion.json) y no se
//   puede cambiar desde el navegador.
// - "Cargar Excel de control" y la verificación y descarga de archivos llegan en la siguiente entrega de la F3.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { formatoFechaHora } from '../../dominio/auditoria';
import {
  errorDeEvento,
  fechaRespaldo,
  textoAvisosGuardado,
  textoResumenGuardado,
  tieneAvisos,
  tieneRespaldos,
  tieneResumen,
  validarCopiaAvisos,
  validarDiasRojo,
  type ConfiguracionGeneral,
  type VistaPreviaAvisos
} from '../../dominio/configuracion';
import { formatoCorto } from '../../dominio/historico';
import { textoVersion } from '../../dominio/version';
import { FECHA_CONSTRUCCION, VERSION_APP } from '../../shared/lib';
import { Aviso, Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');
const Mono = ({ children }: { children: ReactNode }) => <span className="mono">{children}</span>;

function Parametros({ c }: { c: ConfiguracionGeneral }) {
  const { sistema } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [dias, setDias] = useState(String(c.dias_rojo));
  const [disc, setDisc] = useState(c.correo_disciplinario || '');
  const guardar = async () => {
    const d = +dias;
    const e = validarDiasRojo(d);
    if (e) return avisar(e, 'error');
    try {
      await sistema.guardar({ dias_rojo: d, correo_disciplinario: disc.trim() });
      await Promise.all(
        [['sistema'], ['configuracion'], ['requerimientos']].map(k =>
          cliente.invalidateQueries({ queryKey: k })
        )
      );
      avisar('Parámetros guardados', 'ok');
    } catch (er) {
      avisar((er as Error).message, 'error');
    }
  };
  return (
    <div className="card">
      <h3>Parámetros del semáforo</h3>
      <div className="sub">Se guardan en la base de datos y aplican a toda la entidad.</div>
      <div className="field">
        <label htmlFor="cfDias">Días para considerar un requerimiento crítico (rojo)</label>
        <input
          id="cfDias"
          type="number"
          min={1}
          max={30}
          value={dias}
          onChange={e => setDias(e.target.value)}
        />
        <div className="hint">
          Un requerimiento abierto pasa a rojo cuando le quedan este número de días o menos, o ya venció.
        </div>
      </div>
      <div className="field">
        <label htmlFor="cfDisc">Correo de Control Disciplinario Interno</label>
        <input
          id="cfDisc"
          type="email"
          placeholder="disciplinario@cali.gov.co"
          value={disc}
          onChange={e => setDisc(e.target.value)}
        />
        <div className="hint">Destino de la notificación preventiva para requerimientos vencidos.</div>
      </div>
      <button type="button" className="btn primary" onClick={() => void guardar()}>
        <Icono nombre="fa-floppy-disk" /> Guardar parámetros
      </button>
    </div>
  );
}

function Resumen({ c, demo }: { c: ConfiguracionGeneral; demo: boolean }) {
  const { sistema } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [activo, setActivo] = useState(!!c.resumen_activo);
  const [enviando, setEnviando] = useState(false);
  const guardar = async () => {
    try {
      await sistema.guardar({ resumen_activo: activo });
      await cliente.invalidateQueries({ queryKey: ['sistema'] });
      avisar(textoResumenGuardado(activo), 'ok');
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  const probar = async () => {
    setEnviando(true);
    try {
      const r = await sistema.probarResumen();
      avisar(
        r.enviados
          ? 'Correo de prueba enviado. Revise su bandeja de entrada y la carpeta de spam.'
          : 'No hay dependencias con pendientes para armar la prueba.',
        'ok'
      );
    } catch (e) {
      avisar(demo ? (e as Error).message : 'No se pudo enviar la prueba: ' + (e as Error).message, 'error');
    }
    setEnviando(false);
  };
  return (
    <div className="card">
      <h3>Resumen semanal por correo</h3>
      <div className="sub">
        Cada lunes a las 7:00 a. m. se envía a cada secretario o director, a su correo institucional, lo que
        su dependencia tiene pendiente: requerimientos vencidos y por vencer, y acciones de planes de
        mejoramiento vencidas, por vencer o devueltas. Cada envío queda en la bitácora de notificaciones.
      </div>
      {!demo && !tieneResumen(c) ? (
        <div className="pm-note y">
          Para usarlo, ejecute en Supabase el script <Mono>14_seguridad_y_resumen.sql</Mono> y despliegue la
          función <Mono>resumen-semanal</Mono> (ver docs/DESPLIEGUE.md).
        </div>
      ) : (
        <>
          <label className="pm-checks" style={{ margin: '6px 0 12px' }}>
            <input type="checkbox" id="cfRes" checked={activo} onChange={e => setActivo(e.target.checked)} />{' '}
            Enviar el resumen semanal automáticamente
          </label>
          {c.resumen_ultimo && (
            <div className="hint" style={{ marginBottom: 10 }}>
              Último envío: {formatoFechaHora(c.resumen_ultimo)}. {c.resumen_ultimo_detalle || ''}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={() => void guardar()}>
              <Icono nombre="fa-floppy-disk" /> Guardar
            </button>
            <button type="button" className="btn" disabled={enviando} onClick={() => void probar()}>
              <Icono nombre={enviando ? 'fa-spinner fa-spin' : 'fa-paper-plane'} />{' '}
              {enviando ? 'Enviando…' : 'Enviar prueba a mi correo'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AvisoDiario({ c, demo }: { c: ConfiguracionGeneral; demo: boolean }) {
  const { sistema } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [activo, setActivo] = useState(!!c.avisos_activo);
  const [copia, setCopia] = useState(c.avisos_copia_correo || '');
  const [previa, setPrevia] = useState<VistaPreviaAvisos | null>(null);
  const [consultando, setConsultando] = useState(false);
  const guardar = async () => {
    const v = validarCopiaAvisos(copia);
    if (v.error) return avisar(v.error, 'error');
    try {
      await sistema.guardar({ avisos_activo: activo, avisos_copia_correo: v.copia });
      await cliente.invalidateQueries({ queryKey: ['sistema'] });
      avisar(textoAvisosGuardado(activo), 'ok');
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  const verPrevia = async () => {
    setConsultando(true);
    try {
      setPrevia(await sistema.vistaPreviaAvisos());
    } catch (e) {
      avisar(
        demo ? (e as Error).message : 'No se pudo consultar la vista previa: ' + (e as Error).message,
        'error'
      );
    }
    setConsultando(false);
  };
  return (
    <div className="card">
      <h3>Aviso diario de planes de mejoramiento</h3>
      <div className="sub">
        De lunes a viernes a las 7:00 a. m. (los festivos no) se avisa a cada secretario o director, con copia
        a Control Interno, de las acciones que vencen el próximo día hábil y de las que se vencieron sin
        cumplirse (solo las de los últimos 7 días; las más antiguas siguen en el resumen de los lunes). Nunca
        se avisa dos veces lo mismo; con una prórroga se avisa de nuevo.
      </div>
      {!demo && !tieneAvisos(c) ? (
        <div className="pm-note y">
          Para usarlo, ejecute en Supabase el script <Mono>24_avisos_planes.sql</Mono>, despliegue la función{' '}
          <Mono>avisos-planes</Mono> y programe la tarea con <Mono>25_programar_avisos.sql</Mono> (ver
          docs/DESPLIEGUE.md).
        </div>
      ) : (
        <>
          <label className="pm-checks" style={{ margin: '6px 0 12px' }}>
            <input type="checkbox" id="cfAv" checked={activo} onChange={e => setActivo(e.target.checked)} />{' '}
            Enviar el aviso diario automáticamente
          </label>
          <div className="field">
            <label htmlFor="cfAvCopia">Correo de copia a Control Interno</label>
            <input
              id="cfAvCopia"
              type="email"
              placeholder="control.interno@cali.gov.co"
              value={copia}
              onChange={e => setCopia(e.target.value)}
            />
            <div className="hint">Solo correos @cali.gov.co. Vacío: el aviso sale sin copia.</div>
          </div>
          {c.avisos_ultimo && (
            <div className="hint" style={{ marginBottom: 10 }}>
              Último envío: {formatoFechaHora(c.avisos_ultimo)}. {c.avisos_ultimo_detalle || ''}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn primary" onClick={() => void guardar()}>
              <Icono nombre="fa-floppy-disk" /> Guardar
            </button>
            <button type="button" className="btn" disabled={consultando} onClick={() => void verPrevia()}>
              <Icono nombre={consultando ? 'fa-spinner fa-spin' : 'fa-eye'} />{' '}
              {consultando ? 'Consultando…' : 'Ver qué se enviaría hoy'}
            </button>
          </div>
        </>
      )}
      {previa && (
        <Modal abierto ancha titulo="Vista previa del aviso diario" alCerrar={() => setPrevia(null)}>
          <div className="hint" style={{ marginBottom: 10 }}>
            Lo que se enviaría hoy ({formatoCorto(previa.hoy)}). No se envió ningún correo.
            {previa.dia_habil ? '' : ' Hoy no es día hábil: la tarea no enviaría nada.'}
            {previa.activo ? '' : ' El aviso está desactivado.'}
          </div>
          {previa.dependencias.length ? (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Dependencia</th>
                    <th>Vencen el próximo día hábil</th>
                    <th>Vencidas</th>
                    <th>Correo del titular</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.dependencias.map(d => (
                    <tr key={d.dependencia}>
                      <td>{d.dependencia}</td>
                      <td className="mono">{d.previo}</td>
                      <td className="mono">{d.atraso}</td>
                      <td>
                        {d.correo ? d.correo : <span className="muted">sin correo en el directorio</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Hoy no hay acciones para avisar.</div>
          )}
          <div className="hint" style={{ marginTop: 10 }}>
            Copia a Control Interno: {previa.copia ? previa.copia : 'sin correo de copia'}.
            {previa.sin_dependencia
              ? ` ${previa.sin_dependencia} acción(es) sin dependencia asignada no se avisan.`
              : ''}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ExcelControl({ demo }: { demo: boolean }) {
  const { sistema } = useDatos();
  const cargas = useQuery({
    queryKey: ['cargas-excel'],
    queryFn: () => sistema.ultimasCargas(),
    enabled: !demo
  });
  const l = cargas.data;
  return (
    <div className="card">
      <h3>Datos desde el Excel de control</h3>
      <div className="sub">
        Actualice el histórico cargando el Excel de control de la vigencia. Antes de guardar se muestra qué
        cambia y qué filas revisar.
      </div>
      <button type="button" className="btn primary" disabled title="Llega en la siguiente entrega de la 3.0">
        <Icono nombre="fa-file-arrow-up" /> Cargar Excel de control
      </button>
      <div className="hint" style={{ marginTop: 8 }}>
        En la versión 3.0 la carga del Excel llega en la siguiente entrega; mientras tanto se hace en la
        versión 2.x.
      </div>
      <div id="ceUltimas" className="hint" style={{ marginTop: 12 }}>
        {l === null ? (
          <>
            Para guardar las cargas en la base de datos, ejecute el script <Mono>16_carga_excel.sql</Mono>.
          </>
        ) : l && l.length ? (
          <>
            <b>Últimas cargas</b>
            {l.map((x, i) => (
              <div key={i}>
                {formatoFechaHora(x.created_at)}: vigencia {(x.vigencias ?? []).join(' y ')},{' '}
                {nf(x.registros)} registros, por {x.usuario}
              </div>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Respaldos({ c, demo }: { c: ConfiguracionGeneral; demo: boolean }) {
  const { sistema } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const instalado = demo || tieneRespaldos(c);
  const lista = useQuery({
    queryKey: ['respaldos'],
    queryFn: () => sistema.respaldos(),
    enabled: !demo && instalado
  });
  const [creando, setCreando] = useState(false);
  const crear = async () => {
    setCreando(true);
    try {
      const r = await sistema.crearRespaldo();
      avisar(`Copia creada: ${nf(r.registros)} registros, ${r.kb} KB.`, 'ok');
    } catch (e) {
      avisar('No se pudo crear la copia: ' + (e as Error).message, 'error');
    }
    await Promise.all(
      [['sistema'], ['respaldos'], ['eventos-sistema']].map(k => cliente.invalidateQueries({ queryKey: k }))
    );
    setCreando(false);
  };
  const descargar = async (nombre: string) => {
    try {
      const a = document.createElement('a');
      a.href = await sistema.urlRespaldo(nombre);
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      avisar('No se pudo descargar: ' + (e as Error).message, 'error');
    }
  };
  let caja: ReactNode;
  if (demo) caja = <div className="hint">En modo demostración no se crean copias de seguridad.</div>;
  else if (!instalado)
    caja = (
      <div className="pm-note y">
        Para activarlas, ejecute en Supabase los scripts <Mono>17_respaldos_y_monitoreo.sql</Mono> y{' '}
        <Mono>23_respaldo_texto.sql</Mono>, despliegue la función <Mono>respaldo</Mono> y, para la copia
        semanal, ejecute <Mono>21_programar_tareas_boveda.sql</Mono> (ver docs/RESPALDOS.md).
      </div>
    );
  else
    caja = (
      <>
        <div className="hint" style={{ marginBottom: 10 }}>
          {c.respaldo_ultimo
            ? `Última copia: ${formatoFechaHora(c.respaldo_ultimo)}. ${c.respaldo_ultimo_detalle || ''}`
            : 'Todavía no hay copias. Cree la primera ahora.'}
        </div>
        <button type="button" className="btn primary" disabled={creando} onClick={() => void crear()}>
          <Icono nombre={creando ? 'fa-spinner fa-spin' : 'fa-shield-halved'} />{' '}
          {creando ? 'Creando copia…' : 'Crear copia ahora'}
        </button>
        {lista.isError ? (
          <div className="hint err" style={{ marginTop: 10 }}>
            No se pudo consultar la lista: {(lista.error as Error).message}
          </div>
        ) : lista.data?.length ? (
          <div className="rp-lista">
            {lista.data.map(f => (
              <div key={f.nombre}>
                <span className="mono">{fechaRespaldo(f.nombre)}</span>
                <span className="muted">{f.kb ? f.kb + ' KB' : ''}</span>
                <button type="button" className="btn sm" onClick={() => void descargar(f.nombre)}>
                  <Icono nombre="fa-download" /> Descargar
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </>
    );
  return (
    <div className="card">
      <h3>Copias de seguridad</h3>
      <div className="sub">
        Cada domingo a las 11:00 p. m. se guarda una copia completa de la información (se conservan las 12 más
        recientes). Descargue una copia a su computador al menos una vez al mes.
      </div>
      <div id="rpCaja">{caja}</div>
      <div className="rp-arch">
        <b>Archivos (PDF y documentos)</b>
        <div className="sub">
          La copia anterior guarda los datos. Los archivos se respaldan aparte: verifique que estén completos
          y sin alteraciones, y descárguelos en un ZIP con su manifiesto de huellas digitales.
        </div>
        <div className="hint">
          En la versión 3.0 la verificación y la descarga de archivos llegan con Planes de mejoramiento;
          mientras tanto se hacen en la versión 2.x.
        </div>
      </div>
    </div>
  );
}

function Salud({ c, demo }: { c: ConfiguracionGeneral; demo: boolean }) {
  const { sistema } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const instalado = tieneRespaldos(c);
  const eventos = useQuery({
    queryKey: ['eventos-sistema'],
    queryFn: () => sistema.eventos(),
    enabled: !demo && instalado
  });
  const revisado = async (id: number) => {
    try {
      await sistema.marcarRevisado(id);
      await cliente.invalidateQueries({ queryKey: ['eventos-sistema'] });
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  let caja: ReactNode;
  if (demo) caja = <div className="hint">En modo demostración no hay funciones automáticas.</div>;
  else if (!instalado)
    caja = (
      <div className="hint">
        Disponible al ejecutar el script <Mono>17_respaldos_y_monitoreo.sql</Mono>.
      </div>
    );
  else if (eventos.isPending)
    caja = (
      <div className="hint">
        <Icono nombre="fa-spinner fa-spin" /> Consultando…
      </div>
    );
  else if (eventos.isError) caja = <div className="hint err">{(eventos.error as Error).message}</div>;
  else
    caja = eventos.data.length ? (
      <div className="sl-lista">
        {eventos.data.map(e => (
          <div key={e.id}>
            <span className={'pill ' + (e.nivel === 'error' ? 'rojo' : 'amarillo')}>
              <i />
              {e.nivel === 'error' ? 'Error' : 'Aviso'}
            </span>
            <div>
              <b>{e.mensaje}</b>
              <div className="muted">
                {formatoFechaHora(e.created_at)} · {e.origen}
                {e.usuario ? ' · ' + e.usuario : ''}
              </div>
              {errorDeEvento(e) && <div className="muted mono">{errorDeEvento(e)}</div>}
            </div>
            <button type="button" className="btn sm" onClick={() => void revisado(e.id)}>
              Marcar revisado
            </button>
          </div>
        ))}
      </div>
    ) : (
      <div className="pm-note g" style={{ margin: 0 }}>
        <Icono nombre="fa-circle-check" /> Sin errores pendientes.
      </div>
    );
  return (
    <div className="card">
      <h3>Salud del sistema</h3>
      <div className="sub">
        Errores y avisos de las funciones automáticas (resumen semanal, copias de seguridad) y de la app en
        los equipos de los usuarios.
      </div>
      <div id="slCaja">{caja}</div>
    </div>
  );
}

export function PantallaConfiguracion({ demo = false }: { demo?: boolean }) {
  const { sistema } = useDatos();
  const config = useQuery({ queryKey: ['sistema'], queryFn: () => sistema.general() });
  if (config.isPending) return <p className="cargando">Cargando la configuración…</p>;
  if (config.isError)
    return <Aviso>No se pudo cargar la configuración: {(config.error as Error).message}</Aviso>;
  const c = config.data;
  return (
    <>
      <div className="hint" id="cfVersion" style={{ marginBottom: 12 }}>
        <Icono nombre="fa-circle-info" />{' '}
        {textoVersion(VERSION_APP, demo ? 'demo' : 'institucional', FECHA_CONSTRUCCION)}
      </div>
      <div
        className="grid g-2"
        key={config.dataUpdatedAt /* los formularios toman los valores guardados al volver a leer */}
      >
        <Parametros c={c} />
        <div className="card">
          <h3>Conexión a Supabase</h3>
          <div className="sub">
            {demo
              ? 'Estás en modo demostración: los datos son de ejemplo y viven solo en este navegador.'
              : 'Conectado a tu proyecto Supabase.'}
          </div>
          <div className="hint">
            En la versión 3.0 el proyecto de Supabase se define al construir la aplicación
            (configuracion.json), con su clave pública; no se cambia desde el navegador.
          </div>
        </div>
        <Resumen c={c} demo={demo} />
        <AvisoDiario c={c} demo={demo} />
        <ExcelControl demo={demo} />
        <Respaldos c={c} demo={demo} />
        <Salud c={c} demo={demo} />
      </div>
    </>
  );
}
