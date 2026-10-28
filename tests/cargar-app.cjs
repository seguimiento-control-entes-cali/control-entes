/* Carga los archivos reales de src/js/ (01 a 20; el 21 es el arranque y toca la pantalla)
   en un entorno de navegador simulado, y devuelve las funciones pedidas para probarlas.
   Así las pruebas siempre validan el mismo código que se publica. */
const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..', 'src', 'js');

function stub() {
  // Objeto tolerante: cualquier propiedad o llamada devuelve otro stub (document, window, etc.)
  const f = function () { return p; };
  const p = new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : p),
    apply: () => p,
    construct: () => p
  });
  return p;
}
module.exports = function cargarApp(nombres, ce = {}) {
  const archivos = fs.readdirSync(DIR).filter(f => /^\d{2}-.+\.js$/.test(f) && !f.startsWith('21-')).sort();
  const codigo = archivos.map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n');
  const CE_BUILD = Object.assign({ variante: 'institucional', supabaseUrl: '', supabaseAnonKey: '', remitente: '', pruebas: false }, ce);
  const almacen = {};
  const entorno = {
    document: stub(), window: stub(), navigator: stub(), location: { search: '', protocol: 'file:' },
    localStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); } },
    matchMedia: () => ({ matches: false }), requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    supabase: stub(), fetch: () => Promise.reject(new Error('sin red en pruebas'))
  };
  const params = ['CE_BUILD', ...Object.keys(entorno)];
  const fn = new Function(...params, "'use strict';\n" + codigo + `\nreturn {${nombres.join(',')}};`);
  return fn(CE_BUILD, ...Object.values(entorno));
};
