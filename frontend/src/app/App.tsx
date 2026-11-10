// Raíz de la 3.0: proveedores (datos, consultas, rutas) y la decisión ingreso / marco según la sesión.
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import type { Datos } from '../datos/contratos';
import { ContextoDatos, useDatos } from '../features/sesion/contexto';
import { PantallaIngreso } from '../features/sesion/PantallaIngreso';
import { Marco } from '../features/navegacion/Marco';
import { LimiteErrores, ProveedorAvisos } from '../shared/ui';

function Inicio() {
  const datos = useDatos();
  const cliente = useQueryClient();
  const perfil = useQuery({ queryKey: ['perfil'], queryFn: () => datos.identidad.miPerfil() });
  const recargar = () => cliente.invalidateQueries({ queryKey: ['perfil'] });

  if (perfil.isPending) return <p className="cargando">Cargando…</p>;
  if (!perfil.data) return <PantallaIngreso alIngresar={recargar} />;
  return (
    <Marco
      perfil={perfil.data}
      alSalir={async () => {
        await datos.auth.salir();
        await recargar();
      }}
    />
  );
}

export function App({ datos, cliente = new QueryClient() }: { datos: Datos; cliente?: QueryClient }) {
  return (
    <ContextoDatos.Provider value={datos}>
      <QueryClientProvider client={cliente}>
        <ProveedorAvisos>
          <LimiteErrores>
            <HashRouter>
              <Inicio />
            </HashRouter>
          </LimiteErrores>
        </ProveedorAvisos>
      </QueryClientProvider>
    </ContextoDatos.Provider>
  );
}
