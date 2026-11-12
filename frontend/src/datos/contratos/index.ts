// Contratos de la capa de datos (plan §7.2, ADR 0003). Las pantallas solo conocen estas interfaces; las
// implementaciones (datos/supabase y datos/demo) se intercambian sin tocar las pantallas.
import type { Rol } from '../../dominio/roles';
import type { Organismo, Responsable } from '../../dominio/directorio';
import type { RadicadoHistorico } from '../../dominio/historico';
import type { EventoAuditoria, ResultadoVerificacion } from '../../dominio/auditoria';
import type { Notificacion, PerfilActividad } from '../../dominio/actividad';

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
}
