// Plantillas de acciones de mejora según la causa del hallazgo. COPIADAS POR SCRIPT de PM_PLANTILLAS y
// PM_PLANTILLA_GENERAL de src/js/19-planes-de-mejoramiento.js (2.x): no editar a mano; si cambian en la 2.x, volver a
// copiar. La prueba pruebas/paridad-planes-sugerencias.test.ts compara con el código real de la 2.x.
import { llave } from './planes';

export interface AccionSugerida {
  accion: string;
  meta: string;
  unidad: string;
  cantidad: number;
  fuente: string;
  meses: number;
}
export interface Plantilla {
  id: string;
  tema: string;
  re?: RegExp;
  acciones: readonly AccionSugerida[];
}
export const PLANTILLAS: readonly Plantilla[] = [
  {
    id: 'pagos',
    tema: 'Pagos y respaldo presupuestal',
    re: /registro presupuestal|respaldo (contractual|presupuestal)|hecho cumplido|sin contrato|pago del canon|ordenador del gasto|vigilancia presupuestal/,
    acciones: [
      {
        accion:
          'Implementar una lista de chequeo previa a cada pago que verifique contrato perfeccionado, registro presupuestal, acta de inicio y periodo efectivamente ejecutado.',
        meta: 'Lista de chequeo aplicada en el 100 % de los pagos del periodo',
        unidad: 'Porcentaje',
        cantidad: 100,
        fuente: 'Lista de chequeo firmada por el supervisor en cada orden de pago',
        meses: 6
      },
      {
        accion:
          'Realizar una mesa de trabajo entre la supervisión y el área financiera para verificar que los pagos correspondan al periodo contratado.',
        meta: 'Una (1) mesa de trabajo con acta',
        unidad: 'Actas',
        cantidad: 1,
        fuente: 'Acta de reunión y listado de asistencia',
        meses: 3
      }
    ]
  },
  {
    id: 'supervision',
    tema: 'Supervisión de contratos',
    re: /supervis|interventor|seguimiento (al|del) contrato/,
    acciones: [
      {
        accion:
          'Capacitar a los supervisores y apoyos a la supervisión de la dependencia en sus deberes de vigilancia técnica, jurídica, financiera y presupuestal.',
        meta: '100 % de los supervisores de la dependencia capacitados',
        unidad: 'Porcentaje',
        cantidad: 100,
        fuente: 'Listados de asistencia y material de la capacitación',
        meses: 4
      },
      {
        accion: 'Expedir una circular con los lineamientos de supervisión y los requisitos previos al pago.',
        meta: 'Una (1) circular expedida y socializada',
        unidad: 'Documentos',
        cantidad: 1,
        fuente: 'Circular radicada en ORFEO y evidencia de socialización',
        meses: 2
      }
    ]
  },
  {
    id: 'planeacion',
    tema: 'Planeación contractual y estudio del mercado',
    re: /analisis (del )?(sector|mercado)|estudios? previos?|comparativ|cotizacion|planeacion contractual|estructurador/,
    acciones: [
      {
        accion:
          'Elaborar una matriz de análisis comparativo cuantitativo para los procesos de contratación, con criterios de evaluación y ponderación de las alternativas.',
        meta: 'Una (1) matriz adoptada y aplicada en los procesos del periodo',
        unidad: 'Documentos',
        cantidad: 1,
        fuente: 'Matriz aprobada y su aplicación en los expedientes contractuales',
        meses: 4
      },
      {
        accion:
          'Incluir en la lista de verificación de estudios previos el análisis cuantitativo del sector como requisito para continuar el proceso.',
        meta: 'Lista de verificación actualizada',
        unidad: 'Documentos',
        cantidad: 1,
        fuente: 'Lista de verificación actualizada en el sistema de gestión',
        meses: 3
      }
    ]
  },
  {
    id: 'documental',
    tema: 'Gestión documental y soportes',
    re: /expediente|archivo|soporte|documental|evidencia|secop/,
    acciones: [
      {
        accion:
          'Organizar y completar los expedientes con todos los soportes exigidos y publicar los documentos pendientes.',
        meta: '100 % de los expedientes revisados completos',
        unidad: 'Porcentaje',
        cantidad: 100,
        fuente: 'Inventario documental y verificación por muestreo',
        meses: 4
      },
      {
        accion: 'Establecer un control periódico de completitud de expedientes a cargo del área responsable.',
        meta: 'Un (1) control trimestral documentado',
        unidad: 'Informes',
        cantidad: 2,
        fuente: 'Informes de control trimestral',
        meses: 6
      }
    ]
  },
  {
    id: 'contable',
    tema: 'Información contable y financiera',
    re: /contab|conciliaci|estados financieros|inventario|cartera|depuracion/,
    acciones: [
      {
        accion:
          'Realizar conciliaciones mensuales entre las áreas involucradas y depurar las partidas identificadas.',
        meta: 'Conciliaciones mensuales realizadas',
        unidad: 'Actas',
        cantidad: 6,
        fuente: 'Actas de conciliación firmadas',
        meses: 6
      }
    ]
  },
  {
    id: 'metas',
    tema: 'Cumplimiento de metas y planes',
    re: /meta|plan de desarrollo|indicador|ejecucion (fisica|presupuestal)|cronograma/,
    acciones: [
      {
        accion:
          'Implementar un seguimiento mensual de metas físicas y financieras con alertas al jefe de la dependencia.',
        meta: 'Seis (6) informes de seguimiento',
        unidad: 'Informes',
        cantidad: 6,
        fuente: 'Informes de seguimiento mensual',
        meses: 6
      }
    ]
  }
];
export const PLANTILLA_GENERAL: Plantilla = {
  id: 'general',
  tema: 'Acción general',
  acciones: [
    {
      accion:
        'Actualizar el procedimiento relacionado con la causa del hallazgo e incluir un punto de control que evite que se repita.',
      meta: 'Procedimiento actualizado y socializado',
      unidad: 'Procedimientos',
      cantidad: 1,
      fuente: 'Procedimiento publicado en el sistema de gestión y evidencia de socialización',
      meses: 4
    }
  ]
};

/** pmSugerencias: plantillas según la causa y la descripción del hallazgo, más la general (máximo 4 grupos). */
export function sugerencias(h: { causa?: string | null; descripcion?: string | null }): Plantilla[] {
  const t = llave((h.causa || '') + ' ' + (h.descripcion || ''));
  return PLANTILLAS.filter(g => g.re?.test(t))
    .concat([PLANTILLA_GENERAL])
    .slice(0, 4);
}
