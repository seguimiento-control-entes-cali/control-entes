// Planes de mejoramiento de la demostración: los mismos de la 2.x (pmDemoSeed de src/js/19-planes-de-mejoramiento.js),
// FICTICIOS, con fechas relativas a hoy. Las dependencias son las de los catálogos de la 3.0 (la primera es Salud, la
// de las cuentas de secretaría y enlace de la demo, para que "Mis acciones de mejora" muestre datos).
import { sumarDias } from '../../dominio/fechas';
import type { Accion, Avance, DatosPlanes, Hallazgo, Plan } from '../../dominio/planes';
/** Dependencias de la semilla: Salud Pública, Hacienda, Educación y Movilidad (catálogos de supabase/02_seed.sql). */
const DEPS = [21, 7, 15, 19];

export function semillaPlanes(hoy: string): DatosPlanes {
  const st: DatosPlanes = { planes: [], hallazgos: [], acciones: [], avances: [] };
  const dia = (n: number) => sumarDias(hoy, n);
  const ahora = hoy + 'T12:00:00.000Z';
  const anio = +hoy.slice(0, 4);
  const dep = (i: number) => DEPS[i % DEPS.length] ?? null;
  const p1: Plan = {
    id: 'pm-demo-1',
    formato: 'PM_01_CGSC',
    contraloria: 'Contraloría General de Santiago de Cali',
    entidad: 'Distrito Especial de Santiago de Cali',
    nit: '',
    representante_legal: 'Representante legal (ejemplo)',
    ordenador_gasto: 'Ordenador del gasto (ejemplo)',
    ejercicio: 'Auditoría de cumplimiento a la contratación (DATOS DE EJEMPLO)',
    tipo_ejercicio: 'Auditoría de cumplimiento',
    modalidad: '',
    vigencia_pvcft: String(anio - 1),
    periodo_auditado: '',
    numero_informe: 'EJEMPLO-001',
    radicado_orfeo: '',
    fecha_informe: dia(-260),
    fecha_suscripcion: dia(-240),
    estado: 'en_ejecucion',
    observaciones: 'Plan ficticio para conocer el módulo.'
  };
  const p2: Plan = {
    ...p1,
    id: 'pm-demo-2',
    formato: 'F14_CGR',
    contraloria: 'Contraloría General de la República',
    nit: '890.399.011-3',
    ordenador_gasto: '',
    ejercicio: 'Auditoría financiera y de gestión a recursos del SGP (DATOS DE EJEMPLO)',
    tipo_ejercicio: 'Auditoría financiera y de gestión',
    modalidad: 'Auditoría financiera y de gestión',
    vigencia_pvcft: '',
    periodo_auditado: String(anio - 1),
    numero_informe: 'EJEMPLO-CGR-002',
    fecha_informe: dia(-120),
    fecha_suscripcion: dia(-100)
  };
  st.planes.push(p1, p2);
  const H = (p: Plan, numero: string, descripcion: string, connotaciones: string[], orden: number) => {
    const h: Hallazgo = {
      id: 'h-' + p.id + '-' + orden,
      plan_id: p.id,
      numero,
      descripcion,
      causa: '',
      efecto: '',
      connotaciones,
      cuantia: null,
      macroproceso: 'Gestión contractual',
      orden
    };
    st.hallazgos.push(h);
    return h;
  };
  const A = (p: Plan, h: Hallazgo, o: Partial<Accion> & Pick<Accion, 'accion' | 'fecha_fin'>) => {
    const a: Accion = {
      id: 'a-' + (st.acciones.length + 1),
      plan_id: p.id,
      hallazgo_id: h.id,
      dependencia_id: null,
      responsable: '',
      proposito: '',
      actividad: '',
      meta: '',
      unidad_medida: 'Porcentaje',
      cantidad: 100,
      fuente_verificacion: 'Expedientes contractuales',
      lugar_verificacion: 'Archivo de gestión',
      fecha_inicio: p.fecha_suscripcion,
      avance: 0,
      fecha_corte: null,
      orden: st.acciones.length + 1,
      ...o
    };
    st.acciones.push(a);
    return a;
  };
  const V = (a: Accion, o: Pick<Avance, 'fecha_corte' | 'cantidad' | 'descripcion' | 'estado'>) =>
    st.avances.push({
      id: 'v-' + (st.avances.length + 1),
      accion_id: a.id,
      plan_id: a.plan_id,
      dependencia_id: a.dependencia_id,
      radicado_orfeo: '',
      soporte_path: null,
      soporte_hash: null,
      observacion: '',
      reportado_email: 'enlace@cali.gov.co',
      revisado_email: o.estado === 'validado' ? 'control.interno@cali.gov.co' : '',
      revisado_at: o.estado === 'validado' ? ahora : null,
      created_at: ahora,
      ...o
    });
  const h1 = H(
    p1,
    '1',
    'Publicación extemporánea en SECOP II de documentos del proceso contractual (ejemplo).',
    ['administrativa', 'disciplinaria'],
    1
  );
  const a1 = A(p1, h1, {
    dependencia_id: dep(0),
    accion: 'Capacitar a supervisores en publicación oportuna en SECOP II',
    meta: '100% de supervisores capacitados',
    fecha_fin: dia(-60),
    avance: 100,
    fecha_corte: dia(-70)
  });
  V(a1, {
    fecha_corte: dia(-70),
    cantidad: 100,
    descripcion: 'Se capacitó a la totalidad de supervisores (acta y listado de asistencia).',
    estado: 'validado'
  });
  const a2 = A(p1, h1, {
    dependencia_id: dep(0),
    accion: 'Implementar lista de chequeo de publicación por proceso',
    meta: '100% de procesos con lista de chequeo',
    fecha_fin: dia(-15),
    avance: 60,
    fecha_corte: dia(-40)
  });
  V(a2, {
    fecha_corte: dia(-40),
    cantidad: 60,
    descripcion: 'Lista de chequeo aplicada en 6 de 10 procesos revisados.',
    estado: 'validado'
  });
  const h2 = H(
    p1,
    '2',
    'Debilidades en el análisis del sector y estudios de mercado (ejemplo).',
    ['administrativa'],
    2
  );
  const a3 = A(p1, h2, {
    dependencia_id: dep(1),
    accion: 'Ajustar el procedimiento de análisis del sector',
    meta: 'Procedimiento actualizado y socializado',
    fecha_fin: dia(18),
    avance: 50,
    fecha_corte: dia(-30)
  });
  V(a3, {
    fecha_corte: dia(-30),
    cantidad: 50,
    descripcion: 'Borrador del procedimiento en revisión jurídica.',
    estado: 'validado'
  });
  V(a3, {
    fecha_corte: dia(-2),
    cantidad: 80,
    descripcion: 'Procedimiento aprobado en comité; falta socializar.',
    estado: 'reportado'
  });
  const h3 = H(
    p1,
    '3',
    'Informes de supervisión sin evidencia de seguimiento al plan de mejoramiento (ejemplo).',
    ['administrativa', 'sancionatoria'],
    3
  );
  A(p1, h3, {
    dependencia_id: dep(2),
    accion: 'Publicar los informes de avance en el aplicativo de la contraloría',
    meta: '2 informes semestrales publicados',
    unidad_medida: 'Informes',
    cantidad: 2,
    fecha_fin: dia(140)
  });
  const h4 = H(
    p2,
    'H1-2025',
    'Diferencias entre la ejecución presupuestal y los registros contables (ejemplo).',
    ['administrativa', 'fiscal'],
    1
  );
  const a5 = A(p2, h4, {
    dependencia_id: dep(3),
    accion: 'Conciliar mensualmente presupuesto y contabilidad',
    proposito: 'Asegurar la consistencia de la información financiera',
    actividad: 'Elaborar conciliaciones mensuales firmadas',
    meta: '',
    unidad_medida: 'Conciliaciones',
    cantidad: 6,
    fecha_fin: dia(80),
    avance: 3,
    fecha_corte: dia(-10)
  });
  V(a5, {
    fecha_corte: dia(-10),
    cantidad: 3,
    descripcion: 'Se elaboraron las conciliaciones de los tres primeros meses.',
    estado: 'validado'
  });
  A(p2, h4, {
    dependencia_id: dep(1),
    accion: 'Ajustar el instructivo de cierre presupuestal',
    actividad: 'Actualizar y adoptar el instructivo',
    meta: '',
    unidad_medida: 'Instructivo',
    cantidad: 1,
    fecha_fin: dia(-5)
  });
  return st;
}

