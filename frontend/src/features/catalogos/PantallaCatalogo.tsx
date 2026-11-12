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
import { Aviso, Boton, Icono, Modal, useAvisos } from '../../shared/ui';
import { useDatos } from '../sesion/contexto';

type Registro = Ente | Dependencia;
type Borrador = Record<string, string | boolean | number | undefined>;

const NUEVO: Record<TablaCatalogo, Borrador> = {
  entes: { nombre: '', sigla: '', tipo: TIPOS_ENTE[0], activo: true },
  dependencias: { nombre: '', secretarioNombre: '', correo: '', telefono: '', activo: true }
};

export function PantallaCatalogo({ tabla, perfil }: { tabla: TablaCatalogo; perfil: Perfil }) {
  const { catalogos } = useDatos();
  const cliente = useQueryClient();
  const consulta = useQuery<Registro[]>({
    queryKey: [tabla],
    queryFn: () => (tabla === 'entes' ? catalogos.entes() : catalogos.dependencias())
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
