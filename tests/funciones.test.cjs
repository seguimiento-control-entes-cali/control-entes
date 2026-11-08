/* Pruebas del orden de las comprobaciones en las funciones del servidor (supabase/functions). Sin Supabase:
   `node tests/funciones.test.cjs`. Revisan el texto del código, porque las funciones corren en Deno. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
let n = 0; const ok = () => { n++; };

const leer = f => fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', f, 'index.ts'), 'utf8');
const posicion = (texto, s, f) => { const k = texto.indexOf(s); assert.ok(k >= 0, `falta en ${f}: ${s}`); return k; };

// --- resumen-semanal (pendiente 4 de la 2.6.1): apagado no exige los secretos del correo
{
  const f = leer('resumen-semanal');
  const casilla = posicion(f, "if (!prueba && !cfg?.resumen_activo)", 'resumen-semanal');
  const secretos = posicion(f, "if (!SMTP_USER || !SMTP_PASS)", 'resumen-semanal');
  assert.ok(casilla < secretos, 'la casilla debe revisarse antes que los secretos SMTP'); ok();
  // y la identificación de quién llama sigue siendo lo primero
  assert.ok(posicion(f, "claveCron === CLAVE", 'resumen-semanal') < casilla); ok();
  // la prueba manual del Super administrador sí exige los secretos (para avisar que faltan)
  assert.ok(/!prueba && !cfg\?\.resumen_activo/.test(f)); ok();
}

// --- avisos-planes: el mismo orden (identificación, casilla y día hábil, y solo después los secretos)
{
  const f = leer('avisos-planes');
  const quien = posicion(f, "claveCron === CLAVE", 'avisos-planes');
  const casilla = posicion(f, "!cfg?.avisos_activo", 'avisos-planes');
  const secretos = posicion(f, "Deno.env.get('SMTP_USER')", 'avisos-planes');
  assert.ok(quien < casilla && casilla < secretos); ok();
}

console.log(`OK: ${n} verificaciones del orden de las comprobaciones en las funciones del servidor`);