/** pmDemoView: secretario y enlace solo ven las acciones de su dependencia (y sus planes y hallazgos). */
export function vistaPorDependencia(st: DatosPlanes, dep: number | null): DatosPlanes {
  const acciones = st.acciones.filter(a => String(a.dependencia_id) === String(dep));
  // Script 28: también los hallazgos asignados a la dependencia aunque aún no tengan acciones (para formularlos)
  const propios = st.hallazgos.filter(h => String(h.dependencia_id ?? '') === String(dep));
  const hid = new Set([...acciones.map(a => a.hallazgo_id), ...propios.map(h => h.id)]),
    pid = new Set([...acciones.map(a => a.plan_id), ...propios.map(h => h.plan_id)]);
  return {
    planes: st.planes.filter(p => pid.has(p.id)),
    hallazgos: st.hallazgos.filter(h => hid.has(h.id)),
    acciones,
    avances: st.avances.filter(v => String(v.dependencia_id) === String(dep))
  };
}

/**
 * Script 28 (quién hace qué): un plan FICTICIO en formulación con hallazgos de Salud (la dependencia de las cuentas
 * de secretaría y enlace de la demo), para probar el flujo: uno en borrador (la dependencia formula el análisis de
 * causa y las acciones) y otro ya enviado (Control Interno lo valida o lo devuelve). Va aparte de semillaPlanes, que
 * se compara con la 2.x.
 */
