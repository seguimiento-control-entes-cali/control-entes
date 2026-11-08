// =====================================================================
// Edge Function: resumen-semanal
// Envía a cada secretario o director, por correo institucional, el resumen de lo que su
// dependencia tiene pendiente: requerimientos vencidos y por vencer, y acciones de los planes
// de mejoramiento vencidas, por vencer o devueltas. Cada envío queda en la bitácora de
// notificaciones (public.notificaciones).
//
// Quién la llama:
//   * La tarea programada de la base de datos (pg_cron), los lunes, con el encabezado
//     x-cron-clave igual al secreto RESUMEN_CLAVE. Solo envía si el resumen está activo
//     en Configuración.
//   * El Super administrador desde la app ("Enviar prueba a mi correo"): con su sesión;
//     envía un solo correo de muestra a su propio correo.
//
// Secretos (Edge Functions → Secrets): SMTP_USER (correo @cali.gov.co que envía),
// SMTP_PASS (contraseña de aplicación de ese correo), RESUMEN_CLAVE (texto largo aleatorio),
// SITIO_URL (ya existe). SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
// Despliegue: ver docs/DESPLIEGUE.md, sección "Resumen semanal".
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2.45.4';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-clave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

const DOMINIO = /^[a-z0-9._%+-]+@cali\.gov\.co$/;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fecha = (s: string | null) => {
  if (!s) return '';
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
};
/* Días hábiles en Colombia: mismo calendario de la app (src/js/02-utilidades.js), incluida la Ley 2578 de 2026 */
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function pascua(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}
const FESTIVOS: Record<number, Set<string>> = {};
function festivos(y: number) {
  if (FESTIVOS[y]) return FESTIVOS[y];
  const s = new Set<string>();
  const lunes = (d: Date) => { const w = d.getDay(); if (w !== 1) d.setDate(d.getDate() + ((8 - w) % 7)); return d; };
  [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].forEach(([m, d]) => s.add(isoD(new Date(y, m - 1, d))));
  [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].forEach(([m, d]) => s.add(isoD(lunes(new Date(y, m - 1, d)))));
  if (y >= 2026) s.add(isoD(lunes(new Date(y, 6, 9)))); // Ley 2578 de 2026: 9 de julio, trasladable
  const p = pascua(y), mas = (n: number) => { const d = new Date(p); d.setDate(d.getDate() + n); return d; };
  s.add(isoD(mas(-3))); s.add(isoD(mas(-2)));
  [39, 60, 68].forEach(n => s.add(isoD(lunes(mas(n)))));
  return (FESTIVOS[y] = s);
}
function sumarHabiles(desde: string, n: number) {
  const d = new Date(desde + 'T00:00:00');
  let k = 0;
  while (k < n) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6 && !festivos(d.getFullYear()).has(isoD(d))) k++; }
  return isoD(d);
}
/* Res. CGSC 24.043 y 24.003, art. 11: informe semestral dentro de los 15 días hábiles siguientes al 30-jun y al 31-dic */
function informesPendientes(p: { fecha_suscripcion: string; estado: string }, entregados: Set<string>, hoy: string) {
  const out: { corte: string; vence: string }[] = [];
  if (!p.fecha_suscripcion || p.estado !== 'en_ejecucion') return out;
  for (let y = +p.fecha_suscripcion.slice(0, 4); y <= +hoy.slice(0, 4); y++)
    for (const md of ['06-30', '12-31']) {
      const corte = `${y}-${md}`;
      if (corte < p.fecha_suscripcion || corte > hoy || entregados.has(corte)) continue;
      out.push({ corte, vence: sumarHabiles(corte, 15) });
    }
  return out;
}

const hoyBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const corto = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
/* El titular: secretario(a), director(a), gerente o jefe; si no hay, el primero con correo */
const TITULAR = /secretari|director|gerente|jefe|alcalde/i;

type Bloque = { titulo: string; filas: string[] };

