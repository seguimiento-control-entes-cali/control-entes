// Importar un plan desde Excel o desde el informe final en PDF (2.x: pmImportModal, pmImpRender y pmDoImport de
// src/js/19-planes-de-mejoramiento.js). Mismo HTML y clases (pm-drop, pm-imp-sum, pm-imp-all, pm-imp-tbl, pm-imp-k).
// El archivo original queda en el archivo documental (script 20). Pendiente para la entrega 4c: sugerir el oficio de
// remisión (en la 2.x solo cuando están instalados los scripts 19 y 20).
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { textoCorto } from '../../dominio/actividad';
import { nombreCorto } from '../../dominio/directorio';
import { fechaColombia, formatoCorto } from '../../dominio/fechas';
import {
  CONNOTACIONES,
  FORMATOS,
  TIPOS_EJERCICIO,
  txt,
  type DatosPlanes,
  type Plan
} from '../../dominio/planes';
import {
  avanceImpTxt,
  cargaImportacion,
  leerInformePdf,
  leerLibroPlan,
  revisarImportacion,
  type Importacion
} from '../../dominio/planes-importar';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import { leerLibroExcel, leerPdf } from './leer-plan';
import { useCopiaDocumento } from './Memoria';
import { useOficios } from './Oficio';
import { oficioSugerido } from '../../dominio/planes-oficio';

type Dep = { id: number; nombre: string };

