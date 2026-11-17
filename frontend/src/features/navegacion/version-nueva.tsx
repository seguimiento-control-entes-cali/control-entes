// Versión nueva publicada mientras la app está abierta: el service worker nuevo toma el control de inmediato
// (skipWaiting y clientsClaim), pero la página sigue con el código anterior hasta recargar. Se revisa cada 15 minutos
// y al volver a la ventana; con la ventana oculta y sin un formulario abierto se recarga sola y, si está a la vista,
// se ofrece un botón.
import { useEffect, useState } from 'react';

const CADA = 15 * 60_000;

export function useVersionNueva(): boolean {
  const [nueva, setNueva] = useState(false);
  useEffect(() => {
    const sw = globalThis.navigator?.serviceWorker;
    if (!sw) return;
    let habia = !!sw.controller;
    const alCambiar = () => {
      if (habia) setNueva(true);
      habia = true;
    };
    const revisar = () => {
      sw.getRegistration()
        .then(r => r?.update())
        .catch(() => undefined);
    };
    const alVolver = () => {
      if (document.visibilityState === 'visible') revisar();
    };
    sw.addEventListener('controllerchange', alCambiar);
    document.addEventListener('visibilitychange', alVolver);
    const i = setInterval(revisar, CADA);
    return () => {
      sw.removeEventListener('controllerchange', alCambiar);
      document.removeEventListener('visibilitychange', alVolver);
      clearInterval(i);
    };
  }, []);
  useEffect(() => {
    if (!nueva) return;
    const recargarSiOculta = () => {
      if (document.visibilityState === 'hidden' && !document.querySelector('[role="dialog"]'))
        location.reload();
    };
    recargarSiOculta();
    document.addEventListener('visibilitychange', recargarSiOculta);
    return () => document.removeEventListener('visibilitychange', recargarSiOculta);
  }, [nueva]);
  return nueva;
}

export function AvisoVersionNueva() {
  const nueva = useVersionNueva();
  if (!nueva) return null;
  return (
    <div className="banner" role="status">
      <b>Hay una versión nueva de la aplicación.</b> Actualice para usar las últimas correcciones; no se
      pierde nada de lo guardado.{' '}
      <button type="button" className="btn sm primary" onClick={() => location.reload()}>
        Actualizar ahora
      </button>
    </div>
  );
}
