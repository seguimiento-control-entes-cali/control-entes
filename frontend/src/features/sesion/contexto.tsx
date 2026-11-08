// Acceso de las pantallas a la capa de datos: solo a través del contrato Datos (plan §7.2), nunca a Supabase.
import { createContext, useContext } from 'react';
import type { Datos } from '../../datos/contratos';

export const ContextoDatos = createContext<Datos | null>(null);

export function useDatos(): Datos {
  const datos = useContext(ContextoDatos);
  if (!datos) throw new Error('useDatos se usó fuera de <ContextoDatos.Provider>');
  return datos;
}
