// Días hábiles en Colombia. Porte de src/js/02-utilidades.js (festivosCO, esHabil, sumarHabiles) de la 2.x.
// Festivos según la Ley 51 de 1983 ("Ley Emiliani") y la Ley 2578 de 2026: fijos; trasladables al lunes siguiente;
// y los que dependen de la Pascua (Jueves y Viernes Santo, Ascensión, Corpus Christi y Sagrado Corazón).
import { diaSemana, fecha, partes, sumarDias, type FechaISO } from './fechas';

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, el mismo de la 2.x). */
export function pascua(anio: number): FechaISO {
  const a = anio % 19,
    b = Math.floor(anio / 100),
    c = anio % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    mes = Math.floor((h + l - 7 * m + 114) / 31),
    dia = ((h + l - 7 * m + 114) % 31) + 1;
  return fecha(anio, mes, dia);
}

/** Si la fecha no es lunes, el lunes siguiente (Ley Emiliani). */
function alLunes(f: FechaISO): FechaISO {
  const w = diaSemana(f);
  return w === 1 ? f : sumarDias(f, (8 - w) % 7);
}

const FIJOS: [number, number][] = [
  [1, 1],
  [5, 1],
  [7, 20],
  [8, 7],
  [12, 8],
  [12, 25]
];
const TRASLADABLES: [number, number][] = [
  [1, 6],
  [3, 19],
  [6, 29],
  [8, 15],
  [10, 12],
  [11, 1],
  [11, 11]
];

const cache = new Map<number, ReadonlySet<FechaISO>>();

/** Festivos de Colombia de un año, como fechas AAAA-MM-DD. */
export function festivosColombia(anio: number): ReadonlySet<FechaISO> {
  const guardado = cache.get(anio);
  if (guardado) return guardado;
  const s = new Set<FechaISO>();
  for (const [m, d] of FIJOS) s.add(fecha(anio, m, d));
  for (const [m, d] of TRASLADABLES) s.add(alLunes(fecha(anio, m, d)));
  // Ley 2578 de 2026: Día de Nuestra Señora del Rosario de Chiquinquirá (9 de julio), trasladable
  if (anio >= 2026) s.add(alLunes(fecha(anio, 7, 9)));
  const p = pascua(anio);
  s.add(sumarDias(p, -3)); // Jueves Santo
  s.add(sumarDias(p, -2)); // Viernes Santo
  for (const n of [39, 60, 68]) s.add(alLunes(sumarDias(p, n))); // Ascensión, Corpus Christi, Sagrado Corazón
  cache.set(anio, s);
  return s;
}

/** Día hábil: de lunes a viernes y no festivo. */
export function esHabil(f: FechaISO): boolean {
  const w = diaSemana(f);
  return w !== 0 && w !== 6 && !festivosColombia(partes(f).anio).has(String(f).slice(0, 10));
}

/** Fecha que resulta de sumar n días hábiles a una fecha, sin contar el día inicial (igual a la 2.x). */
export function sumarHabiles(desde: FechaISO, n: number): FechaISO {
  let f = String(desde).slice(0, 10);
  let k = 0;
  while (k < n) {
    f = sumarDias(f, 1);
    if (esHabil(f)) k++;
  }
  return f;
}
