#!/usr/bin/env node
/**
 * COPIA EXTERNA (fuera de Supabase). La ejecuta cada semana .github/workflows/copia-externa.yml.
 * Descarga a una carpeta local:
 *   datos/      la copia de datos más reciente del depósito privado «respaldos» (respaldo_AAAA-MM-DD_HHMM.json.gz)
 *   archivos/   todos los archivos de los depósitos «soportes» y «archivo», con MANIFIESTO.csv (huella SHA-256),
 *               en el mismo formato que restaura scripts/restaurar-archivos.mjs
 * Falla (y GitHub avisa por correo) si la copia de datos más reciente tiene más de 9 días: así se nota si la copia
 * semanal de Supabase dejó de hacerse. El cifrado lo hace la tarea de GitHub después (el repositorio es público).
 *
 * Uso: SUPABASE_SERVICE_ROLE_KEY=… node scripts/copia-externa.mjs <carpeta>
 *      (la dirección sale de configuracion.json; la clave de servicio NUNCA va en archivos ni en la aplicación)
 * Sin paquetes adicionales (Node 18 o posterior).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const DEPOSITOS_ARCHIVOS = ['soportes', 'archivo'];

/**
 * Cabeceras de la clave. Las claves nuevas de Supabase (sb_secret_…) van SOLO en «apikey»: no son JWT y la API las
 * rechaza en «Authorization: Bearer». Las claves antiguas (JWT, empiezan por eyJ) van en las dos.
 */
export const cabeceras = clave =>
  /^eyJ/.test(clave) ? { Authorization: `Bearer ${clave}`, apikey: clave } : { apikey: clave };
const MAX_DIAS = 9;

/**
 * La clave pública (sb_publishable_… o la JWT «anon») entra a Supabase pero NO ve los depósitos privados: la lista
 * llega vacía sin error. Se rechaza antes, con un mensaje claro. No se imprime la clave.
 */
export function revisarClave(clave) {
  let rol = '';
  if (/^eyJ/.test(clave))
    try {
      rol = JSON.parse(Buffer.from(clave.split('.')[1], 'base64url').toString()).role || '';
    } catch {
      rol = '';
    }
  if (/^sb_publishable_/.test(clave) || rol === 'anon')
    throw new Error(
      'El secreto SUPABASE_SERVICE_ROLE_KEY tiene la clave PÚBLICA de Supabase (publishable/anon). Debe ser la SECRETA: Supabase → Project Settings → API Keys → Secret keys (empieza por sb_secret_).'
    );
}

/** Lista recursivamente los objetos de un depósito (la API devuelve carpetas sin id). */
export async function listar(base, clave, deposito, prefijo = '', fetchFn = fetch) {
  const salida = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetchFn(`${base}/storage/v1/object/list/${deposito}`, {
      method: 'POST',
      headers: { ...cabeceras(clave), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: prefijo, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    });
    if (!r.ok)
      throw new Error(
        `No se pudo listar ${deposito}/${prefijo}: ${r.status} ${(await r.text()).slice(0, 200)}`
      );
    const l = await r.json();
    for (const o of l) {
      const ruta = prefijo ? `${prefijo}/${o.name}` : o.name;
      if (o.id) salida.push({ ruta, actualizado: o.updated_at || o.created_at || '' });
      else salida.push(...(await listar(base, clave, deposito, ruta, fetchFn)));
    }
    if (l.length < 1000) break;
  }
  return salida;
}

/** La copia de datos más reciente por su nombre respaldo_AAAA-MM-DD_HHMM.json.gz. */
export function masReciente(objetos) {
  const l = objetos.filter(o => /(^|\/)respaldo_\d{4}-\d{2}-\d{2}_\d{4}\.json\.gz$/.test(o.ruta));
  l.sort((a, b) => path.basename(a.ruta).localeCompare(path.basename(b.ruta)));
  return l.at(-1) || null;
}

/** Días entre la fecha del nombre de la copia y hoy. */
export function diasDesde(ruta, hoy = new Date()) {
  const m = /respaldo_(\d{4})-(\d{2})-(\d{2})_/.exec(path.basename(ruta));
  if (!m) return Infinity;
  return Math.floor((hoy - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
}

const csv = v => '"' + String(v).replace(/"/g, '""') + '"';

async function descargar(base, clave, deposito, ruta) {
  const r = await fetch(
    `${base}/storage/v1/object/${deposito}/${ruta.split('/').map(encodeURIComponent).join('/')}`,
    {
      headers: cabeceras(clave)
    }
  );
  if (!r.ok) throw new Error(`No se pudo descargar ${deposito}/${ruta}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function principal() {
  const carpeta = process.argv[2];
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const base = (
    JSON.parse(fs.readFileSync(path.join(raiz, 'configuracion.json'), 'utf8')).supabaseUrl || ''
  ).replace(/\/+$/, '');
  if (!carpeta) throw new Error('Uso: node scripts/copia-externa.mjs <carpeta>');
  if (!clave)
    throw new Error(
      'Falta el secreto SUPABASE_SERVICE_ROLE_KEY (GitHub → Settings → Secrets and variables → Actions).'
    );
  revisarClave(clave);
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base))
    throw new Error('configuracion.json no tiene una dirección de Supabase válida');

  // 1. Datos: la copia más reciente
  const ultima = masReciente(await listar(base, clave, 'respaldos'));
  if (!ultima) throw new Error('No hay ninguna copia de datos en el depósito «respaldos».');
  fs.mkdirSync(path.join(carpeta, 'datos'), { recursive: true });
  const datos = await descargar(base, clave, 'respaldos', ultima.ruta);
  fs.writeFileSync(path.join(carpeta, 'datos', path.basename(ultima.ruta)), datos);
  const dias = diasDesde(ultima.ruta);
  console.log(
    `Datos: ${path.basename(ultima.ruta)} (${(datos.length / 1024).toFixed(0)} KB, hace ${dias} días)`
  );

  // 2. Archivos, con su manifiesto
  const filas = [
    ['deposito', 'ruta', 'bytes', 'sha256_registrado', 'sha256_calculado', 'estado'].map(csv).join(',')
  ];
  let n = 0,
    bytes = 0;
  for (const dep of DEPOSITOS_ARCHIVOS) {
    for (const o of await listar(base, clave, dep)) {
      const b = await descargar(base, clave, dep, o.ruta);
      const destino = path.join(carpeta, 'archivos', dep, ...o.ruta.split('/'));
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, b);
      const h = crypto.createHash('sha256').update(b).digest('hex');
      filas.push([dep, o.ruta, b.length, h, h, 'OK'].map(csv).join(','));
      n++;
      bytes += b.length;
    }
  }
  fs.mkdirSync(path.join(carpeta, 'archivos'), { recursive: true });
  fs.writeFileSync(path.join(carpeta, 'archivos', 'MANIFIESTO.csv'), '﻿' + filas.join('\n') + '\n');
  console.log(`Archivos: ${n} (${(bytes / 1048576).toFixed(1)} MB) de ${DEPOSITOS_ARCHIVOS.join(' y ')}`);

  if (dias > MAX_DIAS)
    throw new Error(
      `La copia de datos más reciente tiene ${dias} días: la copia semanal de Supabase no se está haciendo. Revise Configuración → Salud del sistema.`
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  principal().catch(e => {
    console.error('COPIA EXTERNA FALLÓ: ' + e.message);
    // En GitHub, el motivo queda a la vista en el resumen de la ejecución (sin datos ni claves)
    if (process.env.GITHUB_ACTIONS) console.log('::error::' + e.message.replace(/\r?\n/g, ' '));
    process.exit(1);
  });
