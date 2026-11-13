// Cada variable VITE_* que lee la configuración (config/entorno.ts) debe pasarse desde main.tsx; si falta una,
// la publicación la "configura" pero la aplicación nunca la recibe (pasó con VITE_REMITENTE el 13-nov-2026).
import { describe, expect, it } from 'vitest';
import entorno from '../src/config/entorno.ts?raw';
import main from '../src/main.tsx?raw';
import yml from '../../.github/workflows/publicar.yml?raw';

const nombres = (s: string, re: RegExp) => [...new Set([...s.matchAll(re)].map(m => m[1]))].sort();

describe('arranque · variables de configuración', () => {
  it('main.tsx pasa todas las variables que lee leerEntorno', () => {
    const usadas = nombres(entorno, /env\.(VITE_[A-Z_]+)/g);
    const pasadas = nombres(main, /(VITE_[A-Z_]+):\s*import\.meta\.env\./g);
    expect(usadas).toContain('VITE_REMITENTE');
    expect(pasadas).toEqual(usadas);
  });

  it('publicar.yml define cada variable que se pasa (salvo VITE_VARIANTE, que va en env:)', () => {
    for (const v of nombres(main, /(VITE_[A-Z_]+):\s*import\.meta\.env\./g)) expect(yml, v).toContain(v);
  });
});
