// Ingreso con correo institucional, contraseña y, si la cuenta lo tiene, el código de la app autenticadora.
// Mismos pasos y mensajes que la 2.x. "¿Olvidaste tu contraseña?" vuelve a la dirección actual de la app.
import { useState, type FormEvent } from 'react';
import { ErrorDatos } from '../../datos/contratos';
import { Aviso, Boton, Campo } from '../../shared/ui';
import { MarcoIngreso } from './MarcoIngreso';
import { useDatos } from './contexto';

const mensaje = (e: unknown) =>
  e instanceof ErrorDatos ? e.message : 'No se pudo completar. Intente de nuevo.';

export function PantallaIngreso({ alIngresar }: { alIngresar: () => void }) {
  const { auth } = useDatos();
  const [paso, setPaso] = useState<'clave' | 'codigo'>('clave');
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNota('');
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
    <MarcoIngreso titulo="Control de Entes" subtitulo="Alcaldía de Santiago de Cali · Acceso institucional">
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
            <Campo
              etiqueta="Contraseña"
              id="clave"
              type="password"
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
      {paso === 'clave' && (
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
