// Raíz de la 3.0: proveedores (datos, consultas, rutas) y la decisión ingreso / marco según la sesión.
// Después de ingresar, igual que la 2.x (src/js/21-arranque.js, afterLogin): si se llegó desde el correo de
// invitación o de recuperación se pide la contraseña nueva; luego, la verificación en dos pasos según el rol.
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { HashRouter } from 'react-router-dom';
import type { Datos } from '../datos/contratos';
import { exigenciaVerificacion, type EnlaceConfirmar } from '../dominio/seguridad';
import { ContextoDatos, useDatos } from '../features/sesion/contexto';
import { PantallaIngreso } from '../features/sesion/PantallaIngreso';
import { ActivarVerificacion, ConfirmarEnlace, DefinirClave } from '../features/sesion/PantallasCuenta';
import { Marco } from '../features/navegacion/Marco';
import { LimiteErrores, ProveedorAvisos, useAvisos } from '../shared/ui';

const AVISO_RECOMENDADA = 'ce_mfa_aviso';

function Inicio({
  llegadaClave,
  demo,
  enlace
}: {
  llegadaClave: boolean;
  demo: boolean;
  enlace: EnlaceConfirmar | null;
}) {
  const datos = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [pedirClave, setPedirClave] = useState(llegadaClave);
  const [porConfirmar, setPorConfirmar] = useState(enlace);
  const perfil = useQuery({ queryKey: ['perfil'], queryFn: () => datos.identidad.miPerfil() });
  const recargar = () => cliente.invalidateQueries({ queryKey: ['perfil'] });
  // Clave temporal puesta por el Super administrador: hay que cambiarla antes de usar la app
  const temporal = useQuery({
    queryKey: ['clave-temporal', perfil.data?.id],
    queryFn: () => datos.auth.debeCambiarClave(),
    enabled: !!perfil.data && !pedirClave
  });
  useEffect(() => {
    if (temporal.data) setPedirClave(true);
  }, [temporal.data]);
  const usuario = perfil.data?.id;
  const exigencia = perfil.data ? exigenciaVerificacion(perfil.data.rol) : 'opcional';
  const verificacion = useQuery({
    queryKey: ['verificacion', usuario],
    queryFn: () => datos.auth.tieneVerificacion(),
    enabled: !!usuario && !pedirClave && exigencia !== 'opcional'
  });
  // Un registro en public.accesos por ingreso (igual que la 2.x); si falla no impide entrar
  useEffect(() => {
    if (usuario) void datos.identidad.registrarAcceso();
  }, [usuario, datos]);
  // Recomendada (Despacho y Control Interno): un aviso por sesión del navegador, como la 2.x
  useEffect(() => {
    if (exigencia !== 'recomendada' || verificacion.data !== false) return;
    try {
      if (sessionStorage.getItem(AVISO_RECOMENDADA)) return;
      sessionStorage.setItem(AVISO_RECOMENDADA, '1');
    } catch {
      // sin almacenamiento de sesión: se avisa igual
    }
    avisar('Recomendado: active la verificación en dos pasos en Mi cuenta.');
  }, [exigencia, verificacion.data, avisar]);

  const salir = async () => {
    await datos.auth.salir();
    // Se borra todo lo consultado por la cuenta que sale (en un equipo compartido no debe verlo quien entre después)
    cliente.removeQueries({ predicate: q => q.queryKey[0] !== 'perfil' });
    await recargar();
  };

  // Enlace protegido del correo: se usa solo cuando la persona oprime «Continuar»
  if (porConfirmar)
    return (
      <ConfirmarEnlace
        tipo={porConfirmar.tipo}
        alConfirmar={async () => {
          await datos.auth.confirmarEnlace(porConfirmar.tokenHash, porConfirmar.tipo);
          // El enlace ya no sirve: se quita de la barra de direcciones (y del historial)
          try {
            history.replaceState(null, '', location.pathname + location.search + '#/');
          } catch {
            // sin historial: no importa
          }
          setPedirClave(true);
          setPorConfirmar(null);
          await recargar();
        }}
      />
    );
  if (perfil.isPending) return <p className="cargando">Cargando…</p>;
  if (!perfil.data) return <PantallaIngreso alIngresar={recargar} />;
  if (pedirClave)
    return (
      <DefinirClave
        alGuardar={() => {
          setPedirClave(false);
          cliente.setQueryData(['clave-temporal', perfil.data?.id], false);
          avisar('Contraseña actualizada', 'ok');
        }}
      />
    );
  // Si no se puede consultar, se deja entrar (la 2.x tampoco bloquea ante un error de esta consulta)
  if (exigencia === 'obligatoria' && verificacion.isPending) return <p className="cargando">Cargando…</p>;
  if (exigencia === 'obligatoria' && verificacion.data === false)
    return (
      <ActivarVerificacion
        alActivar={() => {
          avisar('Verificación en dos pasos activada. Desde ahora se pedirá el código al ingresar.', 'ok');
          void cliente.invalidateQueries({ queryKey: ['verificacion'] });
        }}
        alSalir={salir}
      />
    );
  return <Marco perfil={perfil.data} alSalir={salir} demo={demo} />;
}

export function App({
  datos,
  cliente = new QueryClient(),
  llegadaClave = false,
  demo = false,
  enlace = null
}: {
  datos: Datos;
  cliente?: QueryClient;
  /** true si la página se abrió desde el correo de invitación o de recuperación de contraseña. */
  llegadaClave?: boolean;
  /** Variante de demostración: muestra "MODO DEMO" y el aviso de datos de ejemplo, como la 2.x. */
  demo?: boolean;
  /** Enlace protegido del correo (#confirmar=1&token_hash=…&tipo=…), si la página se abrió con él. */
  enlace?: EnlaceConfirmar | null;
}) {
  return (
    <ContextoDatos.Provider value={datos}>
      <QueryClientProvider client={cliente}>
        <ProveedorAvisos>
          <LimiteErrores>
            <HashRouter>
              <Inicio llegadaClave={llegadaClave} demo={demo} enlace={enlace} />
            </HashRouter>
          </LimiteErrores>
        </ProveedorAvisos>
      </QueryClientProvider>
    </ContextoDatos.Provider>
  );
}
