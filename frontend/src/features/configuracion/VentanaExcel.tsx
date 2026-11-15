// Ventana "Cargar Excel de control" (2.x: ceAbrir, ceLeerArchivos, ceVistaPrevia, ceDescargarCalidad, ceGuardar y
// ceResultado de src/js/20-carga-excel.js). Solo el Super administrador. Nada se guarda hasta que se confirma.
// Mismo HTML y clases (pm-drop, pm-imp-k, ce-vig, ce-num, ce-tipos, pm-note, ce-res).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ResultadoCargaExcel } from '../../datos/contratos';
import {
  archivoCalidad,
  clasificar,
  compararConCargado,
  corteDeCarga,
  esProblemaGrave,
  esProblemaRojo,
  filasCsvCalidad,
  leerLibro,
  type FilaCalidad,
  type FilaHistorico,
  type Libro,
  type ResumenVigencia
} from '../../dominio/excel-control/lectura';
import { fechaColombia } from '../../dominio/fechas';
import { formatoCorto, NOMBRE_OPORTUNIDAD } from '../../dominio/historico';
import { descargarCsv } from '../../shared/lib';
import { Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';
import { leerArchivoExcel } from './leer-excel';

const nf = (n: number) => n.toLocaleString('es-CO');

interface Lectura {
  libros: Libro[];
  vigs: number[];
  corte: string;
  filas: FilaHistorico[];
  calidad: FilaCalidad[];
  resumenes: ResumenVigencia[];
}

function Resultado({ l, res, alCerrar }: { l: Lectura; res: ResultadoCargaExcel; alCerrar: () => void }) {
  const filas = (
    [
      ['Registros cargados', nf(res.registros)],
      res.abiertos_nuevos != null
        ? ['Casos abiertos nuevos en "Cargar respuesta ORFEO"', nf(res.abiertos_nuevos)]
        : null,
      res.abiertos_retirados != null
        ? ['Casos que el Excel ya trae respondidos y salieron de pendientes', nf(res.abiertos_retirados)]
        : null,
      res.abiertos_conservados_con_escalamiento
        ? [
            'Casos ya respondidos en el Excel que siguen en pendientes porque tienen escalamientos registrados (ciérrelos en "Cargar respuesta ORFEO")',
            nf(res.abiertos_conservados_con_escalamiento)
          ]
        : null,
      res.respuestas_app_sin_caso
        ? [
            'Respuestas registradas en la app cuyo caso cambió en el Excel (radicado u organismo distinto)',
            nf(res.respuestas_app_sin_caso)
          ]
        : null
    ] as ([string, string] | null)[]
  ).filter((x): x is [string, string] => x !== null);
  return (
    <Modal
      abierto
      titulo="Excel cargado"
      alCerrar={alCerrar}
      pie={
        <button type="button" className="btn primary" onClick={alCerrar}>
          Listo
        </button>
      }
    >
      <div className={'pm-note ' + (res.demo ? 'y' : 'b')} style={{ margin: '0 0 12px' }}>
        {res.demo
          ? 'Modo demostración: la carga se aplicó solo en este navegador y no se guardó en la base de datos.'
          : 'La vigencia ' +
            l.vigs.join(' y ') +
            ' quedó actualizada con corte al ' +
            formatoCorto(l.corte) +
            '. La carga quedó registrada en la auditoría.'}
      </div>
      <div className="ce-res">
        {filas.map(([a, b]) => (
          <div key={a}>
            <span>{a}</span>
            <b className="mono">{b}</b>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function VentanaExcel({ alCerrar }: { alCerrar: () => void }) {
  const { historico } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const hist = useQuery({
    queryKey: ['historico'],
    queryFn: () => historico.radicados(),
    staleTime: 5 * 60_000
  });
  const [leyendo, setLeyendo] = useState(0);
  const [error, setError] = useState('');
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{ l: Lectura; res: ResultadoCargaExcel } | null>(null);

  const leer = async (files: File[]) => {
    if (!files.length) return;
    setLeyendo(files.length);
    setError('');
    setLectura(null);
    try {
      const libros: Libro[] = [];
      for (const f of files) libros.push(leerLibro(await leerArchivoExcel(await f.arrayBuffer()), f.name));
      const vigs = libros.map(l => l.vigencia);
      const dup = vigs.find((v, i) => vigs.indexOf(v) !== i);
      if (dup) throw new Error('Eligió dos archivos de la vigencia ' + dup + '. Deje solo el más reciente.');
      const registros = libros.flatMap(l => l.registros);
      // Corte: lo más reciente de los archivos o de lo ya cargado (una vigencia antigua se mide hasta la misma fecha
      // que el resto), nunca posterior a hoy
      const corte = corteDeCarga(registros, hist.data?.corte ?? '', fechaColombia(new Date()));
      const { filas, calidad } = clasificar(registros, corte);
      const resumenes = compararConCargado(libros, filas, hist.data?.filas ?? [], NOMBRE_OPORTUNIDAD);
      setLectura({ libros, vigs, corte, filas, calidad, resumenes });
    } catch (e) {
      setError((e as Error).message);
    }
    setLeyendo(0);
  };

  const guardar = async () => {
    const R = lectura;
    if (!R || cargando) return;
    if (
      !window.confirm(
        `¿Reemplazar la${R.vigs.length > 1 ? 's vigencias' : ' vigencia'} ${R.vigs.join(' y ')} con ${nf(R.filas.length)} registros del Excel?`
      )
    )
      return;
    setCargando(true);
    try {
      const res = await historico.cargarVigencias({
        vigencias: R.vigs,
        archivos: R.libros.map(l => l.archivo),
        corte: R.corte,
        filas: R.filas
      });
      await Promise.all(
        [['historico'], ['requerimientos'], ['cargas-excel'], ['auditoria']].map(k =>
          cliente.invalidateQueries({ queryKey: k })
        )
      );
      setResultado({ l: R, res });
    } catch (e) {
      avisar((e as Error).message, 'error');
      setCargando(false);
    }
  };

  if (resultado) return <Resultado l={resultado.l} res={resultado.res} alCerrar={alCerrar} />;

  const R = lectura;
  const porTipo: Record<string, number> = {};
  const sinClas: Record<string, number> = {};
  if (R) {
    for (const q of R.calidad) porTipo[q.tipo] = (porTipo[q.tipo] ?? 0) + 1;
    for (const f of R.filas)
      if (f.tipo_organismo === 'Sin clasificar') sinClas[f.organismo] = (sinClas[f.organismo] ?? 0) + 1;
  }
  const graves = R ? R.calidad.filter(q => esProblemaGrave(q.tipo)).length : 0;

  return (
    <Modal
      abierto
      ancha
      titulo="Cargar Excel de control"
      alCerrar={alCerrar}
      pie={
        <>
          <button type="button" className="btn" onClick={alCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            id="ceBtn"
            disabled={!R || cargando}
            onClick={() => void guardar()}
          >
            <Icono nombre={cargando ? 'fa-spinner fa-spin' : 'fa-database'} />{' '}
            {cargando
              ? 'Cargando…'
              : R
                ? `Cargar vigencia${R.vigs.length > 1 ? 's' : ''} ${R.vigs.join(' y ')}`
                : 'Cargar'}
          </button>
        </>
      }
    >
      <div className="pm-drop">
        <Icono nombre="fa-file-excel" />
        <b>Seleccione el Excel de control de la vigencia</b>
        <div className="muted">
          Puede elegir uno o varios archivos (por ejemplo, 2025 y 2026). La app lee las hojas CONTROL y NO
          RESPUESTA, le muestra qué cambia frente a lo que ya está cargado y las filas con problemas. Nada se
          guarda hasta que usted confirme.
        </div>
        <input
          type="file"
          id="ceFile"
          aria-label="Excel de control"
          multiple
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={e => void leer([...(e.target.files ?? [])])}
        />
      </div>
      <div id="ceOut">
        {leyendo > 0 && (
          <div className="empty">
            <Icono nombre="fa-spinner fa-spin" />
            Leyendo {leyendo} archivo(s)…
          </div>
        )}
        {error && (
          <div className="pm-note r" role="alert">
            <Icono nombre="fa-circle-exclamation" /> {error}
          </div>
        )}
        {R && (
          <>
            <div className="pm-imp-k">
              <span className="pm-chip">Corte de datos: {formatoCorto(R.corte)}</span>
              <span className="pm-chip">{R.filas.length} registros leídos</span>
              {R.calidad.length ? (
                <span className="pm-chip y">{R.calidad.length} filas para revisar</span>
              ) : (
                <span className="pm-chip g">Sin filas con problemas</span>
              )}
            </div>
            {R.resumenes.map(s => (
              <div key={s.vigencia} className="ce-vig">
                <div className="ce-vig-h">
                  <b>Vigencia {s.vigencia}</b>
                  <span className="muted">{s.archivo}</span>
                </div>
                <div className="ce-num">
                  <div>
                    <small>Registros</small>
                    <b>{nf(s.n)}</b>
                    <span>
                      {s.ctl} de CONTROL{s.nr ? ' y ' + s.nr + ' de NO RESPUESTA' : ''}
                    </span>
                  </div>
                  <div>
                    <small>Ya cargados</small>
                    <b>{nf(s.hay)}</b>
                    <span>{s.hay ? 'se reemplazan' : 'vigencia nueva'}</span>
                  </div>
                  <div>
                    <small>Nuevos</small>
                    <b>{nf(s.nuevos)}</b>
                    <span>no estaban en la app</span>
                  </div>
                  <div>
                    <small>Cambian de estado</small>
                    <b>{nf(s.cambian)}</b>
                    <span>por ejemplo, ya respondidos</span>
                  </div>
                  <div>
                    <small>Ya no aparecen</small>
                    <b className={s.salen ? 'ce-ojo' : ''}>{nf(s.salen)}</b>
                    <span>{s.salen ? 'revise si se borraron filas o cambió el radicado' : 'ninguno'}</span>
                  </div>
                  <div>
                    <small>Abiertos</small>
                    <b>{nf(s.abN)}</b>
                    <span>antes {nf(s.abA)}</span>
                  </div>
                </div>
              </div>
            ))}
            {Object.keys(sinClas).length > 0 && (
              <div className="pm-note y">
                <b>Organismos que no se reconocieron ({Object.keys(sinClas).length}).</b> Se cargan con el
                texto del Excel y no cuentan en el semáforo de ninguna dependencia. Corrija el nombre en el
                Excel si es un error de digitación.
                <ul>
                  {Object.entries(sinClas)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12)
                    .map(([o, n]) => (
                      <li key={o}>
                        {o} <span className="muted">({n})</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {R.calidad.length > 0 && (
              <div className="field" style={{ marginTop: 12 }}>
                <label>Filas para revisar en el Excel</label>
                <div className="ce-tipos">
                  {Object.entries(porTipo)
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, n]) => (
                      <span key={t} className={'pm-chip ' + (esProblemaRojo(t) ? 'r' : '')}>
                        {t}: {n}
                      </span>
                    ))}
                </div>
                <div className="hint">
                  No impiden la carga: se aplican las mismas reglas de siempre (por ejemplo, una fecha
                  ilegible no se puede medir). Descargue la lista para corregirlas en el Excel.
                </div>
                <button
                  type="button"
                  className="btn sm"
                  style={{ marginTop: 8 }}
                  onClick={() => descargarCsv(archivoCalidad(R.vigs), filasCsvCalidad(R.calidad))}
                >
                  <Icono nombre="fa-file-csv" /> Descargar filas para revisar
                </button>
              </div>
            )}
            {graves > 0 && (
              <div className="hint" style={{ marginTop: 6 }}>
                {graves} filas tienen fechas ilegibles u organismo vacío.
              </div>
            )}
            <div className="pm-note b" style={{ marginTop: 12 }}>
              Al cargar se <b>reemplaza</b> la{R.vigs.length > 1 ? 's vigencias' : ' vigencia'}{' '}
              {R.vigs.join(' y ')} con lo que trae el Excel. Las respuestas registradas en la app con radicado
              ORFEO y PDF se conservan. Los casos abiertos nuevos pasan a &quot;Cargar respuesta ORFEO&quot;.
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
