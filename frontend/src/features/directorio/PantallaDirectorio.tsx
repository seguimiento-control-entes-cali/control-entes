// Directorio del gabinete (2.x: src/js/15-directorio.js y las acciones dirSave, dirAdd y dirCsv de 18-acciones.js).
// Un responsable por dependencia, con nombre completo, celular de WhatsApp y correo institucional. Editan solo el
// Super administrador y el Despacho; la base lo exige además por RLS (políticas dir_ins y dir_upd).
// Mismo HTML y clases de la 2.x (g-kpi, warn-card, toolbar, dir-list, dir-row…) para que se vea igual.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { ErrorDatos, type Perfil } from '../../datos/contratos';
import {
  cargoPorNivel,
  claveOrganismo,
  ETIQUETA_ESTADO,
  filasCsvDirectorio,
  filtrarFilas,
  formatoCelular,
  nombreCorto,
  normalizarCelular,
  organismosPrincipales,
  puedeEditarDirectorio,
  resumirDirectorio,
  validarResponsable,
  type FilaDirectorio,
  type FiltroDirectorio,
  type Responsable
} from '../../dominio/directorio';
import { Aviso, Boton, Icono, Kpi, Pildora, useAvisos, Vacio } from '../../shared/ui';
import { descargarCsv } from '../../shared/lib';
import { useDatos } from '../sesion/contexto';

