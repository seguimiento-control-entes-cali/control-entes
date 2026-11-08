# 0001 · Frontend en React + TypeScript + Vite
Estado: aceptada
Fecha: 2026-11-08 (decisión D-03 tomada el 2026-10-27; ADR escrito en la F0)

## Contexto
La 2.x es un solo `index.html` construido a partir de 21 archivos `src/js/NN-*.js` que comparten un único ámbito
(no son módulos). Funciona, pero no tiene tipos, las dependencias entre partes no son visibles y cada cambio grande
exige revisar a mano todo el archivo unido. El plan de migración (docs/migracion/README.md) pide una base que permita
crecer por pantallas, con pruebas y revisión automática.

## Decisión
La 3.0 se escribe en **React 18 + TypeScript estricto (`strict`, sin `any` explícito) + Vite**, en la carpeta
`frontend/`, con ESLint, Prettier (la misma configuración de la 2.x) y Vitest. Las versiones se fijan exactas en
`frontend/package.json`.

## Consecuencias
- Los errores de tipos y de capas se detectan antes de publicar (CI `frontend.yml`).
- La 2.x no se toca: sigue publicada y con sus propias pruebas hasta la F8.
- Hay una carpeta `frontend/node_modules` aparte; la app publicada no tiene dependencias en ejecución salvo React.
- El equipo debe conocer React y TypeScript; el código conserva nombres de dominio en español.

## Alternativas consideradas
- Seguir con JavaScript sin módulos: no resuelve la falta de tipos ni de fronteras.
- Vue o Svelte: válidos, pero React tiene más soporte y personal disponible.
- Next.js: agrega servidor; la Etapa 1 es un sitio estático (D-26).
