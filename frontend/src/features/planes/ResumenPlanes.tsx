// Resúmenes de los planes para otras pantallas (2.x: pmResumenMando y pmSeccionInforme de
// src/js/19-planes-de-mejoramiento.js): la tarjeta del Centro de mando y la sección del Informe ejecutivo.
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { textoCorto } from '../../dominio/actividad';
import { nombreCorto } from '../../dominio/directorio';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto } from '../../dominio/historico';
import {
  ALERTA_DIAS,
  accionesEnEjecucion,
  conteos,
  estadoAccion,
  formatoDe,
  indicadores,
  pct,
  pctTxt
} from '../../dominio/planes';
import { useDatos } from '../sesion/contexto';

function usePlanes() {
  const { planes, catalogos } = useDatos();
  const datos = useQuery({ queryKey: ['planes'], queryFn: () => planes.datos() });
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const dep = (id: number | null | undefined) =>
    id == null ? '' : (deps.data?.find(x => x.id === id)?.nombre ?? '');
  return { datos, dep };
}

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

/** pmResumenMando: planes vigentes, cumplimiento, avance y alertas (solo supervisión ve el Centro de mando). */
export function TarjetaPlanesMando() {
  const { datos } = usePlanes();
  const ir = useNavigate();
  if (!datos.data) return null;
  const d = datos.data,
    hoy = fechaColombia(new Date());
  const activos = d.planes.filter(p => p.estado !== 'cerrado'),
    ids = new Set(activos.map(p => p.id)),
    acc = accionesEnEjecucion(
      d.acciones.filter(a => ids.has(a.plan_id)),
      d.planes
    ),
    cn = conteos(acc, hoy, d.avances),
    ind = indicadores(acc, hoy, d.avances),
    porVal = d.avances.filter(v => v.estado === 'reportado' && ids.has(v.plan_id)).length;
  const verPlanes = (
    <button type="button" className="btn sm" onClick={() => ir('/planes')}>
      {d.planes.length ? 'Ver planes' : 'Abrir planes'}
    </button>
  );
  if (!d.planes.length)
    return (
      <div className="card pm-mando">
        <div className="pm-mando-h">
          <div>
            <h3>Planes de mejoramiento</h3>
            <div className="sub" style={{ margin: '2px 0 0' }}>
              Aún no hay planes cargados. Cuando Control Interno los entregue, su cumplimiento aparecerá aquí.
            </div>
          </div>
          {verPlanes}
        </div>
      </div>
    );
  return (
    <div className="card pm-mando">
      <div className="pm-mando-h">
        <div>
          <h3>Planes de mejoramiento</h3>
          <div className="sub" style={{ margin: '2px 0 0' }}>
            {activos.length} plan{activos.length === 1 ? '' : 'es'} vigente{activos.length === 1 ? '' : 's'}{' '}
            con la Contraloría de Cali y la Contraloría General de la República
          </div>
        </div>
        {verPlanes}
      </div>
      <div className="pm-ind" style={{ margin: '12px 0' }}>
        <Medidor
          label="Cumplimiento de metas vencidas"
          v={ind.cpm}
          color="var(--sem-v)"
          hint={ind.cpm == null ? 'Aún no hay metas vencidas' : ''}
        />
        <Medidor label="Avance de los planes" v={ind.ap} color="var(--neo, #4c8dff)" />
      </div>
      <div className="pm-chips">
        <span className="pm-chip">{cn.n} acciones</span>
        {cn.cumplida > 0 && <span className="pm-chip g">{cn.cumplida} cumplidas</span>}
        {cn.vencida > 0 && <span className="pm-chip r">{cn.vencida} vencidas sin cumplir</span>}
        {cn.proxima > 0 && (
          <span className="pm-chip y">
            {cn.proxima} vencen en {ALERTA_DIAS} días
          </span>
        )}
        {porVal > 0 && <span className="pm-chip b">{porVal} avances por validar</span>}
      </div>
    </div>
  );
}

/** pmSeccionInforme: sección del Informe ejecutivo. `org` = la dependencia si el informe es de una sola. */
export function SeccionPlanesInforme({ org, num }: { org: string; num: number }) {
  const { datos, dep } = usePlanes();
  if (!datos.data || !datos.data.planes.length) return null;
  const d = datos.data,
    hoy = fechaColombia(new Date());
  const accOrg = (a: { dependencia_id: number | null }) => !org || dep(a.dependencia_id) === org;
  const planes = d.planes.filter(
    p => p.estado !== 'cerrado' && d.acciones.some(a => a.plan_id === p.id && accOrg(a))
  );
  if (!planes.length) return null;
  const venc = accionesEnEjecucion(d.acciones, d.planes)
    .filter(a => planes.some(p => p.id === a.plan_id) && accOrg(a) && estadoAccion(a, hoy).k === 'vencida')
    .sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)))
    .slice(0, 12);
  return (
    <div className="rsec">
      <h2>{num}. Planes de mejoramiento</h2>
      <div className="rsmall" style={{ marginBottom: 6 }}>
        Cumplimiento (CPM) y avance (AP) con las fórmulas del Formulario 14.1 de la Contraloría General de la
        República, solo con avances validados al {formatoCorto(hoy)}.
      </div>
      <table className="rt">
        <thead>
          <tr>
            <th>Contraloría</th>
            <th>Plan</th>
            <th>Suscrito</th>
            <th>Acciones</th>
            <th>Cumplidas</th>
            <th>Vencidas</th>
            <th>Cumplimiento</th>
            <th>Avance</th>
          </tr>
        </thead>
        <tbody>
          {planes.map(p => {
            const l = d.acciones.filter(a => a.plan_id === p.id && accOrg(a)),
              k = conteos(l, hoy, d.avances),
              i = indicadores(l, hoy, d.avances);
            return (
              <tr key={p.id}>
                <td>{formatoDe(p).corto}</td>
                <td>{textoCorto(p.ejercicio, 70)}</td>
                <td>{formatoCorto(p.fecha_suscripcion)}</td>
                <td style={{ textAlign: 'right' }}>{k.n}</td>
                <td style={{ textAlign: 'right' }}>{k.cumplida}</td>
                <td style={{ textAlign: 'right' }}>
                  <b>{k.vencida}</b>
                </td>
                <td style={{ textAlign: 'right' }}>{pctTxt(i.cpm)}</td>
                <td style={{ textAlign: 'right' }}>{pctTxt(i.ap)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {venc.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Acciones vencidas sin cumplir</h3>
          <table className="rt">
            <thead>
              <tr>
                <th>Dependencia</th>
                <th>Hallazgo</th>
                <th>Acción</th>
                <th>Terminaba</th>
                <th>Avance</th>
              </tr>
            </thead>
            <tbody>
              {venc.map(a => (
                <tr key={a.id}>
                  <td>{nombreCorto(dep(a.dependencia_id)) || '—'}</td>
                  <td>{d.hallazgos.find(h => h.id === a.hallazgo_id)?.numero ?? ''}</td>
                  <td>{textoCorto(a.accion, 80)}</td>
                  <td>{formatoCorto(a.fecha_fin)}</td>
                  <td style={{ textAlign: 'right' }}>{pctTxt(pct(a))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
