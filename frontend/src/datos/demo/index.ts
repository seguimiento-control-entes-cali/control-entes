// Implementación en memoria de los contratos para la variante de demostración (D-16): sin red y sin Supabase.
// Cuentas ficticias, una por rol; contraseña "demo". La del Super administrador pide además el código 123456,
// para poder mostrar la verificación en dos pasos.
import {
  ErrorDatos,
  type Datos,
  type Dependencia,
  type Ente,
  type InformeGenerado,
  type Perfil,
  type Sesion
} from '../contratos';
import { DEPENDENCIAS_DEMO, ENTES_DEMO } from './catalogos-semilla';
import { semillaRequerimientos } from './requerimientos-semilla';
import { huellaArchivo } from '../../dominio/huella-archivo';
import { fechaColombia } from '../../dominio/fechas';
import type { Requerimiento } from '../../dominio/requerimientos';
import type { Cuenta } from '../../dominio/cuentas';
import { ORGANISMOS_DEMO, RESPONSABLES_DEMO } from './directorio-semilla';
import { claveOrganismo, type Responsable } from '../../dominio/directorio';
import { nuevoEvento, verificarCadena, type EventoAuditoria } from '../../dominio/auditoria';
import { diferencias, type Notificacion } from '../../dominio/actividad';
import { puedeClasificar, type RevisionCruce, type TemaManual } from '../../dominio/cruces';

export const CLAVE_DEMO = 'demo';
export const CODIGO_DEMO = '123456';

export const PERFILES_DEMO: readonly Perfil[] = [
  {
    id: 'demo-admin',
    correo: 'admin.demo@cali.gov.co',
    nombre: 'Administración (demo)',
    rol: 'admin',
    dependenciaId: null,
    activo: true
  },
  {
    id: 'demo-alcalde',
    correo: 'despacho.demo@cali.gov.co',
    nombre: 'Despacho (demo)',
    rol: 'alcalde',
    dependenciaId: 10,
    activo: true
  },
  {
    id: 'demo-ci',
    correo: 'control.interno.demo@cali.gov.co',
    nombre: 'Control Interno (demo)',
    rol: 'control_interno',
    dependenciaId: 3,
    activo: true
  },
  {
    id: 'demo-secretario',
    correo: 'secretaria.demo@cali.gov.co',
    nombre: 'Secretaría de Salud (demo)',
    rol: 'secretario',
    dependenciaId: 21,
    activo: true
  },
  {
    id: 'demo-enlace',
    correo: 'enlace.demo@cali.gov.co',
    nombre: 'Enlace de Salud (demo)',
    rol: 'enlace',
    dependenciaId: 21,
    activo: true
  }
];

const pideCodigo = (p: Perfil) => p.rol === 'admin';
/** Imagen de muestra en lugar del código QR (en la demostración no hay app autenticadora que lo lea). */
const QR_DEMO =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/>' +
      '<text x="50" y="55" font-size="12" text-anchor="middle" fill="#333">QR de demostración</text></svg>'
  );

/** Mismo orden que la base (order('nombre')). */
const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es');

