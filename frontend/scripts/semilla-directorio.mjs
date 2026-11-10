// Genera src/datos/demo/directorio-semilla.ts desde datos/demo/ (los mismos datos ficticios de la demo 2.x):
// organismos (con su tipo) de historico.json y responsables de directorio.json, con los cambios que hace la demo
// pública de la 2.x (loadDir con ES_DEMO_PUBLICA): nombre "Responsable Ejemplo", celular y correo de ejemplo.
//   node scripts/semilla-directorio.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.join(AQUI, '..', '..', 'datos', 'demo');
const DESTINO = path.join(AQUI, '..', 'src', 'datos', 'demo', 'directorio-semilla.ts');

const hist = JSON.parse(fs.readFileSync(path.join(DEMO, 'historico.json'), 'utf8'));
const dir = JSON.parse(fs.readFileSync(path.join(DEMO, 'directorio.json'), 'utf8'));
const organismos = hist.orgs.map(([nombre, nivel]) => ({ nombre, nivel }));
const responsables = dir.map((x, k) => ({
  organismo: x.organismo,
  cargo: x.cargo,
  nombre: 'Responsable Ejemplo',
  telefono: x.telefono || '57300' + String(1000000 + k * 137).slice(-7),
  correo: 'responsable.ejemplo' + (k + 1) + '@cali.gov.co'
}));

const { format, resolveConfig } = await import('prettier');
const texto = `// ARCHIVO GENERADO por frontend/scripts/semilla-directorio.mjs desde datos/demo/ (datos ficticios). NO EDITAR A MANO.
import type { Organismo, Responsable } from '../../dominio/directorio';

export const ORGANISMOS_DEMO: readonly Organismo[] = ${JSON.stringify(organismos)};

export const RESPONSABLES_DEMO: readonly Responsable[] = ${JSON.stringify(responsables)};
`;
fs.writeFileSync(DESTINO, await format(texto, { ...(await resolveConfig(DESTINO)), filepath: DESTINO }));
console.log(`escrito ${path.relative(process.cwd(), DESTINO)}: ${organismos.length} organismos, ${responsables.length} responsables`);
