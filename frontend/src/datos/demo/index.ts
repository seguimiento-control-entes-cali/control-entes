// Implementación en memoria de los contratos para la variante de demostración (D-16): sin red y sin Supabase.
// Cuentas ficticias, una por rol; contraseña "demo". La del Super administrador pide además el código 123456,
// para poder mostrar la verificación en dos pasos.
import { ErrorDatos, type Datos, type Perfil, type Sesion } from '../contratos';
import { DEPENDENCIAS_DEMO, ENTES_DEMO } from './catalogos-semilla';

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

export function datosDemo(): Datos {
  let actual: { perfil: Perfil; sesion: Sesion } | null = null;
  let pendiente: Perfil | null = null;
  const accesos: string[] = [];
  const verificados = new Set<string>();

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
        if (actual) accesos.push(actual.perfil.id);
      }
    },
    catalogos: {
      async entes() {
        return ENTES_DEMO.map(e => ({ ...e }));
      },
      async dependencias() {
        return DEPENDENCIAS_DEMO.map(d => ({ ...d }));
      },
      async configuracion() {
        return { diasRojo: 5, correoDisciplinario: '' };
      }
    }
  };
}
