// =====================================================================
// Edge Function: avisos-planes
// Aviso diario de planes de mejoramiento: un correo por dependencia, al secretario o director, con copia al correo
// de Control Interno definido en Configuración, con las acciones que vencen el próximo día hábil y las que se
// vencieron sin cumplirse (primer día hábil después del vencimiento, solo las de los últimos 7 días). Las reglas
// están en ./reglas.js (con sus pruebas en tests/avisos-planes.test.cjs).
//
// Quién la llama:
//   * La tarea programada (supabase/25_programar_avisos.sql), de lunes a viernes a las 7:00 a. m., con el encabezado
//     x-cron-clave igual al secreto RESUMEN_CLAVE. Solo envía si el aviso está activo en Configuración y si hoy es
//     día hábil.
//   * El Super administrador desde la app, con su sesión y su código de dos pasos, en modo "vista previa": muestra lo
//     que se enviaría hoy y no envía nada.
// Nunca avisa dos veces lo mismo: antes de enviar reserva cada aviso en public.pm_avisos (único por acción, tipo y
// fecha); si el correo falla, libera la reserva para intentarlo al día siguiente.
// Secretos: SMTP_USER, SMTP_PASS y RESUMEN_CLAVE (los mismos del resumen semanal) y SITIO_URL.
// Requiere el script supabase/24_avisos_planes.sql.
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import { armarCorreo, claveAviso, copiaValida, debeCorrer, elegirAvisos, hoyColombia, porDependencia, titularDe } from './reglas.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* Verificación en dos pasos (supabase/14): igual que en resumen-semanal */
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return responder('ok');
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const CLAVE = Deno.env.get('RESUMEN_CLAVE') ?? '';
  const SITIO = Deno.env.get('SITIO_URL') ?? '';
  const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const evento = (nivel: string, mensaje: string, detalle: Record<string, unknown>, usuario: string) =>
    db.from('eventos_sistema').insert({ origen: 'avisos-planes', nivel, mensaje, detalle, usuario });

  // 1. ¿Quién llama? La tarea programada envía; el Super administrador solo ve la vista previa.
  let vistaPrevia = false,
    usuario = 'tarea programada';
  const claveCron = req.headers.get('x-cron-clave') ?? '';
  if (!(CLAVE && claveCron && claveCron === CLAVE)) {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: quien } = await db.auth.getUser(jwt);
    if (!quien?.user) return responder({ error: 'Sesión no válida. Vuelve a ingresar.' }, 401);
    const { data: perfil } = await db.from('profiles').select('rol, activo, email').eq('id', quien.user.id).maybeSingle();
    if (!perfil || perfil.rol !== 'admin' || !perfil.activo)
      return responder({ error: 'Solo el Super administrador puede ver la vista previa del aviso.' }, 403);
    if (await exigeCodigo(db, quien.user.id, jwt))
      return responder({ error: 'Ingrese con su código de verificación en dos pasos.' }, 403);
    vistaPrevia = true;
    usuario = String(perfil.email || quien.user.email || '');
  }

  // 2. Activación y día hábil, ANTES de exigir los secretos del correo (apagado no responde error)
  const { data: cfg, error: eCfg } = await db.from('config').select('avisos_activo, avisos_copia_correo').eq('id', 1).maybeSingle();
  if (eCfg) return responder({ error: 'Falta ejecutar supabase/24_avisos_planes.sql: ' + eCfg.message }, 500);
  const hoy = hoyColombia();
  if (!vistaPrevia && !cfg?.avisos_activo) return responder({ ok: true, enviados: 0, nota: 'El aviso diario está desactivado en Configuración.' });
  if (!vistaPrevia && !debeCorrer(hoy)) return responder({ ok: true, enviados: 0, nota: `Hoy (${hoy}) no es día hábil: no se envían avisos.` });
  const copia = String(cfg?.avisos_copia_correo ?? '').trim().toLowerCase();
  if (!copiaValida(copia)) return responder({ error: 'El correo de copia a Control Interno debe ser @cali.gov.co.' }, 500);

  // 3. Datos
  const [deps, dir, acc, hall, planes, envs] = await Promise.all([
    db.from('dependencias').select('id, nombre, activo'),
    db.from('directorio').select('organismo, cargo, nombre, correo'),
    db.from('pm_acciones').select('id, plan_id, hallazgo_id, dependencia_id, accion, fecha_fin, avance, cantidad'),
    db.from('pm_hallazgos').select('id, numero'),
    db.from('pm_planes').select('id, formato, estado'),
    db.from('pm_avisos').select('accion_id, tipo, fecha_fin')
  ]);
  for (const r of [deps, dir, acc, hall, planes, envs]) if (r.error) return responder({ error: r.error.message }, 500);
  const planF = new Map((planes.data ?? []).map(p => [p.id, p]));
  const hallN = new Map((hall.data ?? []).map(h => [h.id, h.numero]));
  const depN = new Map((deps.data ?? []).map(d => [d.id, d]));
  const enviados = new Set((envs.data ?? []).map(e => claveAviso(e.accion_id, e.tipo, e.fecha_fin)));
  const elegidos = elegirAvisos({ hoy, acciones: acc.data ?? [], planes: planF, enviados });
  const grupos = porDependencia(elegidos);

  // Vista previa: lo que se enviaría hoy, sin enviar ni reservar nada
  if (vistaPrevia) {
    const lista = [...grupos].map(([id, g]) => {
      const d = depN.get(id);
      const t = d ? titularDe(dir.data ?? [], d.nombre) : null;
      return { dependencia: d?.nombre ?? `Dependencia ${id}`, previo: g.previo.length, atraso: g.atraso.length, correo: t?.correo ?? '', activa: d?.activo !== false };
    });
    return responder({ ok: true, vista_previa: true, hoy, dia_habil: debeCorrer(hoy), activo: !!cfg?.avisos_activo, copia,
      dependencias: lista, sin_dependencia: elegidos.sinDependencia.length });
  }

  const SMTP_USER = (Deno.env.get('SMTP_USER') ?? '').toLowerCase();
  const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
  const resultado = { enviados: 0, avisos: 0, sinCorreo: [] as string[], errores: [] as string[], sinDependencia: elegidos.sinDependencia.length };
  if (grupos.size && (!SMTP_USER || !SMTP_PASS)) return responder({ error: 'Faltan los secretos SMTP_USER y SMTP_PASS de la función.' }, 500);

  // 4. Un correo por dependencia: reservar, enviar y, si falla, liberar
  if (grupos.size) {
    const smtp = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } } });
    try {
      for (const [id, g] of grupos) {
        const d = depN.get(id);
        if (!d || d.activo === false) continue;
        const titular = titularDe(dir.data ?? [], d.nombre);
        if (!titular) {
          resultado.sinCorreo.push(d.nombre);
          continue;
        }
        const para = String(titular.correo).toLowerCase();
        const filas = [...g.previo.map(a => ({ a, tipo: 'previo' })), ...g.atraso.map(a => ({ a, tipo: 'atraso' }))].map(({ a, tipo }) => ({
          accion_id: a.id, tipo, fecha_fin: String(a.fecha_fin).slice(0, 10), dependencia_id: id, correo: para, copia
        }));
        // Reserva: solo quedan las que nadie había registrado (otra ejecución el mismo día no las repite)
        const { data: reservadas, error: eRes } = await db.from('pm_avisos')
          .upsert(filas, { onConflict: 'accion_id,tipo,fecha_fin', ignoreDuplicates: true }).select('id, accion_id, tipo');
        if (eRes) {
          resultado.errores.push(`${d.nombre}: ${eRes.message}`);
          continue;
        }
        const ok = new Set((reservadas ?? []).map(r => r.accion_id + '|' + r.tipo));
        const previo = g.previo.filter(a => ok.has(a.id + '|previo')), atraso = g.atraso.filter(a => ok.has(a.id + '|atraso'));
        if (!previo.length && !atraso.length) continue;
        const correo = armarCorreo({ dependencia: d.nombre, titular, previo, atraso, hallazgos: hallN, planes: planF, sitio: SITIO, hoy });
        try {
          await smtp.send({ from: `Despacho del Alcalde <${SMTP_USER}>`, to: para, ...(copia ? { cc: copia } : {}),
            subject: correo.asunto, content: correo.texto, html: correo.html });
          resultado.enviados++;
          resultado.avisos += correo.n;
          await db.from('notificaciones').insert({
            organismo: d.nombre, destinatario: titular.nombre ?? '', telefono: '', correo: para, canal: 'correo',
            plantilla: 'Aviso diario de planes', n_items: correo.n, mensaje: correo.texto, enviado_por: null
          });
        } catch (e) {
          // El correo no salió: se libera la reserva para intentarlo al día siguiente
          await db.from('pm_avisos').delete().in('id', (reservadas ?? []).map(r => r.id));
          resultado.errores.push(`${d.nombre}: ${(e as Error).message}`);
          console.error('Error enviando a', para, '-', (e as Error).message);
        }
      }
    } finally {
      await smtp.close();
    }
  }

  // 5. Monitoreo (supabase/17) y último envío en Configuración
  await evento(resultado.errores.length ? 'error' : 'info',
    resultado.errores.length ? `Aviso diario con ${resultado.errores.length} error(es)` : `Aviso diario: ${resultado.enviados} correo(s), ${resultado.avisos} aviso(s)`,
    { errores: resultado.errores.slice(0, 10), error: resultado.errores[0] ?? null, sinCorreo: resultado.sinCorreo, sinDependencia: resultado.sinDependencia, hoy },
    usuario);
  await db.from('config').update({
    avisos_ultimo: new Date().toISOString(),
    avisos_ultimo_detalle: `${resultado.enviados} correos, ${resultado.avisos} avisos; ${resultado.sinCorreo.length} dependencias sin correo; ${resultado.errores.length} errores`
  }).eq('id', 1);
  return responder({ ok: true, hoy, ...resultado });
});
