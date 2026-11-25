// Ingreso con correo institucional, contraseña y, si la cuenta lo tiene, el código de la app autenticadora.
// Mismos pasos y mensajes que la 2.x. "¿Olvidaste tu contraseña?" vuelve a la dirección actual de la app.
import { useState, type FormEvent } from 'react';
import { ErrorDatos } from '../../datos/contratos';
import { Aviso, Boton, Campo, CampoClave } from '../../shared/ui';
import { MarcoIngreso } from './MarcoIngreso';
import { useDatos } from './contexto';

const mensaje = (e: unknown) =>
  e instanceof ErrorDatos ? e.message : 'No se pudo completar. Intente de nuevo.';

/** Usuarios de la app de prueba (datos ficticios; contraseña «demo»). */
const USUARIOS_PRUEBA: readonly [string, string][] = [
  ['Super administrador (código 123456)', 'admin.demo@cali.gov.co'],
  ['Alcalde y Despacho', 'despacho.demo@cali.gov.co'],
  ['Control Interno', 'control.interno.demo@cali.gov.co'],
  ['Secretario(a) · Salud Pública', 'secretaria.demo@cali.gov.co'],
  ['Enlace operativo · Salud Pública', 'enlace.demo@cali.gov.co']
];
const APP_REAL = 'https://seguimiento-control-entes-cali.github.io/control-entes/v3/';
const esCuentaPrueba = (c: string) => USUARIOS_PRUEBA.some(([, u]) => u === c.trim().toLowerCase());
/** En la app de prueba, el usuario que viene de la app real (?correo=…) ya queda puesto. */
const correoQueLlega = () => {
  const c = new URLSearchParams(globalThis.location?.search ?? '').get('correo') ?? '';
  return esCuentaPrueba(c) ? c.trim().toLowerCase() : '';
};

export function PantallaIngreso({
  alIngresar,
  demo = false,
  appPrueba
}: {
  alIngresar: () => void;
  demo?: boolean;
  /** Solo en la app real: quien escriba una cuenta de prueba pasa a esta dirección (la app de prueba). */
  appPrueba?: string;
}) {
  const { auth } = useDatos();
  const [paso, setPaso] = useState<'clave' | 'codigo'>('clave');
  const [correo, setCorreo] = useState(() => (demo ? correoQueLlega() : ''));
  const [clave, setClave] = useState(() => (demo && correoQueLlega() ? 'demo' : ''));
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNota('');
    // Una cuenta de prueba en la app real: no se consulta la base; se lleva a la app de prueba con el usuario puesto
    if (appPrueba && paso === 'clave' && esCuentaPrueba(correo)) {
      setNota('Esa es una cuenta de la APP DE PRUEBA. Abriéndola…');
      location.assign(appPrueba + '?correo=' + encodeURIComponent(correo.trim().toLowerCase()));
      return;
    }
    setOcupado(true);
    try {
      if (paso === 'clave') {
        const r = await auth.ingresar(correo, clave);
        if (r.tipo === 'requiere_codigo') setPaso('codigo');
        else alIngresar();
      } else {
        if (codigo.replace(/\D/g, '').length !== 6) throw new ErrorDatos('codigo', 'Escriba los 6 dígitos.');
        await auth.verificarCodigo(codigo);
        alIngresar();
      }
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  async function recuperar() {
    setError('');
    if (!correo.trim()) return setError('Escriba su correo institucional para enviarle el enlace.');
    try {
      await auth.recuperarClave(correo, location.origin + location.pathname);
      setNota('Si el correo está registrado, le llegará un enlace para cambiar la contraseña.');
    } catch (err) {
      setError(mensaje(err));
    }
  }

  return (
    <MarcoIngreso
      titulo={demo ? 'Control de Entes · APP DE PRUEBA' : 'Control de Entes'}
      subtitulo={
        demo
          ? 'Datos ficticios · aquí NO funciona su cuenta real'
          : 'Alcaldía de Santiago de Cali · Acceso institucional'
      }
    >
      {demo && paso === 'clave' && (
        <div className="pm-note y" role="note" aria-label="Usuarios de prueba" style={{ marginBottom: 14 }}>
          <b>Elija un usuario de prueba</b> (contraseña <b className="mono">demo</b>):
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {USUARIOS_PRUEBA.map(([rol, c]) => (
              <button
                key={c}
                type="button"
                className="btn sm"
                style={{
                  justifyContent: 'space-between',
                  width: '100%',
                  height: 'auto',
                  flexWrap: 'wrap',
                  gap: 4,
                  textAlign: 'left'
                }}
                onClick={() => {
                  setCorreo(c);
                  setClave('demo');
                  setError('');
                }}
              >
                <span>{rol}</span>
                <span className="mono muted" style={{ overflowWrap: 'anywhere' }}>
                  {c}
                </span>
              </button>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Para su cuenta real: <a href={APP_REAL}>abra la aplicación real</a>.
          </div>
        </div>
      )}
      <form onSubmit={enviar} noValidate>
        {paso === 'clave' ? (
          <>
            <Campo
              etiqueta="Correo institucional"
              id="correo"
              type="email"
              placeholder="nombre@cali.gov.co"
              autoComplete="username"
              value={correo}
              onChange={e => setCorreo(e.target.value)}
            />
            <CampoClave
              etiqueta="Contraseña"
              id="clave"
              autoComplete="current-password"
              value={clave}
              onChange={e => setClave(e.target.value)}
            />
          </>
        ) : (
          <Campo
            etiqueta="Código de 6 dígitos de la app autenticadora"
            id="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
          />
        )}
        {error && <Aviso>{error}</Aviso>}
        {nota && <p className="hint">{nota}</p>}
        <Boton type="submit" disabled={ocupado} icono="fa-right-to-bracket" style={{ width: '100%' }}>
          Ingresar
        </Boton>
      </form>
      {paso === 'clave' && !demo && (
        <Boton
          variante="secundario"
          onClick={recuperar}
          style={{ width: '100%', marginTop: 10, border: 0, background: 'none', boxShadow: 'none' }}
        >
          ¿Olvidaste tu contraseña?
        </Boton>
      )}
    </MarcoIngreso>
  );
}
