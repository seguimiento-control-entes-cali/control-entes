/**
 * src/js/01-configuracion.js
 * Configuración leída de configuracion.json (URL y clave pública de Supabase, remitente de correos) y variante construida.
 * Depende de: CE_BUILD (inyectado por scripts/build.mjs).
 *
 * Este archivo es una sección de la aplicación: scripts/build.mjs une src/js/01 a 21, en orden,
 * dentro de un único ámbito compartido. Las funciones declaradas aquí se pueden usar desde cualquier
 * archivo; las constantes, una vez se haya ejecutado el archivo que las declara. Ver docs/GUIA_DESARROLLO.md.
 */
/* =====================================================================
   CONFIGURACIÓN
   Los valores NO se escriben en este archivo: se toman de configuracion.json
   (raíz del repositorio) y scripts/build.mjs los inyecta en el objeto CE_BUILD.

   - supabaseUrl y supabaseAnonKey: Project Settings > API Keys en Supabase.
     La anon key es pública por diseño; la seguridad real la dan las políticas
     RLS de supabase/01_schema.sql. NUNCA uses la service_role key.
   - Si quedan vacíos, la app corre en MODO DEMOSTRACIÓN en memoria.
   - remitente: cuenta de Google Workspace que firma los correos de notificación.
   ===================================================================== */
/* config.js (publicado junto a index.html) tiene prioridad: así DATIC cambia de servidor sin reconstruir la app */
const CE_CONF = (typeof window !== 'undefined' && window.CE_CONFIG) || {};
const CFG = {
  SUPABASE_URL: CE_CONF.supabaseUrl || CE_BUILD.supabaseUrl || '',
  SUPABASE_ANON_KEY: CE_CONF.supabaseAnonKey || CE_BUILD.supabaseAnonKey || ''
};
/* Cuenta de Google Workspace desde la que se envían los correos de notificación */
const REMITENTE = CE_CONF.remitente || CE_BUILD.remitente || '';
/* Variante construida: 'institucional' (Supabase), 'demo' (datos ficticios) o 'privada' (datos reales sin conexión) */
const ES_DEMO_PUBLICA = CE_BUILD.variante === 'demo';
const ES_PRIVADA = CE_BUILD.variante === 'privada';
