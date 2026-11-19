// Tipo de lo que la dependencia diligencia del formato de Calidad MEDE01.05.02.P019.F002 (script 28,
// pm_hallazgos.causa_detalle). Solo datos y tipos: el llenado del Excel está en formato-causas.ts.
export const CATEGORIAS_ESPINA = [
  ['materiales', 'Materiales'],
  ['mano_obra', 'Mano de obra'],
  ['maquinaria', 'Maquinaria'],
  ['medio_ambiente', 'Medio ambiente'],
  ['metodo', 'Método'],
  ['medicion', 'Medición']
] as const;
export type CategoriaEspina = (typeof CATEGORIAS_ESPINA)[number][0];

export const METODOS_CAUSA = [
  ['cinco_porques', '5 porqués'],
  ['espina_pescado', 'Causa-efecto (espina de pescado)'],
  ['arbol_problema', 'Árbol de problemas'],
  ['otro', 'Otro']
] as const;

/** Lo que se diligencia en las 4 pestañas del formato (todo opcional: se llena lo que use el equipo). */
export interface DetalleCausas {
  macroproceso?: string;
  macroproceso_codigo?: string;
  proceso?: string;
  proceso_codigo?: string;
  subproceso?: string;
  subproceso_codigo?: string;
  /** Lluvia de ideas: hasta 3 participantes */
  participantes?: string[];
  /** Descripción de la no conformidad (el hallazgo) */
  no_conformidad?: string;
  /** Lluvia de ideas: hasta 7 ideas, con la nota si se descartó o está duplicada */
  lluvia?: { idea: string; descartada?: string }[];
  causa_raiz_lluvia?: string;
  /** Causa-efecto: hasta 2 causas por categoría */
  espina?: Partial<Record<CategoriaEspina, string[]>>;
  /** 5 porqués: hasta 8 filas */
  cinco_porques?: { problema: string; porques: string[]; resultado: string }[];
  /** Árbol de problemas: hasta 8 filas */
  arbol?: { problema: string; causa: string; subcausa: string; efecto: string }[];
}