export function VentanaImportar({
  d,
  deps,
  entes,
  alCerrar,
  alImportar,
  depPropia = null,
  supervisa = true
}: {
  d: DatosPlanes;
  deps: readonly Dep[];
  entes: readonly { id: number; nombre: string }[];
  alCerrar: () => void;
  alImportar: (id: string) => void;
  /** Script 29: si importa una dependencia, su id (sus hallazgos y acciones van a ella; el plan queda en formulación). */
  depPropia?: number | null;
  /** Super administrador o Control Interno: el informe duplicado se puede importar si es versión nueva. */
  supervisa?: boolean;
}) {
  const { planes } = useDatos();
  const avisar = useAvisos();
  const cliente = useQueryClient();
  const hoy = fechaColombia(new Date());
  const oficios = useOficios();
  const [imp, setImp] = useState<Importacion | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [fallo, setFallo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [original, setOriginal] = useState<File | null>(null);
  const copia = useCopiaDocumento();
  const [, setVersion] = useState(0);
  const cambio = () => setVersion(v => v + 1);
  // Informe ya cargado (mismo número y contraloría): la base lo busca aunque el plan sea de otra dependencia
  const [duplicado, setDuplicado] = useState<{ ejercicio: string; creado_por: string }[]>([]);
  const [versionNueva, setVersionNueva] = useState(false);
  const buscarDuplicado = async (x: Importacion) => {
    setDuplicado([]);
    setVersionNueva(false);
    const n = txt(x.plan.numero_informe);
    if (!n) return;
    try {
      setDuplicado(await planes.buscarInforme(txt(x.plan.contraloria), n));
    } catch {
      // sin la búsqueda se sigue: la base igual rechaza el duplicado cuando importa una dependencia
    }
  };
  const previos = { planes: d.planes, hallazgos: d.hallazgos };
  const ordenadas = deps.slice().sort((x, y) => x.nombre.localeCompare(y.nombre));

  const elegir = async (f: File | undefined) => {
    setImp(null);
    setOriginal(f ?? null);
    setFallo('');
    if (!f) return;
    setLeyendo(true);
    try {
      const bytes = await f.arrayBuffer();
      const leido =
        /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
          ? leerInformePdf(await leerPdf(bytes), f.name, deps)
          : leerLibroPlan(await leerLibroExcel(bytes), f.name, deps, previos);
      if (depPropia != null)
        for (const h of leido.hall) {
          // Lo que carga la dependencia: sus hallazgos (puede cambiar los que sean de otra) y todas las acciones suyas
          if (h.dependencia_id == null) h.dependencia_id = depPropia;
          for (const a of h.acciones) a.dependencia_id = depPropia;
        }
      setImp(leido);
    } catch (e) {
      setFallo((e as Error).message);
    } finally {
      setLeyendo(false);
    }
  };
  // pmVal de la 2.x: cada campo del plan se lee sin espacios sobrantes
  const normal = (x: Importacion): Importacion => ({
    ...x,
    plan: {
      ...x.plan,
      contraloria: txt(x.plan.contraloria),
      ejercicio: txt(x.plan.ejercicio),
      fecha_suscripcion: txt(x.plan.fecha_suscripcion),
      tipo_ejercicio: txt(x.plan.tipo_ejercicio),
      numero_informe: txt(x.plan.numero_informe),
      representante_legal: txt(x.plan.representante_legal)
    }
  });
  // Se revisa al leer el archivo y cada vez que cambia el número del informe o la contraloría
  const numeroInforme = imp ? txt(imp.plan.numero_informe) : '';
  const contraloriaInforme = imp ? txt(imp.plan.contraloria) : '';
  useEffect(() => {
    if (imp) void buscarDuplicado(imp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imp, numeroInforme, contraloriaInforme]);
  // Script 29: la dependencia debe escribir el número del informe (el PM_01 de la Contraloría no lo trae)
  const faltaNumero = depPropia != null && !!imp && !numeroInforme;
  const k = imp ? revisarImportacion(normal(imp), previos, hoy) : null;
  const importar = async () => {
    if (!imp || !k || k.err.length) return;
    setOcupado(true);
    try {
      const carga = cargaImportacion(normal(imp), entes, hoy);
      const sug = oficioSugerido(imp.plan as unknown as Plan, oficios);
      if (d.v19) Object.assign(carga.plan, { requerimiento_id: sug?.id ?? null });
      if (d.v20) Object.assign(carga.plan, { fecha_radicacion_informe: sug?.fecha_radicacion ?? null });
      const id = await planes.importar(carga);
      avisar(`Plan importado: ${carga.hallazgos.length} hallazgos y ${k.nAcc} acciones`, 'ok');
      await Promise.all([
        cliente.invalidateQueries({ queryKey: ['planes'] }),
        cliente.invalidateQueries({ queryKey: ['auditoria'] })
      ]);
      // memoria: el archivo original queda en el archivo documental del plan
      await copia(
        original,
        {
          plan_id: id,
          tipo: imp.desdePdf ? 'informe_final' : 'plan_excel',
          observaciones: 'Archivo original importado'
        },
        d.v20
      );
      await cliente.invalidateQueries({ queryKey: ['planes'] });
      alImportar(id);
    } catch (e) {
      avisar((e as Error).message, 'error');
      setOcupado(false);
    }
  };
  const opciones = (
    <>
      <option value="">— Sin asignar —</option>
      {ordenadas.map(x => (
        <option key={x.id} value={x.id}>
          {nombreCorto(x.nombre)}
        </option>
      ))}
    </>
  );
  const acc = imp ? imp.hall.flatMap(h => h.acciones.map(a => ({ h, a }))) : [];
  const p = imp?.plan;
  const rojo = k ? k.warn.filter(w => w.n === 'r') : [];
  const amar = k ? k.warn.filter(w => w.n !== 'r') : [];
  const lista = (l: string[], max: number) => (
    <>
      <ul>
        {l.slice(0, max).map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
      {l.length > max && <div>… y {l.length - max} más</div>}
    </>
  );
  return (
    <Modal
      abierto
      ancha
      titulo="Importar plan de mejoramiento desde Excel"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              !k ||
              k.err.length > 0 ||
              ocupado ||
              faltaNumero ||
              (duplicado.length > 0 && (!supervisa || !versionNueva))
            }
            onClick={() => void importar()}
          >
            <Icono nombre={ocupado ? 'fa-spinner fa-spin' : 'fa-file-import'} />{' '}
            {ocupado ? 'Importando…' : 'Importar'}
          </button>
        </>
      }
    >
      <div className="pm-drop">
        <Icono nombre="fa-file-excel" />
        <b>Selecciona el plan en Excel (.xlsx, .xls) o el informe final en PDF</b>
        <div className="muted">
          Excel: formato PM_01 de la Contraloría General de Santiago de Cali o Formularios 14 / 14.1 de la
          Contraloría General de la República. PDF: el informe final con los hallazgos; se crea el plan en
          formulación para agregar las acciones con sugerencias.
        </div>
        <input
          type="file"
          aria-label="Archivo del plan o del informe final"
          accept=".xlsx,.xls,.pdf,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={e => void elegir(e.target.files?.[0])}
        />
      </div>
      {leyendo && (
        <div className="empty">
          <Icono nombre="fa-spinner fa-spin" />
          Leyendo el archivo…
        </div>
      )}
      {fallo && (
        <div className="pm-note r">
          <Icono nombre="fa-circle-exclamation" /> {fallo}
        </div>
      )}
      {duplicado.length > 0 && (
        <div className="pm-note r" role="alert">
          <Icono nombre="fa-circle-exclamation" /> <b>Este informe ya fue cargado</b> (n.º{' '}
          {txt(imp?.plan.numero_informe)}): «{duplicado[0]?.ejercicio}»
          {duplicado[0]?.creado_por ? <>, por {duplicado[0].creado_por}</> : null}.{' '}
          {supervisa ? (
            <label style={{ display: 'block', marginTop: 6 }}>
              <input
                type="checkbox"
                checked={versionNueva}
                onChange={e => setVersionNueva(e.target.checked)}
              />{' '}
              Es una versión nueva o una reformulación: importarlo de todas formas
            </label>
          ) : (
            <>
              No se carga dos veces: pida a Control Interno que le asigne sus hallazgos en el plan que ya
              existe.
            </>
          )}
        </div>
      )}
      {faltaNumero && (
        <div className="pm-note r" role="alert">
          <Icono nombre="fa-circle-exclamation" /> Escriba el <b>N.º del informe final</b> de la Contraloría
          (abajo): con él se comprueba que el informe no lo haya cargado ya otra dependencia.
        </div>
      )}
      {depPropia != null && imp && (
        <div className="pm-note">
          <Icono nombre="fa-circle-info" /> El plan queda <b>en formulación</b>: su dependencia formula el
          análisis de causa y las acciones de cada hallazgo y los envía a Control Interno. Solo se importan
          las acciones de su dependencia; los avances del archivo no se importan (se reportan con su soporte).
        </div>
      )}
      {imp && p && k && (
        <>
          <div className="pm-imp-sum">
            <span
              className={
                'pm-ctl ' + (imp.formato === 'F14_CGR' ? 'cgr' : imp.formato === 'PM_01_CGSC' ? 'cgsc' : '')
              }
            >
              {(FORMATOS[imp.formato] ?? FORMATOS.OTRO)?.nombre}
            </span>
            <span className="muted">
              {imp.desdePdf ? 'Informe final en PDF' : 'Hoja «' + imp.hoja + '»'} · {imp.hall.length}{' '}
              hallazgos · {acc.length} acciones
            </span>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="pmIFmt">Formato</label>
              <select
                id="pmIFmt"
                value={p.formato}
                onChange={e => {
                  p.formato = e.target.value;
                  const f = FORMATOS[p.formato];
                  if (f && f.contraloria) p.contraloria = f.contraloria;
                  cambio();
                }}
              >
                {Object.entries(FORMATOS).map(([kf, v]) => (
                  <option key={kf} value={kf}>
                    {v.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pmICtl">Contraloría *</label>
              <input
                id="pmICtl"
                value={p.contraloria}
                onChange={e => {
                  p.contraloria = e.target.value;
                  cambio();
                }}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pmIEje">Nombre del ejercicio de fiscalización *</label>
            <textarea
              id="pmIEje"
              rows={2}
              value={p.ejercicio}
              onChange={e => {
                p.ejercicio = e.target.value;
                cambio();
              }}
            />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="pmIFs">
                {imp.desdePdf ? 'Fecha de suscripción (provisional)' : 'Fecha de suscripción *'}
              </label>
              <input
                id="pmIFs"
                type="date"
                value={p.fecha_suscripcion}
                onChange={e => {
                  p.fecha_suscripcion = e.target.value;
                  cambio();
                }}
              />
              {imp.desdePdf && (
                <div className="hint">
                  Si la deja vacía se usa la fecha del informe; actualícela al firmar el plan
                </div>
              )}
            </div>
            <div className="field">
              <label htmlFor="pmITipo">Tipo de ejercicio</label>
              <input
                id="pmITipo"
                list="pmTiposImp"
                value={p.tipo_ejercicio}
                onChange={e => {
                  p.tipo_ejercicio = e.target.value;
                  cambio();
                }}
              />
              <datalist id="pmTiposImp">
                {TIPOS_EJERCICIO.map(t => (
                  <option key={t}>{t}</option>
                ))}
              </datalist>
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="pmIInf">N.º del informe final</label>
              <input
                id="pmIInf"
                value={p.numero_informe}
                onChange={e => {
                  p.numero_informe = e.target.value;
                  cambio();
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="pmIRep">Representante legal</label>
              <input
                id="pmIRep"
                value={p.representante_legal}
                onChange={e => {
                  p.representante_legal = e.target.value;
                  cambio();
                }}
              />
            </div>
          </div>
          {imp.formato === 'F14_CGR' && imp.fevalRaw ? (
            <div className="hint" style={{ margin: '-6px 0 10px' }}>
              Fecha de evaluación del Formulario 14.1:{' '}
              {imp.feval ? formatoCorto(imp.feval) : 'no reconocida («' + txt(imp.fevalRaw) + '»)'}. Es la
              fecha de corte de los avances importados.
            </div>
          ) : null}
          {imp.desdePdf && (
            <div className="field">
              <label>Hallazgos leídos del informe y dependencia responsable</label>
              <div className="tbl-wrap pm-imp-tbl">
                <table className="tbl" style={{ minWidth: 720 }} aria-label="Hallazgos leídos del informe">
                  <thead>
                    <tr>
                      <th>Pág.</th>
                      <th>N.º</th>
                      <th>Hallazgo</th>
                      <th>Incidencia</th>
                      <th>Dependencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {imp.hall.map((h, i) => (
                      <tr key={i}>
                        <td className="mono">{h.fila}</td>
                        <td className="mono">{h.numero}</td>
                        <td className="asunto">
                          {textoCorto(h.descripcion, 110)}
                          {h.causa && (
                            <div className="muted" style={{ fontSize: '.72rem' }}>
                              <b>Causa:</b> {textoCorto(h.causa, 110)}
                            </div>
                          )}
                        </td>
                        <td>
                          {h.connotaciones.map(c => (
                            <span key={c} className={'pm-conn c-' + c}>
                              {CONNOTACIONES[c] || c}
                            </span>
                          ))}
                        </td>
                        <td>
                          <select
                            aria-label={'Dependencia del hallazgo ' + h.numero}
                            value={h.dependencia_id ?? ''}
                            onChange={e => {
                              h.dependencia_id = e.target.value ? Number(e.target.value) : null;
                              cambio();
                            }}
                          >
                            {opciones}
                          </select>
                          {h.dependencia && (
                            <div className="muted" style={{ fontSize: '.7rem' }}>
                              {textoCorto(h.dependencia, 50)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="field" hidden={!!imp.desdePdf}>
            <label>Dependencia responsable de cada acción</label>
            <div className="pm-imp-all">
              <span className="muted" style={{ fontSize: '.78rem' }}>
                Asignar a todas las que están sin asignar:
              </span>
              <select
                aria-label="Asignar a todas las que están sin asignar"
                value=""
                onChange={e => {
                  const v = e.target.value;
                  if (!v) return;
                  acc.forEach(({ a }) => {
                    if (!a.dependencia_id) a.dependencia_id = Number(v);
                  });
                  cambio();
                }}
              >
                {opciones}
              </select>
            </div>
            <div className="tbl-wrap pm-imp-tbl">
              <table className="tbl" style={{ minWidth: 720 }} aria-label="Acciones a importar">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Hallazgo</th>
                    <th>Acción</th>
                    <th>Termina</th>
                    <th>Avance</th>
                    <th>Dependencia</th>
                  </tr>
                </thead>
                <tbody>
                  {acc.map(({ h, a }, i) => (
                    <tr key={i}>
                      <td className="mono">{a.fila}</td>
                      <td className="mono">{h.numero}</td>
                      <td className="asunto">
                        {textoCorto(a.accion, 80)}
                        <div className="muted" style={{ fontSize: '.72rem' }}>
                          {textoCorto(a.responsable, 70)}
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {a.ffin ? (
                          formatoCorto(a.ffin)
                        ) : (
                          <span style={{ color: 'var(--redink)' }}>{txt(a.ffinRaw) || '—'}</span>
                        )}
                      </td>
                      <td className="mono">{avanceImpTxt(a)}</td>
                      <td>
                        <select
                          aria-label={'Dependencia de la fila ' + a.fila}
                          value={a.dependencia_id ?? ''}
                          onChange={e => {
                            a.dependencia_id = e.target.value ? Number(e.target.value) : null;
                            cambio();
                          }}
                        >
                          {opciones}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pm-imp-k">
            <span className="pm-chip">{imp.hall.length} hallazgos</span>
            <span className="pm-chip">{k.nAcc} acciones</span>
            <span className="pm-chip g">{k.nAv} avances a importar como validados</span>
            {k.err.length ? (
              <span className="pm-chip r">{k.err.length} error(es)</span>
            ) : (
              <span className="pm-chip g">Sin errores</span>
            )}
            {k.warn.length > 0 && <span className="pm-chip y">{k.warn.length} aviso(s)</span>}
          </div>
          {k.err.length > 0 && (
            <div className="pm-note r">
              <b>Corrige antes de importar:</b>
              {lista(k.err, 40)}
            </div>
          )}
          {rojo.length > 0 && (
            <div className="pm-note r">
              {lista(
                rojo.map(w => w.t),
                30
              )}
              <div>
                Puedes importar así y asignarlas después, pero mientras no tengan dependencia nadie las verá
                ni reportará su avance.
              </div>
            </div>
          )}
          {amar.length > 0 && (
            <div className="pm-note y">
              {lista(
                amar.map(w => w.t),
                30
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
