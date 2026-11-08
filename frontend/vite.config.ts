/// <reference types="vitest/config" />
// Configuración de Vite y de las pruebas (Vitest). Plan: docs/migracion/README.md, §5 y §6.
// base './': rutas relativas, para publicar la 3.0 en una subcarpeta (/v3/, decisión D-26) sin reconstruir.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: true },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'pruebas/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000
  }
});
