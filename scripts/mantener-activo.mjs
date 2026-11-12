// Consulta diaria para que el proyecto gratuito de Supabase no se pause por inactividad (pendiente 3 de la 2.6.1).
// Llama a la función de solo lectura public.hoy_colombia() (script 22) con la clave PUBLICABLE de configuracion.json:
// no lee ni escribe datos, no necesita secretos y solo devuelve la fecha de hoy en Colombia.
// Uso: node scripts/mantener-activo.mjs   (lo ejecuta a diario .github/workflows/mantener-activo.yml)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hace la consulta y devuelve la fecha (AAAA-MM-DD). Lanza un error si la respuesta no es la esperada. */
export async function consultarHoy(cfg, fetchFn = fetch) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cfg.supabaseUrl || ''))
    throw new Error('configuracion.json no tiene una dirección de Supabase válida');
  if (!/^sb_publishable_/.test(cfg.supabaseAnonKey || ''))
    throw new Error('Solo se permite la clave publicable (sb_publishable_...)');
  const r = await fetchFn(cfg.supabaseUrl + '/rest/v1/rpc/hoy_colombia', {
    method: 'POST',
    headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: '{}'
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`Supabase respondió ${r.status}: ${texto.slice(0, 200)}`);
  let fecha;
  try {
    fecha = JSON.parse(texto);
  } catch {
    fecha = null;
  }
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha))
    throw new Error('Respuesta inesperada: ' + texto.slice(0, 200));
  return fecha;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cfg = JSON.parse(fs.readFileSync(path.join(raiz, 'configuracion.json'), 'utf8'));
  try {
    const fecha = await consultarHoy(cfg);
    console.log('Supabase activo. Fecha en Colombia según la base de datos:', fecha);
  } catch (e) {
    console.error('La consulta diaria falló:', e.message);
    process.exit(1);
  }
}
