// Lee la configuración y crea la capa de datos. Separado de main.tsx para poder probarlo.
import { leerEntorno } from '../config/entorno';
import { crearDatos, type Datos } from '../datos';
import { aplicarTema, leerTema } from '../shared/lib';
export { esLlegadaParaClave } from '../dominio/seguridad';

export function arrancar(env: Record<string, string | undefined>): Datos {
  return crearDatos(leerEntorno(env));
}

/** Tema elegido antes (si lo hay), aplicado antes de pintar la primera pantalla. */
export function aplicarTemaGuardado(): void {
  aplicarTema(document.documentElement, leerTema(globalThis.localStorage));
}

/** Lo que se usa del service worker del navegador (navigator.serviceWorker). */
export interface ContenedorSW {
  controller: unknown;
  addEventListener(tipo: 'controllerchange', oyente: () => void): void;
}

/**
 * Cuando se publica una versión nueva, el service worker nuevo toma el control (autoUpdate: skipWaiting y
 * clientsClaim), pero la página abierta seguía mostrando la versión anterior hasta recargar dos veces. Al cambiar
 * de service worker se recarga una sola vez. No recarga en la primera instalación (antes no había ninguno).
 */
export function recargarAlActualizar(
  sw: ContenedorSW | undefined = globalThis.navigator?.serviceWorker,
  recargar: () => void = () => location.reload()
): void {
  if (!sw) return;
  const habia = !!sw.controller;
  let hecho = false;
  sw.addEventListener('controllerchange', () => {
    if (!habia || hecho) return;
    hecho = true;
    recargar();
  });
}
