// «Mi cuenta y seguridad» (botón de la llave junto a «Cerrar sesión»). Igual a la 2.x (src/js/08: miCuentaModal,
// claveModal(false), mfaInscribir, mfaConfirmar, mfaCancelar y mfaQuitar): cambiar la contraseña propia y administrar la
// verificación en dos pasos (obligatoria para el Super administrador, recomendada para Alcalde y Control Interno).
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorDatos, type InscripcionVerificacion, type Perfil } from '../../datos/contratos';
import { formatoCorto } from '../../dominio/fechas';
import { NOMBRE_ROL } from '../../dominio/roles';
import { errorClaveNueva } from '../../dominio/seguridad';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from './contexto';

const mensaje = (e: unknown) =>
  e instanceof ErrorDatos ? e.message : 'No se pudo completar. Intente de nuevo.';
type Celular = { id: string; nombre: string; desde: string };
type Paso = 'inicio' | 'clave' | 'activar';

export function VentanaMiCuenta({
  perfil,
  demo,
  alCerrar
}: {
  perfil: Perfil;
  demo: boolean;
  alCerrar: () => void;
}) {
  const { auth } = useDatos();
  const avisar = useAvisos();
  const obligatoria = perfil.rol === 'admin';
  const [paso, setPaso] = useState<Paso>('inicio');
  const [celulares, setCelulares] = useState<Celular[] | null>(null);
  const [errorMfa, setErrorMfa] = useState('');
  const cargar = () => {
    if (demo) return;
    auth.celularesVerificados().then(setCelulares, e => setErrorMfa(mensaje(e)));
  };
  useEffect(cargar, [auth, demo]);

  // Cambiar la contraseña
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [errClave, setErrClave] = useState('');
  const guardarClave = async (e: FormEvent) => {
    e.preventDefault();
    const malo = errorClaveNueva(a, b);
    if (malo) return setErrClave(malo);
    if (demo) {
      alCerrar();
      return avisar('Contraseña actualizada (simulado en modo demostración)', 'ok');
    }
    try {
      await auth.cambiarClave(a);
      alCerrar();
      avisar('Contraseña actualizada', 'ok');
    } catch (err) {
      setErrClave('No se pudo guardar: ' + mensaje(err));
    }
  };

  // Activar un celular
  const [ins, setIns] = useState<InscripcionVerificacion | null>(null);
  const [codigo, setCodigo] = useState('');
  const [errAct, setErrAct] = useState('');
  const activar = async () => {
    if (demo) return avisar('No disponible en modo demostración', 'error');
    setPaso('activar');
    setErrAct('');
    try {
      setIns(await auth.iniciarVerificacion());
    } catch (e) {
      setErrAct('No se pudo iniciar la verificación en dos pasos: ' + mensaje(e));
    }
  };
  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    if (!ins) return;
    const c = codigo.replace(/\D/g, '');
    if (c.length !== 6) return setErrAct('Escriba los 6 dígitos que muestra la app.');
    try {
      await auth.confirmarVerificacion(ins.factorId, c);
      avisar('Verificación en dos pasos activada. Desde ahora se pedirá el código al ingresar.', 'ok');
      setIns(null);
      setCodigo('');
      setPaso('inicio');
      cargar();
    } catch {
      setErrAct('El código no es correcto o ya cambió. Escriba el código actual de la app.');
    }
  };
  const cancelarActivacion = async () => {
    if (ins) await auth.cancelarVerificacion(ins.factorId);
    setIns(null);
    setPaso('inicio');
  };
  const quitar = async (c: Celular) => {
    if (obligatoria && (celulares?.length ?? 0) <= 1)
      return avisar('Es obligatoria para el Super administrador: agregue primero otro celular.', 'error');
    if (!window.confirm('¿Quitar este celular de la verificación en dos pasos?')) return;
    try {
      await auth.quitarCelular(c.id);
      avisar('Celular quitado de la verificación en dos pasos', 'ok');
      cargar();
    } catch (e) {
      avisar(
        'No se pudo quitar: ' + mensaje(e) + '. Ingrese de nuevo con el código e inténtelo otra vez.',
        'error'
      );
    }
  };

  const pieInicio = (
    <button type="button" className="btn" onClick={alCerrar}>
      Cerrar
    </button>
  );
  if (paso === 'clave')
    return (
      <Modal
        abierto
        titulo="Cambiar mi contraseña"
        alCerrar={alCerrar}
        pie={
          <>
            <button type="button" className="btn" onClick={() => setPaso('inicio')}>
              Cancelar
            </button>
            <button type="submit" form="formMiClave" className="btn primary">
              <Icono nombre="fa-key" /> Guardar contraseña
            </button>
          </>
        }
      >
        <form id="formMiClave" onSubmit={e => void guardarClave(e)} noValidate>
          <div className="field">
            <label htmlFor="ckA">Contraseña nueva</label>
            <input
              id="ckA"
              type="password"
              autoComplete="new-password"
              value={a}
              onChange={e => setA(e.target.value)}
            />
            <div className="hint">Mínimo 10 caracteres, con letras y números.</div>
          </div>
          <div className="field">
            <label htmlFor="ckB">Repite la contraseña</label>
            <input
              id="ckB"
              type="password"
              autoComplete="new-password"
              value={b}
              onChange={e => setB(e.target.value)}
            />
          </div>
          {errClave && <div className="hint err">{errClave}</div>}
        </form>
      </Modal>
    );
  if (paso === 'activar')
    return (
      <Modal
        abierto
        titulo="Activar verificación en dos pasos"
        alCerrar={() => void cancelarActivacion()}
        pie={
          <>
            <button type="button" className="btn" onClick={() => void cancelarActivacion()}>
              Cancelar
            </button>
            <button type="submit" form="formMiMfa" className="btn primary" disabled={!ins}>
              <Icono nombre="fa-check" /> Confirmar
            </button>
          </>
        }
      >
        <ol style={{ margin: '0 0 12px 18px', lineHeight: 1.6 }}>
          <li>
            Instale en su celular <b>Google Authenticator</b> o <b>Microsoft Authenticator</b> (gratis).
          </li>
          <li>En la app, agregue una cuenta y escanee este código:</li>
        </ol>
        {ins ? (
          <>
            <div style={{ textAlign: 'center', margin: '10px 0' }}>
              <img
                src={ins.qr}
                alt="Código QR para la app autenticadora"
                style={{ width: 210, height: 210, background: '#fff', padding: 8, borderRadius: 10 }}
              />
            </div>
            <div className="hint" style={{ textAlign: 'center' }}>
              Si no puede escanear, escriba esta clave en la app:{' '}
              <span className="mono" style={{ userSelect: 'all' }}>
                {ins.secreto}
              </span>
            </div>
          </>
        ) : (
          !errAct && <p className="cargando">Preparando el código…</p>
        )}
        <form id="formMiMfa" onSubmit={e => void confirmar(e)} noValidate>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="mfaCod">3. Escriba el código de 6 dígitos que muestra la app</label>
            <input
              id="mfaCod"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="mono"
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              style={{ fontSize: '1.4rem', letterSpacing: '.3em', textAlign: 'center' }}
            />
          </div>
          {errAct && <div className="hint err">{errAct}</div>}
        </form>
      </Modal>
    );

  const activos = celulares ?? [];
  return (
    <Modal abierto titulo="Mi cuenta y seguridad" alCerrar={alCerrar} pie={pieInicio}>
      <div className="field">
        <label>Cuenta</label>
        <div>
          {perfil.correo}
          <div className="muted" style={{ fontSize: '.8rem' }}>
            {NOMBRE_ROL[perfil.rol]}
          </div>
        </div>
      </div>
      <div className="field">
        <label>Contraseña</label>
        <button type="button" className="btn sm" onClick={() => setPaso('clave')}>
          <Icono nombre="fa-key" /> Cambiar mi contraseña
        </button>
      </div>
      <div className="field">
        <label>Verificación en dos pasos</label>
        {demo ? (
          <div className="muted">No disponible en modo demostración.</div>
        ) : errorMfa ? (
          <div className="muted">No se pudo consultar: {errorMfa}</div>
        ) : celulares === null ? (
          <div className="muted">Consultando…</div>
        ) : activos.length ? (
          <div>
            <span className="pill verde">Activa</span>{' '}
            <span className="muted" style={{ fontSize: '.8rem' }}>
              desde el {formatoCorto(activos[0]?.desde)}
            </span>
          </div>
        ) : (
          <div>
            <span className={'pill ' + (obligatoria ? 'rojo' : 'amarillo')}>No activa</span>
          </div>
        )}
        <div className="hint" style={{ marginTop: 6 }}>
          Además de la contraseña, al ingresar se pide un código de 6 dígitos que genera una app en su celular
          (Google Authenticator o Microsoft Authenticator). Así, una contraseña robada no basta para entrar.
        </div>
        {!demo && celulares !== null && !activos.length && (
          <button
            type="button"
            className="btn primary sm"
            style={{ marginTop: 10 }}
            onClick={() => void activar()}
          >
            <Icono nombre="fa-shield-halved" /> Activar verificación en dos pasos
          </button>
        )}
        {!demo && activos.length > 0 && obligatoria && (
          <>
            <div className="hint">
              Es obligatoria para el Super administrador. Si cambió de celular, actívela de nuevo en el
              celular nuevo y luego quite la anterior.
            </div>
            <button type="button" className="btn sm" style={{ marginTop: 8 }} onClick={() => void activar()}>
              <Icono nombre="fa-mobile-screen" /> Agregar otro celular
            </button>
          </>
        )}
        {!demo &&
          (activos.length > 1 || (!obligatoria && activos.length > 0)) &&
          activos.map(c => (
            <button
              type="button"
              key={c.id}
              className="btn sm"
              style={{ margin: '8px 0 0 8px' }}
              onClick={() => void quitar(c)}
            >
              Quitar {c.nombre || 'dispositivo'}
            </button>
          ))}
      </div>
    </Modal>
  );
}