export function PantallaDirectorio({ perfil }: { perfil: Perfil }) {
  const { directorio } = useDatos();
  const cliente = useQueryClient();
  const organismos = useQuery({ queryKey: ['organismos'], queryFn: () => directorio.organismos() });
  const responsables = useQuery({ queryKey: ['directorio'], queryFn: () => directorio.responsables() });
  // Responsables agregados en pantalla que aún no se han guardado ("Agregar responsable")
  const [nuevos, setNuevos] = useState<Responsable[]>([]);
  const [texto, setTexto] = useState('');
  const [filtro, setFiltro] = useState<FiltroDirectorio>('todos');
  const editar = puedeEditarDirectorio(perfil.rol);

  const niveles = useMemo(
    () => new Map((organismos.data ?? []).map(o => [o.nombre, o.nivel] as const)),
    [organismos.data]
  );
  const principales = useMemo(() => organismosPrincipales(organismos.data ?? []), [organismos.data]);
  const lista = useMemo(() => [...(responsables.data ?? []), ...nuevos], [responsables.data, nuevos]);
  const resumen = useMemo(() => resumirDirectorio(principales, lista), [principales, lista]);

  if (organismos.isPending || responsables.isPending)
    return <p className="cargando">Cargando el directorio…</p>;
  if (organismos.isError || responsables.isError)
    return (
      <Aviso>
        No se pudo cargar el directorio:{' '}
        {((organismos.error ?? responsables.error) as Error | null)?.message ?? 'error desconocido'}
      </Aviso>
    );

  const visibles = filtrarFilas(resumen.filas, texto, filtro);
  const agregar = (organismo: string) => {
    const cargo = cargoPorNivel(niveles.get(organismo) ?? '');
    if (!lista.some(x => claveOrganismo(x.organismo) === claveOrganismo(organismo) && x.cargo === cargo))
      setNuevos(n => [...n, { organismo, cargo, nombre: '', telefono: '', correo: '' }]);
    setTexto('');
    setFiltro('todos');
  };
  const guardado = async () => {
    setNuevos([]);
    await cliente.invalidateQueries({ queryKey: ['directorio'] });
  };

  return (
    <>
      <div className="grid g-kpi" style={{ marginBottom: 14 }}>
        <Kpi tono="verde" etiqueta="Listas para WhatsApp" valor={resumen.listas} de={resumen.total} />
        <Kpi tono="amarillo" etiqueta="Falta nombre o celular" valor={resumen.incompletas} />
        <Kpi tono="rojo" etiqueta="Sin responsable" valor={resumen.sinResponsable} />
        <Kpi
          tono={resumen.huerfanos.length || resumen.duplicados.length ? 'rojo' : undefined}
          etiqueta="Inconsistencias"
          valor={resumen.huerfanos.length + resumen.duplicados.length}
        />
      </div>

      {(resumen.huerfanos.length > 0 || resumen.duplicados.length > 0) && (
        <div className="card warn-card" style={{ marginBottom: 14 }}>
          <h3>
            <Icono nombre="fa-triangle-exclamation" /> Revisa antes de notificar
          </h3>
          {resumen.huerfanos.length > 0 && (
            <>
              <div className="sub" style={{ margin: '6px 0' }}>
                Estos registros del directorio no corresponden a ninguna dependencia, por eso no se usarán
                para WhatsApp. Corrige el nombre del organismo en Supabase para que coincida exactamente:
              </div>
              {resumen.huerfanos.map(h => (
                <div className="list-row" key={h.organismo + h.cargo}>
                  <div className="grow">
                    <b>{h.organismo}</b>
                    <small>
                      {h.cargo} · {h.nombre || 'sin nombre'}
                    </small>
                  </div>
                </div>
              ))}
            </>
          )}
          {resumen.duplicados.length > 0 && (
            <>
              <div className="sub" style={{ margin: '10px 0 6px' }}>
                El mismo celular está asignado a más de un responsable:
              </div>
              {resumen.duplicados.map(d => (
                <div className="list-row" key={d.celular}>
                  <div className="grow">
                    <b className="mono">{formatoCelular(d.celular)}</b>
                    <small>{d.organismos.map(nombreCorto).join(' · ')}</small>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="toolbar">
        <div className="grow">
          <Icono nombre="fa-magnifying-glass" />
          <input
            aria-label="Buscar"
            placeholder="Buscar dependencia, nombre o cargo"
            value={texto}
            onChange={e => setTexto(e.target.value)}
          />
        </div>
        <select
          aria-label="Mostrar"
          value={filtro}
          onChange={e => setFiltro(e.target.value as FiltroDirectorio)}
        >
          <option value="todos">Todas</option>
          <option value="pend">Pendientes por completar</option>
          <option value="ok">Listas para WhatsApp</option>
          <option value="sin">Sin responsable</option>
        </select>
        <Boton
          variante="secundario"
          icono="fa-file-csv"
          className="no-print"
          onClick={() => descargarCsv('directorio_gabinete.csv', filasCsvDirectorio(lista))}
        >
          Exportar
        </Boton>
      </div>

      <div className="dir-list">
        {visibles.length ? (
          visibles.map(f =>
            f.responsable ? (
              <FilaResponsable
                key={f.organismo + '|' + f.responsable.cargo + '|' + f.indice}
                fila={f}
                lista={lista}
                editar={editar}
                alGuardar={guardado}
              />
            ) : (
              <div key={f.organismo} className="dir-row card">
                <div className="dir-h">
                  <div>
                    <b className="dir-org">{f.organismo}</b>
                    <Pildora tono="rojo" texto="Sin responsable" />
                  </div>
                  {editar && (
                    <Boton className="sm" icono="fa-user-plus" onClick={() => agregar(f.organismo)}>
                      Agregar responsable
                    </Boton>
                  )}
                </div>
              </div>
            )
          )
        ) : (
          <div className="card">
            <Vacio titulo="Ninguna dependencia coincide con la búsqueda" />
          </div>
        )}
      </div>
      <div className="muted" style={{ marginTop: 12, fontSize: '.78rem' }}>
        Solo secretarios y directores (no subsecretarios, asesores ni jefes de oficina). Cada responsable
        queda amarrado a su dependencia: el nombre del organismo no se escribe a mano, se toma de la lista
        oficial. El celular debe tener 10 dígitos e iniciar en 3, y el nombre debe ir completo (nombres y
        apellidos) para que el saludo del mensaje salga correcto.
      </div>
    </>
  );
}

function FilaResponsable({
  fila,
  lista,
  editar,
  alGuardar
}: {
  fila: FilaDirectorio;
  lista: readonly Responsable[];
  editar: boolean;
  alGuardar: () => Promise<void>;
}) {
  const r = fila.responsable as Responsable;
  const { directorio } = useDatos();
  const avisar = useAvisos();
  const celular = normalizarCelular(r.telefono);
  const [v, setV] = useState({
    cargo: r.cargo,
    nombre: r.nombre,
    telefono: celular ? celular.slice(2) : r.telefono,
    correo: r.correo
  });
  const [ocupado, setOcupado] = useState(false);
  const id = (k: string) => `dir-${fila.indice}-${k}`;
  const etiqueta = ETIQUETA_ESTADO[fila.estado];

  async function guardar(e: FormEvent) {
    e.preventDefault();
    const res = validarResponsable(v, r, fila.indice, lista);
    if ('error' in res) return avisar(res.error, 'error');
    setOcupado(true);
    try {
      await directorio.guardar(res.fila);
      avisar('Directorio actualizado', 'ok');
      await alGuardar();
    } catch (err) {
      avisar(err instanceof ErrorDatos ? err.message : 'No se pudo guardar. Intente de nuevo.', 'error');
    } finally {
      setOcupado(false);
    }
  }

  const campo = (k: keyof typeof v, titulo: string, extra: { mono?: boolean; placeholder?: string } = {}) => (
    <div className="field">
      <label htmlFor={id(k)}>{titulo}</label>
      {editar ? (
        <input
          id={id(k)}
          className={extra.mono ? 'mono' : undefined}
          placeholder={extra.placeholder}
          inputMode={k === 'telefono' ? 'tel' : k === 'correo' ? 'email' : undefined}
          autoComplete="off"
          value={v[k]}
          onChange={e => setV(s => ({ ...s, [k]: e.target.value }))}
        />
      ) : (
        <div id={id(k)} className={'ro' + (extra.mono ? ' mono' : '')}>
          {k === 'telefono' ? formatoCelular(celular) : r[k] || '—'}
        </div>
      )}
      {k === 'correo' && !r.correo && (
        <div className="hint err">Sin correo: solo se podrá notificar por WhatsApp</div>
      )}
    </div>
  );

  return (
    <div className="dir-row card">
      <div className="dir-h">
        <div>
          <b className="dir-org">{fila.organismo}</b>
          <Pildora tono={etiqueta.tono} texto={etiqueta.texto} />
        </div>
      </div>
      <form className="dir-f" onSubmit={guardar} noValidate aria-label={'Responsable de ' + fila.organismo}>
        {campo('cargo', 'Cargo')}
        {campo('nombre', 'Nombre completo', { placeholder: 'Nombres y apellidos' })}
        {campo('telefono', 'Celular (WhatsApp)', { mono: true, placeholder: '3001234567' })}
        {campo('correo', 'Correo institucional', { mono: true, placeholder: 'nombre.apellido@cali.gov.co' })}
        <div className="dir-a">
          {editar && (
            <Boton type="submit" disabled={ocupado} icono="fa-floppy-disk">
              Guardar
            </Boton>
          )}
          {celular && (
            <a className="btn" href={'https://wa.me/' + celular} target="_blank" rel="noopener">
              <Icono nombre="fa-whatsapp" tipo="brands" /> Probar chat
            </a>
          )}
        </div>
      </form>
    </div>
  );
}
