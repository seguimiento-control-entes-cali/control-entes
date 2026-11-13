// Histórico de radicados (2.x: vHistorico, renderHist e histDetail de src/js/09-cumplimiento-e-historico.js y la
// acción histCsv de 18-acciones.js). Secretario y enlace ven solo su dependencia; la base lo exige además por RLS.
// Mismo HTML y clases de la 2.x (toolbar, tbl-wrap/tbl, pill, pager, modal con dl.kv).
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import type { Perfil } from '../../datos/contratos';
import {
  alcanceOrganismo,
  filasCsvHistorico,
  filtrarHistorico,
  formatoCorto,
  ocultarDatosPersonales,
  pildoraDe,
  POR_PAGINA,
  PILDORA_OPORTUNIDAD,
  textoRespondio,
  textoTardia,
  type FiltroHistorico,
  type RadicadoHistorico
} from '../../dominio/historico';
import { Aviso, Boton, Icono, Modal } from '../../shared/ui';
import { descargarCsv } from '../../shared/lib';
import { useDatos } from '../sesion/contexto';

const nf = (n: number) => n.toLocaleString('es-CO');
const INICIAL: FiltroHistorico = { q: '', vig: 'todas', ente: '', org: '', opo: '' };

export function PantallaHistorico({ perfil }: { perfil: Perfil }) {
  const { historico, catalogos } = useDatos();
  const datos = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const [f, setF] = useState<FiltroHistorico>(INICIAL);
  const [pagina, setPagina] = useState(0);
  const [detalle, setDetalle] = useState<RadicadoHistorico | null>(null);

  const nombreDep = deps.data?.find(d => d.id === perfil.dependenciaId)?.nombre ?? null;
  const propias = useMemo(() => {
    const filas = datos.data?.filas ?? [];
    const o = alcanceOrganismo(perfil.rol, nombreDep, filas);
    return o === null ? filas : filas.filter(r => r.org === o);
  }, [datos.data, perfil.rol, nombreDep]);
  const lista = useMemo(() => filtrarHistorico(propias, f), [propias, f]);
  const entes = useMemo(() => [...new Set(propias.map(r => r.ente))].sort(), [propias]);
  const orgs = useMemo(() => [...new Set(propias.map(r => r.org))].sort(), [propias]);

  if (datos.isPending || deps.isPending) return <p className="cargando">Cargando el histórico…</p>;
  if (datos.isError) return <Aviso>No se pudo cargar el histórico: {(datos.error as Error).message}</Aviso>;

  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const pag = Math.min(pagina, paginas - 1);
  const cambiar = (k: keyof FiltroHistorico, v: string) => {
    setF(x => ({ ...x, [k]: v }));
    setPagina(0);
  };
  const opcion = (arr: string[], todo: string) => [
    <option key="" value="">
      {todo}
    </option>,
    ...arr.map(x => (
      <option key={x} value={x}>
        {x}
      </option>
    ))
  ];

  return (
    <>
      <div className="toolbar">
        <div className="grow">
          <Icono nombre="fa-magnifying-glass" />
          <input
            aria-label="Buscar"
            placeholder="Buscar radicado del ente, ORFEO, asunto…"
            value={f.q}
            onChange={e => cambiar('q', e.target.value)}
          />
        </div>
        <select aria-label="Vigencia" value={f.vig} onChange={e => cambiar('vig', e.target.value)}>
          <option value="todas">Todas las vigencias</option>
          {[2026, 2025, 2024].map(y => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <select aria-label="Ente" value={f.ente} onChange={e => cambiar('ente', e.target.value)}>
          {opcion(entes, 'Todos los entes')}
        </select>
        <select aria-label="Organismo" value={f.org} onChange={e => cambiar('org', e.target.value)}>
          {opcion(orgs, 'Todos los organismos')}
        </select>
        <select aria-label="Estado" value={f.opo} onChange={e => cambiar('opo', e.target.value)}>
          <option value="">Todo estado</option>
          {PILDORA_OPORTUNIDAD.map((p, i) => (
            <option key={i} value={String(i)}>
              {p[1][0] + p[1].slice(1).toLowerCase()}
            </option>
          ))}
        </select>
        <Boton
          variante="secundario"
          icono="fa-file-csv"
          className="no-print"
          onClick={() => descargarCsv('historico_requerimientos.csv', filasCsvHistorico(lista))}
        >
          Exportar
        </Boton>
      </div>

      <div className="tbl-wrap">
        <table className="tbl" style={{ minWidth: 1180 }}>
          <caption className="solo-lector">Histórico de radicados</caption>
          <thead>
            <tr>
              <th scope="col">Vig.</th>
              <th scope="col">N.º radicación ente</th>
              <th scope="col">ORFEO entrada</th>
              <th scope="col">Organismo</th>
              <th scope="col" className="right">
                Término
              </th>
              <th scope="col">Fecha máx.</th>
              <th scope="col">Fecha resp.</th>
              <th scope="col">ORFEO respuesta</th>
              <th scope="col">¿Respondió?</th>
              <th scope="col">¿Tardía?</th>
              <th scope="col" className="right">
                Retraso
              </th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.length ? (
              lista.slice(pag * POR_PAGINA, (pag + 1) * POR_PAGINA).map(r => {
                const p = pildoraDe(r.opo);
                return (
                  <tr
                    key={r.i}
                    className="click"
                    tabIndex={0}
                    onClick={() => setDetalle(r)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') setDetalle(r);
                    }}
                  >
                    <td className="mono">{r.v}</td>
                    <td className="mono">{r.rad || '—'}</td>
                    <td className="mono" style={{ fontSize: '.76rem' }}>
                      {r.orfE || '—'}
                    </td>
                    <td style={{ minWidth: 210 }}>{r.org}</td>
                    <td className="right mono">{r.term == null ? '—' : r.term + ' d'}</td>
                    <td>{formatoCorto(r.fmax)}</td>
                    <td>{formatoCorto(r.fresp)}</td>
                    <td className="mono" style={{ fontSize: '.76rem' }}>
                      {r.orfR || '—'}
                    </td>
                    <td>{textoRespondio(r.resp)}</td>
                    <td>{textoTardia(r.opo)}</td>
                    <td className="right mono">{r.ret == null ? '—' : r.ret + ' d'}</td>
                    <td>
                      <span className={'pill ' + p[0]}>{p[1]}</span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={12}>
                  <div className="empty" role="status">
                    <Icono nombre="fa-inbox" />
                    Sin resultados
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="muted" style={{ marginRight: 'auto', fontSize: '.78rem' }}>
          {nf(lista.length)} de {nf(propias.length)} registros · corte de datos{' '}
          {formatoCorto(datos.data.corte)}
        </span>
        <Boton variante="secundario" className="sm" onClick={() => setPagina(Math.max(0, pag - 1))}>
          Anterior
        </Boton>
        <span className="mono">
          {pag + 1} / {paginas}
        </span>
        <Boton variante="secundario" className="sm" onClick={() => setPagina(Math.min(paginas - 1, pag + 1))}>
          Siguiente
        </Boton>
      </div>

      <Modal abierto={!!detalle} titulo={detalle?.rad || 'Sin número'} alCerrar={() => setDetalle(null)}>
        {detalle && <DetalleRadicado r={detalle} />}
      </Modal>
    </>
  );
}

/** Ventana de detalle de un radicado (histDetail de la 2.x); también la usa el Expediente de dependencia. */
export function DetalleRadicado({ r }: { r: RadicadoHistorico }) {
  const p = pildoraDe(r.opo);
  const fila = (t: string, v: ReactNode, mono = false) => (
    <div>
      <dt>{t}</dt>
      <dd className={mono ? 'mono' : undefined}>{v}</dd>
    </div>
  );
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <span className={'pill ' + p[0]}>{p[1]}</span>
      </div>
      <dl className="kv">
        {fila('Vigencia', r.v)}
        {fila('Ente de control', r.ente)}
        {fila('N.º radicación del ente', r.rad || '—', true)}
        {fila('ORFEO de entrada', r.orfE || '—', true)}
        {fila('Organismo responsable', r.org)}
        {fila('Asunto', ocultarDatosPersonales(r.asu) || '—')}
        {fila('Fecha de recibo', formatoCorto(r.rec))}
        {fila('Término', r.term == null ? '—' : r.term + ' días hábiles')}
        {fila('Fecha máxima de respuesta', formatoCorto(r.fmax))}
        {fila('Fecha de respuesta', formatoCorto(r.fresp))}
        {fila('ORFEO de la respuesta', r.orfR || '—', true)}
        {fila('Retraso', r.ret == null ? '—' : r.ret + ' días hábiles')}
        {fila('Días hábiles que tardó', r.tiem == null ? '—' : r.tiem)}
      </dl>
    </>
  );
}
