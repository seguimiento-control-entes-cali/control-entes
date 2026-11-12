/* Pruebas de scripts/mantener-activo.mjs (consulta diaria a Supabase). Sin red: se simula la respuesta.
   `node tests/mantener-activo.test.mjs` (lo llama `npm test`). */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { consultarHoy } from '../scripts/mantener-activo.mjs';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let n = 0;
const CFG = { supabaseUrl: 'https://abcdefghij.supabase.co', supabaseAnonKey: 'sb_publishable_EJEMPLO' };
const respuesta = (status, cuerpo) => async (url, op) => {
  respuesta.ultima = { url, op };
  return { ok: status >= 200 && status < 300, status, text: async () => cuerpo };
};

// 1. Llama a la función correcta, por POST, con la clave publicable y sin cuerpo con datos
assert.strictEqual(await consultarHoy(CFG, respuesta(200, '"2026-11-12"')), '2026-11-12');
assert.strictEqual(respuesta.ultima.url, 'https://abcdefghij.supabase.co/rest/v1/rpc/hoy_colombia');
assert.strictEqual(respuesta.ultima.op.method, 'POST');
assert.strictEqual(respuesta.ultima.op.headers.apikey, 'sb_publishable_EJEMPLO');
assert.strictEqual(respuesta.ultima.op.body, '{}');
n += 5;

// 2. Errores del servidor o respuestas raras hacen fallar la tarea (GitHub avisa por correo)
await assert.rejects(consultarHoy(CFG, respuesta(401, '{"message":"Invalid API key"}')), /401/);
await assert.rejects(consultarHoy(CFG, respuesta(200, '<html>')), /inesperada/);
await assert.rejects(consultarHoy(CFG, respuesta(200, '"12/11/2026"')), /inesperada/);
await assert.rejects(consultarHoy(CFG, respuesta(200, 'null')), /inesperada/);
n += 4;

// 3. Nunca acepta una clave que no sea la publicable ni una dirección que no sea de Supabase
await assert.rejects(consultarHoy({ ...CFG, supabaseAnonKey: 'eyJhbGciOiJIUzI1NiJ9.x.y' }, respuesta(200, '"2026-11-12"')), /publicable/);
await assert.rejects(consultarHoy({ ...CFG, supabaseUrl: 'https://otro-sitio.com' }, respuesta(200, '"2026-11-12"')), /válida/);
n += 2;

// 4. La configuración del repositorio cumple las condiciones (apunta al proyecto en uso, Estados Unidos)
const cfg = JSON.parse(fs.readFileSync(path.join(raiz, 'configuracion.json'), 'utf8'));
assert.strictEqual(cfg.supabaseUrl, 'https://xnerfqmjgunqddpwpoep.supabase.co');
assert.match(cfg.supabaseAnonKey, /^sb_publishable_/);
n += 2;

// 5. El flujo de GitHub corre a diario, se puede lanzar a mano, solo lee el repositorio y no usa secretos
const flujo = fs.readFileSync(path.join(raiz, '.github', 'workflows', 'mantener-activo.yml'), 'utf8');
assert.match(flujo, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/);
assert.match(flujo, /workflow_dispatch:/);
assert.match(flujo, /contents: read/);
assert.match(flujo, /node scripts\/mantener-activo\.mjs/);
assert.doesNotMatch(flujo, /secrets\./);
n += 5;

console.log(`mantener-activo: ${n} verificaciones correctas`);
