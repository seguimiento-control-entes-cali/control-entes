// Configuración. Copia de la 2.x: saveCfg (18-acciones.js), guardarResumen, guardarAvisos, rpFecha y los textos de
// vConfig, respaldoCargar y saludCargar (src/js/08-vistas-catalogos-y-seguridad.js). Paridad comprobada en
// pruebas/paridad-configuracion.test.ts.

/** Fila de public.config. Las columnas de los scripts 14, 17 y 24 pueden faltar si el script no se instaló. */
export interface ConfiguracionGeneral {
  dias_rojo: number;
  correo_disciplinario: string;
  resumen_activo?: boolean;
  resumen_ultimo?: string | null;
  resumen_ultimo_detalle?: string;
  respaldo_ultimo?: string | null;
  respaldo_ultimo_detalle?: string;
  avisos_activo?: boolean;
  avisos_copia_correo?: string;
  avisos_ultimo?: string | null;
  avisos_ultimo_detalle?: string;
}
/** ¿Está instalado el script que agrega estas columnas? (la 2.x pregunta 'resumen_activo' in S.cfg, etc.). */
export const tieneResumen = (c: ConfiguracionGeneral) => 'resumen_activo' in c;
export const tieneAvisos = (c: ConfiguracionGeneral) => 'avisos_activo' in c;
export const tieneRespaldos = (c: ConfiguracionGeneral) => 'respaldo_ultimo' in c;

/** saveCfg: el umbral del semáforo va de 1 a 30 días. */
export const validarDiasRojo = (d: number) =>
  d >= 1 && d <= 30 ? null : 'Los días deben estar entre 1 y 30';

const CORREO_CALI = /^[a-z0-9._%+-]+@cali\.gov\.co$/;
/** guardarAvisos: la copia a Control Interno es vacía o un correo @cali.gov.co (en minúsculas). */
export function validarCopiaAvisos(copia: string): { copia: string; error: string | null } {
  const c = copia.trim().toLowerCase();
  return {
    copia: c,
    error: c && !CORREO_CALI.test(c) ? 'El correo de copia a Control Interno debe ser @cali.gov.co' : null
  };
}

export const textoResumenGuardado = (activo: boolean) =>
  activo ? 'Resumen semanal activado: se enviará los lunes a las 7:00 a. m.' : 'Resumen semanal desactivado';
export const textoAvisosGuardado = (activo: boolean) =>
  activo
    ? 'Aviso diario activado: se enviará de lunes a viernes a las 7:00 a. m.'
    : 'Aviso diario desactivado';

/** rpFecha de la 2.x: respaldo_2026-10-25_2300.json.gz → 25/10/2026, 11:00 p. m. */
export function fechaRespaldo(nombre: string): string {
  const m = /respaldo_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/.exec(nombre);
  if (!m) return nombre;
  const h = +(m[4] as string),
    hh = h % 12 || 12;
  return `${m[3]}/${m[2]}/${m[1]}, ${hh}:${m[5]} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}
/** Solo los archivos de copia (respaldo_….json.gz) del depósito respaldos. */
export const esRespaldo = (nombre: string) => /^respaldo_.*\.json\.gz$/.test(nombre);

export interface ArchivoRespaldo {
  nombre: string;
  kb: number | null;
}
export interface EventoSistema {
  id: number;
  created_at: string;
  origen: string;
  nivel: string;
  mensaje: string;
  detalle: unknown;
  usuario: string | null;
}
/** Detalle corto del error de un evento (los primeros 200 caracteres de detalle.error). */
export const errorDeEvento = (e: EventoSistema) => {
  const d = e.detalle as { error?: unknown } | null;
  return d && d.error ? String(d.error).slice(0, 200) : '';
};
export interface CargaExcel {
  created_at: string;
  vigencias: number[] | null;
  registros: number;
  usuario: string;
}
export interface VistaPreviaAvisos {
  hoy: string;
  dia_habil: boolean;
  activo: boolean;
  copia: string;
  sin_dependencia: number;
  dependencias: { dependencia: string; previo: number; atraso: number; correo: string }[];
}
