// Notificaciones por WhatsApp y correo institucional. Copia de la 2.x: src/js/14-notificaciones.js (TPL, buildMsg, la
// plantilla sugerida de notifyModal, el asunto, el conteo de casos de sendWa/sendMail, despachoModal y vNotificaciones)
// y la acción notifCsv de 18-acciones.js. Paridad comprobada en pruebas/paridad-notificaciones.test.ts.
import type { Notificacion } from './actividad';
import { porcentaje1, UMBRALES } from './cumplimiento';
import { nombreCorto } from './directorio';
import { estadisticas } from './expediente';
import { formatoCorto, type RadicadoHistorico } from './historico';

export type Plantilla = 'vencidos' | 'preventivo' | 'desempeno' | 'reconocimiento';
/** Nombres de las plantillas (TPL de la 2.x), en el mismo orden. */
export const PLANTILLAS: Readonly<Record<Plantilla, string>> = {
  vencidos: 'Requerimientos sin respuesta (vencidos)',
  preventivo: 'Recordatorio preventivo (por vencer)',
  desempeno: 'Resumen de desempeño',
  reconocimiento: 'Reconocimiento por buen cumplimiento'
};
export const nombrePlantilla = (tpl: string | undefined) =>
  (PLANTILLAS as Readonly<Record<string, string>>)[tpl ?? ''] ?? tpl;

const LIMITE = 1500;
const PIE = '\n\nDespacho del Alcalde\nAlcaldía de Santiago de Cali';

/** buildMsg de la 2.x: el texto del mensaje para una dependencia, plantilla y vigencias. */
export function construirMensaje(
  filas: readonly RadicadoHistorico[],
  corte: string,
  org: string,
  tpl: string,
  vigs: readonly number[],
  contacto: { nombre?: string } | null
): string {
  const rows = filas.filter(r => r.org === org && vigs.includes(r.v)),
    st = estadisticas(rows),
    per = vigs.slice().sort().join(', ');
  const hi = 'Cordial saludo' + (contacto?.nombre ? ', ' + contacto.nombre : '') + '.';
  const fc = formatoCorto(corte);
  const empacar = <T>(cabeza: string, items: T[], fmt: (x: T, n: number) => string, cola: string) => {
    const lineas: string[] = [];
    let extra = 0;
    for (let i = 0; i < items.length; i++) {
      const l = fmt(items[i] as T, lineas.length + 1);
      const prueba =
        cabeza +
        lineas.concat(l).join('\n') +
        (items.length > lineas.length + 1 ? '\n(y ' + (items.length - lineas.length - 1) + ' más)' : '') +
        cola +
        PIE;
      if (prueba.length > LIMITE || lineas.length >= 10) {
        extra = items.length - lineas.length;
        break;
      }
      lineas.push(l);
    }
    return (
      cabeza +
      lineas.join('\n') +
      (extra > 0 ? `\n... y ${extra} más (el detalle está disponible en el Centro de Mando).` : '') +
      cola +
      PIE
    );
  };
  if (tpl === 'vencidos') {
    const it = rows.filter(r => r.opo === 2).sort((a, b) => (b.ret ?? 0) - (a.ret ?? 0));
    const cabeza = `${hi}\n\nDesde el Despacho del Alcalde se informa que, según el Control de Requerimientos de Entes de Control (corte ${fc}; vigencia ${per}), ${org} registra ${it.length} requerimiento(s) sin respuesta registrada y con el término vencido:\n\n`;
    return empacar(
      cabeza,
      it,
      (r, n) =>
        `${n}. ${r.ente}, radicado ${r.rad || 'sin número'}. Venció el ${formatoCorto(r.fmax)}${r.ret != null ? ' (' + r.ret + ' días hábiles de retraso)' : ''}.`,
      '\n\nEl detalle de cada radicado puede consultarse en el Control de Requerimientos. Se solicita dar respuesta de manera prioritaria, radicarla en ORFEO y reportar el número de radicado de salida al Despacho. Si el requerimiento ya fue respondido, favor informar el número de ORFEO para actualizar el registro.'
    );
  }
  if (tpl === 'preventivo') {
    const it = rows.filter(r => r.opo === 3).sort((a, b) => String(a.fmax).localeCompare(String(b.fmax)));
    const cabeza = `${hi}\n\nDesde el Despacho del Alcalde se recuerda que ${org} tiene ${it.length} requerimiento(s) de entes de control próximos a vencer:\n\n`;
    return empacar(
      cabeza,
      it,
      (r, n) => `${n}. ${r.ente}, radicado ${r.rad || 'sin número'}. Vence el ${formatoCorto(r.fmax)}.`,
      '\n\nSe agradece dar respuesta dentro del término y registrar el radicado ORFEO de salida.'
    );
  }
  if (tpl === 'reconocimiento') {
    return `${hi}\n\nDesde el Despacho del Alcalde se reconoce el compromiso de ${org} con la atención oportuna de los entes de control. En el periodo evaluado (vigencia ${per}; corte ${fc}) la dependencia respondió dentro del término ${st.ok} de ${st.ev} requerimientos (${st.ev ? Math.round((st.ok * 100) / st.ev) : 0}%).\n\nAgradecemos mantener este nivel de cumplimiento.${PIE}`;
  }
  return `${hi}\n\nDesde el Despacho del Alcalde se comparte el resumen de cumplimiento de ${org} frente a los entes de control (vigencia ${per}; corte ${fc}):\n\n- Requerimientos evaluados: ${st.ev}\n- Respondidos dentro del término: ${st.ok}\n- Respondidos fuera del término: ${st.tar}${st.tar ? ' (retraso promedio de ' + st.ret.toFixed(1).replace('.', ',') + ' días hábiles)' : ''}\n- Sin respuesta registrada: ${st.sin}\n- Porcentaje de incumplimiento: ${porcentaje1(st.tasa)}\n\nSe solicita revisar los pendientes y priorizar su respuesta.${PIE}`;
}

