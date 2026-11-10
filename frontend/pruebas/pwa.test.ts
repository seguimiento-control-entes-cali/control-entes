// El modo sin conexión solo guarda la aplicación: nunca respuestas de Supabase (igual que public/sw.js de la 2.x).
import { describe, expect, it } from 'vitest';
import config from '../vite.config.ts?raw';

describe('modo sin conexión (PWA)', () => {
  it('no tiene reglas de caché para otros dominios ni menciona Supabase', () => {
    expect(config).toMatch(/runtimeCaching:\s*\[\]/);
    expect(config.toLowerCase()).not.toMatch(/supabase\.co/);
  });
  it('rutas relativas para poder publicarse en /v3/', () => {
    expect(config).toMatch(/base:\s*'\.\/'/);
    expect(config).toMatch(/scope:\s*'\.\/'/);
  });
});
