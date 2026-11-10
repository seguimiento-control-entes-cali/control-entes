// Reglas del Directorio del gabinete, copiadas de la 2.x (src/js/10-historico-y-directorio-datos.js,
// 15-directorio.js y la acción dirSave de 18-acciones.js). Paridad comprobada en pruebas/paridad-2x.test.ts.

/** Niveles de las dependencias que tienen responsable en el directorio (MAIN_NIV de la 2.x). */
export const NIVELES_PRINCIPALES = ['Secretaría', 'Departamento', 'UAE', 'Despacho'] as const;

export interface Organismo {
  nombre: string;
  /** Tipo de organismo del histórico: Secretaría, Departamento, UAE, Despacho u otro. */
  nivel: string;
}
export interface Responsable {
  organismo: string;
  cargo: string;
  nombre: string;
  /** 57 + 10 dígitos, o vacío. */
  telefono: string;
  correo: string;
}
export type EstadoContacto = 'ok' | 'nombre' | 'celular' | 'sin';

/** Llave para que dependencia, directorio y cuenta coincidan aunque cambien tildes, mayúsculas o espacios. */
export function claveOrganismo(s: string | null | undefined): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Celular de Colombia: 57 + 10 dígitos que empiezan en 3; vacío si no es válido. */
export function normalizarCelular(s: string | null | undefined): string {
  const d = String(s || '').replace(/\D/g, '');
  if (/^57\d{10}$/.test(d)) return d;
  if (/^3\d{9}$/.test(d)) return '57' + d;
  return '';
}

export function formatoCelular(d: string): string {
  return /^57\d{10}$/.test(d || '')
    ? '+57 ' + d.slice(2, 5) + ' ' + d.slice(5, 8) + ' ' + d.slice(8)
    : d || '—';
}

/** Correo institucional @cali.gov.co en minúsculas, o vacío si no lo es. */
export function normalizarCorreo(s: string | null | undefined): string {
  const v = String(s || '')
    .replace(/\s/g, '')
    .toLowerCase();
  return /^[a-z0-9._%+-]+@cali\.gov\.co$/.test(v) ? v : '';
}

/** Nombre completo: al menos dos palabras de más de una letra. */
export function esNombreCompleto(n: string | null | undefined): boolean {
  return (
    String(n || '')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 1).length >= 2
  );
}

export function estadoContacto(x: Responsable | null): EstadoContacto {
  return !x
    ? 'sin'
    : !esNombreCompleto(x.nombre)
      ? 'nombre'
      : !normalizarCelular(x.telefono)
        ? 'celular'
        : 'ok';
}

export const ETIQUETA_ESTADO: Readonly<
  Record<EstadoContacto, { tono: 'verde' | 'amarillo' | 'rojo'; texto: string }>
> = {
  ok: { tono: 'verde', texto: 'Listo para WhatsApp' },
  nombre: { tono: 'amarillo', texto: 'Falta nombre completo' },
  celular: { tono: 'amarillo', texto: 'Falta celular válido' },
  sin: { tono: 'rojo', texto: 'Sin responsable' }
};

export function nombreCorto(n: string): string {
  return n
    .replace('Oficina de la Secretaría Privada y Despacho del Alcalde', 'Despacho / Sec. Privada')
    .replace('Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)', 'DAGMA')
    .replace('Departamento Administrativo de ', 'DA ')
    .replace('Unidad Administrativa Especial de ', 'UAE ')
    .replace('Unidad Administrativa Especial ', 'UAE ')
    .replace('Secretaría de ', '')
    .replace('Secretaría del ', '')
    .replace('Desarrollo e Innovación Institucional', 'Innovación Instit.')
    .replace('Tecnologías de la Información y las Comunicaciones', 'TIC')
    .replace('Gestión del Riesgo de Emergencias y Desastres', 'Gestión del Riesgo')
    .replace('Desarrollo Territorial y Participación Ciudadana', 'Des. Territorial y Particip.');
}

/** Cargo que se propone al agregar un responsable (defaultCargo de la 2.x). */
export function cargoPorNivel(nivel: string): string {
  return nivel === 'Secretaría'
    ? 'Secretario(a) de Despacho'
    : nivel === 'Despacho'
      ? 'Secretario(a) Privado(a)'
      : 'Director(a)';
}

/** Dependencias con responsable en el directorio, sin repetir y en orden alfabético (mainOrgsAll de la 2.x). */
export function organismosPrincipales(lista: readonly Organismo[]): string[] {
  return [
    ...new Set(
      lista.filter(o => (NIVELES_PRINCIPALES as readonly string[]).includes(o.nivel)).map(o => o.nombre)
    )
  ].sort((a, b) => a.localeCompare(b, 'es'));
}

export interface FilaDirectorio {
  organismo: string;
  /** Índice en la lista de responsables, o -1 si la dependencia no tiene. */
  indice: number;
  responsable: Responsable | null;
  estado: EstadoContacto;
}
export interface ResumenDirectorio {
  filas: FilaDirectorio[];
  /** Responsables cuyo organismo no corresponde a ninguna dependencia (no se usan para WhatsApp). */
  huerfanos: Responsable[];
  /** Celulares asignados a más de un responsable. */
  duplicados: { celular: string; organismos: string[] }[];
  listas: number;
  incompletas: number;
  sinResponsable: number;
  total: number;
}

