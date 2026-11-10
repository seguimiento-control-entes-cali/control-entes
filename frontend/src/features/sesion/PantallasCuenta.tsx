// Pasos de la cuenta después de ingresar, iguales a la 2.x (src/js/08-vistas-catalogos-y-seguridad.js):
//  · DefinirClave: al llegar desde el correo de invitación o de recuperación (claveModal(true)).
//  · ActivarVerificacion: el Super administrador sin celular verificado debe activarla (mfaInscribir(true)).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ErrorDatos, type InscripcionVerificacion } from '../../datos/contratos';
import { errorClaveNueva } from '../../dominio/seguridad';
import { Aviso, Boton, Campo, Tarjeta } from '../../shared/ui';
import { useDatos } from './contexto';

const mensaje = (e: unknown) =>
  e instanceof ErrorDatos ? e.message : 'No se pudo completar. Intente de nuevo.';

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
    <main className="ingreso">
      <Tarjeta titulo="Defina su contraseña">
        <p className="sub">Bienvenido(a). Defina la contraseña con la que ingresará de ahora en adelante.</p>
        <form onSubmit={guardar} noValidate>
          <Campo
            etiqueta="Contraseña nueva"
            id="clave-nueva"
            type="password"
            autoComplete="new-password"
            value={a}
            onChange={e => setA(e.target.value)}
          />
          <p className="nota">Mínimo 10 caracteres, con letras y números.</p>
          <Campo
            etiqueta="Repita la contraseña"
            id="clave-repetida"
            type="password"
            autoComplete="new-password"
            value={b}
            onChange={e => setB(e.target.value)}
          />
          {error && <Aviso>{error}</Aviso>}
          <Boton type="submit" disabled={ocupado}>
            Guardar contraseña
          </Boton>
        </form>
      </Tarjeta>
    </main>
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
    <main className="ingreso">
      <Tarjeta titulo="Active la verificación en dos pasos">
        <p className="sub">
          Por seguridad, la cuenta de Super administrador debe tener verificación en dos pasos. Toma un
          minuto.
        </p>
        <ol className="pasos">
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
            <p className="nota">
              Si no puede escanear, escriba esta clave en la app:{' '}
              <code className="secreto">{ins.secreto}</code>
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
      </Tarjeta>
    </main>
  );
}
