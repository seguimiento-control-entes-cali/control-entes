// Formularios de planes de mejoramiento (2.x: pmPlanModal/pmSavePlan, pmHallModal/pmSaveHall, pmAccModal/pmSaveAcc,
// pmReportModal/pmSaveAv, pmReviewModal/pmDoReview, pmCalModal/pmSaveCal y pmObsModal/pmObsGuardar de
// src/js/19-planes-de-mejoramiento.js). Mismos campos, validaciones y mensajes. Mismo HTML y clases (row2, field,
// pm-ctx, pm-info, pm-quote, pm-checks, pm-note).
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { textoCorto } from '../../dominio/actividad';
import { formatoFechaHora } from '../../dominio/auditoria';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto } from '../../dominio/historico';
import {
  CONNOTACIONES,
  ESTADO_PLAN,
  FORMATOS,
  RESOLUCIONES,
  TEXTO_CALIFICACION,
  TIPOS_EJERCICIO,
  calificacionAccion,
  columnasInstaladas,
  fechaPlan,
  llave,
  metaTxt,
  numTxt,
  numero,
  pct,
  pctTxt,
  problemasAccion,
  resolucionInfo,
  txt,
  ultimo,
  validarAccion,
  validarAvance,
  validarDevolucion,
  validarHallazgo,
  validarPlan,
  type Accion,
  type Avance,
  type DatosPlanes,
  type Hallazgo,
  type Plan
} from '../../dominio/planes';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

type Dep = { id: number; nombre: string; activo?: boolean };

