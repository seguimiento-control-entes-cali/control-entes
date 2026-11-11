// Punto de entrada de Control de Entes 3.0 (Etapa 1, docs/migracion/README.md §6).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { arrancar, aplicarTemaGuardado, esLlegadaParaClave, recargarAlActualizar } from './app/arranque';
import './styles/base.css';

aplicarTemaGuardado();
recargarAlActualizar();
// Se lee antes de crear el cliente de Supabase, que limpia el enlace de la barra de direcciones (igual que la 2.x)
const llegadaClave = esLlegadaParaClave(location.hash);
const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('No se encontró el elemento #raiz en index.html');

createRoot(raiz).render(
  <StrictMode>
    <App
      llegadaClave={llegadaClave}
      datos={arrancar({
        VITE_VARIANTE: import.meta.env.VITE_VARIANTE,
        VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY
      })}
    />
  </StrictMode>
);
