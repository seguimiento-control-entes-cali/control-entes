// Cargar respuesta ORFEO (2.x: vCarga de src/js/07-vistas-operacion.js y closeReq de 04-capa-de-datos.js). El caso
// puede llegar ya elegido desde Requerimientos ("Cerrar" o "Registrar respuesta"). Mismo HTML y clases (card, field,
// hint, err, row2).
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto } from '../../dominio/historico';
import { coincideCaso, orfeoRepetido, validarCarga } from '../../dominio/requerimientos';
import { Aviso, Icono, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import { useRequerimientosVivos } from './comun';

export function PantallaCarga() {
  const { requerimientos } = useDatos();
  const { vigencia, vivos, cargando, error } = useRequerimientosVivos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const ir = useNavigate();
  const llegada = (useLocation().state as { id?: string } | null)?.id ?? null;
  const abiertos = useMemo(
    () => vivos.filter(r => r.estado === 'abierto').sort((a, b) => a.dias - b.dias),
    [vivos]
  );
  const hoy = fechaColombia(new Date());
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<string | null>(llegada);
  const [orfeo, setOrfeo] = useState('');
  const [fecha, setFecha] = useState(hoy);
  const [err, setErr] = useState('');
  const [guardando, setGuardando] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);

  if (cargando) return <p className="cargando">Cargando los requerimientos…</p>;
  if (error) return <Aviso>No se pudieron cargar los requerimientos: {error.message}</Aviso>;
  if (!abiertos.length)
    return (
      <div className="card">
        <div className="empty">
          <Icono nombre="fa-champagne-glasses" />
          No hay requerimientos abiertos en la vigencia {vigencia}
        </div>
      </div>
    );

  const visibles = abiertos.filter(r => coincideCaso(r, busqueda));
  // Si el elegido queda oculto por la búsqueda, se toma el primero visible (igual que la 2.x)
  const actual =
    visibles.find(r => r.id === elegido) ??
    (busqueda ? visibles[0] : abiertos.find(r => r.id === elegido)) ??
    abiertos[0];
  const errOrfeo =
    orfeo && orfeoRepetido(orfeo, vivos) ? 'Este ORFEO ya está asociado a otro requerimiento' : '';

  const guardar = async () => {
    setErr('');
    const r = actual;
    if (!r) return;
    const f = archivo.current?.files?.[0] ?? null;
    const cabecera = f ? String.fromCharCode(...new Uint8Array(await f.slice(0, 5).arrayBuffer())) : '';
    const e = validarCarga(
      { orfeo, fecha, archivo: f ? { nombre: f.name, tipo: f.type, tamano: f.size, cabecera } : null },
      r,
      fechaColombia(new Date()),
      vivos,
      formatoCorto
    );
    if (e || !f) return setErr(e ?? 'Adjunta el soporte en PDF');
    setGuardando(true);
    try {
      const res = await requerimientos.cerrar(r, orfeo, fecha, f);
      avisar(`${r.radicado} cerrado · huella ${res.hash.slice(0, 10)}…`, 'ok');
      // El cierre también actualiza el cumplimiento del histórico (cierres hechos en la app)
      await cliente.invalidateQueries({ queryKey: ['requerimientos'] });
      void cliente.invalidateQueries({ queryKey: ['historico'] });
      ir('/requerimientos');
    } catch (er) {
      setErr((er as Error).message);
      setGuardando(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h3>Registrar respuesta ORFEO</h3>
      <div className="sub">
        Vigencia{' '}
        <b className="mono" style={{ color: 'var(--glow)' }}>
          {vigencia}
        </b>{' '}
        · el cierre queda firmado en la pista de auditoría
      </div>
      <form
        id="cargaForm"
        noValidate
        onSubmit={e => {
          e.preventDefault();
          void guardar();
        }}
      >
        <div className="field">
          <label htmlFor="cBus">Buscar caso</label>
          <input
            id="cBus"
            placeholder="Radicado, ente, dependencia o asunto"
            autoComplete="off"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
          <div className="hint" id="cBusN">
            {busqueda
              ? `${visibles.length} de ${abiertos.length} caso(s)`
              : `${abiertos.length} caso(s) abiertos en la vigencia ${vigencia}`}
          </div>
        </div>
        <div className="field">
          <label htmlFor="cSel">Requerimiento pendiente</label>
          <select id="cSel" value={actual?.id ?? ''} onChange={e => setElegido(e.target.value)}>
            {(busqueda ? visibles : abiertos).map(r => (
              <option key={r.id} value={r.id}>
                {r.radicado} · {r.ente_s || r.ente_n} · {r.dep_n} (
                {r.sem === 'rojo' ? 'crítico' : 'en término'})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cOrfeo">Radicado ORFEO de salida</label>
          <input
            id="cOrfeo"
            className="mono"
            inputMode="numeric"
            placeholder="202641430100000171"
            maxLength={20}
            value={orfeo}
            onChange={e => setOrfeo(e.target.value.replace(/\D/g, ''))}
          />
          <div className="hint">Solo dígitos (10 a 20). Se valida contra duplicados.</div>
          {errOrfeo && <div className="err">{errOrfeo}</div>}
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="cFecha">Fecha de envío oficial</label>
            <input id="cFecha" type="date" max={hoy} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cFile">Soporte PDF</label>
            <input id="cFile" ref={archivo} type="file" accept="application/pdf,.pdf" />
            <div className="hint">Máx. 10 MB · se calcula su huella SHA-256</div>
          </div>
        </div>
        {err && (
          <div className="err" id="cErr" role="alert" style={{ marginBottom: 12 }}>
            {err}
          </div>
        )}
        <button className="btn primary" id="cBtn" type="submit" disabled={guardando}>
          {guardando ? (
            <>
              <Icono nombre="fa-spinner fa-spin" /> Guardando…
            </>
          ) : (
            <>
              <Icono nombre="fa-check-circle" /> Guardar y marcar en verde
            </>
          )}
        </button>
      </form>
    </div>
  );
}
