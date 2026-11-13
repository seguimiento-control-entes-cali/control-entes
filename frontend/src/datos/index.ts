// Único punto de entrada a la capa de datos (D-24, plan §7.2): entrega la implementación según la variante.
import type { Datos } from './contratos';
import type { Entorno } from '../config/entorno';
import { datosDemo } from './demo';
import { crearClienteSupabase, datosSupabase } from './supabase';

export function crearDatos(entorno: Entorno): Datos {
  const remitente = entorno.remitente ?? '';
  if (entorno.variante === 'demo') return { ...datosDemo(), remitente };
  // institucional y privada: la base real. leerEntorno ya validó la dirección y que la clave sea la publicable.
  return { ...datosSupabase(crearClienteSupabase(entorno.supabaseUrl, entorno.supabaseAnonKey)), remitente };
}

export type { Datos } from './contratos';
