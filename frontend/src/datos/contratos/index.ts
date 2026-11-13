// Contratos de la capa de datos (plan §7.2, ADR 0003). Las pantallas solo conocen estas interfaces; las
// implementaciones (datos/supabase y datos/demo) se intercambian sin tocar las pantallas.
import type { Rol } from '../../dominio/roles';
import type { Organismo, Responsable } from '../../dominio/directorio';
import type { RadicadoHistorico } from '../../dominio/historico';
import type { EventoAuditoria, ResultadoVerificacion } from '../../dominio/auditoria';
import type { Notificacion, PerfilActividad } from '../../dominio/actividad';
import type { RevisionCruce, TemaManual } from '../../dominio/cruces';
import type { Requerimiento } from '../../dominio/requerimientos';
import type { ArchivoSoporte } from '../../dominio/huella-archivo';
import type { AccionCuenta, Cuenta } from '../../dominio/cuentas';
import type {
  ArchivoRespaldo,
  CargaExcel,
  ConfiguracionGeneral,
  EventoSistema,
  VistaPreviaAvisos
} from '../../dominio/configuracion';

/** Error de la capa de datos con un código estable para la interfaz (el mensaje ya viene en español). */
export type CodigoError = 'credenciales' | 'codigo' | 'sin_permiso' | 'cuenta_inactiva' | 'red' | 'otro';
export class ErrorDatos extends Error {
  readonly codigo: CodigoError;
  constructor(codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDatos';
    this.codigo = codigo;
  }
}

// ---------- auth (hoy: supabase.auth, MFA) ----------
export interface Sesion {
  usuarioId: string;
  correo: string;
  /** Nivel de la sesión: aal2 cuando ya se verificó el código de la app autenticadora. */
  nivel: 'aal1' | 'aal2';
}
export type ResultadoIngreso = { tipo: 'listo'; sesion: Sesion } | { tipo: 'requiere_codigo' };

export interface RepositorioAuth {
  ingresar(correo: string, clave: string): Promise<ResultadoIngreso>;
  verificarCodigo(codigo: string): Promise<Sesion>;
  sesionActual(): Promise<Sesion | null>;
  salir(): Promise<void>;
  /** Envía el correo para cambiar la contraseña; `volverA` debe estar en las Redirect URLs de Supabase. */
  recuperarClave(correo: string, volverA: string): Promise<void>;
  /** Cambia la contraseña de quien tiene la sesión (también al llegar por invitación o recuperación). */
  cambiarClave(nueva: string): Promise<void>;
  /** true si la cuenta ya tiene al menos un celular verificado para la verificación en dos pasos. */
  tieneVerificacion(): Promise<boolean>;
  /** Empieza a activar la verificación en dos pasos: código QR y clave para la app autenticadora. */
  iniciarVerificacion(): Promise<InscripcionVerificacion>;
  /** Confirma la activación con el código de 6 dígitos que muestra la app. */
  confirmarVerificacion(factorId: string, codigo: string): Promise<void>;
  /** Deja sin efecto una activación que no se terminó. */
  cancelarVerificacion(factorId: string): Promise<void>;
}
export interface InscripcionVerificacion {
  factorId: string;
  /** Imagen del código QR, lista para usar en <img src>. */
  qr: string;
  /** Clave para escribir a mano en la app si no se puede escanear. */
  secreto: string;
}

// ---------- identidad (hoy: profiles, accesos) ----------
export interface Perfil {
  id: string;
  correo: string;
  nombre: string;
  rol: Rol;
  dependenciaId: number | null;
  activo: boolean;
}
export interface RepositorioIdentidad {
  /** Perfil de quien tiene la sesión, o null si no hay sesión o la cuenta no está activa. */
  miPerfil(): Promise<Perfil | null>;
  registrarAcceso(): Promise<void>;
}

