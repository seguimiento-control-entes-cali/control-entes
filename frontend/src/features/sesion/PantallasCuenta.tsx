// Pasos de la cuenta después de ingresar, iguales a la 2.x (src/js/08-vistas-catalogos-y-seguridad.js):
//  · DefinirClave: al llegar desde el correo de invitación o de recuperación (claveModal(true)).
//  · ActivarVerificacion: el Super administrador sin celular verificado debe activarla (mfaInscribir(true)).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorDatos, type InscripcionVerificacion } from '../../datos/contratos';
import { errorClaveNueva } from '../../dominio/seguridad';
import { Aviso, Boton, Campo, CampoClave } from '../../shared/ui';
import { MarcoIngreso } from './MarcoIngreso';
import { useDatos } from './contexto';

const mensaje = (e: unknown) =>
  e instanceof ErrorDatos ? e.message : 'No se pudo completar. Intente de nuevo.';

/**
 * Llegada desde el correo con el enlace protegido: el enlace SOLO se usa al oprimir «Continuar» (los filtros de
 * correo abren la página pero no oprimen botones, así el enlace no se gasta antes de que llegue la persona).
 */
export function ConfirmarEnlace({
  tipo,
  alConfirmar
}: {
  tipo: 'invite' | 'recovery';
  alConfirmar: () => Promise<void> | void;
}) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const continuar = async () => {
    setError('');
    setOcupado(true);
    try {
      await alConfirmar();
    } catch (err) {
      setError(mensaje(err));
      setOcupado(false);
    }
  };
  return (
    <MarcoIngreso
      titulo={tipo === 'invite' ? 'Bienvenido(a) a Control de Entes' : 'Cambiar su contraseña'}
      subtitulo={
        tipo === 'invite'
          ? 'Oprima «Continuar» para activar su cuenta y definir su contraseña.'
          : 'Oprima «Continuar» para definir una contraseña nueva.'
      }
    >
      <Boton className="ancho" onClick={() => void continuar()} disabled={ocupado} style={{ width: '100%' }}>
        {ocupado ? 'Verificando…' : 'Continuar'}
      </Boton>
      {error && (
        <div style={{ marginTop: 14 }}>
          <Aviso>{error}</Aviso>
        </div>
      )}
      <p className="hint" style={{ marginTop: 14 }}>
        Este enlace funciona una sola vez. Si ya lo usó o venció, pida uno nuevo.
      </p>
    </MarcoIngreso>
  );
}

export function DefinirClave({ alGuardar }: { alGuardar: () => void }) {
  const { auth } = useDatos();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const malo = errorClaveNueva(a, b);
    if (malo) return setError(malo);
    setError('');
    setOcupado(true);
    try {
      await auth.cambiarClave(a);
      alGuardar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <MarcoIngreso
      titulo="Defina su contraseña"
      subtitulo="Bienvenido(a). Defina la contraseña con la que ingresará de ahora en adelante."
    >
      <form onSubmit={guardar} noValidate>
        <CampoClave
          etiqueta="Contraseña nueva"
          id="clave-nueva"
          autoComplete="new-password"
          value={a}
          onChange={e => setA(e.target.value)}
        />
        <p className="hint" style={{ margin: '-8px 0 12px' }}>
          Mínimo 10 caracteres, con letras y números.
        </p>
        <CampoClave
          etiqueta="Repita la contraseña"
          id="clave-repetida"
          autoComplete="new-password"
          value={b}
          onChange={e => setB(e.target.value)}
        />
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" disabled={ocupado}>
          Guardar contraseña
        </Boton>
      </form>
    </MarcoIngreso>
  );
}

export function ActivarVerificacion({ alActivar, alSalir }: { alActivar: () => void; alSalir: () => void }) {
  const { auth } = useDatos();
  const [ins, setIns] = useState<InscripcionVerificacion | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Una sola activación aunque React monte dos veces en desarrollo (StrictMode): la promesa se guarda
  const inicio = useRef<Promise<InscripcionVerificacion> | null>(null);
  useEffect(() => {
    let vigente = true;
    inicio.current ??= auth.iniciarVerificacion();
    inicio.current.then(
      r => vigente && setIns(r),
      err => vigente && setError(mensaje(err))
    );
    return () => {
      vigente = false;
    };
  }, [auth]);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (!ins) return;
    setError('');
    setOcupado(true);
    try {
      await auth.confirmarVerificacion(ins.factorId, codigo);
      alActivar();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setOcupado(false);
    }
  }

  async function salir() {
    if (ins) await auth.cancelarVerificacion(ins.factorId);
    alSalir();
  }

  return (
    <MarcoIngreso
      titulo="Active la verificación en dos pasos"
      subtitulo="Por seguridad, la cuenta de Super administrador debe tener verificación en dos pasos. Toma un minuto."
    >
      <ol style={{ margin: '0 0 12px 18px', lineHeight: 1.6 }}>
        <li>
          Instale en su celular <b>Google Authenticator</b> o <b>Microsoft Authenticator</b> (gratis).
        </li>
        <li>En la app, agregue una cuenta y escanee este código:</li>
      </ol>
      {ins ? (
        <>
          <img
            className="qr"
            src={ins.qr}
            alt="Código QR para la app autenticadora"
            width={210}
            height={210}
          />
          <p className="hint">
            Si no puede escanear, escriba esta clave en la app: <code className="secreto">{ins.secreto}</code>
          </p>
        </>
      ) : (
        !error && <p className="cargando">Preparando el código…</p>
      )}
      <form onSubmit={confirmar} noValidate>
        <Campo
          etiqueta="3. Escriba el código de 6 dígitos que muestra la app"
          id="codigo-activar"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={codigo}
          onChange={e => setCodigo(e.target.value)}
        />
        {error && <Aviso>{error}</Aviso>}
        <Boton type="submit" disabled={ocupado || !ins}>
          Confirmar
        </Boton>
      </form>
      <Boton variante="secundario" type="button" onClick={salir}>
        Cerrar sesión
      </Boton>
    </MarcoIngreso>
  );
}
