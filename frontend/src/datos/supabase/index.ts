// Implementación real de los contratos con supabase-js (D-24): único lugar donde se importa supabase-js.
// Copia el mismo comportamiento de la 2.x (src/js/21-arranque.js y 08-vistas-catalogos-y-seguridad.js):
//  · ingreso con contraseña → perfil → cuenta activa → si la cuenta tiene verificación en dos pasos, pedir el código;
//  · el código se verifica con el primer factor TOTP verificado (challengeAndVerify);
//  · cada ingreso registra una fila en public.accesos (si falla, no impide entrar).
// La seguridad la ponen las políticas RLS de la base; aquí solo se traduce.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ErrorDatos, type Datos, type Perfil, type ResultadoCargaExcel, type Sesion } from '../contratos';
import { esRol } from '../../dominio/roles';
import type { RevisionCruce, TemaManual } from '../../dominio/cruces';
import type { Requerimiento } from '../../dominio/requerimientos';
import type { Database, Json } from './tipos.generados';
import { huellaArchivo } from '../../dominio/huella-archivo';
import { fechaColombia } from '../../dominio/fechas';
import { revisarDocumento, rutaDocumento, type ElementoPapelera } from '../../dominio/planes-memoria';
import { rutaSoporte } from '../../dominio/requerimientos';
import type {
  Accion,
  Avance,
  DocumentoArchivo,
  Hallazgo,
  InformeAvance,
  Plan,
  Prorroga,
  Traslado
} from '../../dominio/planes';
import {
  esRespaldo,
  type CargaExcel,
  type ConfiguracionGeneral,
  type EventoSistema,
  type VistaPreviaAvisos
} from '../../dominio/configuracion';
import {
  aplicarCierres,
  desdeBaseDeDatos,
  fechaDeCorte,
  type FilaHistoricoBD
} from '../../dominio/historico';

/** Cliente con los tipos de la base (tipos.generados.ts): un nombre de tabla o columna mal escrito no compila. */
export type ClienteSupabase = SupabaseClient<Database>;

export function crearClienteSupabase(url: string, clave: string): ClienteSupabase {
  return createClient<Database>(url, clave, { auth: { persistSession: true, autoRefreshToken: true } });
}

interface FilaPerfil {
  id: string;
  email: string | null;
  nombre: string | null;
  rol: string;
  dependencia_id: number | null;
  activo: boolean;
}

export function aPerfil(f: FilaPerfil): Perfil {
  if (!esRol(f.rol))
    throw new ErrorDatos('sin_permiso', 'El rol de la cuenta no es válido. Contacte al administrador.');
  return {
    id: f.id,
    correo: f.email ?? '',
    nombre: f.nombre ?? '',
    rol: f.rol,
    dependenciaId: f.dependencia_id,
    activo: f.activo
  };
}

/** El QR llega como "data:image/svg+xml;utf-8,<svg …>" sin codificar; se codifica para que se dibuje completo
 *  (igual que qrSeguro de la 2.x, src/js/08-vistas-catalogos-y-seguridad.js). */
export function qrSeguro(qr: string): string {
  const s = String(qr || '');
  const i = s.indexOf(',');
  if (i < 0 || !/^data:image\/svg\+xml/i.test(s) || /;base64,/i.test(s.slice(0, i + 1))) return s;
  const svg = s.slice(i + 1);
  return (
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(/%3C/i.test(svg) ? decodeURIComponent(svg) : svg)
  );
}

/** Error al guardar: sin permiso (RLS) o el mensaje del servidor. */
const errorGuardar = (error: { message: string }, que: string) =>
  /row-level security|permission/i.test(error.message)
    ? new ErrorDatos('sin_permiso', 'No tiene permiso para editar ' + que + '.')
    : new ErrorDatos('otro', 'No se pudo guardar: ' + error.message);

/** Errores de requerimientos con los mismos textos de la 2.x (dbErr de src/js/04-capa-de-datos.js). */
export function errorRequerimiento(error: { message: string }): ErrorDatos {
  const m = error.message;
  if (/duplicate key.*radicado/i.test(m))
    return new ErrorDatos('otro', 'Ese radicado ya existe en el sistema');
  if (/duplicate key.*orfeo/i.test(m))
    return new ErrorDatos('otro', 'Ese radicado ORFEO ya fue registrado en otro requerimiento');
  if (/row-level security/i.test(m))
    return new ErrorDatos('sin_permiso', 'Tu rol no tiene permiso para esta operación');
  if (/duplicate key/i.test(m)) return new ErrorDatos('otro', 'Ya existe un registro con esos datos');
  return new ErrorDatos('otro', m);
}

