// Ventana (Modal) y avisos emergentes (Toast). Sin reglas de negocio (plan §7.1).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Boton } from './componentes';

/** Ventana con el diálogo nativo del navegador: atrapa el foco, se cierra con Escape y no deja tocar el fondo. */
export function Modal({
  abierto,
  titulo,
  alCerrar,
  children,
  pie
}: {
  abierto: boolean;
  titulo: string;
  alCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    // jsdom (pruebas) no implementa showModal: se usa el atributo open
    if (abierto && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!abierto && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [abierto]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-titulo"
      onCancel={e => {
        e.preventDefault();
        alCerrar();
      }}
    >
      {abierto && (
        <>
          <header className="modal-cabeza">
            <h2 id="modal-titulo">{titulo}</h2>
            <button type="button" className="modal-cerrar" aria-label="Cerrar ventana" onClick={alCerrar}>
              ×
            </button>
          </header>
          <div className="modal-cuerpo">{children}</div>
          <footer className="modal-pie">
            {pie ?? (
              <Boton variante="secundario" onClick={alCerrar}>
                Cerrar
              </Boton>
            )}
          </footer>
        </>
      )}
    </dialog>
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
      <div className="avisos" aria-live="polite">
        {avisos.map(a => (
          <p
            key={a.id}
            className={`aviso-emergente aviso-${a.tono}`}
            role={a.tono === 'error' ? 'alert' : 'status'}
          >
            {a.texto}
          </p>
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
