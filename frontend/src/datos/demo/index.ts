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
import { semillaPlanes, vistaPorDependencia } from './planes-semilla';
import {
  puedeEditarPlanes,
  puedeReportar,
  txt,
  type Accion,
  type Avance,
  type Hallazgo,
  type Plan
} from '../../dominio/planes';
import { huellaArchivo } from '../../dominio/huella-archivo';
import { fechaColombia } from '../../dominio/fechas';
import type { Requerimiento } from '../../dominio/requerimientos';
import { desdeBaseDeDatos, fechaDeCorte, type RadicadoHistorico } from '../../dominio/historico';
import type { Cuenta } from '../../dominio/cuentas';
import type { ConfiguracionGeneral } from '../../dominio/configuracion';
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
  // Planes de mejoramiento de la demostración (los mismos de la 2.x, ficticios)
  const planes = semillaPlanes(fechaColombia(new Date()));
  /** Correo de quien edita planes (Super administrador o Control Interno); si no, el error indicado. */
  const editorPlanes = (mensaje: string) => {
    const p = actual?.perfil;
    if (!p || !puedeEditarPlanes(p.rol)) throw new ErrorDatos('sin_permiso', mensaje);
    return p.correo;
  };
  // pmRevisar de la 2.x: al validar, la acción toma el último avance validado (por corte y por revisión)
  async function revisarDemo(id: string, estado: 'validado' | 'devuelto', obs: string) {
    const usuario = editorPlanes('Solo el Super administrador o Control Interno validan avances');
    const v = planes.avances.find(x => x.id === id);
    if (!v) throw new ErrorDatos('otro', 'El avance no existe');
    if (v.estado !== 'reportado') throw new ErrorDatos('otro', 'Este avance ya fue revisado');
    if (estado === 'devuelto' && txt(obs).length < 5)
      throw new ErrorDatos('otro', 'Indica a la dependencia por qué se devuelve el avance');
    const antes = { ...v };
    Object.assign(v, {
      estado,
      observacion: txt(obs),
      revisado_email: usuario,
      revisado_at: new Date().toISOString()
    });
    auditar('pm_avances', 'UPDATE', id, v, usuario, diferencias(antes, { ...v }));
    if (estado === 'validado') {
      const a = planes.acciones.find(x => x.id === v.accion_id);
      const ultimoValidado = planes.avances
        .filter(x => x.accion_id === v.accion_id && x.estado === 'validado')
        .sort(
          (x, y) =>
            String(y.fecha_corte).localeCompare(String(x.fecha_corte)) ||
            String(y.revisado_at).localeCompare(String(x.revisado_at))
        )[0];
      if (a && ultimoValidado) {
        const ant = { ...a };
        a.avance = ultimoValidado.cantidad;
        a.fecha_corte = ultimoValidado.fecha_corte;
        auditar('pm_acciones', 'UPDATE', a.id, a, usuario, diferencias(ant, { ...a }));
      }
    }
  }
  // Histórico después de cargar un Excel en la demostración (si no, el de ejemplo)
  let historicoCargado: { filas: RadicadoHistorico[]; corte: string } | null = null;
  // Configuración de la demostración (en memoria; el semáforo la usa al momento)
  const config: ConfiguracionGeneral = {
    dias_rojo: 5,
    correo_disciplinario: '',
    resumen_activo: false,
    resumen_ultimo: null,
    resumen_ultimo_detalle: '',
    avisos_activo: false,
    avisos_copia_correo: '',
    avisos_ultimo: null,
    avisos_ultimo_detalle: ''
  };
  const soloEnDemo = (que: string) => new ErrorDatos('otro', 'En modo demostración ' + que);
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
        return { diasRojo: config.dias_rojo || 5, correoDisciplinario: config.correo_disciplinario };
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
        if (historicoCargado)
          return { filas: historicoCargado.filas.map(r => ({ ...r })), corte: historicoCargado.corte };
        const { radicadosDemo } = await import('./historico-demo');
        return radicadosDemo();
      },
      // ceAplicarEnMemoria de la 2.x: en la demostración la carga solo cambia los datos de este navegador
      async cargarVigencias(c) {
        const p = actual?.perfil;
        if (!p || p.rol !== 'admin')
          throw new ErrorDatos('sin_permiso', 'Solo el Super administrador carga el Excel de control');
        const { radicadosDemo } = await import('./historico-demo');
        const actualH = historicoCargado ?? (await radicadosDemo());
        const otras = actualH.filas.filter(r => !c.vigencias.includes(r.v));
        const nuevas = desdeBaseDeDatos(c.filas).filas;
        const filas = otras.concat(nuevas).map((r, i) => ({ ...r, i }));
        historicoCargado = { filas, corte: fechaDeCorte(filas) };
        auditar(
          'historico_cargas',
          'INSERT',
          String(Date.now()),
          { vigencias: c.vigencias, archivos: c.archivos, registros: c.filas.length },
          p.correo
        );
        return { registros: c.filas.length, demo: true };
      }
    },
    planes: {
      async datos() {
        const p = actual?.perfil;
        // pmDemoView de la 2.x: secretario y enlace solo ven lo de su dependencia y no ven traslados
        if (p && ['secretario', 'enlace'].includes(p.rol))
          return {
            ...JSON.parse(JSON.stringify(vistaPorDependencia(planes, p.dependenciaId))),
            traslados: []
          };
        return { ...JSON.parse(JSON.stringify(planes)), traslados: [] };
      },
      // pmSave de la 2.x en la demostración
      async guardar(tipo, o, id) {
        const usuario = editorPlanes('Tu rol no puede modificar planes de mejoramiento');
        const lista = (tipo === 'plan'
          ? planes.planes
          : tipo === 'hall'
            ? planes.hallazgos
            : planes.acciones) as unknown as Record<string, unknown>[];
        if (
          tipo === 'hall' &&
          planes.hallazgos.some(h => h.plan_id === o.plan_id && h.numero === o.numero && h.id !== id)
        )
          throw new ErrorDatos(
            'otro',
            'Ya existe un hallazgo con el número ' + String(o.numero) + ' en este plan'
          );
        const tabla = tipo === 'plan' ? 'pm_planes' : tipo === 'hall' ? 'pm_hallazgos' : 'pm_acciones';
        if (id) {
          const t = lista.find(x => x.id === id);
          if (!t) throw new ErrorDatos('otro', 'El registro no existe');
          const antes = { ...t };
          Object.assign(t, o);
          auditar(tabla, 'UPDATE', id, t, usuario, diferencias(antes, { ...t }));
          return id;
        }
        const nuevo: Record<string, unknown> = {
          ...o,
          id: tipo[0] + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        };
        if (tipo === 'acc') Object.assign(nuevo, { avance: 0, fecha_corte: null });
        lista.push(nuevo);
        auditar(tabla, 'INSERT', String(nuevo.id), nuevo, usuario);
        return String(nuevo.id);
      },
      async eliminar(tipo, id) {
        const usuario = editorPlanes('Tu rol no puede eliminar');
        const accIds =
          tipo === 'acc' ? [id] : planes.acciones.filter(a => a.hallazgo_id === id).map(a => a.id);
        if (planes.avances.some(v => accIds.includes(v.accion_id)))
          throw new ErrorDatos(
            'otro',
            tipo === 'acc'
              ? 'La acción tiene avances reportados: no se puede eliminar'
              : 'El hallazgo tiene acciones con avances reportados: no se puede eliminar'
          );
        if (tipo === 'hall') {
          planes.acciones = planes.acciones.filter(a => a.hallazgo_id !== id);
          planes.hallazgos = planes.hallazgos.filter(h => h.id !== id);
        } else planes.acciones = planes.acciones.filter(a => a.id !== id);
        auditar(tipo === 'acc' ? 'pm_acciones' : 'pm_hallazgos', 'DELETE', id, { id }, usuario);
      },
      async eliminarPlan(id) {
        const usuario = editorPlanes('Solo el Super administrador o Control Interno eliminan planes');
        if (planes.avances.some(v => v.plan_id === id && !/^Importado del archivo/.test(v.observacion || '')))
          throw new ErrorDatos(
            'otro',
            'El plan tiene avances reportados por las dependencias: no se puede eliminar'
          );
        planes.avances = planes.avances.filter(v => v.plan_id !== id);
        planes.acciones = planes.acciones.filter(a => a.plan_id !== id);
        planes.hallazgos = planes.hallazgos.filter(h => h.plan_id !== id);
        planes.planes = planes.planes.filter(p => p.id !== id);
        auditar('pm_planes', 'DELETE', id, { id }, usuario);
      },
      // pmReportar de la 2.x en la demostración
      async reportar(a0, o, archivo) {
        const p = actual?.perfil;
        const a = planes.acciones.find(x => x.id === a0.id);
        if (!p || !a || !puedeReportar(a, p.rol, p.dependenciaId))
          throw new ErrorDatos(
            'sin_permiso',
            'Solo puedes reportar avances de las acciones de tu dependencia'
          );
        if (planes.avances.some(v => v.accion_id === a.id && v.estado === 'reportado'))
          throw new ErrorDatos('otro', 'Esta acción ya tiene un avance pendiente de validar');
        const hash = archivo ? await huellaArchivo(archivo) : null;
        const v: Avance = {
          id: 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
          accion_id: a.id,
          plan_id: a.plan_id,
          dependencia_id: a.dependencia_id,
          fecha_corte: o.fecha_corte,
          cantidad: o.cantidad,
          descripcion: o.descripcion,
          radicado_orfeo: o.radicado_orfeo || '',
          soporte_path: archivo ? (archivo.name ?? 'soporte.pdf') : null,
          soporte_hash: hash,
          estado: 'reportado',
          observacion: '',
          reportado_email: p.correo,
          revisado_email: '',
          revisado_at: null,
          created_at: new Date().toISOString()
        };
        planes.avances.push(v);
        auditar('pm_avances', 'INSERT', v.id, v, p.correo);
        if (o.validar && puedeEditarPlanes(p.rol))
          await revisarDemo(v.id, 'validado', 'Registrado y validado por ' + p.correo);
        return { hash };
      },
      async revisar(id, estado, obs) {
        await revisarDemo(id, estado, obs);
      },
      // pmImportar de la 2.x en la demostración: los avances con corte entran como validados
      async importar(carga) {
        const usuario = editorPlanes('Solo el Super administrador o Control Interno importan planes');
        const now = new Date().toISOString();
        const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const plan = { ...carga.plan, id: uid('p'), created_at: now, updated_at: now } as unknown as Plan;
        const hall: Hallazgo[] = [],
          acc: Accion[] = [],
          av: Avance[] = [];
        carga.hallazgos.forEach((h, i) => {
          const { acciones, ...resto } = h;
          const hh = {
            ...resto,
            id: uid('h'),
            plan_id: plan.id,
            orden: i + 1,
            created_at: now,
            updated_at: now
          };
          hall.push(hh as unknown as Hallazgo);
          acciones.forEach(a => {
            const { descripcion_avance, ...ra } = a;
            const aa = {
              ...ra,
              id: uid('a'),
              plan_id: plan.id,
              hallazgo_id: hh.id,
              orden: acc.length + 1,
              avance: 0,
              fecha_corte: null as string | null,
              obs_ci_estado: a.obs_ci ? 'pendiente' : '',
              created_at: now,
              updated_at: now
            };
            if (a.avance != null && a.fecha_corte) {
              aa.avance = a.avance;
              aa.fecha_corte = a.fecha_corte;
              av.push({
                id: uid('v'),
                accion_id: aa.id,
                plan_id: plan.id,
                dependencia_id: aa.dependencia_id,
                fecha_corte: a.fecha_corte,
                cantidad: a.avance,
                descripcion: descripcion_avance || 'Avance importado del archivo ' + carga.archivo,
                radicado_orfeo: '',
                soporte_path: null,
                soporte_hash: null,
                estado: 'validado',
                observacion: 'Importado del archivo ' + carga.archivo,
                reportado_email: usuario,
                revisado_email: usuario,
                revisado_at: now,
                created_at: now
              });
            }
            acc.push(aa as unknown as Accion);
          });
        });
        planes.planes.push(plan);
        planes.hallazgos.push(...hall);
        planes.acciones.push(...acc);
        planes.avances.push(...av);
        auditar(
          'pm_planes',
          'INSERT',
          plan.id,
          { ...plan, hallazgos: hall.length, acciones: acc.length, archivo: carga.archivo },
          usuario
        );
        return plan.id;
      }
    },
    sistema: {
      async general() {
        return { ...config };
      },
      async guardar(c) {
        const p = actual?.perfil;
        if (!p || p.rol !== 'admin')
          throw new ErrorDatos('sin_permiso', 'Tu rol no tiene permiso para esta operación');
        const antes = { ...config };
        Object.assign(config, c);
        auditar('config', 'UPDATE', '1', { ...config }, p.correo, diferencias(antes, { ...config }));
      },
      async probarResumen() {
        throw soloEnDemo('no se envían correos');
      },
      async vistaPreviaAvisos() {
        throw soloEnDemo('no hay vista previa del aviso');
      },
      async respaldos() {
        return [];
      },
      async crearRespaldo() {
        throw soloEnDemo('no se crean copias de seguridad.');
      },
      async urlRespaldo() {
        throw soloEnDemo('no hay copias para descargar.');
      },
      async eventos() {
        return [];
      },
      async marcarRevisado() {},
      async ultimasCargas() {
        return [];
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
