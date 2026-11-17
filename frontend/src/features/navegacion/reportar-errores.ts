// Errores del navegador en «Configuración → Salud del sistema» (reportarErrorApp de la 2.x, src/js/08: máximo 5 por
// sesión; el servidor limita 20 por hora con registrar_error_app del script 17). Nunca interrumpe la aplicación.
import { useEffect, useMemo } from 'react';
import type { RepositorioSistema } from '../../datos/contratos';
import { VERSION_APP } from '../../shared/lib';

const MAXIMO_POR_SESION = 5;

/** Devuelve la función que registra un error; además escucha los errores no atrapados del navegador. */
export function useReportarErrores(sistema: RepositorioSistema, demo: boolean) {
  const reportar = useMemo(() => {
    let n = 0;
    return (mensaje: string, detalle: Record<string, unknown> = {}) => {
      if (demo || n >= MAXIMO_POR_SESION) return;
      n++;
      const g = globalThis as unknown as { location?: { hash?: string }; navigator?: { userAgent?: string } };
      sistema
        .registrarError(String(mensaje || 'Error').slice(0, 500), {
          ...detalle,
          vista: (g.location?.hash ?? '').replace(/^#\/?/, ''),
          version: VERSION_APP,
          navegador: (g.navigator?.userAgent ?? '').slice(0, 160)
        })
        .catch(() => undefined);
    };
  }, [sistema, demo]);

  useEffect(() => {
    const w = globalThis as unknown as {
      addEventListener?: (t: string, f: (e: unknown) => void) => void;
      removeEventListener?: (t: string, f: (e: unknown) => void) => void;
    };
    const alError = (e: unknown) => {
      const ev = e as { message?: string; lineno?: number; colno?: number; filename?: string };
      reportar(ev.message ?? 'Error', {
        archivo: ev.filename ? 'app' : '',
        linea: ev.lineno,
        columna: ev.colno
      });
    };
    const alRechazo = (e: unknown) => {
      const r = (e as { reason?: { message?: string } }).reason;
      reportar(r?.message ?? String(r), { tipo: 'promesa' });
    };
    w.addEventListener?.('error', alError);
    w.addEventListener?.('unhandledrejection', alRechazo);
    return () => {
      w.removeEventListener?.('error', alError);
      w.removeEventListener?.('unhandledrejection', alRechazo);
    };
  }, [reportar]);

  return reportar;
}
