// El modo sin conexión solo guarda la aplicación: nunca respuestas de Supabase (igual que public/sw.js de la 2.x).
import { describe, expect, it } from 'vitest';
import config from '../vite.config.ts?raw';
import indice from '../index.html?raw';

describe('modo sin conexión (PWA)', () => {
  it('no tiene reglas de caché para otros dominios ni menciona Supabase', () => {
    expect(config).toMatch(/runtimeCaching:\s*\[\]/);
    expect(config.toLowerCase()).not.toMatch(/supabase\.co/);
  });
  it('la versión nueva toma el control sola (sin quedar en espera)', () => {
    expect(config).toMatch(/skipWaiting:\s*true/);
    expect(config).toMatch(/clientsClaim:\s*true/);
  });
  it('declara el ícono de la pestaña con ruta relativa (sin él, el navegador pide /favicon.ico y da 404)', () => {
    expect(indice).toMatch(/<link rel="icon"[^>]*href="icons\/icon-192\.png"/);
  });

  it('rutas relativas para poder publicarse en /v3/', () => {
    expect(config).toMatch(/base:\s*'\.\/'/);
    expect(config).toMatch(/scope:\s*'\.\/'/);
  });
});