export function datosDemo(): Datos {
  let actual: { perfil: Perfil; sesion: Sesion } | null = null;
  let pendiente: Perfil | null = null;
  const accesos: Record<string, string> = {};
  const verificados = new Set<string>();
  const directorio: Responsable[] = RESPONSABLES_DEMO.map(r => ({ ...r }));
  const entes: Ente[] = ENTES_DEMO.map(e => ({ ...e }));
  const dependencias: Dependencia[] = DEPENDENCIAS_DEMO.map(d => ({
    ...d,
    secretarioNombre: '',
    correo: '',
    telefono: ''
  }));
  // Pista de auditoría en memoria, como la demo de la 2.x (empieza con la carga inicial)
  const auditoria: EventoAuditoria[] = [];
  // Decisiones de Cruces y temas (la 2.x las guarda en el navegador en la demo; aquí, en memoria)
  const temasMan = new Map<string, TemaManual>();
  const revisiones = new Map<string, RevisionCruce>();
  const informes: InformeGenerado[] = [];
  const notificaciones: Notificacion[] = [];
  // Requerimientos del módulo operativo (los mismos 15 de la 2.x, con fechas relativas a hoy)
  const reqs: Requerimiento[] = semillaRequerimientos(fechaColombia(new Date()));
  const alertasLog: { requerimiento_id: string; canal: string }[] = [];
  // Cuentas de la pantalla Cuentas y roles (copia editable; el ingreso de la demo sigue usando PERFILES_DEMO)
  const cuentas: Cuenta[] = PERFILES_DEMO.map(x => ({
    id: x.id,
    email: x.correo,
    nombre: x.nombre,
    rol: x.rol,
    dependencia_id: x.dependenciaId,
    activo: x.activo
  }));
  const auditar = (
    tabla: string,
    accion: string,
    registro: string,
    payload: unknown,
    usuario: string,
    cambios?: unknown
  ) =>
    auditoria.push(
      nuevoEvento(auditoria, {
        tabla,
        accion,
        registro_id: registro,
        usuario,
        payload: JSON.parse(JSON.stringify(payload)),
        cambios: cambios ?? {},
        created_at: new Date().toISOString()
      })
    );
  auditar('requerimientos', 'INSERT', 'seed', { nota: 'Carga inicial de demostración' }, 'sistema');
  function permisoCruces(): string {
    if (!actual || !puedeClasificar(actual.perfil.rol))
      throw new ErrorDatos(
        'sin_permiso',
        'Solo el Super administrador, el Despacho y Control Interno pueden clasificar temas y revisar cruces.'
      );
    return actual.perfil.correo;
  }
  // Igual que saveCatalog de la 2.x en la demo: actualiza o agrega con el id siguiente, y lo deja en la auditoría
  function guardarEnCatalogo<T extends { id: number }>(
    tabla: 'entes' | 'dependencias',
    lista: T[],
    o: Omit<T, 'id'> & { id?: number }
  ) {
    if (!actual || actual.perfil.rol !== 'admin')
      throw new ErrorDatos('sin_permiso', 'Solo el Super administrador puede editar los catálogos.');
    const i = o.id === undefined ? -1 : lista.findIndex(x => x.id === o.id);
    if (i >= 0) {
      const antes = { ...lista[i] } as T;
      lista[i] = { ...lista[i], ...o } as T;
      auditar(
        tabla,
        'UPDATE',
        String(o.id),
        o,
        actual.perfil.correo,
        diferencias({ ...antes }, { ...lista[i] })
      );
    } else {
      const nuevo = { ...o, id: Math.max(0, ...lista.map(x => x.id)) + 1 } as T;
      lista.push(nuevo);
      auditar(tabla, 'INSERT', String(nuevo.id), nuevo, actual.perfil.correo, {});
    }
  }

  return {
    auth: {
      async ingresar(correo, clave) {
        const perfil = PERFILES_DEMO.find(p => p.correo === correo.trim().toLowerCase());
        if (!perfil || clave !== CLAVE_DEMO)
          throw new ErrorDatos('credenciales', 'Correo o contraseña incorrectos.');
        if (pideCodigo(perfil)) {
          pendiente = perfil;
          return { tipo: 'requiere_codigo' };
        }
        actual = { perfil, sesion: { usuarioId: perfil.id, correo: perfil.correo, nivel: 'aal1' } };
        return { tipo: 'listo', sesion: actual.sesion };
      },
      async verificarCodigo(codigo) {
        if (!pendiente) throw new ErrorDatos('otro', 'Primero ingrese con su correo y contraseña.');
        if (codigo.replace(/\D/g, '') !== CODIGO_DEMO)
          throw new ErrorDatos('codigo', 'El código no es correcto o ya cambió. Escriba el código actual.');
        actual = {
          perfil: pendiente,
          sesion: { usuarioId: pendiente.id, correo: pendiente.correo, nivel: 'aal2' }
        };
        pendiente = null;
        return actual.sesion;
      },
      async sesionActual() {
        return actual?.sesion ?? null;
      },
      async salir() {
        actual = null;
        pendiente = null;
      },
      async recuperarClave() {
        // En la demostración no se envían correos.
      },
      async cambiarClave() {
        if (!actual) throw new ErrorDatos('otro', 'Primero ingrese con su correo y contraseña.');
        // En la demostración la contraseña no cambia (siempre es "demo").
      },
      async tieneVerificacion() {
        return !!actual && (pideCodigo(actual.perfil) || verificados.has(actual.perfil.id));
      },
      async iniciarVerificacion() {
        if (!actual) throw new ErrorDatos('otro', 'Primero ingrese con su correo y contraseña.');
        return { factorId: 'demo-factor-' + actual.perfil.id, qr: QR_DEMO, secreto: 'DEMO DEMO DEMO DEMO' };
      },
      async confirmarVerificacion(factorId, codigo) {
        if (codigo.replace(/\D/g, '') !== CODIGO_DEMO)
          throw new ErrorDatos(
            'codigo',
            'El código no es correcto o ya cambió. Escriba el código actual de la app.'
          );
        verificados.add(factorId.replace('demo-factor-', ''));
      },
      async cancelarVerificacion() {
        // Nada que deshacer en la demostración.
      }
    },
    identidad: {
      async miPerfil() {
        return actual?.perfil ?? null;
      },
      async registrarAcceso() {
        if (actual) accesos[actual.perfil.id] = new Date().toISOString();
      }
    },
    catalogos: {
      async entes() {
        return entes.map(e => ({ ...e })).sort(porNombre);
      },
      async dependencias() {
        return dependencias.map(d => ({ ...d })).sort(porNombre);
      },
      async configuracion() {
        return { diasRojo: 5, correoDisciplinario: '' };
      },
      async guardarEnte(e) {
        guardarEnCatalogo('entes', entes, e);
      },
      async guardarDependencia(d) {
        guardarEnCatalogo('dependencias', dependencias, d);
      }
    },
    actividad: {
      async perfiles() {
        return PERFILES_DEMO.map(p => ({
          id: p.id,
          email: p.correo,
          rol: p.rol,
          dependencia_id: p.dependenciaId,
          activo: p.activo
        }));
      },
      async ultimosAccesos() {
        return { ...accesos };
      },
      async notificaciones() {
        return notificaciones.map(n => ({ ...n }));
      },
      async registrarNotificacion(n) {
        // Igual que la 2.x en la demo: se guarda (máximo 300) y queda en la auditoría
        const usuario = actual?.perfil.correo ?? '';
        notificaciones.unshift({ ...n, ts: new Date().toISOString(), usuario });
        notificaciones.splice(300);
        auditar(
          'notificaciones',
          'INSERT',
          String(notificaciones.length),
          { organismo: n.org, destinatario: n.nombre ?? '', plantilla: n.tpl, n_items: n.n },
          usuario
        );
      },
      async informes() {
        return informes.map(i => ({ ...i }));
      },
      async registrarInforme(e) {
        // Igual que la 2.x en la demo: se guarda y queda en la auditoría
        const usuario = actual?.perfil.correo ?? '';
        informes.unshift({
          ts: new Date().toISOString(),
          usuario,
          alcance: e.alcance,
          vigencias: e.vigencias,
          n: e.n,
          huella: e.huella
        });
        informes.splice(100);
        auditar(
          'informes',
          'INSERT',
          String(informes.length),
          { alcance: e.alcance, vigencias: e.vigencias, huella: e.huella },
          usuario
        );
      }
    },
    auditoria: {
      async eventos() {
        return auditoria.slice().reverse().slice(0, 300);
      },
      async verificar() {
        return verificarCadena(auditoria);
      },
      async simularManipulacion() {
        const e = auditoria[1];
        if (!e) return false;
        (e.payload as Record<string, unknown>).asunto = 'ALTERADO';
        (e.payload as Record<string, unknown>).manipulado = true;
        return true;
      }
    },
    historico: {
      async radicados() {
        // El histórico de ejemplo (datos/demo/historico.json, ficticio) se carga aparte, solo cuando se abre
        const { radicadosDemo } = await import('./historico-demo');
        return radicadosDemo();
      }
    },
    cuentas: {
      async lista() {
        return cuentas.map(c => ({ ...c })).sort((a, b) => a.email.localeCompare(b.email));
      },
      // Igual que db.cuenta de la 2.x en la demostración: simula gestion-cuentas sin enviar correos
      async gestionar(accion, datos) {
        const p = actual?.perfil;
        if (!p || p.rol !== 'admin')
          throw new ErrorDatos('sin_permiso', 'Solo el Super administrador gestiona cuentas.');
        const correo = String(datos.correo ?? '')
          .trim()
          .toLowerCase();
        const dep = datos.dependencia
          ? (dependencias.find(d => claveOrganismo(d.nombre) === claveOrganismo(String(datos.dependencia)))
              ?.id ?? null)
          : null;
        const nueva = () => {
          let c = cuentas.find(x => x.email === correo);
          if (!c) {
            c = {
              id: 'u' + (cuentas.length + 1) + '_' + Date.now(),
              email: correo,
              nombre: '',
              rol: 'secretario',
              dependencia_id: null,
              activo: false
            };
            cuentas.push(c);
          }
          return c;
        };
        const porId = () => {
          const c = cuentas.find(x => x.id === datos.id);
          if (!c) throw new ErrorDatos('otro', 'La cuenta no existe.');
          return c;
        };
        const datosCuenta = (activo: boolean) => ({
          nombre: String(datos.nombre ?? ''),
          rol: String(datos.rol ?? 'secretario'),
          dependencia_id: dep,
          activo
        });
        let mensaje: string;
        if (accion === 'preparar') {
          Object.assign(nueva(), datosCuenta(false));
          mensaje = 'Cuenta preparada para ' + correo + ', sin activar (simulado).';
        } else if (accion === 'activar_invitar') {
          const c = porId();
          c.activo = true;
          mensaje = 'Cuenta activada. Enlace enviado a ' + c.email + ' (simulado).';
        } else if (accion === 'invitar') {
          Object.assign(nueva(), datosCuenta(true));
          mensaje = 'Invitación enviada a ' + correo + ' (simulada en modo demostración).';
        } else if (accion === 'cambiar_correo') {
          if (cuentas.some(x => x.email === correo && x.id !== datos.id))
            throw new ErrorDatos('otro', 'Ese correo ya pertenece a otra cuenta.');
          Object.assign(porId(), { email: correo, nombre: String(datos.nombre ?? ''), activo: true });
          mensaje =
            'La cuenta ahora es de ' + correo + '. El titular anterior ya no puede ingresar (simulado).';
        } else if (accion === 'enlace_clave') mensaje = 'Enlace enviado a ' + correo + ' (simulado).';
        else {
          const c = cuentas.find(x => x.id === datos.id);
          if (c) c.activo = accion === 'activar';
          mensaje = accion === 'activar' ? 'Cuenta activada.' : 'Cuenta desactivada.';
        }
        auditar('cuentas_eventos', 'INSERT', accion, { accion, ...datos }, p.correo);
        return { mensaje };
      },
      async guardar(c) {
        const p = actual?.perfil;
        if (!p || p.rol !== 'admin')
          throw new ErrorDatos('sin_permiso', 'Solo el Super administrador gestiona cuentas.');
        const t = cuentas.find(x => x.id === c.id);
        if (!t) throw new ErrorDatos('otro', 'La cuenta no existe.');
        const antes = { ...t };
        Object.assign(t, { rol: c.rol, dependencia_id: c.dependencia_id, activo: c.activo });
        auditar('profiles', 'UPDATE', t.id, t, p.correo, diferencias(antes, { ...t }));
      }
    },
    requerimientos: {
      async lista(vigencia) {
        // Igual que la base (RLS req_read): secretario y enlace solo ven los de su dependencia
        const p = actual?.perfil;
        const propia = p && ['secretario', 'enlace'].includes(p.rol) ? p.dependenciaId : null;
        return reqs
          .filter(r => r.vigencia === vigencia && (propia === null || r.dependencia_id === propia))
          .map(r => ({ ...r }));
      },
      async crear(o) {
        const p = actual?.perfil;
        // Igual que la base (RLS req_ins): Super administrador, o enlace en su propia dependencia
        if (!p || !(p.rol === 'admin' || (p.rol === 'enlace' && o.dependencia_id === p.dependenciaId)))
          throw new ErrorDatos('sin_permiso', 'Tu rol no tiene permiso para esta operación');
        if (reqs.some(r => r.radicado === o.radicado))
          throw new ErrorDatos('otro', 'El radicado ' + o.radicado + ' ya existe');
        const r: Requerimiento = {
          ...o,
          id: 'd' + Date.now(),
          estado: 'abierto',
          orfeo_salida: null,
          fecha_cierre: null,
          soporte_path: null,
          soporte_hash: null,
          escalado_at: null
        };
        reqs.push(r);
        auditar('requerimientos', 'INSERT', r.id, r, p.correo);
      },
      async cerrar(r, orfeo, fecha, archivo) {
        const p = actual?.perfil;
        const t = reqs.find(x => x.id === r.id);
        // Mismas reglas que cerrar_requerimiento en la base (supabase/22_fecha_colombia.sql)
        if (!p || !['admin', 'secretario', 'enlace'].includes(p.rol))
          throw new ErrorDatos('sin_permiso', 'Tu rol no puede registrar respuestas ORFEO');
        if (!t) throw new ErrorDatos('otro', 'El requerimiento no existe');
        if (p.rol !== 'admin' && t.dependencia_id !== p.dependenciaId)
          throw new ErrorDatos('sin_permiso', 'Este requerimiento pertenece a otra dependencia');
        if (t.estado === 'cerrado') throw new ErrorDatos('otro', 'El requerimiento ya está cerrado');
        if (reqs.some(x => x.orfeo_salida === orfeo))
          throw new ErrorDatos(
            'otro',
            'El radicado ORFEO ' + orfeo + ' ya fue registrado en otro requerimiento'
          );
        const hash = await huellaArchivo(archivo);
        const antes = { ...t };
        Object.assign(t, {
          estado: 'cerrado',
          orfeo_salida: orfeo,
          fecha_cierre: fecha,
          soporte_hash: hash,
          soporte_path: archivo.name ?? null
        });
        auditar('requerimientos', 'UPDATE', t.id, t, p.correo, diferencias(antes, { ...t }));
        return { hash };
      },
      async escalar(id, canal) {
        const p = actual?.perfil;
        if (!p || !['admin', 'alcalde', 'control_interno', 'enlace'].includes(p.rol))
          throw new ErrorDatos('sin_permiso', 'Tu rol no puede escalar alertas');
        const t = reqs.find(x => x.id === id && x.estado === 'abierto');
        if (!t) throw new ErrorDatos('otro', 'El requerimiento no existe o ya está cerrado');
        t.escalado_at = new Date().toISOString();
        alertasLog.push({ requerimiento_id: id, canal });
        auditar(
          'alertas_log',
          'INSERT',
          String(alertasLog.length),
          { requerimiento_id: id, canal },
          p.correo
        );
      },
      async urlSoporte() {
        // La demostración no guarda archivos (igual que la 2.x, que oculta el botón)
        throw new ErrorDatos('otro', 'La demostración no guarda los PDF de soporte.');
      }
    },
    cruces: {
      async temasManuales() {
        return JSON.parse(JSON.stringify(Object.fromEntries(temasMan))) as Record<string, TemaManual>;
      },
      async revisiones() {
        return JSON.parse(JSON.stringify(Object.fromEntries(revisiones))) as Record<string, RevisionCruce>;
      },
      async guardarTema(llave, tema) {
        const usuario = permisoCruces();
        if (tema) temasMan.set(llave, { tema, usuario, ts: new Date().toISOString() });
        else temasMan.delete(llave);
        auditar('tema_manual', tema ? 'UPDATE' : 'DELETE', llave, { tema: tema || null }, usuario);
      },
      async guardarRevision(clave, estado, nota = '') {
        const usuario = permisoCruces();
        if (estado) revisiones.set(clave, { estado, nota, usuario, ts: new Date().toISOString() });
        else revisiones.delete(clave);
        auditar(
          'cruce_revision',
          estado ? 'UPDATE' : 'DELETE',
          clave,
          { estado: estado || null, nota },
          usuario
        );
      }
    },
    directorio: {
      async organismos() {
        return ORGANISMOS_DEMO.map(o => ({ ...o }));
      },
      async responsables() {
        return directorio.map(r => ({ ...r }));
      },
      async guardar(r) {
        if (!actual || !['admin', 'alcalde'].includes(actual.perfil.rol))
          throw new ErrorDatos(
            'sin_permiso',
            'Solo el Super administrador y el Despacho pueden editar el directorio.'
          );
        const i = directorio.findIndex(
          x => claveOrganismo(x.organismo) === claveOrganismo(r.organismo) && x.cargo === r.cargo
        );
        const antes = i >= 0 ? directorio[i] : undefined;
        if (i >= 0) directorio[i] = { ...r };
        else directorio.push({ ...r });
        auditar(
          'directorio',
          antes ? 'UPDATE' : 'INSERT',
          r.organismo + '|' + r.cargo,
          r,
          actual.perfil.correo,
          antes ? diferencias({ ...antes }, { ...r }) : {}
        );
      }
    }
  };
}