/** Plantilla que se propone al abrir la ventana (notifyModal), con las vigencias elegidas en el Centro de mando. */
export function plantillaSugerida(
  filas: readonly RadicadoHistorico[],
  org: string,
  vigs: readonly number[]
): Plantilla {
  const st = estadisticas(filas.filter(r => r.org === org && vigs.includes(r.v)));
  return st.sin > 0
    ? 'vencidos'
    : st.pend > 0
      ? 'preventivo'
      : st.tasa < UMBRALES.verde_lt && st.ev >= UMBRALES.min
        ? 'reconocimiento'
        : 'desempeno';
}

const ASUNTOS: Readonly<Record<string, string>> = {
  vencidos: 'Requerimientos de entes de control vencidos',
  preventivo: 'Recordatorio: requerimientos de entes de control por vencer',
  reconocimiento: 'Reconocimiento: cumplimiento frente a los entes de control',
  desempeno: 'Desempeño frente a los entes de control'
};
/** Asunto del correo según la plantilla. */
export const asuntoCorreo = (tpl: string, org: string) =>
  (ASUNTOS[tpl] ?? 'Requerimientos de entes de control') + ' · ' + nombreCorto(org);

/** Casos que cubre la notificación (n_items): vencidos, por vencer, o ambos para los resúmenes. */
export function casosNotificados(
  filas: readonly RadicadoHistorico[],
  org: string,
  vigs: readonly number[],
  tpl: string
): number {
  return filas.filter(
    r =>
      r.org === org &&
      vigs.includes(r.v) &&
      (tpl === 'preventivo' ? r.opo === 3 : tpl === 'vencidos' ? r.opo === 2 : r.opo === 2 || r.opo === 3)
  ).length;
}

/** Enlace de WhatsApp con el mensaje (wa.me). */
export const enlaceWhatsApp = (tel: string, msg: string) =>
  'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
/** Enlace de Gmail para redactar desde la cuenta institucional del remitente. */
export const enlaceGmail = (remitente: string, para: string, asunto: string, msg: string) =>
  'https://mail.google.com/mail/?authuser=' +
  encodeURIComponent(remitente) +
  '&view=cm&fs=1&tf=1&to=' +
  encodeURIComponent(para) +
  '&su=' +
  encodeURIComponent(asunto) +
  '&body=' +
  encodeURIComponent(msg);

/** ¿Ya se notificó hoy a la dependencia? (despachoModal: fecha local de hoy contra los 10 primeros caracteres). */
export const notificadaHoy = (lista: readonly Notificacion[], org: string, hoy: string) =>
  lista.some(n => n.org === org && String(n.ts).slice(0, 10) === hoy);

/** Archivo notificaciones.csv (notifCsv). */
export function filasCsvNotificaciones(lista: readonly Notificacion[]): unknown[][] {
  return [
    ['Fecha', 'Dependencia', 'Destinatario', 'Celular', 'Mensaje', 'Casos', 'Enviado por', 'Texto'],
    ...lista.map(n => [n.ts, n.org, n.nombre, n.tel, nombrePlantilla(n.tpl), n.n, n.usuario, n.mensaje])
  ];
}
