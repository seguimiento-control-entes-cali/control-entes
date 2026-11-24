// Entes de control y Dependencias (2.x: vCatalog, catModal y saveCat de src/js/08-vistas-catalogos-y-seguridad.js).
// Mismo HTML y clases de la 2.x (toolbar, tbl-wrap, tbl, pill, field, err) para que se vea igual.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorDatos, type Dependencia, type Ente, type Perfil } from '../../datos/contratos';
import {
  CAMPOS_CATALOGO,
  COLUMNAS_CATALOGO,
  limpiarCatalogo,
  puedeEditarCatalogos,
  textoCelda,
  TIPOS_ENTE,
  TITULO_VENTANA,
  type TablaCatalogo
} from '../../dominio/catalogos';
import { pareceDocx } from '../../dominio/oficio-respuesta';
import { Aviso, Boton, Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

type Registro = Ente | Dependencia;
type Borrador = Record<string, string | boolean | number | undefined>;

const NUEVO: Record<TablaCatalogo, Borrador> = {
  entes: { nombre: '', sigla: '', tipo: TIPOS_ENTE[0], activo: true, titularNombre: '', titularCargo: '' },
  dependencias: {
    nombre: '',
    secretarioNombre: '',
    correo: '',
    telefono: '',
    activo: true,
    cargoRemitente: ''
  }
};

/** Plantilla de oficio de una dependencia (script 30): estado y botón para subirla o reemplazarla. */
function CeldaPlantilla({ dep, tiene, admin }: { dep: Dependencia; tiene: boolean; admin: boolean }) {
  const { catalogos } = useDatos();
  const cliente = useQueryClient();
  const avisar = useAvisos();
  const [subiendo, setSubiendo] = useState(false);
  const elegir = async (f: File | undefined) => {
    if (!f) return;
    const b = new Uint8Array(await f.arrayBuffer());
    if (!/\.docx$/i.test(f.name) || !pareceDocx(b))
      return avisar('Elija un documento de Word (.docx) con el membrete de la dependencia.', 'error');
    if (b.length > 5 * 1024 * 1024) return avisar('La plantilla supera 5 MB.', 'error');
    setSubiendo(true);
    try {
      await catalogos.subirPlantillaOficio(dep.id, f);
      avisar('Plantilla de ' + dep.nombre + ' guardada', 'ok');
      await cliente.invalidateQueries({ queryKey: ['plantillas-oficio'] });
    } catch (e) {
      avisar(e instanceof ErrorDatos ? e.message : 'No se pudo guardar la plantilla.', 'error');
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
      {tiene ? (
        <span className="pill verde" title="Tiene plantilla de oficio">
          <i aria-hidden="true" />
          SÍ
        </span>
      ) : (
        <span className="pill neutral" title="Sin plantilla de oficio">
          NO
        </span>
      )}
      {admin && (
        <label className="btn sm" style={{ cursor: subiendo ? 'wait' : 'pointer' }}>
          <Icono nombre="fa-file-word" />{' '}
          {subiendo ? 'Subiendo…' : tiene ? 'Reemplazar' : 'Plantilla de oficio'}
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label={'Plantilla de oficio de ' + dep.nombre}
            style={{ display: 'none' }}
            disabled={subiendo}
            onChange={e => {
              void elegir(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </span>
  );
}

export function PantallaCatalogo({ tabla, perfil }: { tabla: TablaCatalogo; perfil: Perfil }) {
  const { catalogos } = useDatos();
  const cliente = useQueryClient();
  const consulta = useQuery<Registro[]>({
    queryKey: [tabla],
    queryFn: () => (tabla === 'entes' ? catalogos.entes() : catalogos.dependencias())
  });
  const conPlantilla = useQuery({
    queryKey: ['plantillas-oficio'],
    queryFn: () => catalogos.dependenciasConPlantilla(),
    enabled: tabla === 'dependencias'
  });
  const [edicion, setEdicion] = useState<Borrador | null>(null);
  const admin = puedeEditarCatalogos(perfil.rol);

  if (consulta.isPending) return <p className="cargando">Cargando…</p>;
  if (consulta.isError) return <Aviso>No se pudo cargar la lista: {(consulta.error as Error).message}</Aviso>;
  const lista = consulta.data;
  const columnas = COLUMNAS_CATALOGO[tabla];

  return (
    <>
      <div className="toolbar">
        <span className="muted">{lista.length} registro(s)</span>
        <span className="spacer" />
        {admin && (
          <Boton icono="fa-plus" onClick={() => setEdicion({ ...NUEVO[tabla] })}>
            Agregar
          </Boton>
        )}
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columnas.map(([, t]) => (
                <th key={t} scope="col">
                  {t}
                </th>
              ))}
              {tabla === 'dependencias' && <th scope="col">Plantilla de oficio</th>}
              <th scope="col">Estado</th>
              <th scope="col" aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {lista.map(x => (
              <tr key={x.id}>
                {columnas.map(([c]) => (
                  <td key={c}>{textoCelda((x as unknown as Record<string, unknown>)[c])}</td>
                ))}
                {tabla === 'dependencias' && (
                  <td>
                    <CeldaPlantilla
                      dep={x as Dependencia}
                      tiene={(conPlantilla.data ?? []).includes(x.id)}
                      admin={admin}
                    />
                  </td>
                )}
                <td>
                  {x.activo === false ? (
                    <span className="pill neutral">INACTIVO</span>
                  ) : (
                    <span className="pill verde">
                      <i aria-hidden="true" />
                      ACTIVO
                    </span>
                  )}
                </td>
                <td className="right">
                  {admin && (
                    <button
                      type="button"
                      className="btn sm"
                      aria-label={'Editar ' + x.nombre}
                      onClick={() => setEdicion({ ...x })}
                    >
                      <Icono nombre="fa-pen" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edicion && (
        <VentanaCatalogo
          tabla={tabla}
          inicial={edicion}
          alCerrar={() => setEdicion(null)}
          alGuardar={async () => {
            setEdicion(null);
            await cliente.invalidateQueries({ queryKey: [tabla] });
          }}
        />
      )}
    </>
  );
}

function VentanaCatalogo({
  tabla,
  inicial,
  alCerrar,
  alGuardar
}: {
  tabla: TablaCatalogo;
  inicial: Borrador;
  alCerrar: () => void;
  alGuardar: () => Promise<void>;
}) {
  const { catalogos } = useDatos();
  const avisar = useAvisos();
  const [b, setB] = useState<Borrador>(inicial);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const editar = typeof inicial.id === 'number';

  const guardar = async () => {
    const r = limpiarCatalogo({ ...b, nombre: String(b.nombre ?? '') });
    if (!r.ok) return setError(r.error);
    setGuardando(true);
    try {
      if (tabla === 'entes')
        await catalogos.guardarEnte(r.valor as unknown as Omit<Ente, 'id'> & { id?: number });
      else
        await catalogos.guardarDependencia(r.valor as unknown as Omit<Dependencia, 'id'> & { id?: number });
      avisar('Guardado', 'ok');
      await alGuardar();
    } catch (e) {
      setError(e instanceof ErrorDatos ? e.message : 'No se pudo guardar. Intente de nuevo.');
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      titulo={TITULO_VENTANA(tabla, editar)}
      alCerrar={alCerrar}
      pie={
        <>
          <Boton variante="secundario" onClick={alCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            Guardar
          </Boton>
        </>
      }
    >
      {CAMPOS_CATALOGO[tabla].map(([c, etiqueta]) => (
        <div className="field" key={c}>
          <label htmlFor={'cat-' + c}>{etiqueta}</label>
          {c === 'tipo' ? (
            <select
              id="cat-tipo"
              value={String(b.tipo ?? '')}
              onChange={e => setB({ ...b, tipo: e.target.value })}
            >
              {TIPOS_ENTE.map(o => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              id={'cat-' + c}
              value={String(b[c] ?? '')}
              onChange={e => setB({ ...b, [c]: e.target.value })}
            />
          )}
        </div>
      ))}
      <div className="field">
        <label htmlFor="cat-activo">Estado</label>
        <select
          id="cat-activo"
          value={b.activo === false ? 'false' : 'true'}
          onChange={e => setB({ ...b, activo: e.target.value === 'true' })}
        >
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
      </div>
      {error && <div className="err">{error}</div>}
    </Modal>
  );
}
