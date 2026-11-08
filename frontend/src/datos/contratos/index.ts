// Contratos de la capa de datos (plan §7.2, ADR 0003). Las pantallas solo conocen estas interfaces; las
// implementaciones (datos/supabase y datos/demo) se intercambian sin tocar las pantallas.
import type { Rol } from '../../dominio/roles';

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
}

/** Todo lo que la aplicación puede pedir a los datos. Crece módulo por módulo (plan §7.2, tabla de contratos). */
export interface Datos {
  auth: RepositorioAuth;
  identidad: RepositorioIdentidad;
  catalogos: RepositorioCatalogos;
}
