// Planes de mejoramiento · consulta (2.x: vPlanes, pmOverview, pmDepView, pmPlanView, pmAccRow, pmCalLinea,
// pmCgscHtml, pmTabValidar, pmTabHistorial, pmTabCalidad, pmSoporte y pmHistModal de src/js/19-planes-de-mejoramiento.js).
// Mismo HTML y clases (pm-hero, pm-plans, pm-plan, pm-meter, pm-chips, pm-h, pm-a, pm-cgsc, pm-tabs, pm-tl).
// Entregas 1 a 3 de la F3 para Planes: consulta, formulación y edición, reporte y validación de avances, calificación
// CGSC, observaciones de Control Interno (Formularios.tsx) importación desde Excel o desde el informe final en PDF
// (Importar.tsx) y exportación en el formato de cada contraloría (Exportar.tsx). Las sugerencias de acciones, los traslados, la aprobación del plan, las prórrogas, los
// informes semestrales y el archivo documental llegan en la entrega 4 (mientras tanto se hacen en la 2.x).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { Perfil } from '../../datos/contratos';
import { formatoFechaHora } from '../../dominio/auditoria';
import { textoCorto } from '../../dominio/actividad';
import { nombreCorto } from '../../dominio/directorio';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto } from '../../dominio/historico';
import {
  ALERTA_DIAS,
  CONNOTACIONES,
  ESTADO_AVANCE,
  ESTADO_PLAN,
  calidadPlan,
  calificacionAccion,
  calificacionCgsc,
  conteos,
  estadoAccion,
  formatoDe,
  indicadores,
  llave,
  metaTxt,
  numTxt,
  pct,
  pctTxt,
  pendiente,
  puedeReportar,
  puntos,
  ultimo,
  UMBRAL_CGSC,
  type Accion,
  type Avance,
  type DatosPlanes,
  type Hallazgo,
  type Plan,
  type Traslado,
  type ProblemaCalidad
} from '../../dominio/planes';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import {
  useMarcarAtendida,
  VentanaAccion,
  VentanaAvance,
  VentanaCalificacion,
  VentanaHallazgo,
  VentanaObservacion,
  VentanaPlan,
  VentanaRevision
} from './Formularios';
import { VentanaExportar } from './Exportar';
import { BloqueFormulacion } from './Formulacion';
import { ESTADOS_FORMULACION, estadoDe, puedeFormular } from '../../dominio/formulacion';
import { VentanaImportar } from './Importar';
import { TabDocumentos, VentanaDocumento, VentanaPapelera } from './Memoria';
import { TrasladosHallazgo, VentanaTraslado } from './Traslados';
import { TarjetaOficio, VentanaAprobar, VentanaNotificarPlanes } from './Oficio';
import {
  AvisoBajo100,
  LineaProrroga,
  TarjetaInformes,
  TarjetaNorma,
  VentanaInforme,
  VentanaNuevoPlan,
  VentanaProrroga,
  VentanaResolverProrroga,
  type VentanaNorma
} from './Norma';
import { puedeProrrogar } from '../../dominio/planes-norma';

const nf = (n: number) => n.toLocaleString('es-CO');
const SUPERVISION = ['admin', 'alcalde', 'control_interno'];
const EDITA = ['admin', 'control_interno'];

function Medidor({
  label,
  v,
  color,
  hint
}: {
  label: string;
  v: number | null;
  color: string;
  hint?: string;
}) {
  return (
    <div className="pm-meter">
      <div className="pm-meter-h">
        <span>{label}</span>
        <b>{pctTxt(v)}</b>
      </div>
      <div className="bar">
        <span style={{ width: (v == null ? 0 : Math.round(v * 100)) + '%', background: color }} />
      </div>
      {hint && <div className="pm-meter-f">{hint}</div>}
    </div>
  );
}
const Contraloria = ({ p }: { p: Plan }) => (
  <span className={'pm-ctl ' + (p.formato === 'F14_CGR' ? 'cgr' : p.formato === 'PM_01_CGSC' ? 'cgsc' : '')}>
    {formatoDe(p).corto}
  </span>
);
const Vacio = ({ icono, children }: { icono: string; children: ReactNode }) => (
  <div className="empty">
    <Icono nombre={icono} />
    {children}
  </div>
);

/** Contexto de cálculo compartido por las vistas. */
type VentanaPlanes =
  | { t: 'plan'; p: Plan | null }
  | { t: 'hall'; h: Hallazgo | null; planId: string }
  | { t: 'acc'; a: Accion | null; h: Hallazgo }
  | { t: 'avance'; a: Accion }
  | { t: 'revision'; v: Avance }
  | { t: 'cal'; a: Accion; fev: string }
  | { t: 'obs'; a: Accion }
  | { t: 'importar' }
  | { t: 'doc'; planId: string }
  | { t: 'papelera' }
  | VentanaNorma
  | { t: 'tras'; tras: Traslado | null; h: Hallazgo }
  | { t: 'aprobar'; p: Plan }
  | { t: 'notificar'; dep: number; nombre: string }
  | { t: 'exportar'; p: Plan; fev: string };
interface Ctx {
  d: DatosPlanes;
  hoy: string;
  dep: (id: number | null | undefined) => string;
  edita: boolean;
  rol: string;
  depPropia: number | null;
  verHistorial: (a: Accion) => void;
  abrir: (v: VentanaPlanes) => void;
  eliminarAccion: (a: Accion) => void;
  eliminarHallazgo: (h: Hallazgo) => void;
  marcarAtendida: (a: Accion) => void;
}

function Soporte({ v, demo }: { v: Avance; demo: boolean }) {
  const s: ReactNode[] = [];
  if (v.soporte_path)
    s.push(
      demo ? (
        <span key="pdf" className="muted" title={v.soporte_hash || ''}>
          <Icono nombre="fa-file-pdf" /> {textoCorto(v.soporte_path, 26)}
        </span>
      ) : (
        <span key="pdf" className="muted" title={v.soporte_hash || ''}>
          <Icono nombre="fa-file-pdf" /> PDF
        </span>
      )
    );
  if (v.radicado_orfeo)
    s.push(
      <span key="orfeo" className="mono" style={{ fontSize: '.78rem' }}>
        {' '}
        ORFEO {v.radicado_orfeo}
      </span>
    );
  return s.length ? <>{s}</> : <span className="muted">—</span>;
}

function LineaCalificacion({ a, p, ctx, fev }: { a: Accion; p: Plan | undefined; ctx: Ctx; fev: string }) {
  if (!p || p.formato !== 'PM_01_CGSC' || !ctx.d.v19 || p.estado === 'formulacion') return null;
  const r = calificacionAccion(a, fev, ctx.d.avances);
  if (r.c == null && r.e == null) return null;
  return (
    <div className="pm-a-l pm-cal">
      <Icono nombre="fa-scale-balanced" /> CGSC · Cumplimiento <b>{r.c == null ? '—' : r.c}</b>
      {r.c != null && !r.manual ? <span className="muted"> (sugerido)</span> : null} · Efectividad{' '}
      <b>{r.e == null ? '—' : r.e}</b> · Estado <b>{r.estado === 'C' ? 'Cerrada (C)' : 'Abierta (A)'}</b>
    </div>
  );
}

