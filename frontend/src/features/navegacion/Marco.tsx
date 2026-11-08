// Marco de la aplicación: menú lateral según el rol (dominio/menu.ts) y la pantalla elegida. Las pantallas reales
// llegan en la F2 y la F3; mientras tanto cada opción muestra que está en construcción.
import { NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import type { Perfil } from '../../datos/contratos';
import { menuDe, pantallaInicial } from '../../dominio/menu';
import { NOMBRE_ROL } from '../../dominio/roles';
import { Boton, Tarjeta } from '../../shared/ui';

function PantallaPendiente({ textos, inicial }: { textos: Map<string, string>; inicial: string }) {
  const { id = '' } = useParams();
  // Igual que la 2.x: una pantalla que el rol no tiene lleva a su pantalla inicial
  if (!textos.has(id)) return <Navigate to={'/' + inicial} replace />;
  return (
    <Tarjeta titulo={textos.get(id)}>
      <p>
        Esta pantalla se construye en las próximas fases de la versión 3.0. Mientras tanto se usa en la
        versión 2.x.
      </p>
    </Tarjeta>
  );
}

export function Marco({ perfil, alSalir }: { perfil: Perfil; alSalir: () => void }) {
  const grupos = menuDe(perfil.rol);
  const textos = new Map(grupos.flatMap(g => g.opciones.map(o => [o.id, o.texto] as const)));
  return (
    <div className="marco">
      <nav className="menu" aria-label="Menú principal">
        <p className="menu-app">Control de Entes 3.0</p>
        {grupos.map(g => (
          <div key={g.grupo}>
            <p className="menu-grupo">{g.grupo}</p>
            {g.opciones.map(o => (
              <NavLink key={o.id} to={`/${o.id}`} className="menu-opcion">
                {o.texto}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="menu-usuario">
          <p>{perfil.correo}</p>
          <p className="sub">{NOMBRE_ROL[perfil.rol]}</p>
          <Boton variante="secundario" onClick={alSalir}>
            Salir
          </Boton>
        </div>
      </nav>
      <main className="contenido">
        <Routes>
          <Route
            path="/:id"
            element={<PantallaPendiente textos={textos} inicial={pantallaInicial(perfil.rol)} />}
          />
          <Route path="*" element={<Navigate to={`/${pantallaInicial(perfil.rol)}`} replace />} />
        </Routes>
      </main>
    </div>
  );
}
