// Pruebas de scripts/copia-externa.mjs (sin red: el listado de Supabase se simula).
import assert from 'node:assert/strict';
import { listar, masReciente, diasDesde, cabeceras, revisarClave } from '../scripts/copia-externa.mjs';

let n = 0;
const ok = (c, m) => {
  assert.ok(c, m);
  n++;
};

// La copia más reciente se elige por la fecha del nombre, no por el orden en que llega
const objetos = [
  { ruta: 'respaldo_2026-11-09_2300.json.gz' },
  { ruta: 'respaldo_2026-11-16_2300.json.gz' },
  { ruta: 'otro.txt' },
  { ruta: 'respaldo_2026-11-02_2300.json.gz' }
];
ok(masReciente(objetos).ruta === 'respaldo_2026-11-16_2300.json.gz', 'elige la más reciente');
ok(masReciente([{ ruta: 'nada.json' }]) === null, 'sin copias: null');

// Antigüedad en días
ok(diasDesde('respaldo_2026-11-16_2300.json.gz', new Date('2026-11-23T12:00:00Z')) === 7, '7 días');
ok(
  diasDesde('respaldo_2026-11-01_2300.json.gz', new Date('2026-11-23T12:00:00Z')) > 9,
  'más de 9 días: alerta'
);
ok(diasDesde('sin-fecha.gz') === Infinity, 'nombre sin fecha');

// Listado recursivo: las carpetas (sin id) se recorren; los archivos (con id) se devuelven con su ruta completa
const arbol = {
  '': [
    { name: 'plan-1', id: null },
    { name: 'raiz.pdf', id: 'a' }
  ],
  'plan-1': [
    { name: 'informe.pdf', id: 'b' },
    { name: 'sub', id: null }
  ],
  'plan-1/sub': [{ name: 'oficio.pdf', id: 'c' }]
};
const fetchFalso = async (url, op) => {
  const { prefix, offset } = JSON.parse(op.body);
  ok(op.headers.apikey === 'sb_secret_x' && !op.headers.Authorization, 'clave nueva: solo apikey');
  return { ok: true, json: async () => (offset ? [] : arbol[prefix] || []) };
};
const l = await listar('https://x.supabase.co', 'sb_secret_x', 'archivo', '', fetchFalso);
ok(cabeceras('eyJabc').Authorization === 'Bearer eyJabc', 'clave antigua (JWT): también Bearer');
const rutas = l.map(o => o.ruta).sort();
assert.deepEqual(rutas, ['plan-1/informe.pdf', 'plan-1/sub/oficio.pdf', 'raiz.pdf']);
n++;

// La clave pública se rechaza con mensaje claro; la secreta y la service_role pasan
const jwt = rol => 'eyJx.' + Buffer.from(JSON.stringify({ role: rol })).toString('base64url') + '.y';
assert.throws(() => revisarClave('sb_publishable_abc'), /PÚBLICA/);
assert.throws(() => revisarClave(jwt('anon')), /PÚBLICA/);
revisarClave('sb_secret_abc');
revisarClave(jwt('service_role'));
n += 4;

console.log(`copia-externa: ${n} verificaciones correctas`);