// ---------- catalogos (hoy: entes, dependencias, config) ----------
export interface Ente {
  id: number;
  nombre: string;
  sigla: string;
  tipo: string;
  activo: boolean;
}
export interface Dependencia {
  id: number;
  nombre: string;
  /** Secretario(a) de Despacho y su contacto (columnas secretario_nombre, correo y telefono). */
  secretarioNombre: string;
  correo: string;
  telefono: string;
  activo: boolean;
}
export interface Configuracion {
  diasRojo: number;
  correoDisciplinario: string;
}
export interface RepositorioCatalogos {
  entes(): Promise<Ente[]>;
  dependencias(): Promise<Dependencia[]>;
  configuracion(): Promise<Configuracion>;
  /** Crea (sin id) o actualiza un ente de control. Solo Super administrador (RLS entes_ins y entes_upd). */
  guardarEnte(e: Omit<Ente, 'id'> & { id?: number }): Promise<void>;
  /** Crea (sin id) o actualiza una dependencia. Solo Super administrador (RLS deps_ins y deps_upd). */
  guardarDependencia(d: Omit<Dependencia, 'id'> & { id?: number }): Promise<void>;
}

// ---------- directorio (hoy: directorio, historico_requerimientos para la lista de dependencias) ----------
export interface RepositorioDirectorio {
  /** Dependencias del histórico con su tipo (Secretaría, Departamento, UAE, Despacho…). */
  organismos(): Promise<Organismo[]>;
  responsables(): Promise<Responsable[]>;
  /** Crea o actualiza el responsable de una dependencia y cargo (solo Super administrador y Despacho, por RLS). */
  guardar(r: Responsable): Promise<void>;
}

// ---------- historico (hoy: historico_requerimientos + cierres hechos en la app en requerimientos) ----------
export interface RepositorioHistorico {
  /** Todos los radicados del histórico (con los cierres de la app ya aplicados) y la fecha de corte. */
  radicados(): Promise<{ filas: RadicadoHistorico[]; corte: string }>;
}

// ---------- auditoria (hoy: audit_log y la función verificar_cadena_auditoria) ----------
export interface RepositorioAuditoria {
  /** Los 300 eventos más recientes, del más nuevo al más antiguo. */
  eventos(): Promise<EventoAuditoria[]>;
  /** Comprueba toda la cadena de huellas SHA-256. */
  verificar(): Promise<ResultadoVerificacion>;
  /** Solo en la demostración: altera en memoria el evento 2 para mostrar que la verificación lo detecta. */
  simularManipulacion?: () => Promise<boolean>;
}

// ---------- actividad (hoy: profiles, accesos, notificaciones e informes) ----------
export interface InformeGenerado {
  ts: string;
  usuario: string;
  alcance: string;
  vigencias: string;
  n: number;
  huella: string;
}
export interface RepositorioActividad {
  /** Todas las cuentas (solo supervisión las ve, por RLS). */
  perfiles(): Promise<PerfilActividad[]>;
  /** Último ingreso de cada cuenta: { id de la cuenta: fecha y hora }. */
  ultimosAccesos(): Promise<Record<string, string>>;
  /** Las 300 notificaciones más recientes (de la más nueva a la más vieja). */
  notificaciones(): Promise<Notificacion[]>;
  /** Los 100 informes ejecutivos más recientes. */
  informes(): Promise<InformeGenerado[]>;
  /** Registra una notificación enviada (logNotif de la 2.x; tabla notificaciones). */
  registrarNotificacion(n: Omit<Notificacion, 'ts' | 'usuario'>): Promise<void>;
  /** Registra un informe generado con su huella (logInforme de la 2.x; tabla informes). */
  registrarInforme(e: {
    alcance: string;
    vigencias: string;
    corte: string;
    n: number;
    huella: string;
  }): Promise<void>;
}

// ---------- cruces (hoy: tema_manual y cruce_revision; scripts 08) ----------
export interface RepositorioCruces {
  /** Temas corregidos a mano, por llave de fila (vigencia|ORFEO entrada|radicado del ente|organismo). */
  temasManuales(): Promise<Record<string, TemaManual>>;
  /** Cruces confirmados o descartados, por clave del cruce. */
  revisiones(): Promise<Record<string, RevisionCruce>>;
  /** Guarda el tema de un requerimiento; vacío = vuelve al automático. Admin, alcalde y Control Interno (RLS). */
  guardarTema(llave: string, tema: string): Promise<void>;
  /** Confirma o descarta un cruce; vacío = quita la revisión. Admin, alcalde y Control Interno (RLS). */
  guardarRevision(clave: string, estado: '' | RevisionCruce['estado'], nota?: string): Promise<void>;
}

