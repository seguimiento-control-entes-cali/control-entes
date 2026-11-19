// Componentes genéricos sin reglas de negocio (plan §7.1: shared/ no importa features/ ni dominio/).
// Usan las MISMAS clases de la 2.x (btn, card, field, pill, err…) para que la 3.0 se vea igual (src/css/03 y 04).
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

/** Ícono de Font Awesome, como en la 2.x (<i class="fa-solid fa-…">). */
export function Icono({ nombre, tipo = 'solid' }: { nombre: string; tipo?: 'solid' | 'regular' | 'brands' }) {
  return <i className={`fa-${tipo} ${nombre}`} aria-hidden="true" />;
}

export function Boton({
  variante = 'primario',
  icono,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario'; icono?: string }) {
  return (
    <button
      className={`btn${variante === 'primario' ? ' primary' : ''} ${className}`.trim()}
      type="button"
      {...props}
    >
      {icono && <Icono nombre={icono} />} {children}
    </button>
  );
}

export function Tarjeta({
  titulo,
  icono,
  className = '',
  children
}: {
  titulo?: string;
  icono?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`.trim()}>
      {titulo && (
        <h3>
          {icono && <Icono nombre={icono} />} {titulo}
        </h3>
      )}
      {children}
    </section>
  );
}

/** Píldora de color (por ejemplo, el semáforo): el texto lo decide quien la usa. */
export function Pildora({ tono, texto }: { tono: 'rojo' | 'amarillo' | 'verde'; texto: string }) {
  return (
    <span className={`pill ${tono}`}>
      <i aria-hidden="true" />
      {texto}
    </span>
  );
}

export function Campo({
  etiqueta,
  id,
  ayuda,
  ...props
}: { etiqueta: string; id: string; ayuda?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <input id={id} {...props} />
      {ayuda && <div className="hint">{ayuda}</div>}
    </div>
  );
}

/** Campo de contraseña con el ojito para ver lo que se escribió (y volver a ocultarlo). */
export function CampoClave({
  etiqueta,
  id,
  ayuda,
  ...props
}: { etiqueta: string; id: string; ayuda?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [ver, setVer] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{etiqueta}</label>
      <div style={{ position: 'relative' }}>
        <input id={id} type={ver ? 'text' : 'password'} style={{ paddingRight: 44 }} {...props} />
        <button
          type="button"
          className="icon-btn"
          aria-label={ver ? 'Ocultar lo escrito' : 'Mostrar lo escrito'}
          title={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={ver}
          onClick={() => setVer(v => !v)}
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
        >
          <Icono nombre={ver ? 'fa-eye-slash' : 'fa-eye'} />
        </button>
      </div>
      {ayuda && <div className="hint">{ayuda}</div>}
    </div>
  );
}

/** Mensaje de error dentro de un formulario (clase err de la 2.x). */
export function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="hint err" role="alert" style={{ margin: '0 0 12px' }}>
      {children}
    </div>
  );
}
