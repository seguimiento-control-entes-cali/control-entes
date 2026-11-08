#!/usr/bin/env node
/* =====================================================================
   Une una función del servidor con sus archivos locales (import ... from './x.js') en un solo archivo, para
   desplegarla pegándola en el editor del panel de Supabase (Edge Functions → Deploy a new function → Via Editor).
   Con la CLI no hace falta: `supabase functions deploy <nombre>` sube todos sus archivos.

   Uso:  node scripts/funcion-para-pegar.mjs avisos-planes     → build/funciones/avisos-planes/index.ts
   La salida va en build/ (no se sube al repositorio). No cambia nada del código: solo copia el contenido del archivo
   importado en el lugar del import y le quita la palabra export.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function unir(nombre) {
  const dir = path.join(RAIZ, 'supabase', 'functions', nombre);
  if (!/^[a-z0-9-]+$/.test(nombre) || !fs.existsSync(path.join(dir, 'index.ts'))) throw new Error('No existe la función ' + nombre);
  const index = fs.readFileSync(path.join(dir, 'index.ts'), 'utf8');
  return index.replace(/^import \{[^}]*\} from '\.\/([a-z0-9-]+\.js)';\s*$/gm, (_, archivo) => {
    const codigo = fs.readFileSync(path.join(dir, archivo), 'utf8').replace(/^export (const|function|let) /gm, '$1 ');
    return `// ===== inicio de ./${archivo} (copiado por scripts/funcion-para-pegar.mjs) =====\n${codigo.trimEnd()}\n// ===== fin de ./${archivo} =====`;
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const nombre = process.argv[2];
  if (!nombre) {
    console.error('Uso: node scripts/funcion-para-pegar.mjs <nombre de la función>');
    process.exit(2);
  }
  const salida = path.join(RAIZ, 'build', 'funciones', nombre, 'index.ts');
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, unir(nombre));
  console.log(`✓ ${path.relative(RAIZ, salida)}: listo para pegar en el editor de Supabase`);
}
