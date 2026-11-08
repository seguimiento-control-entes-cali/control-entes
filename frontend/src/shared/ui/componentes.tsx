// Componentes genéricos sin reglas de negocio (plan §7.1: shared/ no importa features/ ni dominio/).
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Boton({
  variante = 'primario',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' }) {
  return <button className={`boton boton-${variante} ${className}`.trim()} {...props} />;
}

export function Tarjeta({ titulo, children }: { titulo?: string; children: ReactNode }) {
  return (
    <section className="tarjeta">
      {titulo && <h2 className="tarjeta-titulo">{titulo}</h2>}
      {children}
    </section>
  );
}

/** Píldora de color (por ejemplo, el semáforo): el texto lo decide quien la usa. */
export function Pildora({ tono, texto }: { tono: 'rojo' | 'amarillo' | 'verde'; texto: string }) {
  return (
    <span className={`pildora pildora-${tono}`}>
      <i aria-hidden="true" />
      {texto}
    </span>
  );
}

export function Campo({
  etiqueta,
  id,
  ...props
}: { etiqueta: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="campo">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} {...props} />
    </div>
  );
}

export function Aviso({ children }: { children: ReactNode }) {
  return (
    <p className="aviso" role="alert">
      {children}
    </p>
  );
}