function Campo({
  id,
  label,
  hint,
  children
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
function Pie({
  alCerrar,
  guardar,
  ocupado,
  texto = 'Guardar',
  icono = 'fa-floppy-disk'
}: {
  alCerrar: () => void;
  guardar: () => void;
  ocupado?: boolean;
  texto?: string;
  icono?: string;
}) {
  return (
    <>
      <button type="button" className="btn" onClick={alCerrar}>
        Cancelar
      </button>
      <button type="button" className="btn primary" disabled={ocupado} onClick={guardar}>
        <Icono nombre={icono} /> {texto}
      </button>
    </>
  );
}
/** Refresca los planes (y lo que depende de ellos) después de guardar. */
function useRefrescar() {
  const cliente = useQueryClient();
  return () => Promise.all([['planes'], ['auditoria']].map(k => cliente.invalidateQueries({ queryKey: k })));
}

// ---------- plan ----------
export function VentanaPlan({
  p,
  alCerrar,
  alGuardar,
  d
}: {
  p: Plan | null;
  alCerrar: () => void;
  alGuardar: (id: string) => void;
  d: DatosPlanes;
}) {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const e: Partial<Plan> = p ?? {
    formato: 'PM_01_CGSC',
    contraloria: FORMATOS.PM_01_CGSC?.contraloria,
    entidad: 'Distrito Especial de Santiago de Cali',
    estado: 'en_ejecucion'
  };
  const [f, setF] = useState({
    formato: e.formato ?? 'PM_01_CGSC',
    contraloria: e.contraloria ?? '',
    ejercicio: e.ejercicio ?? '',
    tipo_ejercicio: e.tipo_ejercicio ?? '',
    fecha_suscripcion: e.fecha_suscripcion ?? '',
    vigencia_pvcft: e.vigencia_pvcft ?? '',
    periodo_auditado: e.periodo_auditado ?? '',
    modalidad: e.modalidad ?? '',
    nit: e.nit ?? '',
    numero_informe: e.numero_informe ?? '',
    fecha_informe: e.fecha_informe ?? '',
    radicado_orfeo: e.radicado_orfeo ?? '',
    estado: e.estado ?? 'en_ejecucion',
    resolucion: e.resolucion ?? '',
    fecha_radicacion_informe: e.fecha_radicacion_informe ?? '',
    direccion_tecnica: e.direccion_tecnica ?? '',
    entidad: e.entidad ?? '',
    representante_legal: e.representante_legal ?? '',
    ordenador_gasto: e.ordenador_gasto ?? '',
    observaciones: e.observaciones ?? ''
  });
  const [ocupado, setOcupado] = useState(false);
  const cambiar = (k: keyof typeof f) => (ev: { target: { value: string } }) =>
    setF({ ...f, [k]: ev.target.value });
  const guardar = async () => {
    const o: Record<string, unknown> = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, txt(v)]));
    o.fecha_informe = o.fecha_informe || null;
    // pmSavePlan: las columnas de los scripts 19 y 20 solo se envían si están instalados
    columnasInstaladas(o, d);
    if (o.fecha_radicacion_informe && !fechaPlan(o.fecha_radicacion_informe))
      return avisar('La fecha de radicación del informe no es válida', 'error');
    o.entidad = o.entidad || 'Distrito Especial de Santiago de Cali';
    const err = validarPlan(
      o as Pick<Plan, 'contraloria' | 'ejercicio' | 'fecha_suscripcion'> & { fecha_informe?: string | null }
    );
    if (err) return avisar(err, 'error');
    if (p) {
      const fuera = d.acciones.filter(
        a => a.plan_id === p.id && a.fecha_fin < String(o.fecha_suscripcion)
      ).length;
      if (
        fuera &&
        !window.confirm(
          `${fuera} acción(es) terminan antes de la nueva fecha de suscripción. ¿Guardar de todas formas?`
        )
      )
        return;
    }
    setOcupado(true);
    try {
      const id = await planes.guardar('plan', o, p?.id ?? null);
      avisar(p ? 'Plan actualizado' : 'Plan creado. Ahora agrega sus hallazgos y acciones.', 'ok');
      await refrescar();
      alGuardar(id);
    } catch (er) {
      avisar((er as Error).message, 'error');
      setOcupado(false);
    }
  };
  const tipos =
    f.tipo_ejercicio && !TIPOS_EJERCICIO.includes(f.tipo_ejercicio)
      ? [...TIPOS_EJERCICIO, f.tipo_ejercicio]
      : TIPOS_EJERCICIO;
  return (
    <Modal
      abierto
      ancha
      titulo={p ? 'Editar plan de mejoramiento' : 'Nuevo plan de mejoramiento'}
      alCerrar={alCerrar}
      pie={<Pie alCerrar={alCerrar} guardar={() => void guardar()} ocupado={ocupado} />}
    >
      <div className="row2">
        <Campo id="pmPFmt" label="Formato">
          <select
            id="pmPFmt"
            value={f.formato}
            onChange={ev => {
              const fm = FORMATOS[ev.target.value];
              setF({ ...f, formato: ev.target.value, contraloria: fm?.contraloria || f.contraloria });
            }}
          >
            {Object.entries(FORMATOS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.nombre}
                {v.contraloria ? ' · ' + v.corto : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="pmPCtl" label="Contraloría *">
          <input id="pmPCtl" value={f.contraloria} onChange={cambiar('contraloria')} />
        </Campo>
      </div>
      <Campo id="pmPEje" label="Nombre del ejercicio de fiscalización (auditoría) *">
        <textarea id="pmPEje" rows={2} value={f.ejercicio} onChange={cambiar('ejercicio')} />
      </Campo>
      <div className="row2">
        <Campo id="pmPTipo" label="Tipo de ejercicio">
          <select id="pmPTipo" value={f.tipo_ejercicio} onChange={cambiar('tipo_ejercicio')}>
            <option value="" />
            {tipos.map(t => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Campo>
        <Campo id="pmPFs" label="Fecha de suscripción *">
          <input id="pmPFs" type="date" value={f.fecha_suscripcion} onChange={cambiar('fecha_suscripcion')} />
        </Campo>
      </div>
      <div className="row2">
        <Campo id="pmPVig" label="Vigencia PVCFT (PM_01)">
          <input
            id="pmPVig"
            placeholder="Ej.: 2025"
            value={f.vigencia_pvcft}
            onChange={cambiar('vigencia_pvcft')}
          />
        </Campo>
        <Campo id="pmPPer" label="Periodo fiscal auditado (CGR)">
          <input
            id="pmPPer"
            placeholder="Ej.: 2024"
            value={f.periodo_auditado}
            onChange={cambiar('periodo_auditado')}
          />
        </Campo>
      </div>
      <div className="row2">
        <Campo id="pmPMod" label="Modalidad de auditoría (CGR)">
          <input id="pmPMod" value={f.modalidad} onChange={cambiar('modalidad')} />
        </Campo>
        <Campo id="pmPNit" label="NIT de la entidad">
          <input id="pmPNit" placeholder="890.399.011-3" value={f.nit} onChange={cambiar('nit')} />
        </Campo>
      </div>
      <div className="row2">
        <Campo id="pmPInf" label="N.º del informe final">
          <input id="pmPInf" value={f.numero_informe} onChange={cambiar('numero_informe')} />
        </Campo>
        <Campo id="pmPFi" label="Fecha del informe final">
          <input id="pmPFi" type="date" value={f.fecha_informe} onChange={cambiar('fecha_informe')} />
        </Campo>
      </div>
      <div className="row2">
        <Campo id="pmPOrf" label="Radicado ORFEO del informe o del plan">
          <input id="pmPOrf" value={f.radicado_orfeo} onChange={cambiar('radicado_orfeo')} />
        </Campo>
        <Campo id="pmPEst" label="Estado">
          <select id="pmPEst" value={f.estado} onChange={cambiar('estado')}>
            {Object.entries(ESTADO_PLAN).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {d.v19 && (
        <Campo id="pmPDir" label="Dirección técnica de la contraloría (PM_01)">
          <input
            id="pmPDir"
            value={f.direccion_tecnica}
            placeholder="Ej.: Dirección Técnica ante la Administración Central"
            onChange={cambiar('direccion_tecnica')}
          />
        </Campo>
      )}
      {d.v20 && (
        <div className="row2">
          <Campo
            id="pmPRes"
            label="Resolución CGSC aplicable"
            hint="Res. 24.043: planes desde el 1-ene-2025 · Res. 24.003: del 24-ene al 31-dic-2024"
          >
            <select id="pmPRes" value={f.resolucion} onChange={cambiar('resolucion')}>
              <option value="">Automática según la fecha de suscripción</option>
              {Object.entries(RESOLUCIONES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.corta}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            id="pmPRad"
            label="Fecha de radicación del informe final"
            hint="Desde aquí corren los 15 días hábiles para presentar el plan (art. 7)"
          >
            <input
              id="pmPRad"
              type="date"
              value={f.fecha_radicacion_informe ?? ''}
              onChange={cambiar('fecha_radicacion_informe')}
            />
          </Campo>
        </div>
      )}
      <Campo id="pmPEnt" label="Entidad auditada">
        <input id="pmPEnt" value={f.entidad} onChange={cambiar('entidad')} />
      </Campo>
      <div className="row2">
        <Campo id="pmPRep" label="Representante legal (firma)">
          <input id="pmPRep" value={f.representante_legal} onChange={cambiar('representante_legal')} />
        </Campo>
        <Campo id="pmPOrd" label="Ordenador del gasto del punto de control (firma PM_01)">
          <input id="pmPOrd" value={f.ordenador_gasto} onChange={cambiar('ordenador_gasto')} />
        </Campo>
      </div>
      <Campo id="pmPObs" label="Observaciones">
        <textarea id="pmPObs" rows={2} value={f.observaciones} onChange={cambiar('observaciones')} />
      </Campo>
    </Modal>
  );
}

// ---------- hallazgo ----------
export function VentanaHallazgo({
  h,
  planId,
  d,
  alCerrar
}: {
  h: Hallazgo | null;
  planId: string;
  d: DatosPlanes;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const [numeroH, setNumero] = useState(h?.numero ?? '');
  const [cuantia, setCuantia] = useState(h?.cuantia == null ? '' : String(h.cuantia));
  const [descripcion, setDescripcion] = useState(h?.descripcion ?? '');
  const [causa, setCausa] = useState(h?.causa ?? '');
  const [efecto, setEfecto] = useState(h?.efecto ?? '');
  const [conn, setConn] = useState<string[]>(h?.connotaciones ?? ['administrativa']);
  const [macro, setMacro] = useState(h?.macroproceso ?? '');
  const guardar = async () => {
    const cu = txt(cuantia);
    const o: Record<string, unknown> = {
      plan_id: planId,
      numero: txt(numeroH),
      descripcion: txt(descripcion),
      causa: txt(causa),
      efecto: txt(efecto),
      connotaciones: conn,
      cuantia: cu ? numero(cu) : null,
      macroproceso: txt(macro)
    };
    const err = validarHallazgo({
      numero: String(o.numero),
      descripcion: String(o.descripcion),
      cuantiaTexto: cu,
      cuantia: o.cuantia as number | null
    });
    if (err) return avisar(err, 'error');
    if (!h) o.orden = d.hallazgos.filter(x => x.plan_id === planId).length + 1;
    try {
      await planes.guardar('hall', o, h?.id ?? null);
      avisar(h ? 'Hallazgo actualizado' : 'Hallazgo agregado', 'ok');
      await refrescar();
      alCerrar();
    } catch (er) {
      avisar((er as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      ancha
      titulo={h ? 'Editar hallazgo' : 'Agregar hallazgo'}
      alCerrar={alCerrar}
      pie={<Pie alCerrar={alCerrar} guardar={() => void guardar()} />}
    >
      <div className="row2">
        <Campo id="pmHNum" label="N.º o código del hallazgo *">
          <input id="pmHNum" value={numeroH} onChange={e => setNumero(e.target.value)} />
        </Campo>
        <Campo id="pmHCua" label="Cuantía del presunto detrimento (si es fiscal)">
          <input
            id="pmHCua"
            inputMode="decimal"
            placeholder="0"
            value={cuantia}
            onChange={e => setCuantia(e.target.value)}
          />
        </Campo>
      </div>
      <Campo id="pmHDes" label="Descripción de la condición del hallazgo *">
        <textarea id="pmHDes" rows={4} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
      </Campo>
      <div className="row2">
        <Campo id="pmHCau" label="Causa">
          <textarea id="pmHCau" rows={2} value={causa} onChange={e => setCausa(e.target.value)} />
        </Campo>
        <Campo id="pmHEfe" label="Efecto">
          <textarea id="pmHEfe" rows={2} value={efecto} onChange={e => setEfecto(e.target.value)} />
        </Campo>
      </div>
      <div className="field">
        <label>Connotación</label>
        <div className="pm-checks">
          {Object.entries(CONNOTACIONES).map(([k, v]) => (
            <label key={k}>
              <input
                type="checkbox"
                checked={conn.includes(k)}
                onChange={e => setConn(e.target.checked ? [...conn, k] : conn.filter(x => x !== k))}
              />{' '}
              {v}
            </label>
          ))}
        </div>
      </div>
      <Campo id="pmHMac" label="Macroproceso, criterio u otro">
        <input id="pmHMac" value={macro} onChange={e => setMacro(e.target.value)} />
      </Campo>
    </Modal>
  );
}

// ---------- acción ----------
export function VentanaAccion({
  a,
  h,
  p,
  deps,
  d,
  alCerrar
}: {
  a: Accion | null;
  h: Hallazgo;
  p: Plan;
  deps: readonly Dep[];
  d: DatosPlanes;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const [f, setF] = useState({
    accion: a?.accion ?? '',
    proposito: a?.proposito ?? '',
    actividad: a?.actividad ?? '',
    meta: a?.meta ?? '',
    unidad_medida: a?.unidad_medida ?? 'Porcentaje',
    cantidad: a?.cantidad == null ? '100' : String(a.cantidad),
    fecha_inicio: a?.fecha_inicio ?? (p.fecha_suscripcion || fechaColombia(new Date())),
    fecha_fin: a?.fecha_fin ?? '',
    dependencia_id: String(a?.dependencia_id ?? h.dependencia_id ?? ''),
    responsable: a?.responsable ?? '',
    fuente_verificacion: a?.fuente_verificacion ?? '',
    lugar_verificacion: a?.lugar_verificacion ?? ''
  });
  const cambiar = (k: keyof typeof f) => (ev: { target: { value: string } }) =>
    setF({ ...f, [k]: ev.target.value });
  const activas = deps
    .filter(x => x.activo !== false)
    .slice()
    .sort((x, y) => x.nombre.localeCompare(y.nombre));
  const guardar = async () => {
    const o = {
      plan_id: h.plan_id,
      hallazgo_id: h.id,
      accion: txt(f.accion),
      proposito: txt(f.proposito),
      actividad: txt(f.actividad),
      meta: txt(f.meta),
      unidad_medida: txt(f.unidad_medida),
      cantidad: numero(f.cantidad),
      fecha_inicio: txt(f.fecha_inicio),
      fecha_fin: txt(f.fecha_fin),
      dependencia_id: f.dependencia_id ? +f.dependencia_id : null,
      responsable: txt(f.responsable),
      fuente_verificacion: txt(f.fuente_verificacion),
      lugar_verificacion: txt(f.lugar_verificacion)
    };
    if (o.accion.length < 4) return avisar('Describe la acción', 'error');
    const avisos = problemasAccion(
      {
        ...(a ?? {}),
        ...o,
        id: a?.id ?? '',
        avance: a?.avance ?? 0,
        fecha_corte: a?.fecha_corte ?? null
      } as Accion,
      p
    );
    if (
      avisos.length &&
      !window.confirm('Revise la formulación:\n\n• ' + avisos.join('\n• ') + '\n\n¿Guardar de todas formas?')
    )
      return;
    const err = validarAccion(o);
    if (err) return avisar(err, 'error');
    if (
      p.fecha_suscripcion &&
      o.fecha_fin < p.fecha_suscripcion &&
      !window.confirm('La acción termina antes de la suscripción del plan. ¿Guardar de todas formas?')
    )
      return;
    if (
      a &&
      Number(a.avance) > o.cantidad &&
      !window.confirm('El avance validado supera la nueva cantidad de la meta. ¿Guardar de todas formas?')
    )
      return;
    const datos: Record<string, unknown> = { ...o };
    if (!a) datos.orden = d.acciones.filter(x => x.plan_id === h.plan_id).length + 1;
    try {
      await planes.guardar('acc', datos, a?.id ?? null);
      avisar(a ? 'Acción actualizada' : 'Acción agregada', 'ok');
      await refrescar();
      alCerrar();
    } catch (er) {
      avisar((er as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      ancha
      titulo={(a ? 'Editar acción' : 'Agregar acción') + ' · hallazgo ' + h.numero}
      alCerrar={alCerrar}
      pie={<Pie alCerrar={alCerrar} guardar={() => void guardar()} />}
    >
      <Campo
        id="pmAAcc"
        label={(p.formato === 'F14_CGR' ? 'Acción de mejoramiento' : 'Acción correctiva') + ' *'}
      >
        <textarea id="pmAAcc" rows={2} value={f.accion} onChange={cambiar('accion')} />
      </Campo>
      {p.formato !== 'PM_01_CGSC' && (
        <div className="row2">
          <Campo id="pmAPro" label="Propósito de la acción de mejora">
            <textarea id="pmAPro" rows={2} value={f.proposito} onChange={cambiar('proposito')} />
          </Campo>
          <Campo id="pmAAct" label="Descripción de las actividades">
            <textarea id="pmAAct" rows={2} value={f.actividad} onChange={cambiar('actividad')} />
          </Campo>
        </div>
      )}
      <Campo id="pmAMeta" label="Meta">
        <input
          id="pmAMeta"
          placeholder="Ej.: 100% de los supervisores capacitados"
          value={f.meta}
          onChange={cambiar('meta')}
        />
      </Campo>
      <div className="row2">
        <Campo id="pmAUni" label="Unidad de medida *">
          <input id="pmAUni" list="pmUnis" value={f.unidad_medida} onChange={cambiar('unidad_medida')} />
          <datalist id="pmUnis">
            {['Porcentaje', 'Informes', 'Capacitaciones', 'Actas', 'Documentos', 'Procedimientos'].map(u => (
              <option key={u}>{u}</option>
            ))}
          </datalist>
        </Campo>
        <Campo id="pmACan" label="Cantidad de la meta *" hint="Con «Porcentaje», use 100">
          <input id="pmACan" inputMode="decimal" value={f.cantidad} onChange={cambiar('cantidad')} />
        </Campo>
      </div>
      <div className="row2">
        <Campo
          id="pmAFi"
          label="Fecha de inicio *"
          hint="PM_01 no tiene esta columna: por defecto es la fecha de suscripción"
        >
          <input id="pmAFi" type="date" value={f.fecha_inicio} onChange={cambiar('fecha_inicio')} />
        </Campo>
        <Campo id="pmAFf" label="Fecha de terminación *">
          <input id="pmAFf" type="date" value={f.fecha_fin} onChange={cambiar('fecha_fin')} />
        </Campo>
      </div>
      <div className="row2">
        <Campo id="pmADep" label="Dependencia responsable *">
          <select id="pmADep" value={f.dependencia_id} onChange={cambiar('dependencia_id')}>
            <option value="">Seleccione…</option>
            {activas.map(x => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="pmARes" label="Responsable (nombre y cargo)">
          <input id="pmARes" value={f.responsable} onChange={cambiar('responsable')} />
        </Campo>
      </div>
      <div className="row2">
        <Campo id="pmAFue" label="Fuente de verificación">
          <input id="pmAFue" value={f.fuente_verificacion} onChange={cambiar('fuente_verificacion')} />
        </Campo>
        <Campo id="pmALug" label="Lugar de verificación">
          <input id="pmALug" value={f.lugar_verificacion} onChange={cambiar('lugar_verificacion')} />
        </Campo>
      </div>
    </Modal>
  );
}

// ---------- reportar avance ----------
export function VentanaAvance({
  a,
  d,
  edita,
  alCerrar
}: {
  a: Accion;
  d: DatosPlanes;
  edita: boolean;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const hoy = fechaColombia(new Date());
  const h = d.hallazgos.find(x => x.id === a.hallazgo_id);
  const u = ultimo(a, d.avances);
  const esPct = !!a.unidad_medida && llave(a.unidad_medida).startsWith('porcent');
  const [fecha, setFecha] = useState(hoy);
  const [cant, setCant] = useState('');
  const [desc, setDesc] = useState('');
  const [orfeo, setOrfeo] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [validar, setValidar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const v = numero(cant);
  const p = Number(a.cantidad) > 0 ? v / Number(a.cantidad) : 0;
  const enviar = async () => {
    const o = {
      fecha_corte: txt(fecha),
      cantidad: numero(cant),
      descripcion: txt(desc),
      radicado_orfeo: txt(orfeo).replace(/\s+/g, ''),
      validar: validar && edita
    };
    const err = validarAvance(
      o,
      archivo ? { nombre: archivo.name, tipo: archivo.type, tamano: archivo.size } : null,
      hoy
    );
    if (err) return avisar(err, 'error');
    if (
      o.cantidad < Number(a.avance) &&
      !window.confirm('El avance acumulado es menor que el ya validado. ¿Enviarlo de todas formas?')
    )
      return;
    if (
      o.cantidad > Number(a.cantidad) &&
      !window.confirm('El avance supera la cantidad de la meta. ¿Enviarlo de todas formas?')
    )
      return;
    setOcupado(true);
    try {
      await planes.reportar(a, o, archivo);
      avisar(
        o.validar
          ? 'Avance registrado y validado'
          : 'Avance enviado. Queda pendiente de validación por Control Interno.',
        'ok'
      );
      await refrescar();
      alCerrar();
    } catch (er) {
      avisar((er as Error).message, 'error');
      setOcupado(false);
    }
  };
  return (
    <Modal
      abierto
      ancha
      titulo="Reportar avance"
      alCerrar={alCerrar}
      pie={
        <Pie
          alCerrar={alCerrar}
          guardar={() => void enviar()}
          ocupado={ocupado}
          texto={ocupado ? 'Enviando…' : 'Enviar avance'}
          icono={ocupado ? 'fa-spinner fa-spin' : 'fa-paper-plane'}
        />
      }
    >
      <div className="pm-ctx">
        <small>Hallazgo {h?.numero ?? ''}</small>
        <b>{a.accion}</b>
        <div className="muted">
          Meta: {metaTxt(a)} · termina el {formatoCorto(a.fecha_fin)}
        </div>
        <div className="muted">
          Avance validado actual: <b>{numTxt(a.avance)}</b> ({pctTxt(pct(a))})
          {a.fecha_corte ? ' con corte ' + formatoCorto(a.fecha_corte) : ''}
        </div>
      </div>
      {u && u.estado === 'devuelto' && (
        <div className="pm-note r" style={{ margin: '10px 0' }}>
          <Icono nombre="fa-rotate-left" /> El último reporte fue devuelto: {u.observacion}
        </div>
      )}
      <div className="row2">
        <Campo id="pmVFc" label="Fecha de corte *">
          <input id="pmVFc" type="date" max={hoy} value={fecha} onChange={e => setFecha(e.target.value)} />
        </Campo>
        <Campo
          id="pmVCan"
          label={`Avance acumulado a la fecha de corte * (${esPct ? '0 a 100' : 'de ' + numTxt(a.cantidad) + ' ' + (a.unidad_medida ?? '')})`}
          hint={
            <span id="pmVPct">
              {isNaN(v) ? (
                'Escribe el total logrado hasta la fecha, no solo lo de este periodo'
              ) : (
                <>
                  Equivale a <b>{pctTxt(Math.min(1, p))}</b> de la meta
                  {p > 1 ? ' (supera la meta; para los indicadores cuenta como 100%)' : ''}
                  {v < Number(a.avance) ? (
                    <>
                      {' · '}
                      <span style={{ color: 'var(--redink)' }}>es menor que el avance ya validado</span>
                    </>
                  ) : null}
                </>
              )}
            </span>
          }
        >
          <input
            id="pmVCan"
            inputMode="decimal"
            autoComplete="off"
            value={cant}
            onChange={e => setCant(e.target.value)}
          />
        </Campo>
      </div>
      <Campo
        id="pmVDes"
        label="Descripción del avance de la acción *"
        hint="Qué se hizo, con qué evidencia y dónde se puede verificar"
      >
        <textarea id="pmVDes" rows={4} value={desc} onChange={e => setDesc(e.target.value)} />
      </Campo>
      <div className="row2">
        <Campo id="pmVOrf" label="Radicado ORFEO del soporte">
          <input
            id="pmVOrf"
            inputMode="numeric"
            placeholder="Ej.: 202641320100012345"
            value={orfeo}
            onChange={e => setOrfeo(e.target.value)}
          />
        </Campo>
        <Campo id="pmVPdf" label="Soporte en PDF (máx. 10 MB)">
          <input
            id="pmVPdf"
            type="file"
            accept="application/pdf,.pdf"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
          />
        </Campo>
      </div>
      <div className="hint" style={{ marginTop: -6 }}>
        Adjunte el PDF del soporte o indique el radicado ORFEO donde reposa: al menos uno de los dos es
        obligatorio.
      </div>
      {edita && (
        <label className="pm-checks" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={validar} onChange={e => setValidar(e.target.checked)} /> Validar de
          inmediato (lo registra Control Interno o el Super administrador)
        </label>
      )}
    </Modal>
  );
}

// ---------- revisar avance ----------
export function VentanaRevision({
  v,
  d,
  dep,
  alCerrar
}: {
  v: Avance;
  d: DatosPlanes;
  dep: (id: number | null) => string;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const a = d.acciones.find(x => x.id === v.accion_id);
  const h = d.hallazgos.find(x => x.id === a?.hallazgo_id);
  const [obs, setObs] = useState('');
  const decidir = async (estado: 'validado' | 'devuelto') => {
    const err = validarDevolucion(estado, obs);
    if (err) return avisar(err, 'error');
    try {
      await planes.revisar(v.id, estado, txt(obs));
      avisar(
        estado === 'validado'
          ? 'Avance validado: el indicador de la acción quedó actualizado'
          : 'Avance devuelto a la dependencia',
        'ok'
      );
      await refrescar();
      alCerrar();
    } catch (er) {
      avisar((er as Error).message, 'error');
    }
  };
  if (!a) return null;
  return (
    <Modal
      abierto
      ancha
      titulo="Revisar avance reportado"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn danger" onClick={() => void decidir('devuelto')}>
            <Icono nombre="fa-rotate-left" /> Devolver
          </button>
          <button type="button" className="btn primary" onClick={() => void decidir('validado')}>
            <Icono nombre="fa-check" /> Validar
          </button>
        </>
      }
    >
      <div className="pm-ctx">
        <small>
          Hallazgo {h?.numero ?? ''} · {dep(a.dependencia_id)}
        </small>
        <b>{a.accion}</b>
        <div className="muted">
          Meta: {metaTxt(a)} · termina el {formatoCorto(a.fecha_fin)}
        </div>
      </div>
      <div className="pm-info" style={{ margin: '12px 0' }}>
        <div>
          <small>Fecha de corte</small>
          <span>{formatoCorto(v.fecha_corte)}</span>
        </div>
        <div>
          <small>Avance acumulado</small>
          <span>
            {numTxt(v.cantidad)} · {pctTxt(pct(a, v.cantidad))}
          </span>
        </div>
        <div>
          <small>Avance validado anterior</small>
          <span>
            {numTxt(a.avance)} · {pctTxt(pct(a))}
          </span>
        </div>
        <div>
          <small>Reportado por</small>
          <span>
            {v.reportado_email || '—'} · {formatoFechaHora(v.created_at)}
          </span>
        </div>
      </div>
      <div className="field">
        <label>Descripción del avance</label>
        <div className="pm-quote">{v.descripcion}</div>
      </div>
      <div className="field">
        <label>Soporte</label>
        <div>
          {v.soporte_path ? textoCorto(v.soporte_path, 40) : ''}
          {v.radicado_orfeo ? ' · ORFEO ' + v.radicado_orfeo : ''}
          {!v.soporte_path && !v.radicado_orfeo ? '—' : ''}
          {v.soporte_hash && (
            <div className="muted mono" style={{ fontSize: '.7rem', marginTop: 4 }}>
              SHA-256 {v.soporte_hash}
            </div>
          )}
        </div>
      </div>
      <Campo
        id="pmRObs"
        label="Observación de la revisión"
        hint="Obligatoria si devuelve el avance: la dependencia la verá para corregir"
      >
        <textarea id="pmRObs" rows={3} value={obs} onChange={e => setObs(e.target.value)} />
      </Campo>
    </Modal>
  );
}

// ---------- calificar (CGSC) ----------
export function VentanaCalificacion({
  a,
  p,
  d,
  fev,
  alCerrar
}: {
  a: Accion;
  p: Plan | undefined;
  d: DatosPlanes;
  fev: string;
  alCerrar: () => void;
}) {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const r = calificacionAccion(a, fev, d.avances);
  const ri =
    resolucionInfo(p ?? null) ?? (RESOLUCIONES['24.003'] as NonNullable<ReturnType<typeof resolucionInfo>>);
  const [c, setC] = useState(a.cal_cumplimiento == null ? '' : String(a.cal_cumplimiento));
  const [e, setE] = useState(a.cal_efectividad == null ? '' : String(a.cal_efectividad));
  const guardar = async () => {
    const val = (x: string) => (x === '' ? null : +x);
    try {
      await planes.guardar('acc', { cal_cumplimiento: val(c), cal_efectividad: val(e) }, a.id);
      avisar('Calificación guardada', 'ok');
      await refrescar();
      alCerrar();
    } catch (er) {
      avisar((er as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      titulo="Calificar acción · metodología CGSC"
      alCerrar={alCerrar}
      pie={<Pie alCerrar={alCerrar} guardar={() => void guardar()} />}
    >
      <div className="muted" style={{ marginBottom: 10 }}>
        {textoCorto(a.accion, 160)}
      </div>
      <div className="row2">
        <Campo id="pmCalC" label="Cumplimiento (20 %)" hint="Se cumplió la meta en el plazo">
          <select id="pmCalC" value={c} onChange={ev => setC(ev.target.value)}>
            <option value="">
              Automático
              {r.sug != null ? ` (sugerido: ${r.sug} · ${TEXTO_CALIFICACION[r.sug]})` : ' (aún en término)'}
            </option>
            {ri.escala.map(x => (
              <option key={x} value={x}>
                {x} · {TEXTO_CALIFICACION[x]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="pmCalE" label="Efectividad (80 %)" hint="La acción eliminó la causa del hallazgo">
          <select id="pmCalE" value={e} onChange={ev => setE(ev.target.value)}>
            <option value="">Sin calificar</option>
            {ri.escala.map(x => (
              <option key={x} value={x}>
                {x} · {TEXTO_CALIFICACION[x]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="pm-note b" style={{ marginTop: 4 }}>
        {ri.nombre}, artículo 12:{' '}
        {ri.escala.length === 2
          ? 'cada acción se califica con dos (2) si cumple o cero (0) si no cumple.'
          : 'cero (0) no cumple, uno (1) cumple parcialmente y dos (2) sí cumple. El uno (1) solo aplica a acciones a las que se les fijaron metas parciales.'}
      </div>
      <div className="hint">
        El estado de la acción queda «Cerrada (C)» cuando cumplimiento y efectividad son 2; si no, «Abierta
        (A)», como en el formato de la Contraloría.
      </div>
    </Modal>
  );
}

// ---------- observación de Control Interno ----------
export function VentanaObservacion({ a, alCerrar }: { a: Accion; alCerrar: () => void }) {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const [t, setT] = useState(a.obs_ci ?? '');
  const guardar = async (modo?: 'quitar') => {
    const o =
      modo === 'quitar'
        ? { obs_ci: '', obs_ci_estado: '', obs_ci_at: null }
        : { obs_ci: txt(t), obs_ci_estado: 'pendiente', obs_ci_at: new Date().toISOString() };
    if (!modo && String(o.obs_ci).length < 4) return avisar('Escriba la observación', 'error');
    try {
      await planes.guardar('acc', o, a.id);
      avisar(modo === 'quitar' ? 'Observación quitada' : 'Observación registrada', 'ok');
      await refrescar();
      alCerrar();
    } catch (er) {
      avisar((er as Error).message, 'error');
    }
  };
  return (
    <Modal
      abierto
      titulo="Observación de Control Interno"
      alCerrar={alCerrar}
      pie={
        <>
          {a.obs_ci && (
            <button
              type="button"
              className="btn"
              style={{ marginRight: 'auto' }}
              onClick={() => void guardar('quitar')}
            >
              <Icono nombre="fa-eraser" /> Quitar
            </button>
          )}
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => void guardar()}>
            <Icono nombre="fa-floppy-disk" /> Guardar como pendiente
          </button>
        </>
      }
    >
      <div className="muted" style={{ marginBottom: 10 }}>
        {textoCorto(a.accion, 160)}
      </div>
      <Campo
        id="pmObsT"
        label="Observación a la formulación *"
        hint="Por ejemplo: ajustar la redacción, la meta no es medible, el plazo supera seis meses"
      >
        <textarea id="pmObsT" rows={4} value={t} onChange={e => setT(e.target.value)} />
      </Campo>
    </Modal>
  );
}

/** Marca atendida la observación de Control Interno (pmObsGuardar con modo "atendida"). */
export function useMarcarAtendida() {
  const { planes } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  return async (a: Accion) => {
    try {
      await planes.guardar('acc', { obs_ci_estado: 'atendida', obs_ci_at: new Date().toISOString() }, a.id);
      avisar('Observación marcada como atendida', 'ok');
      await refrescar();
    } catch (er) {
      avisar((er as Error).message, 'error');
    }
  };
}
