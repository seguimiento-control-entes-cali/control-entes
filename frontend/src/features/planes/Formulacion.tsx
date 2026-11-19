// Planes de mejoramiento · QUIÉN HACE QUÉ (script 28, pedido de Control Interno del 17-nov-2026).
// En cada hallazgo: el estado de su formulación, el análisis de causa en el formato de Calidad MEDE01.05.02.P019.F002
// (4 pestañas) que diligencia la dependencia dueña del hallazgo, y los botones de cada rol:
//   · dependencia: diligenciar el análisis, formular acciones y «Enviar a Control Interno»;
//   · Control Interno: ver lo que hizo la dependencia y «Validar» o «Devolver» con observación;
//   · todos los que ven el hallazgo: descargar el formato en Excel con su diseño oficial.
// Solo se muestra si la base tiene el script 28 (d.v28); sin él la pantalla funciona como antes.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatoFechaHora } from '../../dominio/auditoria';
import {
  CATEGORIAS_ESPINA,
  METODOS_CAUSA,
  type CategoriaEspina,
  type DetalleCausas
} from '../../dominio/detalle-causas';
import {
  formatoConDatos,
  LIMITES_FORMATO,
  llenarFormatoCausas,
  nombreFormatoCausas
} from '../../dominio/formato-causas';
import {
  ESTADOS_FORMULACION,
  estadoDe,
  faltaParaEnviar,
  puedeEnviar,
  puedeFormular,
  puedeRevisarFormulacion
} from '../../dominio/formulacion';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto } from '../../dominio/historico';
import type { Accion, Hallazgo } from '../../dominio/planes';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { cargarSheetJS } from '../configuracion/leer-excel';
import { useDatos } from '../sesion/contexto';
import formatoCausasUrl from '../../../plantillas/MEDE01.05.02.P019.F002_base.xlsx?url';

/** Largo máximo de cada causa de la espina: el formato tiene líneas cortas. */
const LARGO_ESPINA = 60;

