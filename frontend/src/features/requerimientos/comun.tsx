// Piezas comunes del módulo operativo: la vigencia elegida en la barra superior (S.vigencia y #selVigencia de la 2.x)
// y la lista de requerimientos de esa vigencia con su semáforo (reload + decorate).
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { fechaColombia } from '../../dominio/fechas';
import { decorar, vigenciasSelector, type RequerimientoVivo } from '../../dominio/requerimientos';
import { ETIQUETA_SEMAFORO, type Semaforo } from '../../dominio/semaforo';
import { useDatos } from '../sesion/contexto';

const ContextoVigencia = createContext<{ vigencia: number; cambiar: (v: number) => void } | null>(null);

export function ProveedorVigencia({ children }: { children: ReactNode }) {
  const [vigencia, cambiar] = useState(() => new Date().getFullYear());
  const valor = useMemo(() => ({ vigencia, cambiar }), [vigencia]);
  return <ContextoVigencia.Provider value={valor}>{children}</ContextoVigencia.Provider>;
}
export function useVigencia() {
  const v = useContext(ContextoVigencia);
  if (!v) throw new Error('useVigencia se usó fuera de <ProveedorVigencia>');
  return v;
}

/** Selector de la barra superior (la vigencia actual y las dos anteriores). */
export function SelectorVigencia() {
  const { vigencia, cambiar } = useVigencia();
  return (
    <select
      id="selVigencia"
      title="Vigencia"
      aria-label="Vigencia"
      value={vigencia}
      onChange={e => cambiar(+e.target.value)}
    >
      {vigenciasSelector(new Date().getFullYear()).map(v => (
        <option key={v} value={v}>
          Vigencia {v}
        </option>
      ))}
    </select>
  );
}

/** Requerimientos de la vigencia elegida, con su semáforo (la base ya limita a secretario y enlace por RLS). */
export function useRequerimientosVivos() {
  const { requerimientos, catalogos } = useDatos();
  const { vigencia } = useVigencia();
  const lista = useQuery({
    queryKey: ['requerimientos', vigencia],
    queryFn: () => requerimientos.lista(vigencia)
  });
  const entes = useQuery({ queryKey: ['entes'], queryFn: () => catalogos.entes() });
  const deps = useQuery({ queryKey: ['dependencias'], queryFn: () => catalogos.dependencias() });
  const config = useQuery({ queryKey: ['configuracion'], queryFn: () => catalogos.configuracion() });
  const diasRojo = config.data?.diasRojo ?? 5;
  const vivos = useMemo<RequerimientoVivo[]>(() => {
    const hoy = fechaColombia(new Date());
    return (lista.data ?? []).map(r => decorar(r, hoy, diasRojo, entes.data ?? [], deps.data ?? []));
  }, [lista.data, entes.data, deps.data, diasRojo]);
  return {
    vigencia,
    vivos,
    entes: entes.data ?? [],
    deps: deps.data ?? [],
    diasRojo,
    correoDisciplinario: config.data?.correoDisciplinario ?? '',
    cargando: lista.isPending || entes.isPending || deps.isPending,
    error: lista.error as Error | null
  };
}

/** Píldora del semáforo (pill de la 2.x). */
export function PildoraSemaforo({ sem }: { sem: Semaforo }) {
  return (
    <span className={'pill ' + sem}>
      <i />
      {ETIQUETA_SEMAFORO[sem].toUpperCase()}
    </span>
  );
}

export const PUEDE_REGISTRAR = ['admin', 'enlace'];
export const PUEDE_CERRAR = ['admin', 'secretario', 'enlace'];
export const PUEDE_ESCALAR = ['admin', 'alcalde', 'control_interno', 'enlace'];
