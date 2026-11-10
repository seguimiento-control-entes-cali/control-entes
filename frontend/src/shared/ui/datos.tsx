// Componentes para mostrar datos: indicador (Kpi), estado vacío y tabla. Sin reglas de negocio (plan §7.1).
import type { ReactNode } from 'react';

export function Kpi({
  valor,
  etiqueta,
  tono
}: {
  valor: ReactNode;
  etiqueta: string;
  tono?: 'rojo' | 'amarillo' | 'verde';
}) {
  return (
    <div className={`kpi${tono ? ' kpi-' + tono : ''}`}>
      <span className="kpi-valor">{valor}</span>
      <span className="kpi-etiqueta">{etiqueta}</span>
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio" role="status">
      <p className="vacio-titulo">{titulo}</p>
      {children && <div className="vacio-texto">{children}</div>}
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
    <div className="tabla-marco">
      <table className="tabla">
        <caption className="solo-lector">{titulo}</caption>
        <thead>
          <tr>
            {columnas.map(c => (
              <th key={c.clave} scope="col" className={c.derecha ? 'derecha' : undefined}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={claveFila(f)}>
              {columnas.map(c => (
                <td key={c.clave} className={c.derecha ? 'derecha' : undefined}>
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