export function semillaFormulacion(hoy: string): Pick<DatosPlanes, 'planes' | 'hallazgos' | 'acciones'> {
  const dia = (n: number) => sumarDias(hoy, n);
  const p: Plan = {
    id: 'pm-demo-3',
    formato: 'PM_01_CGSC',
    contraloria: 'Contraloría General de Santiago de Cali',
    entidad: 'Distrito Especial de Santiago de Cali',
    nit: '',
    representante_legal: '',
    ordenador_gasto: '',
    ejercicio: 'Actuación especial de fiscalización a la contratación en salud (DATOS DE EJEMPLO)',
    tipo_ejercicio: 'Actuación Especial de Fiscalización',
    modalidad: '',
    vigencia_pvcft: hoy.slice(0, 4),
    periodo_auditado: '',
    numero_informe: 'EJEMPLO-003',
    radicado_orfeo: '',
    fecha_informe: dia(-10),
    fecha_suscripcion: dia(5),
    estado: 'formulacion',
    observaciones: 'Plan ficticio en formulación: la dependencia formula, Control Interno valida.'
  };
  const base = {
    plan_id: p.id,
    causa: '',
    efecto: '',
    cuantia: null,
    macroproceso: 'Gestión contractual',
    dependencia_id: DEPS[0] ?? null
  };
  const h1: Hallazgo = {
    ...base,
    id: 'h-pm-demo-3-1',
    numero: '1',
    descripcion:
      'Los informes de supervisión de los contratos de prestación de servicios se publicaron en el SECOP fuera del término legal (DATOS DE EJEMPLO).',
    connotaciones: ['administrativa', 'disciplinaria'],
    orden: 1,
    formulacion_estado: 'borrador'
  };
  const h2: Hallazgo = {
    ...base,
    id: 'h-pm-demo-3-2',
    numero: '2',
    descripcion:
      'No se evidenció el seguimiento a las pólizas de cumplimiento de los contratos de suministro (DATOS DE EJEMPLO).',
    connotaciones: ['administrativa'],
    orden: 2,
    causa_metodo: 'cinco_porques',
    causa_raiz: 'No existe un control periódico de vigencia de las pólizas en la supervisión',
    causa_detalle: {
      no_conformidad: 'Sin seguimiento a las pólizas de cumplimiento',
      cinco_porques: [
        {
          problema: 'Pólizas sin seguimiento',
          porques: [
            'El supervisor no revisa las pólizas',
            'No hay alerta de vencimiento',
            'No existe un control periódico',
            '',
            ''
          ],
          resultado: 'No existe un control periódico de vigencia de las pólizas'
        }
      ]
    },
    formulacion_estado: 'enviado',
    formulacion_enviado_por: 'secretario.demo@cali.gov.co',
    formulacion_enviado_at: dia(-1) + 'T15:00:00.000Z'
  };
  const a: Accion = {
    id: 'a-demo-3-1',
    plan_id: p.id,
    hallazgo_id: h2.id,
    dependencia_id: DEPS[0] ?? null,
    responsable: 'Supervisores de contratos de suministro',
    accion: 'Implementar un control mensual de vigencia de pólizas con alerta de vencimiento',
    meta: '12 controles mensuales',
    unidad_medida: 'Controles',
    cantidad: 12,
    fecha_inicio: dia(10),
    fecha_fin: dia(375),
    avance: 0,
    fecha_corte: null
  } as Accion;
  return { planes: [p], hallazgos: [h1, h2], acciones: [a] };
}
