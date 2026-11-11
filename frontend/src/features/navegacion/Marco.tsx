// Marco de la aplicación, con la MISMA estructura y clases de la 2.x (src/index.html, renderNav, renderTabbar y la
// barra superior de src/js/06-interfaz-base.js): menú lateral con escudo e íconos, barra superior con título,
// subtítulo, reloj y estado, aviso de demostración y barra inferior en el celular.
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { Perfil } from '../../datos/contratos';
import { ICONO, menuDe, pantallaInicial, pestanasDe, TITULO } from '../../dominio/menu';
import { NOMBRE_ROL } from '../../dominio/roles';
import { Icono, LimiteErrores, Tarjeta } from '../../shared/ui';
import { PantallaDirectorio } from '../directorio/PantallaDirectorio';
import { PantallaHistorico } from '../historico/PantallaHistorico';
import { PantallaCumplimiento } from '../cumplimiento/PantallaCumplimiento';
import { PantallaAuditoria } from '../auditoria/PantallaAuditoria';
import { PantallaActividad } from '../actividad/PantallaActividad';
import escudo from '../../../../src/assets/escudo.png';

function PantallaPendiente({ textos, inicial }: { textos: Map<string, string>; inicial: string }) {
  const { id = '' } = useParams();
  // Igual que la 2.x: una pantalla que el rol no tiene lleva a su pantalla inicial
  if (!textos.has(id)) return <Navigate to={'/' + inicial} replace />;
  return (
    <Tarjeta titulo={textos.get(id)} icono={ICONO[id]}>
      <p className="muted">
        Esta pantalla se construye en las próximas fases de la versión 3.0. Mientras tanto se usa en la
        versión 2.x.
      </p>
    </Tarjeta>
  );
}

/** Reloj de la barra superior (hudTick de la 2.x). */
function Reloj() {
  const texto = () => {
    const d = new Date();
    return (
      d.toLocaleDateString('es-CO', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '') +
      ' · ' +
      d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    );
  };
  const [t, setT] = useState(texto);
  useEffect(() => {
    const i = setInterval(() => setT(texto()), 1000);
    return () => clearInterval(i);
  }, []);
  return <span className="hud">{t}</span>;
}

/** Estado de la conexión (renderMode de la 2.x). */
function Modo({ demo }: { demo: boolean }) {
  const [enLinea, setEnLinea] = useState(() => globalThis.navigator?.onLine ?? true);
  useEffect(() => {
    const si = () => setEnLinea(true),
      no = () => setEnLinea(false);
    window.addEventListener('online', si);
    window.addEventListener('offline', no);
    return () => {
      window.removeEventListener('online', si);
      window.removeEventListener('offline', no);
    };
  }, []);
  const clase = !enLinea ? 'off' : demo ? 'demo' : 'live';
  return (
    <span className={'mode ' + clase}>
      <i className="dot" />
      <span>{!enLinea ? 'SIN CONEXIÓN' : demo ? 'MODO DEMO' : 'EN LÍNEA'}</span>
    </span>
  );
}

const leerContraido = () => {
  try {
    return globalThis.localStorage?.getItem('ce_collapsed') === '1';
  } catch {
    return false;
  }
};

