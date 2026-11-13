// Alertas y escalamiento (2.x: vAlertas y waLink de src/js/07-vistas-operacion.js, y las acciones escalate,
// escalateAll y log de 18-acciones.js). Cada envío por WhatsApp o correo queda como escalamiento (si el rol puede
// escalar). Mismo HTML y clases (card, alert-card, pill, btn).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Perfil } from '../../datos/contratos';
import { formatoFechaHora } from '../../dominio/auditoria';
import { claveOrganismo, normalizarCelular } from '../../dominio/directorio';
import { formatoCorto } from '../../dominio/historico';
import { alertas, enlaceDisciplinario, mensajeAlerta, textoDias } from '../../dominio/requerimientos';
import { Aviso, Icono, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import { PUEDE_ESCALAR, useRequerimientosVivos } from './comun';

export function PantallaAlertas({ perfil }: { perfil: Perfil }) {
  const { requerimientos, directorio } = useDatos();
  const { vigencia, vivos, deps, correoDisciplinario, cargando, error } = useRequerimientosVivos();
  const resp = useQuery({ queryKey: ['directorio'], queryFn: () => directorio.responsables() });
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  const escala = PUEDE_ESCALAR.includes(perfil.rol);

  if (cargando) return <p className="cargando">Cargando las alertas…</p>;
  if (error) return <Aviso>No se pudieron cargar los requerimientos: {error.message}</Aviso>;
  const { rojos, vencidos, pendientes } = alertas(vivos);
  if (!rojos.length)
    return (
      <div className="card">
        <div className="empty">
          <Icono nombre="fa-champagne-glasses" />
          Sin alertas críticas en la vigencia {vigencia}
        </div>
      </div>
    );

  const recargar = () => cliente.invalidateQueries({ queryKey: ['requerimientos'] });
  /** Escalamiento silencioso al abrir WhatsApp o correo (acción log de la 2.x: si falla, no se avisa). */
  const anotar = (id: string, canal: string) => {
    if (escala)
      requerimientos
        .escalar(id, canal)
        .then(recargar)
        .catch(() => {});
  };
  const registrar = async (id: string) => {
    try {
      await requerimientos.escalar(id, 'registro');
      avisar('Escalamiento registrado', 'ok');
      await recargar();
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  const registrarTodos = async () => {
    setOcupado(true);
    let n = 0;
    for (const r of pendientes) {
      try {
        await requerimientos.escalar(r.id, 'registro');
        n++;
      } catch (e) {
        avisar((e as Error).message, 'error');
        break;
      }
    }
    if (n) avisar(n + ' escalamiento(s) registrado(s)', 'ok');
    await recargar();
    setOcupado(false);
  };
  const celularDe = (dep: string) => {
    const ct = (resp.data ?? []).find(x => claveOrganismo(x.organismo) === claveOrganismo(dep));
    return normalizarCelular(ct?.telefono);
  };

  return (
    <>
      <div
        className="card"
        style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <h3>
            {rojos.length} requerimiento(s) crítico(s)
            {vencidos.length > 0 && (
              <>
                {' · '}
                <span style={{ color: 'var(--redink)' }}>{vencidos.length} vencido(s)</span>
              </>
            )}
          </h3>
          <div className="sub" style={{ margin: '4px 0 0' }}>
            Cada envío por WhatsApp o correo abre tu aplicación con el mensaje redactado; luego registra el
            escalamiento para dejar trazabilidad.
          </div>
        </div>
        {escala && pendientes.length > 0 && (
          <button
            type="button"
            className="btn danger"
            disabled={ocupado}
            onClick={() => void registrarTodos()}
          >
            <Icono nombre="fa-paper-plane" /> Registrar escalamiento de {pendientes.length}
          </button>
        )}
      </div>
      {rojos.map(r => {
        const l = mensajeAlerta(
          r,
          celularDe(r.dep_n),
          deps.find(d => d.id === r.dependencia_id)?.correo ?? '',
          formatoCorto
        );
        return (
          <div key={r.id} className={'alert-card' + (r.venc ? ' venc' : '')}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 6
              }}
            >
              <b>{r.dep_n}</b>
              <span className="mono muted" style={{ fontSize: '.76rem' }}>
                {r.radicado} · {r.ente_s || r.ente_n}
              </span>
            </div>
            <div className="muted" style={{ fontSize: '.84rem', marginBottom: 10 }}>
              {r.asunto}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="pill rojo">
                <i />
                {r.venc ? 'VENCIDO' : 'CRÍTICO'}
              </span>
              <span style={{ color: 'var(--redink)', fontWeight: 600, fontSize: '.82rem' }}>
                {textoDias(r.dias)}
              </span>
              {r.escalado_at && (
                <span className="pill neutral">Escalado {formatoFechaHora(r.escalado_at)}</span>
              )}
              <span className="spacer" />
              <a
                className="btn sm"
                href={l.wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => anotar(r.id, 'whatsapp')}
              >
                <Icono nombre="fa-whatsapp" tipo="brands" /> WhatsApp
              </a>
              <a className="btn sm" href={l.mail} onClick={() => anotar(r.id, 'correo')}>
                <Icono nombre="fa-envelope" tipo="regular" /> Correo
              </a>
              {r.venc && correoDisciplinario && (
                <a
                  className="btn sm"
                  href={enlaceDisciplinario(correoDisciplinario, r, l.msg)}
                  onClick={() => anotar(r.id, 'disciplinario')}
                >
                  <Icono nombre="fa-scale-balanced" /> Control Disciplinario
                </a>
              )}
              {escala && !r.escalado_at && (
                <button type="button" className="btn sm danger" onClick={() => void registrar(r.id)}>
                  Registrar
                </button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