/** Descarga el formato de Calidad lleno con su diseño. */
async function descargarFormato(h: Hallazgo) {
  const X = await cargarSheetJS();
  const r = await fetch(formatoCausasUrl);
  if (!r.ok)
    throw new Error('No se pudo cargar el formato de Calidad. Revise la conexión e inténtelo de nuevo.');
  const d: DetalleCausas = { no_conformidad: h.descripcion, ...(h.causa_detalle ?? {}) };
  const bin = llenarFormatoCausas(X, new Uint8Array(await r.arrayBuffer()), d);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([bin.slice().buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  );
  a.download = nombreFormatoCausas(h.numero);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function BloqueFormulacion({
  h,
  acciones,
  rol,
  depPropia,
  nuevaAccion
}: {
  h: Hallazgo;
  acciones: readonly Accion[];
  rol: string;
  depPropia: number | null;
  nuevaAccion: () => void;
}) {
  const { planes } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [ventana, setVentana] = useState<'analisis' | 'devolver' | 'sia' | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const estado = estadoDe(h);
  const info = ESTADOS_FORMULACION[estado];
  const formula = puedeFormular(h, rol, depPropia);
  const revisa = puedeRevisarFormulacion(h, rol);
  const falta = faltaParaEnviar(h, acciones);
  const metodo = METODOS_CAUSA.find(([k]) => k === h.causa_metodo)?.[1];
  const conFormato = formatoConDatos(h.causa_detalle);
  const recargar = () => cliente.invalidateQueries({ queryKey: ['planes'] });
  const ejecutar = async (f: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await f();
      await recargar();
      avisar(ok, 'ok');
      return true;
    } catch (e) {
      avisar((e as Error).message, 'error');
      return false;
    } finally {
      setOcupado(false);
    }
  };
  const puedeSia =
    estado === 'validado' &&
    !h.sia_cargado_at &&
    (['admin', 'control_interno'].includes(rol) ||
      (['secretario', 'enlace'].includes(rol) && String(h.dependencia_id ?? '') === String(depPropia)));

  return (
    <div
      className="pm-formulacion"
      style={{ margin: '8px 0', padding: '8px 10px', borderLeft: '3px solid var(--line, #ccc)' }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: '.82rem' }}>Formulación:</b>
        <span className={'pill ' + info.clase} title={info.ayuda}>
          {info.texto}
        </span>
        {h.sia_cargado_at && (
          <span className="pill verde" title="Fecha en que la dependencia lo cargó en el SIA Contralorías">
            Cargado en SIA {formatoCorto(h.sia_cargado_at)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={() => setVentana('analisis')}>
          <Icono nombre={formula ? 'fa-pen' : 'fa-eye'} />{' '}
          {formula ? 'Análisis de causa' : 'Ver análisis de causa'}
        </button>
        {conFormato && (
          <button
            type="button"
            className="btn sm"
            title="Formato MEDE01.05.02.P019.F002 con su diseño oficial"
            onClick={() => descargarFormato(h).catch(e => avisar((e as Error).message, 'error'))}
          >
            <Icono nombre="fa-file-excel" /> Formato de Calidad
          </button>
        )}
        {formula && (
          <button type="button" className="btn sm" onClick={nuevaAccion}>
            <Icono nombre="fa-plus" /> Acción
          </button>
        )}
        {puedeEnviar(h, rol, depPropia) && (
          <button
            type="button"
            className="btn sm primary"
            disabled={ocupado || falta.length > 0}
            title={
              falta.length ? 'Falta: ' + falta.join('; ') : 'Enviar a Control Interno para su validación'
            }
            onClick={() =>
              void ejecutar(
                () => planes.enviarFormulacion(h.id),
                'Enviado a Control Interno para su validación'
              )
            }
          >
            <Icono nombre="fa-paper-plane" /> Enviar a Control Interno
          </button>
        )}
        {revisa && (
          <>
            <button
              type="button"
              className="btn sm primary"
              disabled={ocupado}
              onClick={() =>
                void ejecutar(
                  () => planes.revisarFormulacion(h.id, 'validado', ''),
                  'Formulación validada: la dependencia ya puede cargarla en el SIA'
                )
              }
            >
              <Icono nombre="fa-check" /> Validar
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={ocupado}
              onClick={() => setVentana('devolver')}
            >
              <Icono nombre="fa-rotate-left" /> Devolver
            </button>
          </>
        )}
        {puedeSia && (
          <button type="button" className="btn sm" onClick={() => setVentana('sia')}>
            <Icono nombre="fa-cloud-arrow-up" /> Registrar cargue en SIA
          </button>
        )}
      </div>
      {metodo && h.causa_raiz && (
        <div style={{ fontSize: '.82rem', marginTop: 6 }}>
          <b>Causa raíz</b> ({metodo}): {h.causa_raiz}
        </div>
      )}
      {formula && falta.length > 0 && (
        <div className="hint" style={{ marginTop: 4 }}>
          Para enviar a Control Interno falta: {falta.join('; ')}.
        </div>
      )}
      {estado === 'devuelto' && h.formulacion_obs && (
        <div className="hint err" role="note" style={{ marginTop: 6 }}>
          <b>Observación de Control Interno:</b> {h.formulacion_obs}
          {h.formulacion_revisado_por && <> · {h.formulacion_revisado_por}</>}
        </div>
      )}
      {estado === 'enviado' && h.formulacion_enviado_at && (
        <div className="muted" style={{ fontSize: '.76rem', marginTop: 4 }}>
          Enviado por {h.formulacion_enviado_por || 'la dependencia'} el{' '}
          {formatoFechaHora(h.formulacion_enviado_at)}
        </div>
      )}
      {estado === 'validado' && h.formulacion_revisado_at && (
        <div className="muted" style={{ fontSize: '.76rem', marginTop: 4 }}>
          Validado por {h.formulacion_revisado_por} el {formatoFechaHora(h.formulacion_revisado_at)}
          {h.formulacion_obs && <> · {h.formulacion_obs}</>}
        </div>
      )}

      {ventana === 'analisis' && (
        <VentanaAnalisis
          h={h}
          editable={formula}
          alCerrar={() => setVentana(null)}
          alGuardar={async v => {
            const ok = await ejecutar(
              () => planes.guardar('hall', { ...v }, h.id),
              'Análisis de causa guardado'
            );
            if (ok) setVentana(null);
          }}
        />
      )}
      {ventana === 'devolver' && (
        <VentanaDevolver
          ocupado={ocupado}
          alCerrar={() => setVentana(null)}
          alDevolver={async obs => {
            const ok = await ejecutar(
              () => planes.revisarFormulacion(h.id, 'devuelto', obs),
              'Devuelto a la dependencia con su observación'
            );
            if (ok) setVentana(null);
          }}
        />
      )}
      {ventana === 'sia' && (
        <VentanaSia
          ocupado={ocupado}
          alCerrar={() => setVentana(null)}
          alRegistrar={async fecha => {
            const ok = await ejecutar(
              () => planes.marcarSia(h.plan_id, fecha),
              'Cargue en el SIA registrado para los hallazgos validados del plan'
            );
            if (ok) setVentana(null);
          }}
        />
      )}
    </div>
  );
}

const PESTANAS = [
  ['general', 'Resumen'],
  ['lluvia', 'Lluvia de ideas'],
  ['espina', 'Causa - efecto'],
  ['porques', '5 porqués'],
  ['arbol', 'Árbol de problemas']
] as const;

function VentanaAnalisis({
  h,
  editable,
  alCerrar,
  alGuardar
}: {
  h: Hallazgo;
  editable: boolean;
  alCerrar: () => void;
  alGuardar: (v: { causa_metodo: string; causa_raiz: string; causa_detalle: DetalleCausas }) => Promise<void>;
}) {
  const [tab, setTab] = useState<(typeof PESTANAS)[number][0]>('general');
  const [metodo, setMetodo] = useState(h.causa_metodo || '');
  const [raiz, setRaiz] = useState(h.causa_raiz || '');
  const [d, setD] = useState<DetalleCausas>(() => ({
    no_conformidad: h.descripcion,
    ...(h.causa_detalle ?? {})
  }));
  const [ocupado, setOcupado] = useState(false);
  const pon = (c: Partial<DetalleCausas>) => setD(x => ({ ...x, ...c }));
  const lista = <T,>(arr: T[] | undefined, n: number, vacio: T) =>
    Array.from({ length: n }, (_, i) => arr?.[i] ?? vacio);
  const lluvia = lista(d.lluvia, LIMITES_FORMATO.lluvia, { idea: '', descartada: '' });
  const participantes = lista(d.participantes, LIMITES_FORMATO.participantes, '');
  const filasPorques = Math.min(LIMITES_FORMATO.cinco_porques, Math.max(1, (d.cinco_porques ?? []).length));
  const porques = lista(d.cinco_porques, filasPorques, {
    problema: '',
    porques: ['', '', '', '', ''],
    resultado: ''
  });
  const filasArbol = Math.min(LIMITES_FORMATO.arbol, Math.max(1, (d.arbol ?? []).length));
  const arbol = lista(d.arbol, filasArbol, { problema: '', causa: '', subcausa: '', efecto: '' });
  const id = (s: string) => `ac-${h.id}-${s}`;

  const guardar = async () => {
    setOcupado(true);
    try {
      await alGuardar({ causa_metodo: metodo, causa_raiz: raiz.trim(), causa_detalle: d });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      abierto
      ancha
      titulo={`Análisis de causa · Hallazgo ${h.numero}`}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            {editable ? 'Cancelar' : 'Cerrar'}
          </button>
          {editable && (
            <button type="button" className="btn primary" disabled={ocupado} onClick={() => void guardar()}>
              <Icono nombre="fa-floppy-disk" /> Guardar
            </button>
          )}
        </>
      }
    >
      <div className="hint" style={{ marginBottom: 10 }}>
        Formato de Calidad <b>MEDE01.05.02.P019.F002</b> · Herramientas análisis de causas para planes de
        mejoramiento por proceso.{' '}
        {editable
          ? 'Lo diligencia la dependencia responsable del hallazgo; Control Interno lo revisa.'
          : 'Diligenciado por la dependencia responsable del hallazgo (solo lectura).'}
      </div>
      <div
        className="seg"
        style={{ marginBottom: 12, flexWrap: 'wrap' }}
        role="tablist"
        aria-label="Herramientas"
      >
        {PESTANAS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : ''}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <fieldset disabled={!editable || ocupado} style={{ border: 0, padding: 0, margin: 0 }}>
        {tab === 'general' && (
          <>
            <div className="muted" style={{ fontSize: '.82rem', marginBottom: 8 }}>
              <b>Hallazgo:</b> {h.descripcion}
            </div>
            <div className="field">
              <label htmlFor={id('metodo')}>Herramienta principal del análisis</label>
              <select id={id('metodo')} value={metodo} onChange={e => setMetodo(e.target.value)}>
                <option value="">Seleccione…</option>
                {METODOS_CAUSA.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={id('raiz')}>Causa raíz (conclusión del análisis)</label>
              <textarea id={id('raiz')} rows={3} value={raiz} onChange={e => setRaiz(e.target.value)} />
              <div className="hint">Es la causa que deben eliminar las acciones del plan.</div>
            </div>
            <div className="row2">
              {(
                [
                  ['macroproceso', 'Macroproceso'],
                  ['macroproceso_codigo', 'Código'],
                  ['proceso', 'Proceso'],
                  ['proceso_codigo', 'Código'],
                  ['subproceso', 'Subproceso'],
                  ['subproceso_codigo', 'Código']
                ] as const
              ).map(([k, l]) => (
                <div className="field" key={k}>
                  <label htmlFor={id(k)}>{l}</label>
                  <input id={id(k)} value={d[k] ?? ''} onChange={e => pon({ [k]: e.target.value })} />
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'lluvia' && (
          <>
            <div className="field">
              <label>Nombres de los participantes</label>
              {participantes.map((p, i) => (
                <input
                  key={i}
                  aria-label={`Participante ${i + 1}`}
                  style={{ marginBottom: 4 }}
                  value={p}
                  onChange={e => {
                    const n = [...participantes];
                    n[i] = e.target.value;
                    pon({ participantes: n });
                  }}
                />
              ))}
            </div>
            <div className="field">
              <label htmlFor={id('nc')}>Descripción de la no conformidad</label>
              <textarea
                id={id('nc')}
                rows={2}
                value={d.no_conformidad ?? ''}
                onChange={e => pon({ no_conformidad: e.target.value })}
              />
            </div>
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>No.</th>
                  <th>Lluvia de ideas (opiniones del equipo)</th>
                  <th>Ideas duplicadas / no consideradas</th>
                </tr>
              </thead>
              <tbody>
                {lluvia.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <input
                        aria-label={`Idea ${i + 1}`}
                        value={l.idea}
                        onChange={e => {
                          const n = lluvia.map(x => ({ ...x }));
                          n[i] = { ...n[i], idea: e.target.value, descartada: n[i]?.descartada ?? '' };
                          pon({ lluvia: n });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Idea ${i + 1} duplicada o no considerada`}
                        value={l.descartada ?? ''}
                        onChange={e => {
                          const n = lluvia.map(x => ({ ...x }));
                          n[i] = { idea: n[i]?.idea ?? '', descartada: e.target.value };
                          pon({ lluvia: n });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor={id('raizll')}>Causa raíz (lluvia de ideas)</label>
              <textarea
                id={id('raizll')}
                rows={2}
                value={d.causa_raiz_lluvia ?? ''}
                onChange={e => pon({ causa_raiz_lluvia: e.target.value })}
              />
            </div>
          </>
        )}

        {tab === 'espina' && (
          <>
            <div className="hint" style={{ marginBottom: 8 }}>
              Hasta 2 causas por categoría, cortas (máximo {LARGO_ESPINA} caracteres): en el formato van sobre
              las líneas de la espina.
            </div>
            <div className="row2">
              {CATEGORIAS_ESPINA.map(([k, l]) => (
                <div className="field" key={k}>
                  <label>{l}</label>
                  {[0, 1].map(i => (
                    <input
                      key={i}
                      aria-label={`${l}: causa ${i + 1}`}
                      maxLength={LARGO_ESPINA}
                      style={{ marginBottom: 4 }}
                      value={d.espina?.[k as CategoriaEspina]?.[i] ?? ''}
                      onChange={e => {
                        const actual = [...(d.espina?.[k as CategoriaEspina] ?? ['', ''])];
                        actual[i] = e.target.value;
                        pon({ espina: { ...(d.espina ?? {}), [k]: actual } });
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'porques' && (
          <>
            {porques.map((f, i) => (
              <div key={i} className="card" style={{ padding: 10, marginBottom: 8 }}>
                <div className="field">
                  <label>Descripción del problema o hallazgo</label>
                  <input
                    aria-label={`Problema ${i + 1}`}
                    value={f.problema}
                    onChange={e => {
                      const n = porques.map(x => ({ ...x, porques: [...x.porques] }));
                      n[i] = { ...f, porques: [...f.porques], problema: e.target.value };
                      pon({ cinco_porques: n });
                    }}
                  />
                </div>
                {[0, 1, 2, 3, 4].map(j => (
                  <div className="field" key={j}>
                    <label>{j + 1} porqué</label>
                    <input
                      aria-label={`Fila ${i + 1}: ${j + 1} porqué`}
                      value={f.porques[j] ?? ''}
                      onChange={e => {
                        const n = porques.map(x => ({ ...x, porques: [...x.porques] }));
                        const ps = [...f.porques];
                        ps[j] = e.target.value;
                        n[i] = { ...f, porques: ps };
                        pon({ cinco_porques: n });
                      }}
                    />
                  </div>
                ))}
                <div className="field">
                  <label>Resultado del análisis</label>
                  <input
                    aria-label={`Resultado ${i + 1}`}
                    value={f.resultado}
                    onChange={e => {
                      const n = porques.map(x => ({ ...x, porques: [...x.porques] }));
                      n[i] = { ...f, porques: [...f.porques], resultado: e.target.value };
                      pon({ cinco_porques: n });
                    }}
                  />
                </div>
              </div>
            ))}
            {editable && porques.length < LIMITES_FORMATO.cinco_porques && (
              <button
                type="button"
                className="btn sm"
                onClick={() =>
                  pon({
                    cinco_porques: [
                      ...porques,
                      { problema: '', porques: ['', '', '', '', ''], resultado: '' }
                    ]
                  })
                }
              >
                <Icono nombre="fa-plus" /> Otra fila
              </button>
            )}
          </>
        )}

        {tab === 'arbol' && (
          <>
            <table className="tbl" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Descripción de problema</th>
                  <th>Causa</th>
                  <th>Sub causa</th>
                  <th>Efecto</th>
                </tr>
              </thead>
              <tbody>
                {arbol.map((f, i) => (
                  <tr key={i}>
                    {(['problema', 'causa', 'subcausa', 'efecto'] as const).map(k => (
                      <td key={k}>
                        <input
                          aria-label={`Árbol fila ${i + 1}: ${k}`}
                          value={f[k]}
                          onChange={e => {
                            const n = arbol.map(x => ({ ...x }));
                            n[i] = { ...f, [k]: e.target.value };
                            pon({ arbol: n });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {editable && arbol.length < LIMITES_FORMATO.arbol && (
              <button
                type="button"
                className="btn sm"
                style={{ marginTop: 8 }}
                onClick={() =>
                  pon({ arbol: [...arbol, { problema: '', causa: '', subcausa: '', efecto: '' }] })
                }
              >
                <Icono nombre="fa-plus" /> Otra fila
              </button>
            )}
          </>
        )}
      </fieldset>
    </Modal>
  );
}

function VentanaDevolver({
  ocupado,
  alCerrar,
  alDevolver
}: {
  ocupado: boolean;
  alCerrar: () => void;
  alDevolver: (obs: string) => Promise<void>;
}) {
  const [obs, setObs] = useState('');
  return (
    <Modal
      abierto
      titulo="Devolver a la dependencia"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={ocupado || obs.trim().length < 5}
            onClick={() => void alDevolver(obs)}
          >
            <Icono nombre="fa-rotate-left" /> Devolver
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pm-devolver-obs">Ajustes que debe hacer la dependencia</label>
        <textarea id="pm-devolver-obs" rows={4} value={obs} onChange={e => setObs(e.target.value)} />
        <div className="hint">
          La dependencia verá esta observación en el hallazgo y podrá corregir y volver a enviar.
        </div>
      </div>
    </Modal>
  );
}

function VentanaSia({
  ocupado,
  alCerrar,
  alRegistrar
}: {
  ocupado: boolean;
  alCerrar: () => void;
  alRegistrar: (fecha: string) => Promise<void>;
}) {
  const hoy = fechaColombia(new Date());
  const [fecha, setFecha] = useState(hoy);
  return (
    <Modal
      abierto
      titulo="Registrar cargue en el SIA Contralorías"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={ocupado || !fecha || fecha > hoy}
            onClick={() => void alRegistrar(fecha)}
          >
            <Icono nombre="fa-check" /> Registrar
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="pm-sia-fecha">Fecha en que se cargó en el SIA</label>
        <input
          id="pm-sia-fecha"
          type="date"
          max={hoy}
          value={fecha}
          onChange={e => setFecha(e.target.value)}
        />
        <div className="hint">
          Se registra para todos los hallazgos validados de su dependencia en este plan.
        </div>
      </div>
    </Modal>
  );
}
