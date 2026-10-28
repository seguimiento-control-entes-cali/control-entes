// =====================================================================
// Edge Function: respaldo
// Copia de seguridad de todas las tablas de la app en un archivo .json.gz dentro del
// bucket privado "respaldos" (supabase/17). Conserva las 12 copias más recientes.
//
// Quién la llama:
//   * La tarea programada de la base de datos (pg_cron), los domingos a las 11:00 p. m., con el
//     encabezado x-cron-clave igual al secreto RESUMEN_CLAVE.
//   * El Super administrador desde la app ("Crear copia ahora"), con su sesión y su código de
//     verificación en dos pasos.
// Cada ejecución queda en public.eventos_sistema y en config.respaldo_ultimo.
// Restaurar: scripts/restaurar-respaldo.mjs (ver docs/RESPALDOS.md).
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* Tablas en orden de restauración (primero las que otras referencian) y la columna para paginar */
const TABLAS: [string, string][] = [
  ['config', 'id'], ['entes', 'id'], ['dependencias', 'id'], ['profiles', 'id'], ['directorio', 'id'],
  ['requerimientos', 'id'], ['alertas_log', 'id'], ['notificaciones', 'id'], ['informes', 'id'], ['accesos', 'id'],
  ['historico_requerimientos', 'id'], ['historico_cargas', 'id'], ['tema_manual', 'row_key'], ['cruce_revision', 'clave'],
  ['cuentas_eventos', 'id'], ['pm_planes', 'id'], ['pm_hallazgos', 'id'], ['pm_acciones', 'id'], ['pm_avances', 'id'],
  // scripts 18 y 20: traslados, prórrogas, archivo documental e informes semestrales
  ['pm_traslados', 'id'], ['pm_prorrogas', 'id'], ['archivo_documentos', 'id'], ['pm_informes_avance', 'id'],
  ['eventos_sistema', 'id'], ['audit_log', 'id'], ['pm_restauraciones', 'audit_id']
];
const CONSERVAR = 12;
const LOTE = 1000;

const nivelSesion = (jwt: string) => {
  try {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4))).aal ?? 'aal1';
  } catch {
    return 'aal1';
  }
};
// deno-lint-ignore no-explicit-any
const exigeCodigo = async (admin: any, userId: string, jwt: string) => {
  if (nivelSesion(jwt) === 'aal2') return false;
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  // deno-lint-ignore no-explicit-any
  return (data?.factors ?? []).some((f: any) => f.status === 'verified');
};
const sello = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16).replace('T', '_').replace(':', '');

async function gzip(texto: string): Promise<Uint8Array> {
  const flujo = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return responder('ok');
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CLAVE = Deno.env.get('RESUMEN_CLAVE') ?? '';
  const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const evento = (nivel: string, mensaje: string, detalle: Record<string, unknown>, usuario: string) =>
    db.from('eventos_sistema').insert({ origen: 'respaldo', nivel, mensaje, detalle, usuario });

  // 1. ¿Quién llama?
  let usuario = 'tarea programada';
  const claveCron = req.headers.get('x-cron-clave') ?? '';
  if (!(CLAVE && claveCron && claveCron === CLAVE)) {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: quien } = await db.auth.getUser(jwt);
    if (!quien?.user) return responder({ error: 'Sesión no válida. Vuelve a ingresar.' }, 401);
    const { data: perfil } = await db.from('profiles').select('rol, activo, email').eq('id', quien.user.id).maybeSingle();
    if (!perfil || perfil.rol !== 'admin' || !perfil.activo)
      return responder({ error: 'Solo el Super administrador puede crear copias de seguridad.' }, 403);
    if (await exigeCodigo(db, quien.user.id, jwt))
      return responder({ error: 'Ingrese con su código de verificación en dos pasos.' }, 403);
    usuario = String(perfil.email || quien.user.email || '');
  }

  try {
    // 2. Leer todas las tablas por lotes
    const tablas: Record<string, unknown[]> = {};
    const conteo: Record<string, number> = {};
    for (const [t, orden] of TABLAS) {
      const filas: unknown[] = [];
      for (let desde = 0; ; desde += LOTE) {
        const { data, error } = await db.from(t).select('*').order(orden, { ascending: true }).range(desde, desde + LOTE - 1);
        if (error) {
          // Una tabla que aún no existe (script pendiente) no impide el resto de la copia
          if (/does not exist|schema cache|Could not find/i.test(error.message)) break;
          throw new Error(`Tabla ${t}: ${error.message}`);
        }
        filas.push(...(data ?? []));
        if (!data || data.length < LOTE) break;
      }
      tablas[t] = filas;
      conteo[t] = filas.length;
    }
    // Inventario de archivos con su huella SHA-256 registrada: permite comprobar un respaldo de archivos (ZIP
    // descargado desde Configuración) y restaurarlos con scripts/restaurar-archivos.mjs
    const inventario: { deposito: string; path: string; sha256: string }[] = [];
    for (const r of (tablas['requerimientos'] ?? []) as Record<string, string>[])
      if (r.soporte_path) inventario.push({ deposito: 'soportes', path: r.soporte_path, sha256: r.soporte_hash ?? '' });
    for (const v of (tablas['pm_avances'] ?? []) as Record<string, string>[])
      if (v.soporte_path) inventario.push({ deposito: 'soportes', path: v.soporte_path, sha256: v.soporte_hash ?? '' });
    for (const d of (tablas['archivo_documentos'] ?? []) as Record<string, string>[])
      inventario.push({ deposito: 'archivo', path: d.path, sha256: d.sha256 });

    // 3. Archivo comprimido
    const copia = {
      formato: 'control-entes-respaldo', version: 2, creado: new Date().toISOString(), creado_por: usuario,
      orden_restauracion: TABLAS.map(([t]) => t), conteo, tablas, archivos: inventario
    };
    const bytes = await gzip(JSON.stringify(copia));
    const nombre = `respaldo_${sello()}.json.gz`;
    const { error: eSubir } = await db.storage.from('respaldos').upload(nombre, bytes, { contentType: 'application/gzip', upsert: true });
    if (eSubir) throw new Error('No se pudo guardar el archivo: ' + eSubir.message);

    // 4. Conservar solo las más recientes
    const { data: lista } = await db.storage.from('respaldos').list('', { limit: 1000, sortBy: { column: 'name', order: 'desc' } });
    const viejos = (lista ?? []).filter(f => /^respaldo_.*\.json\.gz$/.test(f.name)).slice(CONSERVAR).map(f => f.name);
    if (viejos.length) await db.storage.from('respaldos').remove(viejos);

    const total = Object.values(conteo).reduce((a, b) => a + b, 0);
    const detalle = `${nombre}: ${total} registros en ${Object.keys(conteo).length} tablas, ${(bytes.length / 1024).toFixed(0)} KB`;
    await db.from('config').update({ respaldo_ultimo: new Date().toISOString(), respaldo_ultimo_detalle: detalle }).eq('id', 1);
    await evento('info', 'Copia de seguridad creada', { archivo: nombre, conteo, kb: Math.round(bytes.length / 1024) }, usuario);
    return responder({ ok: true, archivo: nombre, registros: total, conteo, kb: Math.round(bytes.length / 1024), borrados: viejos.length });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('Error en la copia de seguridad:', msg);
    await evento('error', 'Falló la copia de seguridad', { error: msg }, usuario);
    return responder({ error: msg }, 500);
  }
});
