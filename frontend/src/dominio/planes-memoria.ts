// Planes de mejoramiento · memoria (entrega 4b): archivo documental de cada plan y papelera. Reglas de
// src/js/19-planes-norma-y-memoria.js de la 2.x (PM_DOC_TIPOS, PM_DOC_MIME, PM_DOC_MAX, pmDocNombreSeguro, pmDocSubir,
// PM_PAP_TIPO). Requiere el script 20; sin él la aplicación oculta estas funciones.
import { txt } from './planes';

export const TIPOS_DOCUMENTO: Readonly<Record<string, string>> = {
  informe_final: 'Informe final',
  plan_excel: 'Plan en Excel',
  formato_exportado: 'Formato exportado',
  informe_avance: 'Informe semestral de avance',
  oficio: 'Oficio',
  soporte: 'Soporte',
  otro: 'Otro'
};
export const MIME_DOCUMENTO: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv'
};
export const MAX_DOCUMENTO = 50 * 1024 * 1024;
export const TIPOS_PAPELERA: Readonly<Record<string, string>> = {
  pm_planes: 'Plan',
  pm_hallazgos: 'Hallazgo',
  pm_acciones: 'Acción',
  pm_traslados: 'Traslado'
};

/** pmDocNombreSeguro: nombre para la ruta en el depósito (sin tildes ni símbolos, máximo 120 caracteres). */
export const nombreSeguro = (n: unknown) =>
  txt(n)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .slice(-120) || 'documento';
/** Tipo MIME permitido según la extensión, o el mensaje de error de la 2.x. */
export function revisarDocumento(nombre: string, tamano: number): { mime: string } | { error: string } {
  const ext = (nombre.split('.').pop() || '').toLowerCase();
  const mime = MIME_DOCUMENTO[ext];
  if (!mime) return { error: 'Tipo de archivo no permitido: use PDF, Excel, Word o CSV' };
  if (tamano > MAX_DOCUMENTO) return { error: 'El archivo supera 50 MB' };
  return { mime };
}
/** Ruta en el depósito «archivo»: <plan>/<año>/<marca de tiempo>-<nombre seguro> (pmDocSubir). */
export const rutaDocumento = (
  planId: string | null | undefined,
  hoy: string,
  marca: number,
  nombre: string
) => `${planId || 'general'}/${hoy.slice(0, 4)}/${marca.toString(36)}-${nombreSeguro(nombre)}`;
/** Radicado ORFEO: solo dígitos, entre 10 y 20 (pmDocGuardar e pmInfGuardar). */
export function radicadoOrfeo(v: string): { ok: string } | { error: string } {
  const orf = v.replace(/\D/g, '');
  if (orf && (orf.length < 10 || orf.length > 20))
    return { error: 'El radicado ORFEO debe tener entre 10 y 20 dígitos' };
  return { ok: orf };
}

/** Lo que se registra de un documento (sin el contenido). */
export interface MetaDocumento {
  plan_id: string | null;
  requerimiento_id?: string | null;
  tipo: string;
  radicado_orfeo?: string;
  observaciones?: string;
  /** Nombre del archivo, si no se toma del archivo elegido. */
  nombre?: string;
}
/** Elemento de la papelera (pm_papelera del script 20; en la demo, lo que se borró para poder restaurarlo). */
export interface ElementoPapelera {
  audit_id: string;
  tabla: string;
  registro_id: string;
  descripcion: string;
  eliminado_at: string;
  dependientes: number;
}
