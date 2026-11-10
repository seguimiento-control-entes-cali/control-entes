// Lee la configuración y crea la capa de datos. Separado de main.tsx para poder probarlo.
import { leerEntorno } from '../config/entorno';
import { crearDatos, type Datos } from '../datos';
import { aplicarTema, leerTema } from '../shared/lib';

export function arrancar(env: Record<string, string | undefined>): Datos {
  return crearDatos(leerEntorno(env));
}

/** Tema elegido antes (si lo hay), aplicado antes de pintar la primera pantalla. */
export function aplicarTemaGuardado(): void {
  aplicarTema(document.documentElement, leerTema(globalThis.localStorage));
}
