// Cuentas y roles (2.x: vCuentas, titularModal, guardarTitular, invitarModal y guardarInvitacion de
// src/js/08-vistas-catalogos-y-seguridad.js, y las acciones cta* y saveProfile de 18-acciones.js). Solo el Super
// administrador la tiene en el menú; las cuentas se crean y activan con la función gestion-cuentas.
// Mismo HTML y clases (g-kpi, kpi, dir-list, dir-row, kv, tbl, pill).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  cuentaDe,
  estadoCuenta,
  MATRIZ_PERMISOS,
  otrasCuentas,
  titularCompleto,
  titularDe,
  validarInvitacion,
  validarTitular,
  type AccionCuenta,
  type Cuenta
} from '../../dominio/cuentas';
import { cargoPorNivel, nombreCorto, normalizarCelular, normalizarCorreo } from '../../dominio/directorio';
import { dependenciasDelHistorico } from '../../dominio/expediente';
import { NOMBRE_ROL, ROLES } from '../../dominio/roles';
import { Aviso, Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

const ETIQUETA_ROL: Readonly<Record<string, string>> = NOMBRE_ROL;

function useDatosCuentas() {
  const { cuentas, historico, catalogos, directorio } = useDatos();
  const lista = useQuery({ queryKey: ['cuentas'], queryFn: () => cuentas.lista() });
  const hist = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const resp = useQuery({ queryKey: ['directorio'], queryFn: () => directorio.responsables() });
  return { lista, hist, deps, resp };
}

function useRefrescar() {
  const cliente = useQueryClient();
  return () =>
    Promise.all(
      [['cuentas'], ['dependencias'], ['directorio'], ['auditoria'], ['actividad']].map(k =>
        cliente.invalidateQueries({ queryKey: k })
      )
    );
}

function VentanaTitular({ org, alCerrar }: { org: string; alCerrar: () => void }) {
  const { cuentas, directorio } = useDatos();
  const { lista, hist, deps, resp } = useDatosCuentas();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const nivel = hist.data?.filas.find(r => r.org === org)?.niv ?? '';
  const t = titularDe(org, resp.data ?? []);
  const p = cuentaDe(org, deps.data ?? [], lista.data ?? []);
  const [nombre, setNombre] = useState(t?.nombre && !/ejemplo/i.test(t.nombre) ? t.nombre : '');
  const [cargo, setCargo] = useState(t?.cargo || cargoPorNivel(nivel));
  const [correo, setCorreo] = useState(t?.correo ?? '');
  const tel0 = normalizarCelular(t?.telefono);
  const [telefono, setTelefono] = useState(tel0 ? tel0.slice(2) : (t?.telefono ?? ''));
  const [err, setErr] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    const e = validarTitular({ nombre, correo, telefono }, p?.id ?? null, lista.data ?? []);
    if (e) return setErr(e);
    setGuardando(true);
    try {
      const n = nombre.trim().replace(/\s+/g, ' '),
        mail = normalizarCorreo(correo);
      await directorio.guardar({
        organismo: t?.organismo ?? org,
        cargo: cargo.trim() || t?.cargo || cargoPorNivel(nivel),
        nombre: n,
        correo: mail,
        telefono: normalizarCelular(telefono) || t?.telefono || ''
      });
      const r = p
        ? await cuentas.gestionar('cambiar_correo', { id: p.id, correo: mail, nombre: n })
        : await cuentas.gestionar('invitar', {
            correo: mail,
            nombre: n,
            rol: 'secretario',
            dependencia: org
          });
      alCerrar();
      avisar(r.mensaje || 'Listo', 'ok');
      await refrescar();
    } catch (er) {
      setGuardando(false);
      setErr((er as Error).message);
    }
  };
  return (
    <Modal
      abierto
      titulo={'Cambiar titular · ' + nombreCorto(org)}
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={guardando} onClick={() => void guardar()}>
            <Icono nombre="fa-check" /> {p ? 'Cambiar titular' : 'Guardar y crear cuenta'}
          </button>
        </>
      }
    >
      <div className="sub" style={{ marginBottom: 12 }}>
        {p ? (
          <>
            La cuenta de acceso <b>{p.email}</b> pasará al correo nuevo. El titular anterior ya no podrá
            ingresar y el nuevo recibirá un enlace para definir su contraseña.
          </>
        ) : (
          'Se registrará el titular en el directorio y se creará su cuenta de acceso.'
        )}
      </div>
      <div className="field">
        <label htmlFor="tiNombre">Nombre completo</label>
        <input
          id="tiNombre"
          placeholder="Nombres y apellidos"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tiCargo">Cargo</label>
        <input id="tiCargo" value={cargo} onChange={e => setCargo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tiCorreo">Correo institucional</label>
        <input
          id="tiCorreo"
          type="email"
          placeholder="nombre.apellido@cali.gov.co"
          value={correo}
          onChange={e => setCorreo(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="tiTel">Celular (WhatsApp)</label>
        <input
          id="tiTel"
          className="mono"
          inputMode="tel"
          placeholder="3001234567"
          value={telefono}
          onChange={e => setTelefono(e.target.value)}
        />
        <div className="hint">Opcional, pero necesario para notificar por WhatsApp.</div>
      </div>
      {err && (
        <div className="hint err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  );
}

function VentanaInvitar({ orgs, alCerrar }: { orgs: string[]; alCerrar: () => void }) {
  const { cuentas } = useDatos();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [rol, setRol] = useState<string>(ROLES.filter(r => r !== 'secretario')[0] ?? 'admin');
  const [dep, setDep] = useState('');
  const [err, setErr] = useState('');
  const guardar = async () => {
    const e = validarInvitacion({ nombre, correo, rol, dependencia: dep });
    if (e) return setErr(e);
    try {
      const r = await cuentas.gestionar('invitar', {
        correo: normalizarCorreo(correo),
        nombre: nombre.trim(),
        rol,
        dependencia: rol === 'enlace' ? dep : ''
      });
      alCerrar();
      avisar(r.mensaje, 'ok');
      await refrescar();
    } catch (er) {
      setErr((er as Error).message);
    }
  };
  return (
    <Modal
      abierto
      titulo="Invitar usuario"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={() => void guardar()}>
            <Icono nombre="fa-envelope" /> Enviar invitación
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="inNombre">Nombre completo</label>
        <input
          id="inNombre"
          placeholder="Nombres y apellidos"
          value={nombre}
          onChange={e => setNombre(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="inCorreo">Correo institucional</label>
        <input
          id="inCorreo"
          type="email"
          placeholder="nombre.apellido@cali.gov.co"
          value={correo}
          onChange={e => setCorreo(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="inRol">Rol</label>
        <select id="inRol" value={rol} onChange={e => setRol(e.target.value)}>
          {ROLES.filter(r => r !== 'secretario').map(r => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="inDep">Dependencia (solo para enlace operativo)</label>
        <select id="inDep" value={dep} onChange={e => setDep(e.target.value)}>
          <option value="">—</option>
          {orgs.map(o => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
      {err && (
        <div className="hint err" role="alert">
          {err}
        </div>
      )}
    </Modal>
  );
}

function FilaOtra({ p, deps }: { p: Cuenta; deps: readonly { id: number; nombre: string }[] }) {
  const { cuentas } = useDatos();
  const avisar = useAvisos();
  const [rol, setRol] = useState(p.rol);
  const [dep, setDep] = useState(p.dependencia_id == null ? '' : String(p.dependencia_id));
  const [activo, setActivo] = useState(p.activo ? 'true' : 'false');
  const guardar = async () => {
    try {
      await cuentas.guardar({ id: p.id, rol, dependencia_id: dep ? +dep : null, activo: activo === 'true' });
      avisar('Cuenta actualizada', 'ok');
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  return (
    <tr>
      <td>
        {p.email}
        <div className="muted" style={{ fontSize: '.72rem' }}>
          {p.nombre}
        </div>
      </td>
      <td>
        <select aria-label={'Rol de ' + p.email} value={rol} onChange={e => setRol(e.target.value)}>
          {ROLES.map(r => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select aria-label={'Dependencia de ' + p.email} value={dep} onChange={e => setDep(e.target.value)}>
          <option value="">— Todas / ninguna —</option>
          {deps.map(d => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select aria-label={'Activo ' + p.email} value={activo} onChange={e => setActivo(e.target.value)}>
          <option value="true">Sí</option>
          <option value="false">No</option>
        </select>
      </td>
      <td className="right">
        <button type="button" className="btn sm primary" onClick={() => void guardar()}>
          Guardar
        </button>
      </td>
    </tr>
  );
}

export function PantallaCuentas() {
  const { cuentas } = useDatos();
  const { lista, hist, deps, resp } = useDatosCuentas();
  const refrescar = useRefrescar();
  const avisar = useAvisos();
  const [titular, setTitular] = useState<string | null>(null);
  const [invitar, setInvitar] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (lista.isPending || hist.isPending || deps.isPending || resp.isPending)
    return (
      <div className="empty">
        <Icono nombre="fa-spinner fa-spin" />
        Cargando cuentas…
      </div>
    );
  if (lista.isError)
    return <Aviso>No se pudieron cargar las cuentas: {(lista.error as Error).message}</Aviso>;

  const cs = lista.data,
    ds = deps.data ?? [],
    rs = resp.data ?? [];
  const orgs = dependenciasDelHistorico(hist.data?.filas ?? []);
  const est = orgs.map(o => [o, estadoCuenta(o, ds, cs, rs)] as const);
  const n = (k: string) => est.filter(([, e]) => e[0] === k).length;
  const pendientes = est.filter(([, e]) => e[0] === 'sin').map(([o]) => o);
  const otras = otrasCuentas(cs, orgs, ds);

  const accion = async (
    clave: string,
    a: AccionCuenta,
    datos: Record<string, unknown>,
    confirmar?: string
  ) => {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(clave);
    try {
      const r = await cuentas.gestionar(a, datos);
      avisar(r.mensaje, 'ok');
      await refrescar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
    setOcupado(null);
  };
  const conTitular = (org: string, hacer: () => void) =>
    titularCompleto(titularDe(org, rs)) ? hacer() : setTitular(org);
  const prepararTodas = async () => {
    if (
      !pendientes.length ||
      !window.confirm(
        `Se prepararán ${pendientes.length} cuenta(s) con el correo institucional de cada titular. Quedarán bloqueadas y NO se enviará ningún correo hasta que usted las active. ¿Continuar?`
      )
    )
      return;
    setOcupado('todas');
    let ok = 0;
    const fallas: string[] = [];
    for (const o of pendientes) {
      const x = titularDe(o, rs);
      try {
        await cuentas.gestionar('preparar', {
          correo: normalizarCorreo(x?.correo),
          nombre: x?.nombre ?? '',
          rol: 'secretario',
          dependencia: o
        });
        ok++;
      } catch (e) {
        fallas.push(nombreCorto(o) + ': ' + (e as Error).message);
      }
    }
    await refrescar();
    setOcupado(null);
    avisar(
      `${ok} cuenta(s) preparada(s), sin activar y sin enviar correos` +
        (fallas.length ? `. No se pudo en ${fallas.length}: ${fallas.slice(0, 2).join(' · ')}` : ''),
      fallas.length ? 'error' : 'ok'
    );
  };

  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <div className="card kpi g">
          <small>Dependencias con cuenta activa</small>
          <b>
            {n('activa')}
            <span className="kpi-of"> / {orgs.length}</span>
          </b>
        </div>
        <div className="card kpi r">
          <small>Sin cuenta</small>
          <b>{n('sin')}</b>
        </div>
        <div className="card kpi y">
          <small>Correo distinto al directorio</small>
          <b>{n('distinto')}</b>
        </div>
        <div className="card kpi">
          <small>Preparadas sin activar o sin datos</small>
          <b>{n('incompleto') + n('inactiva')}</b>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3>Cuentas por dependencia</h3>
            <div className="sub">
              Cada dependencia ingresa con el correo institucional de su secretario o director y solo ve sus
              requerimientos. Las cuentas se pueden <b>preparar</b> sin enviar ningún correo: quedan creadas y
              bloqueadas. Al <b>activarlas</b>, el titular recibe el enlace para definir su propia contraseña.
            </div>
          </div>
          {pendientes.length > 0 && (
            <button
              type="button"
              className="btn primary"
              disabled={ocupado === 'todas'}
              onClick={() => void prepararTodas()}
            >
              <Icono nombre="fa-user-lock" /> Preparar cuentas sin activar ({pendientes.length})
            </button>
          )}
        </div>
        <div className="dir-list">
          {est.map(([o, e]) => {
            const p = cuentaDe(o, ds, cs),
              t = titularDe(o, rs);
            return (
              <div key={o} className="dir-row card">
                <div className="dir-h">
                  <div>
                    <b className="dir-org">{o}</b>
                    <span className={'pill ' + e[1]}>
                      <i />
                      {e[2]}
                    </span>
                  </div>
                </div>
                <dl className="kv" style={{ marginTop: 10 }}>
                  <div>
                    <dt>Titular</dt>
                    <dd>
                      {t?.nombre ? (
                        <>
                          {t.nombre}
                          <div className="muted" style={{ fontSize: '.74rem' }}>
                            {t.cargo || ''}
                          </div>
                        </>
                      ) : (
                        <span className="muted">Sin registrar</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Correo del directorio</dt>
                    <dd>{t?.correo ? t.correo : <span className="muted">—</span>}</dd>
                  </div>
                  <div>
                    <dt>Cuenta de acceso</dt>
                    <dd>{p ? p.email : <span className="muted">—</span>}</dd>
                  </div>
                </dl>
                <div className="dir-a" style={{ marginTop: 10 }}>
                  {!p && e[0] === 'sin' && (
                    <>
                      <button
                        type="button"
                        className="btn sm primary"
                        disabled={ocupado === o}
                        onClick={() =>
                          conTitular(
                            o,
                            () =>
                              void accion(o, 'preparar', {
                                correo: normalizarCorreo(t?.correo),
                                nombre: t?.nombre ?? '',
                                rol: 'secretario',
                                dependencia: o
                              })
                          )
                        }
                      >
                        <Icono nombre="fa-user-lock" /> Preparar cuenta
                      </button>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={ocupado === o}
                        onClick={() =>
                          conTitular(
                            o,
                            () =>
                              void accion(o, 'invitar', {
                                correo: normalizarCorreo(t?.correo),
                                nombre: t?.nombre ?? '',
                                rol: 'secretario',
                                dependencia: o
                              })
                          )
                        }
                      >
                        <Icono nombre="fa-user-plus" /> Crear e invitar ya
                      </button>
                    </>
                  )}
                  {p && !p.activo && (
                    <button
                      type="button"
                      className="btn sm primary"
                      disabled={ocupado === o}
                      onClick={() =>
                        void accion(
                          o,
                          'activar_invitar',
                          { id: p.id },
                          `Se activará la cuenta y se enviará a ${p.email} el enlace para definir su contraseña. ¿Continuar?`
                        )
                      }
                    >
                      <Icono nombre="fa-paper-plane" /> Activar e invitar
                    </button>
                  )}
                  <button type="button" className="btn sm" onClick={() => setTitular(o)}>
                    <Icono nombre="fa-user-pen" /> Cambiar titular
                  </button>
                  {p?.activo && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => void accion(o, 'enlace_clave', { correo: p.email })}
                    >
                      <Icono nombre="fa-key" /> Reenviar enlace de contraseña
                    </button>
                  )}
                  {p?.activo && (
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() =>
                        void accion(
                          o,
                          'desactivar',
                          { id: p.id },
                          'La persona ya no podrá ingresar. ¿Desactivar la cuenta?'
                        )
                      }
                    >
                      Desactivar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h3>Otras cuentas</h3>
            <div className="sub">Super administrador, Alcalde, Control Interno y enlaces operativos.</div>
          </div>
          <button type="button" className="btn" onClick={() => setInvitar(true)}>
            <Icono nombre="fa-envelope" /> Invitar usuario
          </button>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <caption className="solo-lector">Otras cuentas</caption>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Rol</th>
                <th>Dependencia</th>
                <th>Activo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {otras.length ? (
                otras.map(p => <FilaOtra key={p.id + p.rol + String(p.activo)} p={p} deps={ds} />)
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">No hay otras cuentas</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Matriz de permisos por rol</h3>
        <div className="sub">Se aplica en la base de datos (RLS), no solo en la interfaz.</div>
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 640 }}>
            <caption className="solo-lector">Matriz de permisos por rol</caption>
            <thead>
              <tr>
                <th>Rol</th>
                <th>Ve</th>
                <th>Crea</th>
                <th>Cierra con ORFEO</th>
                <th>Escala</th>
                <th>Auditoría</th>
              </tr>
            </thead>
            <tbody>
              {MATRIZ_PERMISOS.map(f => (
                <tr key={f[0]}>
                  {f.map((c, i) => (
                    <td key={i}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {titular && <VentanaTitular org={titular} alCerrar={() => setTitular(null)} />}
      {invitar && <VentanaInvitar orgs={orgs} alCerrar={() => setInvitar(false)} />}
    </>
  );
}
