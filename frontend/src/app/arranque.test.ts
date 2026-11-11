import { describe, expect, it } from 'vitest';
import { recargarAlActualizar } from './arranque';

function swFalso(controlador: boolean) {
  const oyentes: (() => void)[] = [];
  return {
    controller: controlador ? {} : null,
    addEventListener: (_: 'controllerchange', f: () => void) => {
      oyentes.push(f);
    },
    cambiar: () => oyentes.forEach(f => f())
  };
}

describe('versión nueva de la 3.0', () => {
  it('recarga una sola vez cuando un service worker nuevo reemplaza al anterior', () => {
    const sw = swFalso(true);
    let veces = 0;
    recargarAlActualizar(sw, () => veces++);
    sw.cambiar();
    sw.cambiar();
    expect(veces).toBe(1);
  });
  it('no recarga en la primera instalación ni si el navegador no tiene service worker', () => {
    const sw = swFalso(false);
    let veces = 0;
    recargarAlActualizar(sw, () => veces++);
    sw.cambiar();
    recargarAlActualizar(undefined, () => veces++);
    expect(veces).toBe(0);
  });
});