// ---------- requerimientos (hoy: v_requerimientos, requerimientos; scripts 01 y 22) ----------
export interface RepositorioRequerimientos {
  /** Requerimientos de una vigencia (RLS: secretario y enlace solo los de su dependencia). */
  lista(vigencia: number): Promise<Requerimiento[]>;
  /** Registra uno nuevo (RLS: Super administrador, o enlace en su dependencia). */
  crear(r: {
    radicado: string;
    vigencia: number;
    ente_id: number;
    dependencia_id: number;
    asunto: string;
    fecha_radicacion: string;
    fecha_limite: string;
  }): Promise<void>;
  /**
   * Cierra un requerimiento con su ORFEO de salida, la fecha de envío y el PDF de soporte (closeReq de la 2.x): sube el
   * PDF al depósito soportes y llama a cerrar_requerimiento; si el cierre falla, borra el PDF. Devuelve la huella.
   */
  cerrar(
    r: Pick<Requerimiento, 'id' | 'radicado' | 'vigencia'>,
    orfeo: string,
    fecha: string,
    archivo: ArchivoSoporte
  ): Promise<{ hash: string }>;
  /** Registra un escalamiento (escalar_requerimiento): canal registro, whatsapp, correo o disciplinario. */
  escalar(id: string, canal: string): Promise<void>;
  /** Enlace temporal (5 minutos) para ver el PDF de soporte del depósito privado soportes. */
  urlSoporte(path: string): Promise<string>;
}

// ---------- cuentas (hoy: profiles y la función gestion-cuentas) ----------
export interface RepositorioCuentas {
  /** Todas las cuentas, por correo (solo el Super administrador las administra). */
  lista(): Promise<Cuenta[]>;
  /** Llama a gestion-cuentas (preparar, invitar, activar_invitar, cambiar_correo, enlace_clave, activar, desactivar). */
  gestionar(accion: AccionCuenta, datos: Record<string, unknown>): Promise<{ mensaje: string }>;
  /** Cambia rol, dependencia o estado de una cuenta (tabla profiles). */
  guardar(c: Pick<Cuenta, 'id' | 'rol' | 'dependencia_id' | 'activo'>): Promise<void>;
}

// ---------- sistema (hoy: config, eventos_sistema, historico_cargas, depósito respaldos y las funciones
// resumen-semanal, avisos-planes y respaldo) ----------
export interface RepositorioSistema {
  /** La fila de configuración tal como está en la base (sin las columnas de los scripts no instalados). */
  general(): Promise<ConfiguracionGeneral>;
  /** Guarda los cambios (solo el Super administrador, por RLS). */
  guardar(c: Partial<ConfiguracionGeneral>): Promise<void>;
  /** Envía el resumen semanal de prueba al correo de quien lo pide; devuelve cuántos correos salieron. */
  probarResumen(): Promise<{ enviados: number }>;
  /** Lo que el aviso diario de planes enviaría hoy (no envía nada). */
  vistaPreviaAvisos(): Promise<VistaPreviaAvisos>;
  /** Copias guardadas en el depósito respaldos (las 20 más recientes). */
  respaldos(): Promise<ArchivoRespaldo[]>;
  /** Crea una copia ahora (función respaldo). */
  crearRespaldo(): Promise<{ registros: number; kb: number }>;
  /** Enlace de descarga (2 minutos) de una copia. */
  urlRespaldo(nombre: string): Promise<string>;
  /** Errores y avisos sin revisar de las funciones automáticas y de la app. */
  eventos(): Promise<EventoSistema[]>;
  marcarRevisado(id: number): Promise<void>;
  /** Las 5 cargas más recientes del Excel de control; null si falta el script 16. */
  ultimasCargas(): Promise<CargaExcel[] | null>;
}

/** Todo lo que la aplicación puede pedir a los datos. Crece módulo por módulo (plan §7.2, tabla de contratos). */
export interface Datos {
  auth: RepositorioAuth;
  identidad: RepositorioIdentidad;
  catalogos: RepositorioCatalogos;
  directorio: RepositorioDirectorio;
  historico: RepositorioHistorico;
  auditoria: RepositorioAuditoria;
  actividad: RepositorioActividad;
  cruces: RepositorioCruces;
  requerimientos: RepositorioRequerimientos;
  cuentas: RepositorioCuentas;
  sistema: RepositorioSistema;
  /** Cuenta institucional desde la que se redactan los correos (remitente de configuracion.json). */
  remitente?: string;
}
