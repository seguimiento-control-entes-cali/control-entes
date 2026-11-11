// Componentes para mostrar datos: indicador (Kpi), estado vacío y tabla. Sin reglas de negocio (plan §7.1).
// Mismas clases de la 2.x (card kpi g/y/r, empty, tbl-wrap/tbl) para que se vean igual.
import type { ReactNode } from 'react';

export function Kpi({
  valor,
  etiqueta,
  tono,
  de
}: {
  valor: ReactNode;
  etiqueta: string;
  tono?: 'rojo' | 'amarillo' | 'verde';
  /** Total al lado del valor ("30 / 30"), como kpi-of de la 2.x. */
  de?: ReactNode;
}) {
  const letra = tono === 'rojo' ? ' r' : tono === 'amarillo' ? ' y' : tono === 'verde' ? ' g' : '';
  return (
    <div className={'card kpi' + letra}>
      <small>{etiqueta}</small>
      <b>
        {valor}
        {de != null && <span className="kpi-of"> / {de}</span>}
      </b>
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
      {titulo}
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export interface Columna<T> {
  /** Identificador único de la columna. */
  clave: string;
  titulo: string;
  celda: (fila: T) => ReactNode;
  /** Alinear a la derecha (cifras). */
  derecha?: boolean;
}

/**
 * Tabla accesible con encabezados reales (th + scope). Si no hay filas muestra el estado vacío.
 * `claveFila` da un identificador estable a cada fila (React lo necesita para no mezclar filas al reordenar).
 */
export function Tabla<T>({
  columnas,
  filas,
  claveFila,
  titulo,
  vacio = 'No hay registros para mostrar.'
}: {
  columnas: Columna<T>[];
  filas: readonly T[];
  claveFila: (fila: T) => string | number;
  titulo: string;
  vacio?: string;
}) {
  if (!filas.length) return <Vacio titulo={vacio} />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <caption className="solo-lector">{titulo}</caption>
        <thead>
          <tr>
            {columnas.map(c => (
              <th key={c.clave} scope="col" className={c.derecha ? 'right' : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={claveFila(f)}>
              {columnas.map(c => (
                <td key={c.clave} className={c.derecha ? 'right' : undefined}>
                  {c.celda(f)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