const TABLA_PLANES = {
  plan: 'pm_planes',
  hall: 'pm_hallazgos',
  acc: 'pm_acciones',
  pror: 'pm_prorrogas',
  inf: 'pm_informes_avance',
  tras: 'pm_traslados'
} as const;
/** pmErr de la 2.x: mensajes claros para las restricciones de los planes; el resto, como los requerimientos. */
export function errorPlanes(error: { message: string }): ErrorDatos {
  if (/pm_hallazgos_numero_unq/.test(error.message))
    return new ErrorDatos('otro', 'Ya existe un hallazgo con ese número en el plan');
  if (/pm_acciones_fechas_ok/.test(error.message))
    return new ErrorDatos('otro', 'La fecha de terminación no puede ser anterior a la de inicio');
  return errorRequerimiento(error);
}

const red = () =>
  new ErrorDatos('red', 'No hay conexión con el servidor. Revise su internet e intente de nuevo.');

export function datosSupabase(sb: ClienteSupabase): Datos {
  /** Llama a una función del servidor como la 2.x: su { error } o el error de la llamada se muestran tal cual. */
  async function funcion(nombre: string, cuerpo: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await sb.functions.invoke(nombre, { body: cuerpo });
    const d = (data ?? {}) as Record<string, unknown>;
    if (error) throw new ErrorDatos('otro', String(d.error ?? error.message));
    if (d.error) throw new ErrorDatos('otro', String(d.error));
    return d;
  }
  async function perfilDe(usuarioId: string): Promise<Perfil | null> {
    const { data, error } = await sb.from('profiles').select('*').eq('id', usuarioId).maybeSingle();
    if (error) throw red();
    return data ? aPerfil(data as FilaPerfil) : null;
  }

  async function nivel(): Promise<{ actual: 'aal1' | 'aal2'; siguiente: string | null }> {
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    return { actual: data?.currentLevel === 'aal2' ? 'aal2' : 'aal1', siguiente: data?.nextLevel ?? null };
  }

  async function sesion(): Promise<Sesion | null> {
    const { data } = await sb.auth.getSession();
    const s = data.session;
    if (!s) return null;
    const n = await nivel();
    // Con verificación en dos pasos pendiente no hay sesión completa todavía
    if (n.siguiente === 'aal2' && n.actual !== 'aal2') return null;
    return { usuarioId: s.user.id, correo: s.user.email ?? '', nivel: n.actual };
  }

  return {
    auth: {
      async ingresar(correo, clave) {
        const { data, error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
        if (error || !data.session) throw new ErrorDatos('credenciales', 'Correo o contraseña incorrectos.');
        const perfil = await perfilDe(data.session.user.id);
        if (!perfil) {
          await sb.auth.signOut();
          throw new ErrorDatos('sin_permiso', 'No se pudo cargar tu perfil. Contacta al administrador.');
        }
        if (!perfil.activo) {
          await sb.auth.signOut();
          throw new ErrorDatos(
            'cuenta_inactiva',
            'Tu cuenta está pendiente de activación por un administrador.'
          );
        }
        const n = await nivel();
        if (n.siguiente === 'aal2' && n.actual !== 'aal2') return { tipo: 'requiere_codigo' };
        return { tipo: 'listo', sesion: { usuarioId: perfil.id, correo: perfil.correo, nivel: n.actual } };
      },
      async verificarCodigo(codigo) {
        const limpio = codigo.replace(/\D/g, '');
        if (limpio.length !== 6) throw new ErrorDatos('codigo', 'Escriba los 6 dígitos.');
        const { data, error } = await sb.auth.mfa.listFactors();
        if (error) throw red();
        const factor = (data?.totp ?? []).find(f => f.status === 'verified');
        if (!factor) throw new ErrorDatos('codigo', 'La cuenta no tiene verificación en dos pasos activa.');
        const v = await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code: limpio });
        if (v.error)
          throw new ErrorDatos('codigo', 'El código no es correcto o ya cambió. Escriba el código actual.');
        const s = await sesion();
        if (!s) throw new ErrorDatos('codigo', 'No se pudo completar la verificación. Intente de nuevo.');
        return s;
      },
      sesionActual: sesion,
      async salir() {
        await sb.auth.signOut();
      },
      async recuperarClave(correo, volverA) {
        const { error } = await sb.auth.resetPasswordForEmail(correo.trim(), { redirectTo: volverA });
        if (error) throw new ErrorDatos('otro', 'No se pudo enviar el enlace: ' + error.message);
      },
      async cambiarClave(nueva) {
        const { error } = await sb.auth.updateUser({ password: nueva });
        if (error) throw new ErrorDatos('otro', 'No se pudo guardar: ' + error.message);
      },
      async tieneVerificacion() {
        const { data, error } = await sb.auth.mfa.listFactors();
        if (error) throw red();
        return (data?.totp ?? []).some(f => f.status === 'verified');
      },
      async iniciarVerificacion() {
        const { data: f, error: e1 } = await sb.auth.mfa.listFactors();
        if (e1) throw red();
        // Igual que la 2.x: se quitan los intentos anteriores sin terminar
        for (const x of (f?.all ?? []).filter(x => x.factor_type === 'totp' && x.status !== 'verified'))
          await sb.auth.mfa.unenroll({ factorId: x.id });
        const n = (f?.totp ?? []).filter(x => x.status === 'verified').length;
        const nombre = 'Celular ' + (n + 1) + ' (' + new Date().toLocaleDateString('es-CO') + ')';
        const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: nombre });
        if (error || !data)
          throw new ErrorDatos(
            'otro',
            'No se pudo iniciar la verificación en dos pasos: ' + (error?.message ?? '')
          );
        return { factorId: data.id, qr: qrSeguro(data.totp.qr_code), secreto: data.totp.secret };
      },
      async confirmarVerificacion(factorId, codigo) {
        const limpio = codigo.replace(/\D/g, '');
        if (limpio.length !== 6) throw new ErrorDatos('codigo', 'Escriba los 6 dígitos que muestra la app.');
        const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code: limpio });
        if (error)
          throw new ErrorDatos(
            'codigo',
            'El código no es correcto o ya cambió. Escriba el código actual de la app.'
          );
      },
      async cancelarVerificacion(factorId) {
        await sb.auth.mfa.unenroll({ factorId }).then(
          () => undefined,
          () => undefined
        );
      }
    },
    identidad: {
      async miPerfil() {
        const s = await sesion();
        if (!s) return null;
        const p = await perfilDe(s.usuarioId);
        return p && p.activo ? p : null;
      },
      async registrarAcceso() {
        // Igual que la 2.x: el registro de acceso nunca impide entrar
        await sb
          .from('accesos')
          .insert({})
          .then(
            () => undefined,
            () => undefined
          );
      }
    },
    catalogos: {
      async entes() {
        const { data, error } = await sb
          .from('entes')
          .select('id, nombre, sigla, tipo, activo')
          .order('nombre');
        if (error) throw red();
        return data ?? [];
      },
      async dependencias() {
        const { data, error } = await sb
          .from('dependencias')
          .select('id, nombre, secretario_nombre, correo, telefono, activo')
          .order('nombre');
        if (error) throw red();
        return (data ?? []).map(d => ({
          id: d.id,
          nombre: d.nombre,
          secretarioNombre: d.secretario_nombre ?? '',
          correo: d.correo ?? '',
          telefono: d.telefono ?? '',
          activo: d.activo
        }));
      },
      async configuracion() {
        const { data, error } = await sb
          .from('config')
          .select('dias_rojo, correo_disciplinario')
          .eq('id', 1)
          .maybeSingle();
        if (error) throw red();
        return { diasRojo: data?.dias_rojo || 5, correoDisciplinario: data?.correo_disciplinario ?? '' };
      },
      // Igual que saveCatalog de la 2.x: update por id o insert. La auditoría la escribe el servidor (triggers).
      async guardarEnte({ id, ...e }) {
        const fila = { nombre: e.nombre, sigla: e.sigla, tipo: e.tipo, activo: e.activo };
        const { error } =
          id === undefined
            ? await sb.from('entes').insert(fila)
            : await sb.from('entes').update(fila).eq('id', id);
        if (error) throw errorGuardar(error, 'los catálogos');
      },
      async guardarDependencia({ id, ...d }) {
        const fila = {
          nombre: d.nombre,
          secretario_nombre: d.secretarioNombre,
          correo: d.correo,
          telefono: d.telefono,
          activo: d.activo
        };
        const { error } =
          id === undefined
            ? await sb.from('dependencias').insert(fila)
            : await sb.from('dependencias').update(fila).eq('id', id);
        if (error) throw errorGuardar(error, 'los catálogos');
      }
    },
    actividad: {
      async perfiles() {
        const { data, error } = await sb
          .from('profiles')
          .select('id, email, rol, dependencia_id, activo')
          .order('email');
        if (error) throw red();
        return data ?? [];
      },
      async ultimosAccesos() {
        // Igual que la 2.x: los 1000 ingresos más recientes y, de cada cuenta, el último
        const { data, error } = await sb
          .from('accesos')
          .select('user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(1000);
        const acc: Record<string, string> = {};
        if (!error) for (const x of data ?? []) if (!acc[x.user_id]) acc[x.user_id] = x.created_at;
        return acc;
      },
      async notificaciones() {
        const { data, error } = await sb
          .from('notificaciones')
          .select(
            'created_at, organismo, enviado_por, n_items, destinatario, plantilla, telefono, correo, canal, mensaje'
          )
          .order('created_at', { ascending: false })
          .limit(300);
        if (error) return [];
        return (data ?? []).map(x => ({
          ts: x.created_at,
          org: x.organismo,
          usuario: x.enviado_por,
          n: x.n_items,
          nombre: x.destinatario,
          tpl: x.plantilla,
          tel: x.telefono,
          correo: x.correo || '',
          canal: x.canal || 'whatsapp',
          mensaje: x.mensaje
        }));
      },
      async informes() {
        const { data, error } = await sb
          .from('informes')
          .select('created_at, generado_por, alcance, vigencias, n_registros, huella')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) return [];
        return (data ?? []).map(x => ({
          ts: x.created_at,
          usuario: x.generado_por,
          alcance: x.alcance,
          vigencias: x.vigencias,
          n: x.n_registros,
          huella: x.huella
        }));
      },
      async registrarNotificacion(n) {
        const { error } = await sb.from('notificaciones').insert({
          organismo: n.org,
          destinatario: n.nombre || '',
          telefono: n.tel || '',
          correo: n.correo || '',
          plantilla: n.tpl ?? '',
          n_items: n.n,
          canal: n.canal || 'whatsapp',
          mensaje: n.mensaje ?? ''
        });
        if (error) throw errorGuardar(error, 'las notificaciones');
      },
      async registrarInforme(e) {
        const { error } = await sb.from('informes').insert({
          alcance: e.alcance,
          vigencias: e.vigencias,
          corte: e.corte || null,
          n_registros: e.n,
          huella: e.huella
        });
        if (error) throw errorGuardar(error, 'los informes');
      }
    },
    auditoria: {
      async eventos() {
        const { data, error } = await sb
          .from('audit_log')
          .select('id, tabla, accion, registro_id, usuario, payload, cambios, prev_hash, hash, created_at')
          .order('id', { ascending: false })
          .limit(300);
        if (error) throw red();
        return data ?? [];
      },
      async verificar() {
        const { data, error } = await sb.rpc('verificar_cadena_auditoria');
        if (error) throw new ErrorDatos('otro', 'No se pudo verificar la cadena: ' + error.message);
        const r = data?.[0];
        if (!r) throw new ErrorDatos('otro', 'La verificación no devolvió resultado.');
        return { ok: r.ok, total: r.total, primer_id_roto: r.primer_id_roto };
      }
    },
    historico: {
      async cargarVigencias(c) {
        const { data, error } = await sb.rpc('cargar_historico', { p: c as unknown as Json });
        if (error) {
          if (
            /cargar_historico/.test(error.message || '') &&
            /function|exist|schema cache/i.test(error.message || '')
          )
            throw new ErrorDatos('otro', 'Falta ejecutar en Supabase el script supabase/16_carga_excel.sql');
          throw errorRequerimiento(error);
        }
        return (data ?? { registros: c.filas.length }) as unknown as ResultadoCargaExcel;
      },
      async radicados() {
        // Igual que la 2.x (loadHist + aplicarCierresApp): por páginas de 1000 y luego los cierres hechos en la app
        let todas: FilaHistoricoBD[] = [];
        for (let desde = 0; ; desde += 1000) {
          const { data, error } = await sb
            .from('historico_requerimientos')
            .select(
              'vigencia, radicacion_ente, ente, orfeo_entrada, fecha_recibo, organismo, tipo_organismo, asunto, termino_dias_habiles, fecha_maxima, orfeo_respuesta, fecha_respuesta, respondio, oportunidad, retraso_dias_habiles, dias_habiles_responder'
            )
            .order('id')
            .range(desde, desde + 999);
          if (error) throw red();
          todas = todas.concat(data ?? []);
          if (!data || data.length < 1000) break;
        }
        const base = desdeBaseDeDatos(todas);
        const { data: cierres, error } = await sb
          .from('requerimientos')
          .select('hist_key, orfeo_salida, fecha_cierre')
          .not('hist_key', 'is', null)
          .eq('estado', 'cerrado');
        if (error || !cierres?.length) return base;
        const filas = aplicarCierres(
          base.filas,
          cierres.map(c => ({
            hist_key: c.hist_key ?? '',
            orfeo_salida: c.orfeo_salida ?? '',
            fecha_cierre: c.fecha_cierre ?? ''
          }))
        );
        return { filas, corte: fechaDeCorte(filas) };
      }
    },
    planes: {
      async datos() {
        // pmAll de la 2.x: cada tabla por páginas de 1000, en orden y por id
        const todo = async <T>(tabla: string, orden: string): Promise<T[]> => {
          let desde = 0,
            out: T[] = [];
          for (;;) {
            const { data, error } = await sb
              .from(tabla as 'pm_planes')
              .select('*')
              .order(orden as 'id')
              .order('id')
              .range(desde, desde + 999);
            if (error) throw new ErrorDatos('otro', error.message);
            out = out.concat((data ?? []) as unknown as T[]);
            if ((data ?? []).length < 1000) break;
            desde += 1000;
          }
          return out;
        };
        const [planes, hallazgos, acciones, avances] = await Promise.all([
          todo<Plan>('pm_planes', 'fecha_suscripcion'),
          todo<Hallazgo>('pm_hallazgos', 'orden'),
          todo<Accion>('pm_acciones', 'orden'),
          todo<Avance>('pm_avances', 'created_at')
        ]);
        // Traslados (script 18): si la tabla no está o el rol no la ve, se sigue sin ellos (igual que la 2.x)
        let traslados: Traslado[] | null;
        try {
          traslados = await todo<Traslado>('pm_traslados', 'created_at');
        } catch {
          traslados = null;
        }
        // ¿Script 19 instalado? (pmLoad de la 2.x: la columna direccion_tecnica)
        const v19 = !(await sb.from('pm_planes').select('direccion_tecnica').limit(1)).error;
        // Script 20: prórrogas, informes semestrales y archivo documental; si falta, se ocultan esas funciones
        let v20 = true,
          prorrogas: Prorroga[] = [],
          informes: InformeAvance[] = [],
          documentos: DocumentoArchivo[] = [];
        try {
          [prorrogas, informes, documentos] = await Promise.all([
            todo<Prorroga>('pm_prorrogas', 'created_at'),
            todo<InformeAvance>('pm_informes_avance', 'created_at'),
            todo<DocumentoArchivo>('archivo_documentos', 'created_at')
          ]);
        } catch {
          v20 = false;
        }
        return { planes, hallazgos, acciones, avances, traslados, v19, v20, prorrogas, informes, documentos };
      },
      async guardar(tipo, o, id) {
        const tabla = TABLA_PLANES[tipo];
        if (id) {
          const { error } = await sb
            .from(tabla)
            .update(o as never)
            .eq('id', id);
          if (error) throw errorPlanes(error);
          return id;
        }
        const { data, error } = await sb
          .from(tabla)
          .insert(o as never)
          .select('id')
          .single();
        if (error) throw errorPlanes(error);
        return String((data as { id: string }).id);
      },
      async eliminar(tipo, id) {
        const { error } = await sb.from(TABLA_PLANES[tipo]).delete().eq('id', id);
        if (error) throw errorPlanes(error);
      },
      async eliminarPlan(id) {
        const { error } = await sb.rpc('pm_eliminar_plan', { p_id: id });
        if (error) throw errorPlanes(error);
      },
      // pmReportar de la 2.x: el PDF va a soportes/pm/<plan>/<acción>_<hora>.pdf; si el registro falla, se borra
      async reportar(a, o, archivo) {
        let path: string | null = null;
        const hash = archivo ? await huellaArchivo(archivo) : null;
        if (archivo) {
          path = `pm/${a.plan_id}/${a.id}_${Date.now()}.pdf`;
          const up = await sb.storage.from('soportes').upload(path, archivo as unknown as ArrayBuffer, {
            contentType: 'application/pdf',
            upsert: false
          });
          if (up.error) throw new ErrorDatos('otro', 'No se pudo subir el PDF: ' + up.error.message);
        }
        const { error } = await sb.rpc('pm_reportar_avance', {
          p_accion: a.id,
          p_fecha: o.fecha_corte,
          p_cantidad: o.cantidad,
          p_descripcion: o.descripcion,
          p_orfeo: o.radicado_orfeo || '',
          p_path: path as string,
          p_hash: hash as string,
          p_validar: o.validar
        } as never);
        if (error) {
          if (path) await sb.storage.from('soportes').remove([path]);
          throw errorPlanes(error);
        }
        return { hash };
      },
      async revisar(id, estado, observacion) {
        const { error } = await sb.rpc('pm_revisar_avance', {
          p_id: id,
          p_estado: estado,
          p_observacion: observacion || ''
        });
        if (error) throw errorPlanes(error);
      },
      // pmDocSubir: el archivo va al depósito privado «archivo»; si el registro falla, se borra
      async subirDocumento(archivo, meta) {
        const nombre = meta.nombre || archivo.name || 'documento';
        const r = revisarDocumento(nombre, archivo.size);
        if ('error' in r) throw new ErrorDatos('otro', r.error);
        const buf = await archivo.arrayBuffer();
        const sha = await huellaArchivo({ arrayBuffer: () => Promise.resolve(buf) });
        const path = rutaDocumento(meta.plan_id, fechaColombia(new Date()), Date.now(), nombre);
        const up = await sb.storage.from('archivo').upload(path, buf, { contentType: r.mime, upsert: false });
        if (up.error) throw new ErrorDatos('otro', 'No se pudo guardar el archivo: ' + up.error.message);
        const { data: u } = await sb.auth.getUser();
        const { data, error } = await sb
          .from('archivo_documentos')
          .insert({
            plan_id: meta.plan_id || null,
            requerimiento_id: meta.requerimiento_id || null,
            tipo: meta.tipo || 'otro',
            nombre,
            path,
            mime: r.mime,
            tamano: archivo.size,
            sha256: sha,
            radicado_orfeo: meta.radicado_orfeo || '',
            observaciones: meta.observaciones || '',
            subido_email: u.user?.email ?? ''
          } as never)
          .select('id')
          .single();
        if (error) {
          await sb.storage.from('archivo').remove([path]);
          throw errorPlanes(error);
        }
        return String((data as { id: string }).id);
      },
      async contenidoDocumento(d) {
        const { data, error } = await sb.storage.from('archivo').download(d.path);
        if (error || !data) throw new ErrorDatos('otro', 'No se pudo descargar: ' + (error?.message ?? ''));
        return data.arrayBuffer();
      },
      async moverDocumento(id, aPapelera) {
        const { error } = await sb
          .from('archivo_documentos')
          .update({ eliminado_at: aPapelera ? new Date().toISOString() : null } as never)
          .eq('id', id);
        if (error) throw errorPlanes(error);
      },
      async purgarDocumento(d) {
        const { error } = await sb.from('archivo_documentos').delete().eq('id', d.id);
        if (error) throw errorPlanes(error);
        await sb.storage.from('archivo').remove([d.path]);
      },
      async resolverProrroga(id, estado, radicado, fecha) {
        const { error } = await sb.rpc(
          'pm_resolver_prorroga' as never,
          {
            p_id: id,
            p_estado: estado,
            p_radicado: radicado,
            p_fecha: fecha
          } as never
        );
        if (error) throw errorPlanes(error);
      },
      async papelera() {
        const { data, error } = await sb.rpc('pm_papelera' as never);
        if (error) throw errorPlanes(error);
        return ((data as unknown as ElementoPapelera[]) ?? []).map(x => ({
          ...x,
          audit_id: String(x.audit_id)
        }));
      },
      async restaurar(auditId) {
        const { data, error } = await sb.rpc(
          'pm_restaurar' as never,
          { p_audit_id: Number(auditId) } as never
        );
        if (error) throw errorPlanes(error);
        return String(data);
      },
      // pmImportar de la 2.x: todo en una transacción en la base (pm_importar)
      async importar(carga) {
        const { data, error } = await sb.rpc('pm_importar', { p: carga } as never);
        if (error) throw errorPlanes(error);
        return String(data);
      }
    },
    sistema: {
      async general() {
        // select('*'): si un script no está instalado, su columna no llega y la pantalla lo indica (igual que la 2.x)
        const { data, error } = await sb.from('config').select('*').eq('id', 1).maybeSingle();
        if (error) throw red();
        const { id: _id, ...c } = (data ?? { id: 1, dias_rojo: 5, correo_disciplinario: '' }) as Record<
          string,
          unknown
        >;
        void _id;
        return c as unknown as ConfiguracionGeneral;
      },
      async guardar(c) {
        const { error } = await sb.from('config').update(c).eq('id', 1);
        if (error) throw errorRequerimiento(error);
      },
      async probarResumen() {
        const r = await funcion('resumen-semanal', { prueba: true });
        const errores = (r.errores as string[] | undefined) ?? [];
        // Si el servidor de correo rechazó el envío se muestra su respuesta (antes se confundía con "sin pendientes")
        if (errores.length) throw new ErrorDatos('otro', 'el servidor de correo respondió: ' + errores[0]);
        return { enviados: Number(r.enviados ?? 0) };
      },
      async vistaPreviaAvisos() {
        return (await funcion('avisos-planes', { vista_previa: true })) as unknown as VistaPreviaAvisos;
      },
      async respaldos() {
        const { data, error } = await sb.storage
          .from('respaldos')
          .list('', { limit: 20, sortBy: { column: 'name', order: 'desc' } });
        if (error) throw new ErrorDatos('otro', error.message);
        return (data ?? [])
          .filter(f => esRespaldo(f.name))
          .map(f => {
            const kb = (f.metadata as { size?: number } | null)?.size;
            return { nombre: f.name, kb: kb ? Math.round(kb / 1024) : null };
          });
      },
      async crearRespaldo() {
        const r = await funcion('respaldo', {});
        return { registros: Number(r.registros ?? 0), kb: Number(r.kb ?? 0) };
      },
      async urlRespaldo(nombre) {
        const { data, error } = await sb.storage
          .from('respaldos')
          .createSignedUrl(nombre, 120, { download: nombre });
        if (error) throw new ErrorDatos('otro', error.message);
        return data.signedUrl;
      },
      async eventos() {
        const { data, error } = await sb
          .from('eventos_sistema')
          .select('*')
          .in('nivel', ['error', 'aviso'])
          .eq('revisado', false)
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw new ErrorDatos('otro', error.message);
        return (data ?? []) as EventoSistema[];
      },
      async marcarRevisado(id) {
        const { error } = await sb.from('eventos_sistema').update({ revisado: true }).eq('id', id);
        if (error) throw new ErrorDatos('otro', error.message);
      },
      async ultimasCargas() {
        const { data, error } = await sb
          .from('historico_cargas')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);
        return error ? null : ((data ?? []) as unknown as CargaExcel[]);
      }
    },
    cuentas: {
      async lista() {
        const { data, error } = await sb.from('profiles').select('*').order('email');
        if (error) throw red();
        return (data ?? []).map(x => ({
          id: x.id,
          email: x.email ?? '',
          nombre: x.nombre ?? '',
          rol: x.rol,
          dependencia_id: x.dependencia_id,
          activo: x.activo
        }));
      },
      // Igual que db.cuenta de la 2.x: la función responde { mensaje } o { error }
      async gestionar(accion, datos) {
        const { data, error } = await sb.functions.invoke('gestion-cuentas', { body: { accion, ...datos } });
        if (error) {
          let msg = error.message;
          try {
            const contexto = (error as { context?: { json(): Promise<{ error?: string }> } }).context;
            const j = contexto ? await contexto.json() : {};
            if (j.error) msg = j.error;
          } catch {
            /* la respuesta no trae JSON */
          }
          if (/Failed to send|not found|404/i.test(msg))
            msg =
              'La función gestion-cuentas no está desplegada en Supabase (ver docs/DESPLIEGUE.md, sección Cuentas).';
          throw new ErrorDatos('otro', msg);
        }
        const r = (data ?? {}) as { mensaje?: string; error?: string };
        if (r.error) throw new ErrorDatos('otro', r.error);
        return { mensaje: r.mensaje ?? 'Listo' };
      },
      async guardar({ id, ...c }) {
        const { error } = await sb.from('profiles').update(c).eq('id', id);
        if (error) throw errorRequerimiento(error);
      }
    },
    requerimientos: {
      async lista(vigencia) {
        // Igual que la 2.x: por páginas de 1000, ordenados por fecha límite e id
        let desde = 0,
          out: Requerimiento[] = [];
        for (;;) {
          const { data, error } = await sb
            .from('v_requerimientos')
            .select('*')
            .eq('vigencia', vigencia)
            .order('fecha_limite')
            .order('id')
            .range(desde, desde + 999);
          if (error) throw errorRequerimiento(error);
          out = out.concat((data ?? []) as Requerimiento[]);
          if ((data ?? []).length < 1000) break;
          desde += 1000;
        }
        return out;
      },
      async crear(o) {
        const { error } = await sb.from('requerimientos').insert(o);
        if (error) throw errorRequerimiento(error);
      },
      async cerrar(r, orfeo, fecha, archivo) {
        const hash = await huellaArchivo(archivo);
        const path = rutaSoporte(r, Date.now());
        const up = await sb.storage
          .from('soportes')
          .upload(path, archivo as unknown as ArrayBuffer, { contentType: 'application/pdf', upsert: false });
        if (up.error) throw new ErrorDatos('otro', 'No se pudo subir el PDF: ' + up.error.message);
        const { error } = await sb.rpc('cerrar_requerimiento', {
          p_id: r.id,
          p_orfeo: orfeo,
          p_fecha: fecha,
          p_path: path,
          p_hash: hash
        });
        if (error) {
          // Igual que la 2.x: si el cierre no queda, el PDF subido se borra
          await sb.storage.from('soportes').remove([path]);
          throw errorRequerimiento(error);
        }
        return { hash };
      },
      async escalar(id, canal) {
        const { error } = await sb.rpc('escalar_requerimiento', { p_id: id, p_canal: canal });
        if (error) throw errorRequerimiento(error);
      },
      async urlSoporte(path) {
        const { data, error } = await sb.storage.from('soportes').createSignedUrl(path, 300);
        if (error) throw new ErrorDatos('otro', error.message);
        return data.signedUrl;
      }
    },
    cruces: {
      // Igual que loadCruceMeta de la 2.x: si no se pueden leer, se trabaja sin decisiones guardadas
      async temasManuales() {
        const { data, error } = await sb.from('tema_manual').select('row_key, tema, usuario, updated_at');
        const r: Record<string, TemaManual> = {};
        if (!error)
          for (const x of data ?? []) r[x.row_key] = { tema: x.tema, usuario: x.usuario, ts: x.updated_at };
        return r;
      },
      async revisiones() {
        const { data, error } = await sb
          .from('cruce_revision')
          .select('clave, estado, nota, usuario, updated_at');
        const r: Record<string, RevisionCruce> = {};
        if (!error)
          for (const x of data ?? [])
            r[x.clave] = {
              estado: x.estado as RevisionCruce['estado'],
              nota: x.nota || '',
              usuario: x.usuario,
              ts: x.updated_at
            };
        return r;
      },
      // Quién y cuándo los pone el servidor (firmar_decision); la auditoría la lleva audit_trigger
      async guardarTema(llave, tema) {
        const { error } = tema
          ? await sb.from('tema_manual').upsert({ row_key: llave, tema }, { onConflict: 'row_key' })
          : await sb.from('tema_manual').delete().eq('row_key', llave);
        if (error) throw errorGuardar(error, 'los temas');
      },
      async guardarRevision(clave, estado, nota = '') {
        const { error } = estado
          ? await sb.from('cruce_revision').upsert({ clave, estado, nota }, { onConflict: 'clave' })
          : await sb.from('cruce_revision').delete().eq('clave', clave);
        if (error) throw errorGuardar(error, 'los cruces');
      }
    },
    directorio: {
      async organismos() {
        // Igual que la 2.x: la lista sale del histórico, leído por páginas de 1000 filas (solo las 2 columnas que se usan)
        const vistos = new Map<string, string>();
        for (let desde = 0; ; desde += 1000) {
          const { data, error } = await sb
            .from('historico_requerimientos')
            .select('organismo, tipo_organismo')
            .order('id')
            .range(desde, desde + 999);
          if (error) throw red();
          for (const f of data ?? [])
            if (!vistos.has(f.organismo)) vistos.set(f.organismo, f.tipo_organismo ?? '');
          if (!data || data.length < 1000) break;
        }
        return [...vistos].map(([nombre, nivel]) => ({ nombre, nivel }));
      },
      async responsables() {
        const { data, error } = await sb
          .from('directorio')
          .select('organismo, cargo, nombre, telefono, correo')
          .order('organismo');
        if (error) throw red();
        return (data ?? []).map(x => ({ ...x, correo: x.correo || '' }));
      },
      async guardar(r) {
        const { error } = await sb.from('directorio').upsert(
          {
            organismo: r.organismo,
            cargo: r.cargo,
            nombre: r.nombre,
            telefono: r.telefono,
            correo: r.correo
          },
          { onConflict: 'organismo,cargo' }
        );
        if (error)
          throw new ErrorDatos(
            /row-level security|permission/i.test(error.message) ? 'sin_permiso' : 'otro',
            /row-level security|permission/i.test(error.message)
              ? 'No tiene permiso para editar el directorio.'
              : 'No se pudo guardar: ' + error.message
          );
      }
    }
  };
}
