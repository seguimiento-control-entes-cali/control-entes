/// <reference types="vitest/config" />
// Configuración de Vite, del modo sin conexión (PWA) y de las pruebas (Vitest). Plan: docs/migracion/README.md, §5, §6 y §8.
// base './': rutas relativas, para publicar la 3.0 en una subcarpeta (/v3/, decisión D-26) sin reconstruir.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import paquete from './package.json';

// Fecha de construcción en Colombia (AAAA-MM-DD), como CE_BUILD.construido de la 2.x
const construido = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

export default defineConfig({
  base: './',
  // Versión y fecha de construcción que se muestran en Configuración
  define: {
    __CE_VERSION__: JSON.stringify(paquete.version),
    __CE_CONSTRUIDO__: JSON.stringify(construido)
  },
  // El diseño viene de los estilos, fuentes e íconos de la 2.x (src/css y vendor/web, fuera de frontend/)
  server: { fs: { allow: ['..'] } },
  plugins: [
    react(),
    VitePWA({
      // La versión nueva se instala sola al recargar; no hay datos sin guardar que perder (todo vive en Supabase)
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: {
        name: 'Control de Entes 3.0 - Alcaldía de Santiago de Cali',
        short_name: 'Control Entes 3',
        description: 'Seguimiento a requerimientos de entes de control',
        lang: 'es-CO',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#041a40',
        theme_color: '#0b3d91',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Solo se guarda la aplicación (pantallas, estilos, íconos). Las respuestas de Supabase NUNCA se guardan
        // (igual que la 2.x, public/sw.js): no hay reglas de caché para otros dominios.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'], // los íconos los agrega el plugin desde el manifiesto
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // La versión nueva toma el control apenas se instala (sin esto quedaba "en espera" mientras hubiera una
        // pestaña abierta); src/app/arranque.ts recarga la página una vez al cambiar.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: []
      }
    })
  ],
  build: { outDir: 'dist', sourcemap: true },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'pruebas/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000
  }
});