export function Marco({
  perfil,
  alSalir,
  demo = false
}: {
  perfil: Perfil;
  alSalir: () => void;
  demo?: boolean;
}) {
  const grupos = menuDe(perfil.rol);
  const textos = new Map(grupos.flatMap(g => g.opciones.map(o => [o.id, o.texto] as const)));
  const pestanas = pestanasDe(perfil.rol);
  const [abierto, setAbierto] = useState(false);
  const [contraido, setContraido] = useState(leerContraido);
  const { pathname } = useLocation();
  const vista = pathname.replace(/^\//, '');
  const [titulo, subtitulo] = (textos.has(vista) && TITULO[vista]) || ['', ''];
  useEffect(() => setAbierto(false), [pathname]);

  const contraer = () => {
    const c = !contraido;
    setContraido(c);
    try {
      globalThis.localStorage?.setItem('ce_collapsed', c ? '1' : '0');
    } catch {
      // sin almacenamiento: solo dura esta sesión
    }
  };

  return (
    <>
      <div className={'app' + (abierto ? ' open' : '') + (contraido ? ' collapsed' : '')}>
        <aside className="sidebar">
          <div className="brand">
            <div className="shield">
              <img src={escudo} alt="Escudo de Santiago de Cali" />
            </div>
            <div className="brand-t">
              <b>Control de Entes</b>
              <small>Alcaldía de Santiago de Cali</small>
            </div>
            <button
              type="button"
              className="icon-btn"
              onClick={contraer}
              title={contraido ? 'Expandir menú' : 'Contraer menú'}
              aria-label={contraido ? 'Expandir menú' : 'Contraer menú'}
            >
              <Icono nombre={contraido ? 'fa-angles-right' : 'fa-angles-left'} />
            </button>
          </div>
          <nav className="nav" aria-label="Menú principal">
            {grupos.map(g => (
              <div key={g.grupo}>
                <div className="nav-group">{g.grupo}</div>
                {g.opciones.map(o => (
                  <NavLink
                    key={o.id}
                    to={`/${o.id}`}
                    className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}
                    title={o.texto}
                  >
                    <Icono nombre={ICONO[o.id] ?? 'fa-circle'} />
                    <span className="nav-label">{o.texto}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="user">
            <div className="avatar">
              <Icono nombre="fa-user" tipo="regular" />
            </div>
            <div className="user-t">
              <b>{perfil.correo}</b>
              <small>{NOMBRE_ROL[perfil.rol]}</small>
            </div>
            <button
              type="button"
              className="icon-btn logout"
              onClick={alSalir}
              title="Cerrar sesión"
              aria-label="Salir"
            >
              <Icono nombre="fa-right-from-bracket" />
            </button>
          </div>
        </aside>
        <div className="mobile-ov" onClick={() => setAbierto(false)} />

        <main className="main">
          <header className="topbar">
            <button
              type="button"
              className="icon-btn burger"
              aria-label="Abrir menú"
              onClick={() => setAbierto(true)}
            >
              <Icono nombre="fa-bars" />
            </button>
            <div className="tb-shield">
              <img src={escudo} alt="Escudo de Santiago de Cali" />
            </div>
            <div className="title">
              <h2>{titulo}</h2>
              <small>{subtitulo}</small>
            </div>
            <div className="spacer" />
            <Reloj />
            <Modo demo={demo} />
          </header>
          {demo && (
            <div className="banner">
              <b>Versión de demostración con datos de ejemplo.</b> Los nombres, cifras y radicados son
              ficticios y no corresponden a la realidad. En la versión institucional los datos reales viven en
              Supabase y cada usuario solo ve lo que le corresponde.
            </div>
          )}
          <section className="content">
            <LimiteErrores>
              <Routes>
                {textos.has('directorio') && (
                  <Route path="/directorio" element={<PantallaDirectorio perfil={perfil} />} />
                )}
                {textos.has('actividad') && <Route path="/actividad" element={<PantallaActividad />} />}
                {textos.has('auditoria') && <Route path="/auditoria" element={<PantallaAuditoria />} />}
                {textos.has('cumplimiento') && (
                  <Route path="/cumplimiento" element={<PantallaCumplimiento />} />
                )}
                {textos.has('historico') && (
                  <Route path="/historico" element={<PantallaHistorico perfil={perfil} />} />
                )}
                <Route
                  path="/:id"
                  element={<PantallaPendiente textos={textos} inicial={pantallaInicial(perfil.rol)} />}
                />
                <Route path="*" element={<Navigate to={`/${pantallaInicial(perfil.rol)}`} replace />} />
              </Routes>
            </LimiteErrores>
          </section>
        </main>
      </div>

      <nav className="tabbar" aria-label="Accesos rápidos">
        {pestanas.map(p => (
          <NavLink key={p.id} to={`/${p.id}`} className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}>
            <Icono nombre={ICONO[p.id] ?? 'fa-circle'} />
            <span>{p.texto}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={'tab' + (pestanas.some(p => p.id === vista) ? '' : ' on')}
          aria-label="Menú administrativo"
          onClick={() => setAbierto(true)}
        >
          <Icono nombre="fa-bars" />
          <span>Menú</span>
        </button>
      </nav>
    </>
  );
}
