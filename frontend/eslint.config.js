// ESLint del frontend 3.0. Fronteras entre capas: docs/migracion/README.md §7.1.
//   features/                     → dominio/, datos/contratos, shared/   (nunca supabase-js ni datos/supabase)
//   datos/supabase/, datos/demo/  → datos/contratos, dominio/
//   dominio/                      → nada (TypeScript puro: sin React, sin navegador, sin datos)
//   shared/                       → shared/ (sin features/)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

const NAVEGADOR = ['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'fetch'];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, boundaries },
    settings: {
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
      'boundaries/include': ['src/**/*'],
      'boundaries/elements': [
        { type: 'main', pattern: 'src/main.tsx', mode: 'full' },
        { type: 'datos-entrada', pattern: 'src/datos/index.ts', mode: 'full' },
        { type: 'contratos', pattern: 'src/datos/contratos' },
        { type: 'datos-supabase', pattern: 'src/datos/supabase' },
        { type: 'datos-demo', pattern: 'src/datos/demo' },
        { type: 'app', pattern: 'src/app' },
        { type: 'config', pattern: 'src/config' },
        { type: 'dominio', pattern: 'src/dominio' },
        { type: 'features', pattern: 'src/features' },
        { type: 'shared', pattern: 'src/shared' },
        { type: 'styles', pattern: 'src/styles' }
      ]
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/no-unknown': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          message:
            'La capa "${file.type}" no puede importar de "${dependency.type}" (docs/migracion/README.md §7.1)',
          rules: [
            { from: 'main', allow: ['app', 'styles'] },
            {
              from: 'app',
              allow: [
                'app',
                'features',
                'shared',
                'config',
                'datos-entrada',
                'contratos',
                'dominio',
                'styles'
              ]
            },
            { from: 'features', allow: ['features', 'dominio', 'contratos', 'shared'] },
            { from: 'datos-entrada', allow: ['contratos', 'datos-supabase', 'datos-demo', 'config'] },
            { from: 'datos-supabase', allow: ['datos-supabase', 'contratos', 'dominio'] },
            { from: 'datos-demo', allow: ['datos-demo', 'contratos', 'dominio'] },
            { from: 'contratos', allow: ['contratos', 'dominio'] },
            { from: 'dominio', allow: ['dominio'] },
            { from: 'shared', allow: ['shared', 'styles'] },
            { from: 'config', allow: ['config'] }
          ]
        }
      ],
      // supabase-js solo dentro de src/datos/supabase/ (D-24)
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@supabase/supabase-js', message: 'Solo se importa en src/datos/supabase/ (D-24).' }
          ]
        }
      ]
    }
  },
  {
    files: ['src/datos/supabase/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' }
  },
  {
    // dominio/: reglas puras, sin React ni objetos del navegador
    files: ['src/dominio/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@supabase/supabase-js', message: 'dominio/ es TypeScript puro (plan §7.1).' },
            { name: 'react', message: 'dominio/ es TypeScript puro (plan §7.1).' },
            { name: 'react-dom', message: 'dominio/ es TypeScript puro (plan §7.1).' }
          ]
        }
      ],
      'no-restricted-globals': [
        'error',
        ...NAVEGADOR.map(name => ({ name, message: 'dominio/ no usa el navegador.' }))
      ]
    }
  },
  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
    rules: { 'boundaries/no-unknown': 'off', 'boundaries/element-types': 'off' }
  }
);
