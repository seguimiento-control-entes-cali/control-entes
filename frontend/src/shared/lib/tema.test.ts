import { describe, expect, it } from 'vitest';
import { guardarTema, leerTema, siguienteTema } from './tema';

const almacen = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k)
  };
};

describe('tema', () => {
  it('por defecto sigue al equipo; recuerda claro u oscuro; "sistema" borra la elección', () => {
    const a = almacen();
    expect(leerTema(a)).toBe('sistema');
    guardarTema(a, 'oscuro');
    expect(leerTema(a)).toBe('oscuro');
    guardarTema(a, 'sistema');
    expect(leerTema(a)).toBe('sistema');
  });
  it('no falla sin almacenamiento o si el navegador lo bloquea', () => {
    expect(leerTema(undefined)).toBe('sistema');
    const bloqueado = {
      getItem: () => {
        throw new Error('bloqueado');
      }
    };
    expect(leerTema(bloqueado)).toBe('sistema');
  });
  it('orden del botón', () => {
    expect(siguienteTema('sistema')).toBe('claro');
    expect(siguienteTema('claro')).toBe('oscuro');
    expect(siguienteTema('oscuro')).toBe('sistema');
  });
});
