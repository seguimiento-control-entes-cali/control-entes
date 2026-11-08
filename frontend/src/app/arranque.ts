// Lee la configuración y crea la capa de datos. Separado de main.tsx para poder probarlo.
import { leerEntorno } from '../config/entorno';
import { crearDatos, type Datos } from '../datos';

export function arrancar(env: Record<string, string | undefined>): Datos {
  return crearDatos(leerEntorno(env));
}
