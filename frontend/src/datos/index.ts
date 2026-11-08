// Único punto de entrada a la capa de datos (D-24, plan §7.2): entrega la implementación según la variante.
import type { Datos } from './contratos';
import type { Entorno } from '../config/entorno';
import { datosDemo } from './demo';

export function crearDatos(entorno: Entorno): Datos {
  if (entorno.variante === 'demo') return datosDemo();
  // La implementación con Supabase (datos/supabase/) se agrega en la F1 cuando se apruebe instalar
  // @supabase/supabase-js. Hasta entonces la 3.0 solo corre en demostración.
  throw new Error('La versión 3.0 todavía no se conecta a Supabase: use VITE_VARIANTE=demo.');
}

export type { Datos } from './contratos';
