// Único punto de entrada a la capa de datos (D-24, plan §7.2): entrega la implementación según la variante.
import type { Datos } from './contratos';
import type { Entorno } from '../config/entorno';
import { datosDemo } from './demo';
import { crearClienteSupabase, datosSupabase } from './supabase';

export function crearDatos(entorno: Entorno): Datos {
  if (entorno.variante === 'demo') return datosDemo();
  // institucional y privada: la base real. leerEntorno ya validó la dirección y que la clave sea la publicable.
  return datosSupabase(crearClienteSupabase(entorno.supabaseUrl, entorno.supabaseAnonKey));
}

export type { Datos } from './contratos';
