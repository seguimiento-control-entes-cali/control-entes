// Tema claro u oscuro. "sistema" sigue la preferencia del equipo; la elección se recuerda solo en este navegador
// (es una comodidad personal, no un dato de la aplicación). Sin reglas de negocio (plan §7.1).
export type Tema = 'sistema' | 'claro' | 'oscuro';
const CLAVE = 'ce3_tema';

export function leerTema(almacen: Pick<Storage, 'getItem'> | undefined): Tema {
  try {
    const v = almacen?.getItem(CLAVE);
    return v === 'claro' || v === 'oscuro' ? v : 'sistema';
  } catch {
    return 'sistema'; // navegación privada o almacenamiento bloqueado
  }
}

export function guardarTema(almacen: Pick<Storage, 'setItem' | 'removeItem'> | undefined, tema: Tema): void {
  try {
    if (tema === 'sistema') almacen?.removeItem(CLAVE);
    else almacen?.setItem(CLAVE, tema);
  } catch {
    // sin almacenamiento: el tema vale solo para esta visita
  }
}

/** Aplica el tema en <html data-tema="…">; con "sistema" se quita el atributo y manda la preferencia del equipo. */
export function aplicarTema(raiz: HTMLElement, tema: Tema): void {
  if (tema === 'sistema') raiz.removeAttribute('data-tema');
  else raiz.setAttribute('data-tema', tema);
}

/** Orden del botón: sistema → claro → oscuro → sistema. */
export function siguienteTema(t: Tema): Tema {
  return t === 'sistema' ? 'claro' : t === 'claro' ? 'oscuro' : 'sistema';
}

export const NOMBRE_TEMA: Readonly<Record<Tema, string>> = {
  sistema: 'Tema: automático',
  claro: 'Tema: claro',
  oscuro: 'Tema: oscuro'
};