export function resumirDirectorio(
  organismos: readonly string[],
  lista: readonly Responsable[]
): ResumenDirectorio {
  const filas: FilaDirectorio[] = [];
  for (const o of organismos) {
    const k = claveOrganismo(o);
    const propios = lista.map((x, i) => ({ x, i })).filter(z => claveOrganismo(z.x.organismo) === k);
    if (propios.length)
      for (const z of propios)
        filas.push({ organismo: o, indice: z.i, responsable: z.x, estado: estadoContacto(z.x) });
    else filas.push({ organismo: o, indice: -1, responsable: null, estado: 'sin' });
  }
  const claves = new Set(organismos.map(claveOrganismo));
  const huerfanos = lista.filter(x => !claves.has(claveOrganismo(x.organismo)));
  const cuenta = new Map<string, number>();
  for (const x of lista) {
    const p = normalizarCelular(x.telefono);
    if (p) cuenta.set(p, (cuenta.get(p) ?? 0) + 1);
  }
  const duplicados = [...cuenta]
    .filter(([, n]) => n > 1)
    .map(([celular]) => ({
      celular,
      organismos: lista.filter(x => normalizarCelular(x.telefono) === celular).map(x => x.organismo)
    }));
  const n = (s: EstadoContacto) => filas.filter(f => f.estado === s).length;
  const listas = organismos.filter(o => {
    const k = claveOrganismo(o);
    return lista.some(x => claveOrganismo(x.organismo) === k && estadoContacto(x) === 'ok');
  }).length;
  return {
    filas,
    huerfanos,
    duplicados,
    listas,
    incompletas: n('nombre') + n('celular'),
    sinResponsable: n('sin'),
    total: organismos.length
  };
}

export type FiltroDirectorio = 'todos' | 'pend' | 'ok' | 'sin';
export function filtrarFilas(filas: readonly FilaDirectorio[], texto: string, filtro: FiltroDirectorio) {
  const q = claveOrganismo(texto);
  return filas.filter(
    f =>
      (filtro === 'todos' || (filtro === 'pend' ? f.estado !== 'ok' : f.estado === filtro)) &&
      (!q ||
        claveOrganismo(
          f.organismo + ' ' + (f.responsable ? f.responsable.nombre + ' ' + f.responsable.cargo : '')
        ).includes(q))
  );
}

/** Valida los datos escritos para un responsable (acción dirSave de la 2.x). Devuelve el error o la fila lista. */
export function validarResponsable(
  escrito: { cargo: string; nombre: string; telefono: string; correo: string },
  actual: Responsable,
  indice: number,
  lista: readonly Responsable[]
): { error: string } | { fila: Responsable } {
  const limpio = (s: string) => s.trim().replace(/\s+/g, ' ');
  const cargo = limpio(escrito.cargo),
    nombre = limpio(escrito.nombre),
    tel = limpio(escrito.telefono);
  if (tel && !normalizarCelular(tel)) return { error: 'El celular debe tener 10 dígitos e iniciar en 3' };
  if (nombre && !esNombreCompleto(nombre))
    return { error: 'Escribe el nombre completo: nombres y apellidos' };
  if (tel && !nombre)
    return { error: 'Agrega el nombre completo del responsable antes de guardar el celular' };
  const correo = limpio(escrito.correo).replace(/\s/g, '').toLowerCase();
  if (correo && !normalizarCorreo(correo))
    return { error: 'El correo debe ser institucional: nombre.apellido@cali.gov.co' };
  const otroCorreo = lista.find(
    (y, k) => k !== indice && correo && String(y.correo || '').toLowerCase() === correo
  );
  if (otroCorreo) return { error: 'Ese correo ya está asignado a ' + nombreCorto(otroCorreo.organismo) };
  const otroTel = lista.find(
    (y, k) => k !== indice && tel && normalizarCelular(y.telefono) === normalizarCelular(tel)
  );
  if (otroTel) return { error: 'Ese celular ya está asignado a ' + nombreCorto(otroTel.organismo) };
  return {
    fila: {
      organismo: actual.organismo,
      cargo: cargo || actual.cargo,
      nombre,
      telefono: tel ? normalizarCelular(tel) : '',
      correo
    }
  };
}

/** Filas del archivo CSV que exporta la 2.x (directorio_gabinete.csv). */
export function filasCsvDirectorio(lista: readonly Responsable[]): string[][] {
  return [
    ['Dependencia', 'Cargo', 'Nombre', 'Celular'],
    ...lista.map(x => [x.organismo, x.cargo, x.nombre, x.telefono])
  ];
}

/** Quién puede editar el directorio en pantalla (canRole(['admin','alcalde']) de la 2.x; la base lo exige por RLS). */
export function puedeEditarDirectorio(rol: string): boolean {
  return rol === 'admin' || rol === 'alcalde';
}
