// Informe ejecutivo (2.x: vInforme, reportHtml, chBarsStack, chDonut, chTrend, chBarsH, logInforme y rpPdf de
// src/js/16-informe-ejecutivo.js, y la acción rpCsv de 18-acciones.js). Secretario y enlace ven el informe de su
// dependencia ("Informe de mi dependencia"). "Descargar PDF" registra el informe con su huella y abre la impresión.
// Mismo HTML y clases de la 2.x (toolbar, paper, rsec, rhead, rgrid, rk, rt, rsmall, rflow, rfoot).
// Pendiente para la pantalla de Planes: la sección de planes de mejoramiento (pmSeccionInforme).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { Perfil } from '../../datos/contratos';
import { formatoFechaHora, sha256Hex } from '../../dominio/auditoria';
import {
  colorSemaforo,
  dependenciasDelHistorico,
  type EstadisticasDependencia
} from '../../dominio/expediente';
import { porcentaje1, semaforoHistorico, UMBRALES } from '../../dominio/cumplimiento';
import { nombreCorto } from '../../dominio/directorio';
import { alcanceOrganismo, formatoCorto } from '../../dominio/historico';
import {
  archivoCsvInforme,
  filasCsvInforme,
  fondoSemaforo,
  modeloInforme,
  narrativa,
  nombrePdf,
  PALETA,
  textoHuella,
  textoSemaforo,
  vigenciasRegistro,
  type DependenciaInforme,
  type PuntoInforme
} from '../../dominio/informe';
import { nombrePlantilla } from '../../dominio/notificaciones';
import { descargarCsv } from '../../shared/lib';
import { Aviso, Icono, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import escudo from '../../../../src/assets/escudo.png';

const nf = (n: number) => n.toLocaleString('es-CO');
const dos = (n: number) => String(n).padStart(2, '0');

function BarrasApiladas({ lista }: { lista: DependenciaInforme[] }) {
  if (!lista.length) return null;
  const W = 700,
    LBL = 235,
    BAR = 330,
    RH = 26,
    H = lista.length * RH + 8,
    mx = Math.max(...lista.map(o => o.ev), 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: 'Arial,Helvetica,sans-serif' }}>
      {lista.map((o, i) => {
        const y = 4 + i * RH,
          k = BAR / mx,
          a = o.ok * k,
          b = o.tar * k,
          c = o.sin * k;
        return (
          <g key={o.name}>
            <text x={LBL - 8} y={y + 16} textAnchor="end" fontSize="10.5" fill={PALETA.ink}>
              {nombreCorto(o.name).slice(0, 38)}
            </text>
            <rect x={LBL} y={y + 4} width={a.toFixed(1)} height="15" fill={PALETA.ok} />
            <rect x={(LBL + a).toFixed(1)} y={y + 4} width={b.toFixed(1)} height="15" fill={PALETA.tar} />
            <rect x={(LBL + a + b).toFixed(1)} y={y + 4} width={c.toFixed(1)} height="15" fill={PALETA.sin} />
            <circle
              cx={LBL + BAR + 24}
              cy={y + 11.5}
              r="5"
              fill={colorSemaforo(o.sem)}
              stroke="#9aa5ab"
              strokeWidth=".6"
            />
            <text x={LBL + BAR + 36} y={y + 15} fontSize="10.5" fill={PALETA.ink}>
              {o.inc} · {porcentaje1(o.tasa)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Dona({
  partes,
  centro,
  sub
}: {
  partes: { v: number; color: string }[];
  centro: string;
  sub: string;
}) {
  const r = 54,
    C = 2 * Math.PI * r,
    tot = partes.reduce((s, p) => s + p.v, 0) || 1;
  let acc = 0;
  const arcos = partes
    .filter(p => p.v > 0)
    .map((p, i) => {
      const len = (C * p.v) / tot;
      const el = (
        <circle
          key={i}
          cx="70"
          cy="70"
          r={r}
          fill="none"
          stroke={p.color}
          strokeWidth="20"
          strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
          strokeDashoffset={(-acc).toFixed(2)}
          transform="rotate(-90 70 70)"
        />
      );
      acc += len;
      return el;
    });
  return (
    <svg viewBox="0 0 140 140" width="150" height="150" style={{ fontFamily: 'Arial,Helvetica,sans-serif' }}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#eef2f4" strokeWidth="20" />
      {arcos}
      <text x="70" y="69" textAnchor="middle" fontSize="22" fontWeight="700" fill={PALETA.ink}>
        {centro}
      </text>
      <text x="70" y="85" textAnchor="middle" fontSize="9" fill={PALETA.soft}>
        {sub}
      </text>
    </svg>
  );
}

function Tendencia({ pts }: { pts: PuntoInforme[] }) {
  const W = 700,
    H = 200,
    L = 36,
    R = 12,
    T = 14,
    B = 28,
    n = pts.length;
  if (n < 2)
    return <div style={{ color: '#5c6b73', padding: 14 }}>Sin datos suficientes para la tendencia.</div>;
  const xs = (i: number) => L + ((W - L - R) * i) / (n - 1),
    ys = (v: number) => T + (H - T - B) * (1 - Math.min(1, v)),
    y20 = ys(UMBRALES.verde_lt),
    y40 = ys(UMBRALES.rojo_ge);
  const linea = pts
    .map((p, i) => (p.v == null ? null : `${xs(i).toFixed(1)},${ys(p.v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  const paso = Math.ceil(n / 9);
  const et = (y: number, t: string) => (
    <text x="3" y={y + 3} fontSize="9" fill={PALETA.soft}>
      {t}
    </text>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ fontFamily: 'Arial,Helvetica,sans-serif' }}>
      <rect x={L} y={T} width={W - L - R} height={y40 - T} fill="#fdeef0" />
      <rect x={L} y={y20} width={W - L - R} height={H - B - y20} fill="#eef8f1" />
      <line x1={L} x2={W - R} y1={y40} y2={y40} stroke="#D21F3C" strokeDasharray="4 4" />
      <line x1={L} x2={W - R} y1={y20} y2={y20} stroke="#138A44" strokeDasharray="4 4" />
      {et(y40, '40%')}
      {et(y20, '20%')}
      {et(ys(1), '100%')}
      {et(ys(0), '0%')}
      <polyline points={linea} fill="none" stroke="#0B3D91" strokeWidth="2.2" strokeLinejoin="round" />
      {pts.map((p, i) =>
        p.v == null ? null : (
          <circle
            key={'p' + i}
            cx={xs(i).toFixed(1)}
            cy={ys(p.v).toFixed(1)}
            r="4.2"
            fill={colorSemaforo(semaforoHistorico(Math.max(p.ev, UMBRALES.min), p.v))}
            stroke="#fff"
            strokeWidth="1.4"
          />
        )
      )}
      {pts.map((p, i) =>
        i % paso === 0 ? (
          <text
            key={'t' + i}
            x={xs(i).toFixed(1)}
            y={H - 9}
            textAnchor="middle"
            fontSize="9"
            fill={PALETA.soft}
          >
            {p.short}
          </text>
        ) : null
      )}
    </svg>
  );
}

function BarrasEntes({ lista }: { lista: [string, number][] }) {
  if (!lista.length) return <div style={{ color: '#5c6b73' }}>Sin incumplimientos.</div>;
  const mx = lista[0]?.[1] ?? 1;
  return (
    <>
      {lista.map(([e, n]) => (
        <div key={e} style={{ margin: '0 0 7px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
            <span>{e}</span>
            <b>{n}</b>
          </div>
          <div style={{ height: 9, background: '#eef2f4', borderRadius: 5 }}>
            <div
              style={{ height: 9, width: (n * 100) / mx + '%', background: PALETA.blue, borderRadius: 5 }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

const Kpi = ({ l, v, c }: { l: string; v: string; c?: string }) => (
  <div className="rk">
    <span>{l}</span>
    <b style={{ color: c ?? PALETA.ink }}>{v}</b>
  </div>
);
const Leyenda = ({ c, t }: { c: string; t: string }) => (
  <span style={{ marginRight: 12 }}>
    <i
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        background: c,
        borderRadius: 2,
        marginRight: 5
      }}
    />
    {t}
  </span>
);
const colorTasa = (s: EstadisticasDependencia['sem']) =>
  s === 'rojo' ? '#b83a4b' : s === 'amarillo' ? '#b07d0a' : '#2e7d4f';

export function PantallaInforme({ perfil, demo = false }: { perfil: Perfil; demo?: boolean }) {
  const { historico, catalogos, actividad } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const datos = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const notifs = useQuery({
    queryKey: ['notificaciones'],
    queryFn: () => actividad.notificaciones().catch(() => [])
  });
  const [vig, setVig] = useState('todas');
  const [orgElegida, setOrgElegida] = useState('');
  const [casos, setCasos] = useState(true);

  const todas = useMemo(() => datos.data?.filas ?? [], [datos.data]);
  const corte = datos.data?.corte ?? '';
  const nombreDep = deps.data?.find(d => d.id === perfil.dependenciaId)?.nombre ?? null;
  const propia = alcanceOrganismo(perfil.rol, nombreDep, todas);
  const visibles = useMemo(
    () => (propia === null ? todas : todas.filter(r => r.org === propia)),
    [todas, propia]
  );
  const org = propia ?? orgElegida;
  const m = useMemo(
    () => modeloInforme(visibles, corte, { vig, org }, notifs.data ?? []),
    [visibles, corte, vig, org, notifs.data]
  );
  const huella = useMemo(() => sha256Hex(textoHuella(m.rows)), [m.rows]);

  if (datos.isPending || deps.isPending) return <p className="cargando">Cargando el informe…</p>;
  if (datos.isError) return <Aviso>No se pudo cargar el histórico: {(datos.error as Error).message}</Aviso>;
  if (!todas.length)
    return (
      <div className="card">
        <div className="empty">
          <Icono nombre="fa-database" />
          Aún no hay datos históricos cargados.
        </div>
      </div>
    );

  const ahora = new Date();
  const generado =
    formatoCorto(`${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`) +
    ' ' +
    dos(ahora.getHours()) +
    ':' +
    dos(ahora.getMinutes());
  const s = m.st,
    who = m.org || 'Todas las dependencias',
    per = vig === 'todas' ? '2024 - 2026' : vig;
  const nCasos = m.org ? 5 : 6;

  const pdf = async () => {
    try {
      await actividad.registrarInforme({
        alcance: m.org || 'Todas las dependencias',
        vigencias: vigenciasRegistro(vig),
        corte,
        n: m.rows.length,
        huella
      });
      void cliente.invalidateQueries({ queryKey: ['actividad'] });
    } catch (e) {
      avisar('El informe se generó pero no se pudo registrar: ' + (e as Error).message, 'error');
    }
    const t = document.title;
    document.title = nombrePdf(corte, m.org);
    const volver = () => {
      document.title = t;
      window.removeEventListener('afterprint', volver);
    };
    window.addEventListener('afterprint', volver);
    setTimeout(() => window.print(), 80);
    setTimeout(volver, 60000);
  };

  return (
    <>
      <div className="toolbar no-print">
        <select id="rpVig" aria-label="Vigencia" value={vig} onChange={e => setVig(e.target.value)}>
          <option value="todas">Todas las vigencias</option>
          {[2026, 2025, 2024].map(y => (
            <option key={y} value={String(y)}>
              Vigencia {y}
            </option>
          ))}
        </select>
        {propia === null && (
          <select
            id="rpOrg"
            aria-label="Dependencia"
            value={orgElegida}
            onChange={e => setOrgElegida(e.target.value)}
          >
            <option value="">Todas las dependencias</option>
            {dependenciasDelHistorico(todas).map(o => (
              <option key={o}>{o}</option>
            ))}
          </select>
        )}
        <label
          style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: '.82rem', color: 'var(--soft)' }}
        >
          <input
            type="checkbox"
            id="rpCasos"
            style={{ width: 'auto' }}
            checked={casos}
            onChange={e => setCasos(e.target.checked)}
          />{' '}
          Incluir casos críticos
        </label>
        <span className="spacer" />
        <button
          type="button"
          className="btn"
          onClick={() => descargarCsv(archivoCsvInforme(corte), filasCsvInforme(m.rows))}
        >
          <Icono nombre="fa-file-csv" /> Datos (CSV)
        </button>
        <button type="button" className="btn primary" onClick={() => void pdf()}>
          <Icono nombre="fa-file-pdf" /> Descargar PDF
        </button>
      </div>
      <div className="muted no-print" style={{ fontSize: '.78rem', margin: '-4px 0 12px' }}>
        Al pulsar Descargar PDF se abre el cuadro de impresión: elige &quot;Guardar como PDF&quot; como
        destino. El informe queda registrado con su huella de verificación.
      </div>
      <div className="paper" id="paper">
        {demo && (
          <div
            style={{
              background: '#fdecbd',
              border: '1px solid #e9c46a',
              borderRadius: 6,
              padding: '6px 10px',
              marginBottom: 10,
              fontSize: '10.5px',
              color: '#7a5210'
            }}
          >
            <b>DATOS DE EJEMPLO</b>: este informe es una demostración y sus cifras no corresponden a la
            realidad.
          </div>
        )}
        <div className="rsec rhead">
          <img src={escudo} alt="" style={{ height: 64 }} />
          <div style={{ flex: 1 }}>
            <div className="rsmall">ALCALDÍA DE SANTIAGO DE CALI · DESPACHO DEL ALCALDE</div>
            <h1>Informe ejecutivo de cumplimiento frente a los entes de control</h1>
            <div className="rsmall">
              {who} · Vigencia {per} · Corte de datos {formatoCorto(m.corte)}
            </div>
          </div>
        </div>
        <div className="rsec">
          <h2>1. Resumen ejecutivo</h2>
          <div className="rgrid">
            <Kpi l="Evaluados" v={nf(s.ev)} />
            <Kpi l="A tiempo" v={nf(s.ok)} c="#2e7d4f" />
            <Kpi l="Respondidos tarde" v={nf(s.tar)} c="#b07d0a" />
            <Kpi l="Sin respuesta" v={nf(s.sin)} c="#b83a4b" />
            <Kpi l="Incumplimiento" v={porcentaje1(s.tasa)} c={colorTasa(s.sem)} />
          </div>
          {narrativa(m, vig).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="rsec">
          <h2>2. Oportunidad de respuesta{m.org ? '' : ' y semáforo de dependencias'}</h2>
          <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <Dona
                partes={[
                  { v: s.ok, color: PALETA.ok },
                  { v: s.tar, color: PALETA.tar },
                  { v: s.sin, color: PALETA.sin }
                ]}
                centro={s.ev ? Math.round((s.ok * 100) / s.ev) + '%' : '—'}
                sub="a tiempo"
              />
              <div className="rsmall">Oportunidad</div>
            </div>
            {!m.org && (
              <div style={{ textAlign: 'center' }}>
                <Dona
                  partes={[
                    { v: m.semCount.verde, color: '#4FB57C' },
                    { v: m.semCount.amarillo, color: '#F2B230' },
                    { v: m.semCount.rojo, color: '#E0566B' },
                    { v: m.semCount.muestra, color: '#d5dade' }
                  ]}
                  centro={String(m.orgs.length)}
                  sub="dependencias"
                />
                <div className="rsmall">Semáforo</div>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              <Leyenda c={PALETA.ok} t="A tiempo" />
              <Leyenda c={PALETA.tar} t="Tarde" />
              <Leyenda c={PALETA.sin} t="Sin respuesta vencida" />
              <div style={{ marginTop: 8 }} className="rsmall">
                Semáforo: verde si el incumplimiento es menor a {UMBRALES.verde_lt * 100}%, rojo desde{' '}
                {UMBRALES.rojo_ge * 100}%, amarillo entre ambos. Se califica con mínimo {UMBRALES.min} casos
                evaluados.
              </div>
              {!m.org && (
                <div style={{ marginTop: 8 }}>
                  <Leyenda c="#E0566B" t={'Rojo: ' + m.semCount.rojo} />
                  <Leyenda c="#F2B230" t={'Amarillo: ' + m.semCount.amarillo} />
                  <Leyenda c="#4FB57C" t={'Verde: ' + m.semCount.verde} />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="rsec">
          <h2>3. Tendencia mensual de incumplimiento</h2>
          <div className="rsmall">
            Por mes de vencimiento del requerimiento. Líneas punteadas: umbrales del semáforo.
          </div>
          <Tendencia pts={m.pts} />
        </div>
        {!m.org && (
          <>
            <div className="rsec">
              <h2>4. Cumplimiento por dependencia</h2>
              <div className="rsmall" style={{ marginBottom: 6 }}>
                Ordenado de mayor a menor número de incumplimientos. A la derecha: incumplimientos ·
                porcentaje.
              </div>
              <BarrasApiladas lista={m.orgs.slice(0, 18)} />
            </div>
            <div className="rsec rflow">
              <h3 style={{ marginTop: 0 }}>Detalle por dependencia</h3>
              <table className="rt">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Dependencia</th>
                    <th>Evaluados</th>
                    <th>A tiempo</th>
                    <th>Tarde</th>
                    <th>Sin resp.</th>
                    <th>Incumpl.</th>
                    <th>%</th>
                    <th>Semáforo</th>
                  </tr>
                </thead>
                <tbody>
                  {m.orgs.map((o, i) => (
                    <tr key={o.name}>
                      <td>{i + 1}</td>
                      <td>{o.name}</td>
                      <td>{o.ev}</td>
                      <td>{o.ok}</td>
                      <td>{o.tar}</td>
                      <td>{o.sin}</td>
                      <td>
                        <b>{o.inc}</b>
                      </td>
                      <td>{porcentaje1(o.tasa)}</td>
                      <td style={{ background: fondoSemaforo(o.sem), fontWeight: 700, textAlign: 'center' }}>
                        {textoSemaforo(o.sem)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="rsec">
          <h2>{m.org ? '4' : '5'}. Entes de control con más incumplimientos</h2>
          <BarrasEntes lista={m.entes} />
        </div>
        {casos && (
          <div className="rsec">
            <h2>{nCasos}. Casos críticos: mayor retraso sin respuesta registrada</h2>
            <div className="rsmall" style={{ marginBottom: 6 }}>
              Se omite el asunto para proteger datos personales. Los casos de vigencias anteriores pueden
              haberse respondido sin actualizar el registro: confirmar con la dependencia.
            </div>
            <table className="rt">
              <thead>
                <tr>
                  <th>Dependencia</th>
                  <th>Ente de control</th>
                  <th>Radicado del ente</th>
                  <th>Vig.</th>
                  <th>Fecha máx.</th>
                  <th>Retraso (días háb.)</th>
                </tr>
              </thead>
              <tbody>
                {m.critical.length ? (
                  m.critical.map(r => (
                    <tr key={r.i}>
                      <td>{nombreCorto(r.org)}</td>
                      <td>{r.ente}</td>
                      <td>{r.rad || 'sin número'}</td>
                      <td>{r.v}</td>
                      <td>{formatoCorto(r.fmax)}</td>
                      <td style={{ textAlign: 'right' }}>{r.ret == null ? '—' : r.ret}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>No hay requerimientos sin respuesta registrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {m.nots.length > 0 && (
          <div className="rsec">
            <h2>Notificaciones enviadas</h2>
            <table className="rt">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Dependencia</th>
                  <th>Destinatario</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {m.nots.map((n, i) => (
                  <tr key={i}>
                    <td>{formatoFechaHora(n.ts)}</td>
                    <td>{nombreCorto(n.org)}</td>
                    <td>{n.nombre || '—'}</td>
                    <td>{nombrePlantilla(n.tpl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="rsec">
          <h2>Metodología y notas</h2>
          <ul className="rsmall" style={{ margin: 0, paddingLeft: 16, lineHeight: 1.55 }}>
            <li>
              Fuente: Control de Requerimientos de Entes de Control (Excel consolidados 2024-2026). Corte de
              datos: {formatoCorto(m.corte)}.
            </li>
            <li>
              Respuesta tardía: la fecha de respuesta es posterior a la fecha máxima del requerimiento. Los
              retrasos se miden en días hábiles (festivos de Colombia).
            </li>
            <li>
              Sin respuesta vencida: no hay fecha ni radicado ORFEO de respuesta y la fecha máxima es anterior
              al corte.
            </li>
            <li>
              Incumplimiento = respuestas tardías + sin respuesta vencidas, sobre el total evaluado (a tiempo
              + tardías + sin respuesta vencidas).
            </li>
            <li>
              Si un ente concedió prórroga y no se actualizó la fecha máxima en el Excel de origen, la
              respuesta aparece como tardía.
            </li>
          </ul>
        </div>
        <div className="rsec rfoot">
          Generado el {generado} por {perfil.correo}. Registros considerados: {nf(m.rows.length)}.
          <br />
          Huella de verificación SHA-256 de los datos:{' '}
          <span style={{ fontFamily: "'Courier New',monospace", fontSize: '9.5px', wordBreak: 'break-all' }}>
            {huella}
          </span>
        </div>
      </div>
    </>
  );
}
