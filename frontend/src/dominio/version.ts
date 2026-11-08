// Reglas puras (sin React, sin navegador, sin datos): docs/migracion/README.md §7.1 y §7.3.
// Texto de la versión instalada, con la misma forma que versionApp() de la 2.x (src/js/01-configuracion.js).

export type Variante = 'institucional' | 'demo' | 'privada';

const NOMBRE_VARIANTE: Record<Variante, string> = {
  institucional: 'institucional',
  demo: 'demostración',
  privada: 'privada'
};

/**
 * "Control de Entes versión 3.0.0 · demostración · construida el 08/11/2026".
 * fechaConstruccion va en formato AAAA-MM-DD; si falta o no es válida, se omite.
 */
export function textoVersion(version: string, variante?: Variante, fechaConstruccion?: string): string {
  const partes = ['Control de Entes ' + (version ? 'versión ' + version : '(versión sin dato)')];
  if (variante) partes.push(NOMBRE_VARIANTE[variante]);
  const fecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaConstruccion ?? '');
  if (fecha) partes.push(`construida el ${fecha[3]}/${fecha[2]}/${fecha[1]}`);
  return partes.join(' · ');
}
