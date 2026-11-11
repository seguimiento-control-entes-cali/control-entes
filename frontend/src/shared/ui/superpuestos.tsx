// Ventana (Modal) y avisos emergentes (Toast). Sin reglas de negocio (plan §7.1).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Boton } from './componentes';

/** Ventana igual a la 2.x (overlay + modal con cabecera azul): se cierra con Escape, con la × o al tocar afuera. */
export function Modal({
  abierto,
  titulo,
  alCerrar,
  children,
  pie,
  ancha = false
}: {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  /** Ventana ancha (wide de la 2.x: hasta 720 px). */
  ancha?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    document.addEventListener('keydown', tecla);
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => document.removeEventListener('keydown', tecla);
  }, [abierto, alCerrar]);
  if (!abierto) return null;
  return (
    <div
      className="overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
        style={ancha ? { width: 'min(720px, 100%)' } : undefined}
      >
        <header>
          <h3 id="modal-titulo">{titulo}</h3>
          <button type="button" className="icon-btn" aria-label="Cerrar ventana" onClick={alCerrar}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </header>
        <div className="body">{children}</div>
        <footer>
          {pie ?? (
            <Boton variante="secundario" onClick={alCerrar}>
              Cerrar
            </Boton>
          )}
        </footer>
      </div>
    </div>
  );
}

type TonoAviso = 'ok' | 'error' | 'info';
interface AvisoEmergente {
  id: number;
  texto: string;
  tono: TonoAviso;
}
const ContextoAvisos = createContext<((texto: string, tono?: TonoAviso) => void) | null>(null);

/** Proveedor de avisos emergentes: cada aviso desaparece solo a los `duracion` milisegundos. */
export function ProveedorAvisos({ children, duracion = 4000 }: { children: ReactNode; duracion?: number }) {
  const [avisos, setAvisos] = useState<AvisoEmergente[]>([]);
  const siguiente = useRef(1);
  const avisar = useCallback(
    (texto: string, tono: TonoAviso = 'info') => {
      const id = siguiente.current++;
      setAvisos(a => [...a, { id, texto, tono }]);
      setTimeout(() => setAvisos(a => a.filter(x => x.id !== id)), duracion);
    },
    [duracion]
  );
  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}
      <div id="toasts" aria-live="polite">
        {avisos.map(a => (
          <div
            key={a.id}
            className={'toast' + (a.tono === 'error' ? ' err' : '')}
            role={a.tono === 'error' ? 'alert' : 'status'}
          >
            <i
              className={'fa-solid ' + (a.tono === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check')}
              aria-hidden="true"
            />
            <span>{a.texto}</span>
          </div>
        ))}
      </div>
    </ContextoAvisos.Provider>
  );
}

export function useAvisos() {
  const avisar = useContext(ContextoAvisos);
  if (!avisar) throw new Error('useAvisos se usó fuera de <ProveedorAvisos>');
  return avisar;
}