/* Verificación en dos pasos (supabase/14): si la cuenta ya la activó, la sesión debe venir con el código (aal2).
   Sin esto, una contraseña robada bastaría para usar esta función, aunque la base de datos ya la exija. */
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
  const SMTP_USER = (Deno.env.get('SMTP_USER') ?? '').toLowerCase();
  const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
  const SITIO = Deno.env.get('SITIO_URL') ?? '';
  const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. ¿Quién llama?
  let prueba = false,
    correoPrueba = '';
  const claveCron = req.headers.get('x-cron-clave') ?? '';
  if (CLAVE && claveCron && claveCron === CLAVE) {
    prueba = false;
  } else {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: quien } = await db.auth.getUser(jwt);
    if (!quien?.user) return responder({ error: 'Sesión no válida. Vuelve a ingresar.' }, 401);
    const { data: perfil } = await db.from('profiles').select('rol, activo, email').eq('id', quien.user.id).maybeSingle();
    if (!perfil || perfil.rol !== 'admin' || !perfil.activo)
      return responder({ error: 'Solo el Super administrador puede enviar el resumen de prueba.' }, 403);
    if (await exigeCodigo(db, quien.user.id, jwt))
      return responder({ error: 'Ingrese con su código de verificación en dos pasos.' }, 403);
    prueba = true;
    correoPrueba = String(perfil.email || quien.user.email || '').toLowerCase();
  }
  // La casilla de activación se revisa ANTES que los secretos del correo: apagado no responde error cada lunes
  const { data: cfg } = await db.from('config').select('resumen_activo').eq('id', 1).maybeSingle();
  if (!prueba && !cfg?.resumen_activo) return responder({ ok: true, enviados: 0, nota: 'El resumen semanal está desactivado en Configuración.' });

  if (!SMTP_USER || !SMTP_PASS) return responder({ error: 'Faltan los secretos SMTP_USER y SMTP_PASS de la función.' }, 500);

  // 2. Datos
  const hoy = hoyBogota(),
    en10 = sumarDias(hoy, 10),
    en30 = sumarDias(hoy, 30);
  const [deps, dir, reqs, entes, acc, hall, planes, avs] = await Promise.all([
    db.from('dependencias').select('id, nombre, activo'),
    db.from('directorio').select('organismo, cargo, nombre, correo'),
    db.from('requerimientos').select('radicado, asunto, fecha_limite, ente_id, dependencia_id, estado').eq('estado', 'abierto').lte('fecha_limite', en10),
    db.from('entes').select('id, nombre'),
    db.from('pm_acciones').select('id, plan_id, hallazgo_id, dependencia_id, accion, fecha_fin, avance, cantidad'),
    db.from('pm_hallazgos').select('id, numero'),
    db.from('pm_planes').select('id, formato, estado, ejercicio, fecha_suscripcion'),
    db.from('pm_avances').select('accion_id, estado, observacion, created_at').order('created_at', { ascending: false })
  ]);
  for (const r of [deps, dir, reqs, entes]) if (r.error) return responder({ error: r.error.message }, 500);
  // script 20: informes semestrales ya entregados (si no existe la tabla, no se avisa)
  const infs = await db.from('pm_informes_avance').select('plan_id, corte');
  const entregados = new Map<string, Set<string>>();
  for (const i of infs.error ? [] : infs.data ?? []) {
    if (!entregados.has(i.plan_id)) entregados.set(i.plan_id, new Set());
    entregados.get(i.plan_id)!.add(i.corte);
  }
  const pmOk = !acc.error && !hall.error && !planes.error && !avs.error; // si el script 13 no se ha ejecutado, se omite esa parte
  const enteN = new Map((entes.data ?? []).map(e => [e.id, e.nombre]));
  const hallN = new Map((pmOk ? hall.data ?? [] : []).map(h => [h.id, h.numero]));
  const planF = new Map((pmOk ? planes.data ?? [] : []).map(p => [p.id, p]));
  const ultimoAv = new Map<string, { estado: string; observacion: string }>();
  if (pmOk) for (const v of avs.data ?? []) if (!ultimoAv.has(v.accion_id)) ultimoAv.set(v.accion_id, v);

  // 3. Un correo por dependencia con pendientes
  const resultado = { enviados: 0, sinCorreo: [] as string[], errores: [] as string[] };
  const smtp = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } } });
  const depsActivas = (deps.data ?? []).filter(d => d.activo !== false);
  try {
    for (const d of depsActivas) {
      const venc = (reqs.data ?? []).filter(r => r.dependencia_id === d.id && r.fecha_limite < hoy);
      const prox = (reqs.data ?? []).filter(r => r.dependencia_id === d.id && r.fecha_limite >= hoy);
      const accD = pmOk
        ? (acc.data ?? []).filter(a => a.dependencia_id === d.id && Number(a.avance) < Number(a.cantidad) && planF.get(a.plan_id)?.estado !== 'cerrado')
        : [];
      const accV = accD.filter(a => a.fecha_fin < hoy),
        accP = accD.filter(a => a.fecha_fin >= hoy && a.fecha_fin <= en30);
      const accDev = pmOk
        ? (acc.data ?? []).filter(a => a.dependencia_id === d.id && ultimoAv.get(a.id)?.estado === 'devuelto')
        : [];
      // Planes de la CGSC en los que la dependencia tiene acciones y que deben un informe semestral
      const infP: string[] = [];
      if (pmOk && !infs.error) {
        const planesDep = new Set((acc.data ?? []).filter(a => a.dependencia_id === d.id).map(a => a.plan_id));
        for (const pid of planesDep) {
          const p = planF.get(pid);
          if (!p || p.formato !== 'PM_01_CGSC') continue;
          for (const i of informesPendientes(p, entregados.get(pid) ?? new Set(), hoy))
            infP.push(`${corto(p.ejercicio, 100)}: informe con corte ${fecha(i.corte)}, ${i.vence < hoy ? 'venció' : 'vence'} el ${fecha(i.vence)}`);
        }
      }
      const n = venc.length + prox.length + accV.length + accP.length + accDev.length + infP.length;
      if (!n) continue;

      const contactos = (dir.data ?? []).filter(x => x.organismo === d.nombre && DOMINIO.test(String(x.correo || '')));
      const titular = contactos.find(x => TITULAR.test(x.cargo)) ?? contactos[0];
      if (!titular && !prueba) {
        resultado.sinCorreo.push(d.nombre);
        continue;
      }
      const bloques: Bloque[] = [];
      const linReq = (r: (typeof venc)[number]) => `${enteN.get(r.ente_id) ?? 'Ente de control'}, radicado ${r.radicado}: ${corto(r.asunto, 110)} (fecha límite ${fecha(r.fecha_limite)})`;
      const linAcc = (a: (typeof accD)[number]) =>
        `${planF.get(a.plan_id)?.formato === 'F14_CGR' ? 'Contraloría General de la República' : 'Contraloría General de Santiago de Cali'}, hallazgo ${hallN.get(a.hallazgo_id) ?? ''}: ${corto(a.accion, 110)} (termina ${fecha(a.fecha_fin)}; avance ${Math.round((100 * Number(a.avance)) / Number(a.cantidad || 1))} %)`;
      if (venc.length) bloques.push({ titulo: `Requerimientos vencidos sin respuesta registrada (${venc.length})`, filas: venc.map(linReq) });
      if (prox.length) bloques.push({ titulo: `Requerimientos que vencen en los próximos 10 días (${prox.length})`, filas: prox.map(linReq) });
      if (accV.length) bloques.push({ titulo: `Acciones de planes de mejoramiento vencidas sin cumplir (${accV.length})`, filas: accV.map(linAcc) });
      if (accP.length) bloques.push({ titulo: `Acciones de planes de mejoramiento que vencen en los próximos 30 días (${accP.length})`, filas: accP.map(linAcc) });
      if (infP.length) bloques.push({ titulo: `Informes semestrales de avance de planes de mejoramiento por presentar (${infP.length})`, filas: infP });
      if (accDev.length) bloques.push({ titulo: `Avances devueltos por Control Interno para corregir (${accDev.length})`, filas: accDev.map(a => `${corto(a.accion, 110)}: ${corto(ultimoAv.get(a.id)?.observacion, 140)}`) });

      const saludo = titular?.nombre ? `Respetado(a) ${titular.nombre}:` : 'Respetado(a) secretario(a) o director(a):';
      const intro = `Desde el Despacho del Alcalde se comparte el resumen semanal de su dependencia, ${d.nombre}, frente a los entes de control, con corte al ${fecha(hoy)}.`;
      const cierre = `Le solicitamos gestionar estos asuntos y registrar las respuestas con su radicado ORFEO, y los avances con su soporte, en la aplicación Control de Entes${SITIO ? ' (' + SITIO + ')' : ''}.`;
      const texto = [saludo, '', intro, '', ...bloques.flatMap(b => [b.titulo + ':', ...b.filas.map(f => '- ' + f), '']), cierre, '', 'Cordialmente,', 'Despacho del Alcalde', 'Alcaldía Distrital de Santiago de Cali'].join('\n');
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#0e1c3a;line-height:1.5;max-width:680px">
        <p>${esc(saludo)}</p><p>${esc(intro)}</p>
        ${bloques.map(b => `<p style="margin:16px 0 6px"><b>${esc(b.titulo)}</b></p><ul style="margin:0;padding-left:20px">${b.filas.map(f => `<li style="margin-bottom:4px">${esc(f)}</li>`).join('')}</ul>`).join('')}
        <p style="margin-top:18px">${esc(cierre)}</p><p>Cordialmente,<br><b>Despacho del Alcalde</b><br>Alcaldía Distrital de Santiago de Cali</p>
        <p style="font-size:12px;color:#5b6780;border-top:1px solid #d9dee8;padding-top:8px">Mensaje generado por la aplicación Control de Entes.</p></div>`;

      const para = prueba ? correoPrueba : String(titular!.correo).toLowerCase();
      /* Asunto corto y sin tildes: con tildes y más de ~75 caracteres, denomailer parte mal el encabezado
         codificado y el correo llega con los encabezados dentro del cuerpo. El nombre de la dependencia va en el texto. */
      const asunto = (prueba ? '[PRUEBA] ' : '') + 'Resumen semanal de entes de control';
      try {
        await smtp.send({ from: `Despacho del Alcalde <${SMTP_USER}>`, to: para, subject: asunto, content: texto, html });
        resultado.enviados++;
        if (!prueba)
          await db.from('notificaciones').insert({
            organismo: d.nombre,
            destinatario: titular?.nombre ?? '',
            telefono: '',
            correo: para,
            canal: 'correo',
            plantilla: 'Resumen semanal',
            n_items: n,
            mensaje: texto,
            enviado_por: null
          });
      } catch (e) {
        resultado.errores.push(`${d.nombre}: ${(e as Error).message}`);
        console.error('Error enviando a', para, '-', (e as Error).message);
      }
      if (prueba) break; // la prueba envía un solo correo de muestra
    }
  } finally {
    await smtp.close();
  }
  // Monitoreo (supabase/17): el resultado queda visible en Configuración → Salud del sistema
  await db.from('eventos_sistema').insert({
    origen: 'resumen-semanal',
    nivel: resultado.errores.length ? 'error' : 'info',
    mensaje: resultado.errores.length ? `Resumen semanal con ${resultado.errores.length} error(es)` : `Resumen semanal: ${resultado.enviados} enviado(s)${prueba ? ' (prueba)' : ''}`,
    detalle: { errores: resultado.errores.slice(0, 10), error: resultado.errores[0] ?? null, sinCorreo: resultado.sinCorreo, prueba },
    usuario: prueba ? correoPrueba : 'tarea programada'
  });
  if (!prueba)
    await db
      .from('config')
      .update({
        resumen_ultimo: new Date().toISOString(),
        resumen_ultimo_detalle: `${resultado.enviados} enviados; ${resultado.sinCorreo.length} dependencias sin correo; ${resultado.errores.length} errores`
      })
      .eq('id', 1);
  return responder({ ok: true, prueba, ...resultado });
});