function FilaAccion({
  a,
  ctx,
  conContexto,
  fev
}: {
  a: Accion;
  ctx: Ctx;
  conContexto?: boolean;
  fev: string;
}) {
  const e = estadoAccion(a, ctx.hoy),
    p = pct(a),
    pend = pendiente(a, ctx.d.avances),
    u = ultimo(a, ctx.d.avances),
    h = ctx.d.hallazgos.find(x => x.id === a.hallazgo_id);
  const dev = u && u.estado === 'devuelto' && !pend;
  const plan = ctx.d.planes.find(x => x.id === a.plan_id);
  return (
    <div className={'pm-a s-' + e.k} id={'pmA-' + a.id}>
      <div className="pm-a-main">
        {conContexto && h && (
          <div className="pm-a-ctx">
            Hallazgo {h.numero} · {textoCorto(h.descripcion, 110)}
          </div>
        )}
        <b className="pm-a-t">{a.accion}</b>
        {a.actividad && a.actividad !== a.accion && <div className="pm-a-l">Actividad: {a.actividad}</div>}
        <div className="pm-a-l">Meta: {metaTxt(a)}</div>
        <div className="pm-a-l">
          <Icono nombre="fa-building-columns" />{' '}
          {a.dependencia_id ? (
            ctx.dep(a.dependencia_id)
          ) : (
            <span style={{ color: 'var(--redink)' }}>Sin dependencia asignada</span>
          )}
          {a.responsable ? ' · ' + a.responsable : ''}
        </div>
        {a.fuente_verificacion && (
          <div className="pm-a-l">
            Verificación: {a.fuente_verificacion}
            {a.lugar_verificacion ? ' · ' + a.lugar_verificacion : ''}
          </div>
        )}
        {a.obs_ci && (
          <div className={'pm-note ' + (a.obs_ci_estado === 'atendida' ? 'g' : 'y')}>
            <Icono nombre="fa-user-shield" />{' '}
            <b>Control Interno{a.obs_ci_estado === 'atendida' ? ' (atendida)' : ' (pendiente)'}:</b>{' '}
            {a.obs_ci}
            {ctx.edita && a.obs_ci_estado === 'pendiente' && (
              <>
                {' '}
                <button type="button" className="btn sm" onClick={() => ctx.marcarAtendida(a)}>
                  Marcar atendida
                </button>
              </>
            )}
          </div>
        )}
        <LineaCalificacion a={a} p={plan} ctx={ctx} fev={fev} />
        <LineaProrroga a={a} d={ctx.d} edita={ctx.edita} abrir={ctx.abrir} />
        {pend && (
          <div className="pm-note b">
            <Icono nombre="fa-hourglass-half" /> Avance de {pctTxt(pct(a, pend.cantidad))} reportado el{' '}
            {formatoFechaHora(pend.created_at)}, pendiente de validación.
          </div>
        )}
        {dev && u && (
          <div className="pm-note r">
            <Icono nombre="fa-rotate-left" /> Avance devuelto: {u.observacion || ''}
          </div>
        )}
      </div>
      <div className="pm-a-side">
        <span className={'pill ' + e.pill}>{e.k === 'vencida' ? `Vencida hace ${-e.d} d` : e.txt}</span>
        <div className="pm-a-f">
          Inicio {formatoCorto(a.fecha_inicio)} · Fin <b>{formatoCorto(a.fecha_fin)}</b>
        </div>
        <div className="pm-a-p">
          <div className="bar">
            <span
              style={{
                width: Math.round(p * 100) + '%',
                background:
                  p >= 1 ? 'var(--sem-v)' : e.k === 'vencida' ? 'var(--sem-r)' : 'var(--neo, #4c8dff)'
              }}
            />
          </div>
          <b className="mono">{pctTxt(p)}</b>
        </div>
        <div className="pm-a-f">
          {a.fecha_corte ? 'Validado con corte ' + formatoCorto(a.fecha_corte) : 'Sin avance validado'}
        </div>
        <div className="pm-a-b">
          {puedeReportar(a, ctx.rol, ctx.depPropia) && !pend && (e.k !== 'cumplida' || ctx.edita) && (
            <button type="button" className="btn sm primary" onClick={() => ctx.abrir({ t: 'avance', a })}>
              <Icono nombre="fa-chart-line" /> Reportar avance
            </button>
          )}
          {pend && ctx.edita && (
            <button
              type="button"
              className="btn sm primary"
              onClick={() => ctx.abrir({ t: 'revision', v: pend })}
            >
              <Icono nombre="fa-clipboard-check" /> Revisar avance
            </button>
          )}
          <button type="button" className="btn sm" onClick={() => ctx.verHistorial(a)}>
            <Icono nombre="fa-clock-rotate-left" /> Historial
          </button>
          {puedeProrrogar(a, ctx.d, ctx.edita) && (
            <button
              type="button"
              className="btn sm"
              onClick={() => ctx.abrir({ t: 'pror', tipo: 'accion', ctx: { a } })}
            >
              <Icono nombre="fa-calendar-plus" /> Prórroga
            </button>
          )}
          {ctx.edita && ctx.d.v19 && plan?.formato === 'PM_01_CGSC' && plan.estado !== 'formulacion' && (
            <button type="button" className="btn sm" onClick={() => ctx.abrir({ t: 'cal', a, fev })}>
              <Icono nombre="fa-scale-balanced" /> Calificar
            </button>
          )}
          {ctx.edita && ctx.d.v19 && !a.obs_ci && (
            <button
              type="button"
              className="icon-btn"
              title="Observación de Control Interno"
              aria-label="Observación de Control Interno"
              onClick={() => ctx.abrir({ t: 'obs', a })}
            >
              <Icono nombre="fa-user-shield" />
            </button>
          )}
          {h && (ctx.d.v28 ? puedeFormular(h, ctx.rol, ctx.depPropia) : ctx.edita) && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Editar acción"
                aria-label="Editar acción"
                onClick={() => ctx.abrir({ t: 'acc', a, h })}
              >
                <Icono nombre="fa-pen" />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Eliminar acción"
                aria-label="Eliminar acción"
                onClick={() => ctx.eliminarAccion(a)}
              >
                <Icono nombre="fa-trash" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Historial({ a, ctx, demo, alCerrar }: { a: Accion; ctx: Ctx; demo: boolean; alCerrar: () => void }) {
  const l = ctx.d.avances
    .filter(v => v.accion_id === a.id)
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  return (
    <Modal
      abierto
      ancha
      titulo="Historial de avances"
      alCerrar={alCerrar}
      pie={
        <>
          {puedeReportar(a, ctx.rol, ctx.depPropia) && !pendiente(a, ctx.d.avances) && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                alCerrar();
                ctx.abrir({ t: 'avance', a });
              }}
            >
              <Icono nombre="fa-chart-line" /> Reportar avance
            </button>
          )}
          <button type="button" className="btn" onClick={alCerrar}>
            Cerrar
          </button>
        </>
      }
    >
      <div className="pm-ctx">
        <b>{a.accion}</b>
        <div className="muted">
          {ctx.dep(a.dependencia_id)} · meta {numTxt(a.cantidad)} {a.unidad_medida} · termina el{' '}
          {formatoCorto(a.fecha_fin)}
        </div>
      </div>
      {l.length ? (
        <div className="pm-tl">
          {l.map(v => (
            <div key={v.id} className={'pm-tl-i ' + v.estado}>
              <div className="pm-tl-h">
                <span
                  className={
                    'pill ' +
                    (v.estado === 'validado' ? 'verde' : v.estado === 'devuelto' ? 'rojo' : 'amarillo')
                  }
                >
                  {ESTADO_AVANCE[v.estado]}
                </span>
                <b className="mono">{pctTxt(pct(a, v.cantidad))}</b>
                <span className="muted">
                  corte {formatoCorto(v.fecha_corte)} · {formatoFechaHora(v.created_at)}
                </span>
              </div>
              <div>{v.descripcion}</div>
              <div className="muted" style={{ fontSize: '.76rem', marginTop: 4 }}>
                {v.reportado_email || ''}
                {v.revisado_at
                  ? ' · revisó ' + (v.revisado_email || '') + ' el ' + formatoFechaHora(v.revisado_at)
                  : ''}
              </div>
              {v.observacion && (
                <div className={'pm-note ' + (v.estado === 'devuelto' ? 'r' : 'b')} style={{ marginTop: 6 }}>
                  {v.observacion}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <Soporte v={v} demo={demo} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Vacio icono="fa-inbox">Aún no hay avances reportados</Vacio>
      )}
    </Modal>
  );
}

function Resumen({
  ctx,
  abrir,
  abrirAccion
}: {
  ctx: Ctx;
  abrir: (id: string) => void;
  abrirAccion: (a: Accion) => void;
}) {
  const { d, hoy } = ctx;
  const [ctl, setCtl] = useState('');
  const [q, setQ] = useState('');
  const k = llave(q);
  const planes = d.planes
    .filter(p => !ctl || formatoDe(p).corto === ctl)
    .filter(
      p => !k || llave([p.ejercicio, p.contraloria, p.numero_informe, p.tipo_ejercicio].join(' ')).includes(k)
    )
    .sort(
      (a, b) =>
        Number(a.estado === 'cerrado') - Number(b.estado === 'cerrado') ||
        String(b.fecha_suscripcion).localeCompare(String(a.fecha_suscripcion))
    );
  const pids = new Set(planes.map(p => p.id));
  const acc = d.acciones.filter(a => pids.has(a.plan_id));
  const cn = conteos(acc, hoy, d.avances),
    ind = indicadores(acc, hoy, d.avances);
  const porVal = d.avances.filter(v => v.estado === 'reportado' && pids.has(v.plan_id)).length;
  const crit = acc
    .filter(a => ['vencida', 'proxima'].includes(estadoAccion(a, hoy).k))
    .sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)));
  const porDep: Record<string, Accion[]> = {};
  for (const a of acc) (porDep[String(a.dependencia_id || 'sin')] ??= []).push(a);
  const depRows = Object.entries(porDep)
    .map(([key, l]) => ({
      key,
      n: (key === 'sin' ? '' : ctx.dep(+key)) || 'Sin dependencia asignada',
      c: conteos(l, hoy, d.avances),
      i: indicadores(l, hoy, d.avances)
    }))
    .sort(
      (a, b) => b.c.vencida - a.c.vencida || (a.i.cpm == null ? 1 : a.i.cpm) - (b.i.cpm == null ? 1 : b.i.cpm)
    );
  const ctls: [string, string][] = [
    ['', 'Todas'],
    ['CGSC', 'Contraloría de Cali'],
    ['CGR', 'Contraloría General de la República']
  ];
  return (
    <>
      <div className="card pm-hero">
        <div>
          <h2>Planes de mejoramiento</h2>
          <div className="sub">
            Formulación, avance y cumplimiento frente a la Contraloría General de Santiago de Cali (formato
            PM_01) y la Contraloría General de la República (Formularios 14 y 14.1).
          </div>
        </div>
        {ctx.edita && (
          <div className="pm-hero-b">
            <button type="button" className="btn primary" onClick={() => ctx.abrir({ t: 'importar' })}>
              <Icono nombre="fa-file-import" /> Importar Excel
            </button>
            <button type="button" className="btn" onClick={() => ctx.abrir({ t: 'plan', p: null })}>
              <Icono nombre="fa-plus" /> Nuevo plan
            </button>
            {ctx.d.v20 && (
              <button type="button" className="btn" onClick={() => ctx.abrir({ t: 'papelera' })}>
                <Icono nombre="fa-trash-can-arrow-up" /> Papelera
              </button>
            )}
          </div>
        )}
      </div>
      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <div className="card kpi">
          <small>Planes</small>
          <b>{nf(planes.length)}</b>
        </div>
        <div className="card kpi">
          <small>Acciones</small>
          <b>{nf(cn.n)}</b>
        </div>
        <div className="card kpi g">
          <small>Cumplidas</small>
          <b>{nf(cn.cumplida)}</b>
        </div>
        <div className="card kpi r">
          <small>Vencidas sin cumplir</small>
          <b>{nf(cn.vencida)}</b>
        </div>
        <div className="card kpi y">
          <small>Vencen en {ALERTA_DIAS} días</small>
          <b>{nf(cn.proxima)}</b>
        </div>
        <div className="card kpi">
          <small>Avances por validar</small>
          <b>{nf(porVal)}</b>
        </div>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="pm-ind">
          <Medidor
            label="Cumplimiento de metas vencidas"
            v={ind.cpm}
            color="var(--sem-v)"
            hint={
              ind.cpm == null
                ? 'Aún no hay metas vencidas a la fecha'
                : 'Σ PLAVI / Σ PAAVI · metodología Formulario 14.1 CGR'
            }
          />
          <Medidor
            label="Avance general de los planes"
            v={ind.ap}
            color="var(--neo, #4c8dff)"
            hint="Σ PLAI / Σ plazo en semanas"
          />
        </div>
      </div>
      <div className="toolbar pm-filtros">
        <div className="seg">
          {ctls.map(([key, l]) => (
            <button key={key} type="button" className={ctl === key ? 'on' : ''} onClick={() => setCtl(key)}>
              {l}
            </button>
          ))}
        </div>
        <input
          id="pmQ"
          type="search"
          aria-label="Buscar plan"
          placeholder="Buscar plan, informe o contraloría"
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <div className="pm-plans">
        {planes.length ? (
          planes.map(p => {
            const l = d.acciones.filter(a => a.plan_id === p.id),
              c = conteos(l, hoy, d.avances),
              i = indicadores(l, hoy, d.avances),
              nh = d.hallazgos.filter(h => h.plan_id === p.id).length,
              pv = d.avances.filter(v => v.plan_id === p.id && v.estado === 'reportado').length;
            return (
              <article
                key={p.id}
                className="card pm-plan"
                tabIndex={0}
                role="button"
                aria-label={'Abrir ' + p.ejercicio}
                onClick={() => abrir(p.id)}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && abrir(p.id)}
              >
                <div className="pm-plan-h">
                  <Contraloria p={p} />
                  <span className={'pill ' + (p.estado === 'cerrado' ? 'verde' : 'neutral')}>
                    {ESTADO_PLAN[p.estado] || p.estado}
                  </span>
                </div>
                <h3>{p.ejercicio}</h3>
                <div className="sub">
                  Suscrito el {formatoCorto(p.fecha_suscripcion)} · {nf(nh)} hallazgo{nh === 1 ? '' : 's'} ·{' '}
                  {nf(l.length)} acci{l.length === 1 ? 'ón' : 'ones'}
                </div>
                <Medidor label="Cumplimiento" v={i.cpm} color="var(--sem-v)" />
                <Medidor label="Avance" v={i.ap} color="var(--neo, #4c8dff)" />
                <div className="pm-chips">
                  {c.vencida > 0 && (
                    <span className="pm-chip r">
                      {c.vencida} vencida{c.vencida === 1 ? '' : 's'}
                    </span>
                  )}
                  {c.proxima > 0 && <span className="pm-chip y">{c.proxima} por vencer</span>}
                  {pv > 0 && <span className="pm-chip b">{pv} por validar</span>}
                  {c.cumplida > 0 && (
                    <span className="pm-chip g">
                      {c.cumplida} cumplida{c.cumplida === 1 ? '' : 's'}
                    </span>
                  )}
                  {c.sinDep > 0 && <span className="pm-chip">{c.sinDep} sin dependencia</span>}
                </div>
              </article>
            );
          })
        ) : (
          <div className="card">
            <Vacio icono="fa-clipboard-list">
              {d.planes.length
                ? 'Ningún plan coincide con el filtro.'
                : 'Aún no hay planes de mejoramiento registrados.'}
            </Vacio>
          </div>
        )}
      </div>
      <div className="grid g-2 pm-g2" style={{ marginTop: 14 }}>
        {!['secretario', 'enlace'].includes(ctx.rol) && (
          <TarjetaInformes d={ctx.d} hoy={ctx.hoy} abrirPlan={abrir} />
        )}
        <div className="card">
          <h3>Acciones que requieren atención</h3>
          <div className="sub">Vencidas sin cumplir y las que vencen en los próximos {ALERTA_DIAS} días</div>
          {crit.length ? (
            <>
              <div className="tbl-wrap">
                <table className="tbl" style={{ minWidth: 560 }}>
                  <caption className="solo-lector">Acciones que requieren atención</caption>
                  <thead>
                    <tr>
                      <th>Acción</th>
                      <th>Dependencia</th>
                      <th>Termina</th>
                      <th>Avance</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {crit.slice(0, 15).map(a => {
                      const e = estadoAccion(a, hoy);
                      return (
                        <tr key={a.id} className="click" onClick={() => abrirAccion(a)}>
                          <td className="asunto">{textoCorto(a.accion, 90)}</td>
                          <td>{nombreCorto(ctx.dep(a.dependencia_id)) || '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatoCorto(a.fecha_fin)}</td>
                          <td className="mono">{pctTxt(pct(a))}</td>
                          <td>
                            <span className={'pill ' + e.pill}>{e.txt}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {crit.length > 15 && (
                <div className="muted" style={{ fontSize: '.76rem', marginTop: 8 }}>
                  Se muestran 15 de {crit.length}.
                </div>
              )}
            </>
          ) : (
            <Vacio icono="fa-circle-check">No hay acciones vencidas ni por vencer</Vacio>
          )}
        </div>
        <div className="card">
          <h3>Cumplimiento por dependencia</h3>
          <div className="sub">Acciones asignadas, vencidas sin cumplir y cumplimiento de metas vencidas</div>
          {depRows.length ? (
            depRows.map(r => (
              <div key={r.key} className="list-row pm-deprow">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{nombreCorto(r.n) || r.n}</b>
                  <div className="muted" style={{ fontSize: '.76rem' }}>
                    {r.c.n} acciones · {r.c.cumplida} cumplidas
                    {r.c.vencida > 0 && (
                      <>
                        {' · '}
                        <span style={{ color: 'var(--redink)' }}>{r.c.vencida} vencidas</span>
                      </>
                    )}
                  </div>
                  <div className="bar" style={{ marginTop: 6 }}>
                    <span
                      style={{
                        width: (r.i.cpm == null ? 0 : Math.round(r.i.cpm * 100)) + '%',
                        background:
                          r.i.cpm == null
                            ? 'transparent'
                            : r.i.cpm >= 0.8
                              ? 'var(--sem-v)'
                              : r.i.cpm >= 0.5
                                ? 'var(--sem-a)'
                                : 'var(--sem-r)'
                      }}
                    />
                  </div>
                </div>
                <div className="pm-deprow-r">
                  <b className="mono">{pctTxt(r.i.cpm)}</b>
                  {r.key !== 'sin' &&
                    SUPERVISION.includes(ctx.rol) &&
                    (r.c.vencida > 0 || r.c.proxima > 0) && (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => ctx.abrir({ t: 'notificar', dep: Number(r.key), nombre: r.n })}
                      >
                        <Icono nombre="fa-paper-plane" /> Notificar
                      </button>
                    )}
                </div>
              </div>
            ))
          ) : (
            <Vacio icono="fa-sitemap">Sin acciones registradas</Vacio>
          )}
        </div>
      </div>
    </>
  );
}

function MisAcciones({
  ctx,
  depId,
  abrirPlan
}: {
  ctx: Ctx;
  depId: number | null;
  abrirPlan: (id: string) => void;
}) {
  const { d, hoy } = ctx;
  if (!depId)
    return (
      <div className="card">
        <Vacio icono="fa-circle-info">
          Tu cuenta aún no tiene dependencia asignada. Pide al Super administrador que la asigne.
        </Vacio>
      </div>
    );
  const acc = d.acciones.slice().sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)));
  const cn = conteos(acc, hoy, d.avances),
    ind = indicadores(acc, hoy, d.avances);
  const porPlan: Record<string, Accion[]> = {};
  for (const a of acc) (porPlan[a.plan_id] ??= []).push(a);
  return (
    <>
      <div className="card pm-hero">
        <div>
          <h2>Mis acciones de mejora</h2>
          <div className="sub">
            {ctx.dep(depId)} · acciones asignadas en los planes de mejoramiento suscritos con las
            contralorías. Reporta el avance con su soporte antes de la fecha de terminación.
          </div>
        </div>
      </div>
      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        {(
          [
            ['', 'Asignadas', cn.n],
            ['g', 'Cumplidas', cn.cumplida],
            ['r', 'Vencidas sin cumplir', cn.vencida],
            ['y', `Vencen en ${ALERTA_DIAS} días`, cn.proxima],
            ['', 'En validación', cn.pend],
            ['r', 'Devueltas para corregir', cn.dev]
          ] as const
        ).map(([c, t, n]) => (
          <div key={t} className={'card kpi ' + c}>
            <small>{t}</small>
            <b>{nf(n)}</b>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="pm-ind">
          <Medidor
            label="Cumplimiento de mis metas vencidas"
            v={ind.cpm}
            color="var(--sem-v)"
            hint={ind.cpm == null ? 'Aún no hay metas vencidas' : ''}
          />
          <Medidor label="Avance de mis acciones" v={ind.ap} color="var(--neo, #4c8dff)" />
        </div>
      </div>
      {ctx.d.v28 && <HallazgosPorFormular ctx={ctx} depId={depId} abrirPlan={abrirPlan} />}
      {acc.length ? (
        Object.entries(porPlan).map(([pid, l]) => {
          const p = d.planes.find(x => x.id === pid);
          return (
            <section key={pid} className="card" style={{ marginBottom: 14 }}>
              <div className="pm-plan-h">
                {p && <Contraloria p={p} />}
                <span className="muted" style={{ fontSize: '.78rem' }}>
                  Suscrito el {formatoCorto(p?.fecha_suscripcion)}
                </span>
              </div>
              <h3 style={{ margin: '6px 0 10px' }}>{p?.ejercicio || 'Plan de mejoramiento'}</h3>
              <div className="pm-acts">
                {l.map(a => (
                  <FilaAccion key={a.id} a={a} ctx={ctx} conContexto fev={hoy} />
                ))}
              </div>
            </section>
          );
        })
      ) : (
        <div className="card">
          <Vacio icono="fa-champagne-glasses">
            Tu dependencia no tiene acciones asignadas en planes de mejoramiento.
          </Vacio>
        </div>
      )}
    </>
  );
}

/**
 * Script 28: hallazgos de la dependencia que aún no están validados (en formulación, enviados o devueltos). Sin esta
 * tarjeta un hallazgo recién asignado, sin acciones, no aparecería en «Mis acciones de mejora».
 */
function HallazgosPorFormular({
  ctx,
  depId,
  abrirPlan
}: {
  ctx: Ctx;
  depId: number | null;
  abrirPlan: (id: string) => void;
}) {
  const l = ctx.d.hallazgos.filter(
    h => String(h.dependencia_id ?? '') === String(depId) && estadoDe(h) !== 'validado'
  );
  if (!l.length) return null;
  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ margin: '0 0 6px' }}>Hallazgos por formular</h3>
      <div className="hint" style={{ marginBottom: 8 }}>
        Su dependencia formula el análisis de causa y las acciones de cada hallazgo y los envía a Control
        Interno para su validación.
      </div>
      {l.map(h => {
        const p = ctx.d.planes.find(x => x.id === h.plan_id);
        const e = ESTADOS_FORMULACION[estadoDe(h)];
        return (
          <div
            key={h.id}
            style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0' }}
          >
            <span className="pm-num">Hallazgo {h.numero}</span>
            <span className={'pill ' + e.clase}>{e.texto}</span>
            <span className="muted" style={{ fontSize: '.8rem', flex: 1, minWidth: 180 }}>
              {textoCorto(p?.ejercicio || '', 90)}
            </span>
            <button
              type="button"
              className="btn sm"
              aria-label={'Formular hallazgo ' + h.numero + ' de ' + (p?.ejercicio || 'el plan')}
              onClick={() => abrirPlan(h.plan_id)}
            >
              <Icono nombre="fa-pen" /> Formular
            </button>
          </div>
        );
      })}
    </section>
  );
}

function CalificacionCgsc({ p, acc, ctx, fev }: { p: Plan; acc: Accion[]; ctx: Ctx; fev: string }) {
  if (p.formato !== 'PM_01_CGSC' || !ctx.d.v19) return null;
  const k = calificacionCgsc(acc, fev, ctx.d.avances);
  return (
    <div className="pm-cgsc">
      <div className="pm-cgsc-h">
        <b>Calificación según la metodología de la CGSC</b>
        <span className="muted">
          Formato PM_01 · cumplimiento 20 % + efectividad 80 % · al {formatoCorto(fev)}
        </span>
      </div>
      <div className="pm-cgsc-g">
        <div>
          <small>Cumplimiento (20 %)</small>
          <b className="mono">{puntos(k.C)}</b>
          <span className="muted">
            {k.nC} de {k.n} acciones calificadas
          </span>
        </div>
        <div>
          <small>Efectividad (80 %)</small>
          <b className="mono">{puntos(k.E)}</b>
          <span className="muted">
            {k.nE} calificadas
            {k.sinEf > 0 && (
              <>
                {' · '}
                <b style={{ color: 'var(--amberink,#b7791f)' }}>{k.sinEf} por calificar</b>
              </>
            )}
          </span>
        </div>
        <div>
          <small>Calificación total</small>
          <b className="mono">{puntos(k.T)}</b>
          <span className="muted">de 100 puntos</span>
        </div>
        <div>
          <small>Concepto</small>
          {k.concepto ? (
            <span className={'pill ' + (k.concepto === 'Cumple' ? 'verde' : 'rojo')}>{k.concepto}</span>
          ) : (
            <span className="pill neutral">Sin acciones para calificar</span>
          )}
          <span className="muted">Cumple desde {UMBRAL_CGSC} puntos</span>
        </div>
      </div>
      <div className="hint">
        El cumplimiento se sugiere con los avances validados (2 = meta cumplida; 1 = vencida con avance
        parcial; 0 = vencida sin avance). La efectividad la califica Control Interno: ¿la acción eliminó la
        causa del hallazgo?
      </div>
    </div>
  );
}

type Pestana = 'acciones' | 'validar' | 'calidad' | 'historial' | 'documentos';

function DetallePlan({
  p,
  ctx,
  demo,
  volver,
  resaltar,
  quitarPlan
}: {
  p: Plan;
  ctx: Ctx;
  demo: boolean;
  volver: () => void;
  resaltar: string | null;
  quitarPlan: (p: Plan) => void;
}) {
  const { d } = ctx;
  const [fev, setFev] = useState(ctx.hoy);
  const [tab, setTab] = useState<Pestana>('acciones');
  const [fEst, setFEst] = useState('');
  const [fDep, setFDep] = useState('');
  const [fQ, setFQ] = useState('');
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const hall = d.hallazgos
    .filter(h => h.plan_id === p.id)
    .sort(
      (a, b) =>
        (a.orden || 0) - (b.orden || 0) ||
        String(a.numero).localeCompare(String(b.numero), 'es', { numeric: true })
    );
  const accAll = d.acciones.filter(a => a.plan_id === p.id);
  const ind = indicadores(accAll, fev, d.avances),
    cn = conteos(accAll, ctx.hoy, d.avances);
  const pend = d.avances.filter(v => v.plan_id === p.id && v.estado === 'reportado');
  const issues: ProblemaCalidad[] = calidadPlan(
    p,
    hall,
    accAll,
    d.acciones,
    d.avances,
    d.traslados ?? null,
    ctx.hoy
  );
  const q = llave(fQ);
  const accOk = (a: Accion) =>
    (!fEst ||
      (fEst === 'sindep'
        ? !a.dependencia_id
        : fEst === 'pend'
          ? !!pendiente(a, d.avances)
          : estadoAccion(a, ctx.hoy).k === fEst)) &&
    (!fDep || String(a.dependencia_id) === fDep) &&
    (!q || llave([a.accion, a.actividad, a.meta, a.responsable].join(' ')).includes(q));
  const deps = [...new Set(accAll.map(a => a.dependencia_id).filter((x): x is number => !!x))]
    .map(id => ({ id, nombre: ctx.dep(id) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const info = (
    [
      ['Contraloría', p.contraloria],
      ['Formato', formatoDe(p).nombre],
      ['Tipo de ejercicio', p.tipo_ejercicio],
      [p.formato === 'F14_CGR' ? 'Modalidad de auditoría' : '', p.formato === 'F14_CGR' ? p.modalidad : ''],
      ['Fecha de suscripción', formatoCorto(p.fecha_suscripcion)],
      [
        p.formato === 'F14_CGR' ? 'Periodo fiscal' : 'Vigencia PVCFT',
        p.formato === 'F14_CGR' ? p.periodo_auditado : p.vigencia_pvcft
      ],
      ['Informe', (p.numero_informe ?? '') + (p.fecha_informe ? ' · ' + formatoCorto(p.fecha_informe) : '')],
      ['Radicado ORFEO', p.radicado_orfeo],
      ['Representante legal', p.representante_legal]
    ] as [string, string | undefined][]
  ).filter(x => x[0] && x[1] && String(x[1]).trim() && x[1] !== '—');
  const tabs: [Pestana, string, number][] = [
    ['acciones', 'Hallazgos y acciones', accAll.length],
    ['validar', 'Por validar', pend.length],
    ['calidad', 'Calidad de datos', issues.length],
    ['historial', 'Historial de avances', d.avances.filter(v => v.plan_id === p.id).length]
  ];
  // pmPlanView: el archivo documental no lo ven secretario ni enlace
  if (!['secretario', 'enlace'].includes(ctx.rol))
    tabs.push([
      'documentos',
      'Documentos',
      (d.documentos ?? []).filter(x => x.plan_id === p.id && !x.eliminado_at).length
    ]);
  const accDe = (id: string | undefined) => d.acciones.find(a => a.id === id);

  let cuerpo: ReactNode;
  if (tab === 'validar')
    cuerpo = pend.length ? (
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 760 }}>
            <caption className="solo-lector">Avances por validar</caption>
            <thead>
              <tr>
                <th>Acción</th>
                <th>Dependencia</th>
                <th>Corte</th>
                <th>Avance reportado</th>
                <th>Soporte</th>
                {ctx.edita && <th />}
              </tr>
            </thead>
            <tbody>
              {pend.map(v => {
                const a = accDe(v.accion_id);
                return (
                  <tr key={v.id}>
                    <td className="asunto">
                      {textoCorto(a?.accion, 80)}
                      <div className="muted" style={{ fontSize: '.74rem' }}>
                        {textoCorto(v.descripcion, 120)}
                      </div>
                    </td>
                    <td>{nombreCorto(ctx.dep(v.dependencia_id)) || '—'}</td>
                    <td>{formatoCorto(v.fecha_corte)}</td>
                    <td className="mono">
                      {numTxt(v.cantidad)} de {numTxt(a?.cantidad)} · {a ? pctTxt(pct(a, v.cantidad)) : '—'}
                    </td>
                    <td>
                      <Soporte v={v} demo={demo} />
                    </td>
                    {ctx.edita && (
                      <td>
                        <button
                          type="button"
                          className="btn sm primary"
                          onClick={() => ctx.abrir({ t: 'revision', v })}
                        >
                          Revisar
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <div className="card">
        <Vacio icono="fa-circle-check">No hay avances pendientes de validación</Vacio>
      </div>
    );
  else if (tab === 'calidad')
    cuerpo = issues.length ? (
      <div className="card">
        {issues.map((i, n) => (
          <div key={n} className={'list-row pm-issue ' + i.nivel}>
            <Icono nombre={i.nivel === 'r' ? 'fa-circle-exclamation' : 'fa-triangle-exclamation'} />
            <span style={{ flex: 1 }}>{i.txt}</span>
          </div>
        ))}
      </div>
    ) : (
      <div className="card">
        <Vacio icono="fa-circle-check">Los datos del plan están completos y consistentes</Vacio>
      </div>
    );
  else if (tab === 'historial') {
    const l = d.avances
      .filter(v => v.plan_id === p.id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    cuerpo = l.length ? (
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl" style={{ minWidth: 820 }}>
            <caption className="solo-lector">Historial de avances</caption>
            <thead>
              <tr>
                <th>Registrado</th>
                <th>Acción</th>
                <th>Corte</th>
                <th>Avance</th>
                <th>Estado</th>
                <th>Revisión</th>
                <th>Soporte</th>
              </tr>
            </thead>
            <tbody>
              {l.map(v => {
                const a = accDe(v.accion_id);
                return (
                  <tr key={v.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatoFechaHora(v.created_at)}
                      <div className="muted" style={{ fontSize: '.72rem' }}>
                        {v.reportado_email || ''}
                      </div>
                    </td>
                    <td className="asunto">
                      {textoCorto(a?.accion, 70)}
                      <div className="muted" style={{ fontSize: '.74rem' }}>
                        {textoCorto(v.descripcion, 110)}
                      </div>
                    </td>
                    <td>{formatoCorto(v.fecha_corte)}</td>
                    <td className="mono">{a ? pctTxt(pct(a, v.cantidad)) : '—'}</td>
                    <td>
                      <span
                        className={
                          'pill ' +
                          (v.estado === 'validado' ? 'verde' : v.estado === 'devuelto' ? 'rojo' : 'amarillo')
                        }
                      >
                        {ESTADO_AVANCE[v.estado]}
                      </span>
                    </td>
                    <td style={{ fontSize: '.78rem' }}>
                      {v.revisado_at ? (
                        <>
                          {formatoFechaHora(v.revisado_at)}
                          <div className="muted">{v.revisado_email || ''}</div>
                        </>
                      ) : (
                        '—'
                      )}
                      {v.observacion && <div className="muted">{textoCorto(v.observacion, 90)}</div>}
                    </td>
                    <td>
                      <Soporte v={v} demo={demo} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ) : (
      <div className="card">
        <Vacio icono="fa-inbox">Aún no se han reportado avances</Vacio>
      </div>
    );
  } else if (tab === 'documentos') {
    cuerpo = (
      <TabDocumentos p={p} d={d} edita={ctx.edita} subir={() => ctx.abrir({ t: 'doc', planId: p.id })} />
    );
  } else {
    const secciones = hall
      .map(h => {
        const l = accAll
          .filter(a => a.hallazgo_id === h.id)
          .sort((a, b) => (a.orden || 0) - (b.orden || 0))
          .filter(accOk);
        if ((fEst || fDep || q) && !l.length) return null;
        return (
          <SeccionHallazgo
            key={h.id}
            h={h}
            l={l}
            ctx={ctx}
            fev={fev}
            abierto={!!abiertos[h.id]}
            alternar={() => setAbiertos(x => ({ ...x, [h.id]: !x[h.id] }))}
          />
        );
      })
      .filter(Boolean);
    cuerpo = (
      <>
        <div className="toolbar pm-filtros">
          <select id="pmFEst" aria-label="Estado" value={fEst} onChange={e => setFEst(e.target.value)}>
            <option value="">Todos los estados</option>
            {(
              [
                ['vencida', 'Vencidas sin cumplir'],
                ['proxima', 'Vencen en ' + ALERTA_DIAS + ' días'],
                ['termino', 'En término'],
                ['cumplida', 'Cumplidas'],
                ['pend', 'Con avance por validar'],
                ['sindep', 'Sin dependencia asignada']
              ] as const
            ).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select id="pmFDep" aria-label="Dependencia" value={fDep} onChange={e => setFDep(e.target.value)}>
            <option value="">Todas las dependencias</option>
            {deps.map(x => (
              <option key={x.id} value={x.id}>
                {nombreCorto(x.nombre)}
              </option>
            ))}
          </select>
          <input
            id="pmFQ"
            type="search"
            aria-label="Buscar en acciones"
            placeholder="Buscar en acciones"
            value={fQ}
            onChange={e => setFQ(e.target.value)}
            style={{ maxWidth: 260 }}
          />
          {ctx.edita && (
            <button
              type="button"
              className="btn sm"
              onClick={() => ctx.abrir({ t: 'hall', h: null, planId: p.id })}
            >
              <Icono nombre="fa-plus" /> Agregar hallazgo
            </button>
          )}
        </div>
        {hall.length ? (
          secciones.length ? (
            secciones
          ) : (
            <div className="card">
              <Vacio icono="fa-filter">Ninguna acción coincide con el filtro</Vacio>
            </div>
          )
        ) : (
          <div className="card">
            <Vacio icono="fa-clipboard-list">El plan aún no tiene hallazgos.</Vacio>
          </div>
        )}
      </>
    );
  }
  void resaltar;
  const eliminarPlan = () => {
    if (
      window.confirm(
        `¿Eliminar el plan «${textoCorto(p.ejercicio, 80)}» con sus hallazgos y acciones? Esta acción queda en la auditoría y no se puede deshacer.`
      )
    )
      quitarPlan(p);
  };
  return (
    <>
      <div className="toolbar pm-top">
        <button type="button" className="btn sm" onClick={volver}>
          <Icono nombre="fa-arrow-left" /> Planes
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn sm" onClick={() => ctx.abrir({ t: 'exportar', p, fev })}>
          <Icono nombre="fa-file-excel" /> Exportar formato
        </button>
        {ctx.edita && p.estado === 'formulacion' && d.v19 && (
          <button type="button" className="btn sm primary" onClick={() => ctx.abrir({ t: 'aprobar', p })}>
            <Icono nombre="fa-file-signature" /> Aprobar y suscribir
          </button>
        )}
        {ctx.edita && (
          <>
            <button type="button" className="btn sm" onClick={() => ctx.abrir({ t: 'plan', p })}>
              <Icono nombre="fa-pen" /> Editar plan
            </button>
            <button type="button" className="btn sm danger" onClick={eliminarPlan}>
              <Icono nombre="fa-trash" /> Eliminar
            </button>
          </>
        )}
      </div>
      <div className="card pm-head">
        <div className="pm-plan-h">
          <Contraloria p={p} />
          <span className={'pill ' + (p.estado === 'cerrado' ? 'verde' : 'neutral')}>
            {ESTADO_PLAN[p.estado] || p.estado}
          </span>
        </div>
        <h2>{p.ejercicio}</h2>
        <div className="pm-info">
          {info.map(([k, v]) => (
            <div key={k}>
              <small>{k}</small>
              <span>{v}</span>
            </div>
          ))}
        </div>
        <div className="pm-ind" style={{ marginTop: 14 }}>
          <Medidor
            label="Cumplimiento (CPM)"
            v={ind.cpm}
            color="var(--sem-v)"
            hint={
              ind.cpm == null
                ? 'Sin metas vencidas a la fecha de evaluación'
                : `Σ PLAVI ${numTxt(ind.plavi)} / Σ PAAVI ${numTxt(ind.pbec)}`
            }
          />
          <Medidor
            label="Avance del plan (AP)"
            v={ind.ap}
            color="var(--neo, #4c8dff)"
            hint={`Σ PLAI ${numTxt(ind.plai)} / Σ plazo ${numTxt(ind.pbea)} semanas`}
          />
          <div className="field pm-fev">
            <label htmlFor="pmEval">Fecha de evaluación</label>
            <input
              type="date"
              id="pmEval"
              value={fev}
              max="2100-12-31"
              onChange={e => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && setFev(e.target.value)}
            />
            <div className="hint">Usa el último avance validado hasta esta fecha</div>
          </div>
        </div>
        <CalificacionCgsc p={p} acc={accAll} ctx={ctx} fev={fev} />
        <AvisoBajo100 p={p} d={d} edita={ctx.edita} fev={fev} abrir={ctx.abrir} />
        <TarjetaOficio p={p} d={d} edita={ctx.edita} hoy={ctx.hoy} />
        <TarjetaNorma p={p} d={d} edita={ctx.edita} hoy={ctx.hoy} abrir={ctx.abrir} />
        <div className="pm-chips" style={{ marginTop: 10 }}>
          <span className="pm-chip">{hall.length} hallazgos</span>
          <span className="pm-chip">{cn.n} acciones</span>
          {cn.cumplida > 0 && <span className="pm-chip g">{cn.cumplida} cumplidas</span>}
          {cn.vencida > 0 && <span className="pm-chip r">{cn.vencida} vencidas sin cumplir</span>}
          {cn.proxima > 0 && (
            <span className="pm-chip y">
              {cn.proxima} vencen en {ALERTA_DIAS} días
            </span>
          )}
          {pend.length > 0 && <span className="pm-chip b">{pend.length} por validar</span>}
        </div>
      </div>
      <div className="seg pm-tabs" role="group" aria-label="Pestañas del plan">
        {tabs.map(([k, l, n]) => (
          <button
            key={k}
            type="button"
            className={tab === k ? 'on' : ''}
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
            {n ? <span className="cnt"> {n}</span> : null}
          </button>
        ))}
      </div>
      <div className="pm-body">{cuerpo}</div>
    </>
  );
}

function SeccionHallazgo({
  h,
  l,
  ctx,
  fev,
  abierto,
  alternar
}: {
  h: Hallazgo;
  l: Accion[];
  ctx: Ctx;
  fev: string;
  abierto: boolean;
  alternar: () => void;
}) {
  return (
    <section className="card pm-h">
      <header className="pm-h-h">
        <span className="pm-num">Hallazgo {h.numero}</span>
        {(h.connotaciones ?? []).map(c => (
          <span key={c} className={'pm-conn c-' + c}>
            {CONNOTACIONES[c] || c}
          </span>
        ))}
        {h.cuantia ? <span className="pm-conn c-fiscal">$ {numTxt(h.cuantia)}</span> : null}
        <span style={{ flex: 1 }} />
        {ctx.edita && (
          <>
            {/* Script 28: las acciones las formula la dependencia (botón en «Formulación»); el admin corrige */}
            {(!ctx.d.v28 || ctx.rol === 'admin') && (
              <button type="button" className="btn sm" onClick={() => ctx.abrir({ t: 'acc', a: null, h })}>
                <Icono nombre="fa-plus" /> Acción
              </button>
            )}
            <button
              type="button"
              className="icon-btn"
              title="Editar hallazgo"
              aria-label="Editar hallazgo"
              onClick={() => ctx.abrir({ t: 'hall', h, planId: h.plan_id })}
            >
              <Icono nombre="fa-pen" />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Eliminar hallazgo"
              aria-label="Eliminar hallazgo"
              onClick={() => ctx.eliminarHallazgo(h)}
            >
              <Icono nombre="fa-trash" />
            </button>
          </>
        )}
      </header>
      <div className={'pm-desc' + (abierto ? ' open' : '')}>
        {h.descripcion}
        {h.causa && (
          <div style={{ marginTop: 6 }}>
            <b>Causa:</b> {h.causa}
          </div>
        )}
        {h.efecto && (
          <div style={{ marginTop: 6 }}>
            <b>Efecto:</b> {h.efecto}
          </div>
        )}
        {h.macroproceso && (
          <div style={{ marginTop: 6 }}>
            <b>Macroproceso / criterio:</b> {h.macroproceso}
          </div>
        )}
      </div>
      {(String(h.descripcion).length > 260 || h.causa || h.efecto) && (
        <button type="button" className="pm-more" onClick={alternar}>
          {abierto ? 'Ver menos' : 'Ver descripción completa'}
        </button>
      )}
      {(h.dependencia_id || h.dependencia_texto) && (
        <div className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>
          <Icono nombre="fa-building-columns" /> {ctx.dep(h.dependencia_id) || h.dependencia_texto}
        </div>
      )}
      {ctx.d.v28 && (
        <BloqueFormulacion
          h={h}
          acciones={l}
          rol={ctx.rol}
          depPropia={ctx.depPropia}
          nuevaAccion={() => ctx.abrir({ t: 'acc', a: null, h })}
        />
      )}
      <TrasladosHallazgo
        h={h}
        d={ctx.d}
        edita={ctx.edita}
        abrir={t => ctx.abrir({ t: 'tras', tras: t, h })}
      />
      <div className="pm-acts">
        {l.length ? (
          l.map(a => <FilaAccion key={a.id} a={a} ctx={ctx} fev={fev} />)
        ) : (
          <div className="muted" style={{ fontSize: '.82rem', padding: '8px 0' }}>
            Este hallazgo aún no tiene acciones.
            {(ctx.d.v28 ? puedeFormular(h, ctx.rol, ctx.depPropia) : ctx.edita) && (
              <>
                {' '}
                <button type="button" className="btn sm" onClick={() => ctx.abrir({ t: 'acc', a: null, h })}>
                  <Icono nombre="fa-lightbulb" /> Formular con sugerencias
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function PantallaPlanes({ perfil, demo = false }: { perfil: Perfil; demo?: boolean }) {
  const { planes, catalogos } = useDatos();
  const datos = useQuery({ queryKey: ['planes'], queryFn: () => planes.datos() });
  // (los formularios de la entrega 2 se abren con ctx.abrir)
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const entes = useQuery({ queryKey: ['entes'], queryFn: () => catalogos.entes() });
  const [plan, setPlan] = useState<string | null>(null);
  const [historial, setHistorial] = useState<Accion | null>(null);
  const [ventana, setVentana] = useState<VentanaPlanes | null>(null);
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const marcarAtendida = useMarcarAtendida();
  const [resaltar, setResaltar] = useState<string | null>(null);

  if (datos.isPending || deps.isPending)
    return <p className="cargando">Cargando los planes de mejoramiento…</p>;
  if (datos.isError) {
    const m = (datos.error as Error).message;
    return /pm_planes|relation|does not exist|schema cache|not find/i.test(m) ? (
      <div className="card">
        <Vacio icono="fa-database">
          <b>El módulo de planes de mejoramiento aún no está instalado en la base de datos.</b>
          <div style={{ marginTop: 6 }}>
            Ejecuta el script <span className="mono">supabase/13_planes_mejoramiento.sql</span> en el SQL
            Editor de Supabase y vuelve a cargar la página.
          </div>
        </Vacio>
      </div>
    ) : (
      <div className="card">
        <Vacio icono="fa-triangle-exclamation">
          No se pudieron cargar los planes de mejoramiento.
          <div className="muted" style={{ marginTop: 6, fontSize: '.8rem' }}>
            {m}
          </div>
          <button
            type="button"
            className="btn sm"
            style={{ marginTop: 12 }}
            onClick={() => void datos.refetch()}
          >
            <Icono nombre="fa-rotate" /> Reintentar
          </button>
        </Vacio>
      </div>
    );
  }
  const quitar = async (hacer: () => Promise<void>, ok: string) => {
    try {
      await hacer();
      avisar(ok, 'ok');
      await cliente.invalidateQueries({ queryKey: ['planes'] });
    } catch (e) {
      avisar((e as Error).message, 'error');
    }
  };
  const ctx: Ctx = {
    d: datos.data,
    hoy: fechaColombia(new Date()),
    dep: id => (id == null ? '' : (deps.data?.find(x => x.id === id)?.nombre ?? '')),
    edita: EDITA.includes(perfil.rol),
    rol: perfil.rol,
    depPropia: perfil.dependenciaId,
    verHistorial: setHistorial,
    abrir: setVentana,
    eliminarAccion: a => {
      if (window.confirm('¿Eliminar esta acción?'))
        void quitar(() => planes.eliminar('acc', a.id), 'Acción eliminada');
    },
    eliminarHallazgo: h => {
      if (window.confirm(`¿Eliminar el hallazgo ${h.numero} y sus acciones?`))
        void quitar(() => planes.eliminar('hall', h.id), 'Hallazgo eliminado');
    },
    marcarAtendida: a => void marcarAtendida(a)
  };
  const quitarPlan = (x: Plan) =>
    void quitar(async () => {
      await planes.eliminarPlan(x.id);
      setPlan(null);
    }, 'Plan eliminado');
  const cerrarVentana = () => setVentana(null);
  const w = ventana;
  const formularios =
    w?.t === 'plan' ? (
      <VentanaPlan
        p={w.p}
        d={datos.data}
        alCerrar={cerrarVentana}
        alGuardar={id => {
          cerrarVentana();
          setPlan(id);
        }}
      />
    ) : w?.t === 'hall' ? (
      <VentanaHallazgo h={w.h} planId={w.planId} d={datos.data} alCerrar={cerrarVentana} />
    ) : w?.t === 'acc' ? (
      (() => {
        const pl = datos.data.planes.find(x => x.id === w.h.plan_id);
        return pl ? (
          <VentanaAccion
            a={w.a}
            h={w.h}
            p={pl}
            deps={deps.data ?? []}
            d={datos.data}
            alCerrar={cerrarVentana}
          />
        ) : null;
      })()
    ) : w?.t === 'avance' ? (
      <VentanaAvance a={w.a} d={datos.data} edita={ctx.edita} alCerrar={cerrarVentana} />
    ) : w?.t === 'revision' ? (
      <VentanaRevision v={w.v} d={datos.data} dep={ctx.dep} alCerrar={cerrarVentana} />
    ) : w?.t === 'cal' ? (
      <VentanaCalificacion
        a={w.a}
        p={datos.data.planes.find(x => x.id === w.a.plan_id)}
        d={datos.data}
        fev={w.fev}
        alCerrar={cerrarVentana}
      />
    ) : w?.t === 'obs' ? (
      <VentanaObservacion a={w.a} alCerrar={cerrarVentana} />
    ) : w?.t === 'exportar' ? (
      <VentanaExportar
        p={w.p}
        d={datos.data}
        dep={ctx.dep}
        usuario={perfil.correo}
        corteInicial={w.fev}
        edita={ctx.edita}
        completar={a => {
          const h = datos.data.hallazgos.find(x => x.id === a.hallazgo_id);
          if (h) setVentana({ t: 'acc', a, h });
        }}
        alCerrar={cerrarVentana}
      />
    ) : w?.t === 'doc' ? (
      <VentanaDocumento planId={w.planId} alCerrar={cerrarVentana} />
    ) : w?.t === 'aprobar' ? (
      <VentanaAprobar p={w.p} d={datos.data} hoy={ctx.hoy} rol={perfil.rol} alCerrar={cerrarVentana} />
    ) : w?.t === 'notificar' ? (
      <VentanaNotificarPlanes
        depId={w.dep}
        depNombre={w.nombre}
        d={datos.data}
        hoy={ctx.hoy}
        alCerrar={cerrarVentana}
      />
    ) : w?.t === 'tras' ? (
      <VentanaTraslado t={w.tras} h={w.h} alCerrar={cerrarVentana} />
    ) : w?.t === 'pror' ? (
      <VentanaProrroga tipo={w.tipo} ctx={w.ctx} d={datos.data} hoy={ctx.hoy} alCerrar={cerrarVentana} />
    ) : w?.t === 'resolver' ? (
      <VentanaResolverProrroga pr={w.pr} hoy={ctx.hoy} alCerrar={cerrarVentana} />
    ) : w?.t === 'inf' ? (
      <VentanaInforme p={w.p} d={datos.data} hoy={ctx.hoy} alCerrar={cerrarVentana} />
    ) : w?.t === 'nuevo' ? (
      <VentanaNuevoPlan
        p={w.p}
        d={datos.data}
        fev={w.fev}
        hoy={ctx.hoy}
        alCerrar={cerrarVentana}
        alCrear={id => {
          cerrarVentana();
          setPlan(id);
        }}
      />
    ) : w?.t === 'papelera' ? (
      <VentanaPapelera d={datos.data} admin={perfil.rol === 'admin'} alCerrar={cerrarVentana} />
    ) : w?.t === 'importar' ? (
      <VentanaImportar
        d={datos.data}
        deps={deps.data ?? []}
        entes={entes.data ?? []}
        alCerrar={cerrarVentana}
        alImportar={id => {
          cerrarVentana();
          setPlan(id);
        }}
      />
    ) : null;
  const propio = !SUPERVISION.includes(perfil.rol);
  const p = plan ? datos.data.planes.find(x => x.id === plan) : undefined;
  const abrirAccion = (a: Accion) => {
    setPlan(a.plan_id);
    setResaltar(a.id);
    setTimeout(() => {
      const el = document.getElementById('pmA-' + a.id);
      if (el) {
        el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        el.classList.add('pm-flash');
      }
    }, 60);
  };
  return (
    <>
      {p ? (
        <DetallePlan
          key={p.id}
          p={p}
          ctx={ctx}
          demo={demo}
          volver={() => setPlan(null)}
          resaltar={resaltar}
          quitarPlan={quitarPlan}
        />
      ) : propio ? (
        <MisAcciones ctx={ctx} depId={perfil.dependenciaId} abrirPlan={id => setPlan(id)} />
      ) : (
        <Resumen ctx={ctx} abrir={id => setPlan(id)} abrirAccion={abrirAccion} />
      )}
      {formularios}
      {historial && <Historial a={historial} ctx={ctx} demo={demo} alCerrar={() => setHistorial(null)} />}
    </>
  );
}
