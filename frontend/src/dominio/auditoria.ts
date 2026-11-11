// Pista de auditoría con cadena de custodia SHA-256. Copia de la 2.x: src/js/04-capa-de-datos.js (demoAudit y
// db.verify en modo demostración), src/js/08-vistas-catalogos-y-seguridad.js (vAuditoria, verifyChain) y fmtTs de
// src/js/02-utilidades.js. En la base real la verificación la hace la función verificar_cadena_auditoria (script 08).
import { formatoCorto } from './fechas';

export interface EventoAuditoria {
  id: number;
  tabla: string;
  accion: string;
  registro_id: string;
  usuario: string;
  payload: unknown;
  cambios: unknown;
  prev_hash: string;
  hash: string;
  created_at: string;
}
export interface ResultadoVerificacion {
  ok: boolean;
  total: number;
  primer_id_roto: number | null;
}

export const HUELLA_INICIAL = '0'.repeat(64);

/** Texto del que sale la huella de un evento (el mismo orden y separador de la 2.x). */
export function textoParaHuella(prev: string, e: Omit<EventoAuditoria, 'id' | 'prev_hash' | 'hash'>): string {
  return [
    prev,
    e.tabla,
    e.accion,
    e.registro_id,
    e.usuario,
    e.created_at,
    JSON.stringify(e.payload),
    JSON.stringify(e.cambios || {})
  ].join('|');
}

/** Verifica la cadena en orden (db.verify de la 2.x en demostración): la primera huella que no cuadra la rompe. */
export function verificarCadena(eventos: readonly EventoAuditoria[]): ResultadoVerificacion {
  let prev = HUELLA_INICIAL;
  for (let i = 0; i < eventos.length; i++) {
    const r = eventos[i] as EventoAuditoria;
    if (r.prev_hash !== prev || r.hash !== sha256Hex(textoParaHuella(prev, r)))
      return { ok: false, total: i + 1, primer_id_roto: r.id };
    prev = r.hash;
  }
  return { ok: true, total: eventos.length, primer_id_roto: null };
}

/** Fecha y hora local DD/MM/AAAA HH:MM (fmtTs de la 2.x). */
export function formatoFechaHora(s: string): string {
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return formatoCorto(iso) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ---------- SHA-256 (FIPS 180-4) en código, sin depender del navegador: sirve en la demo y en las pruebas ----------
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
  0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
  0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2
]);
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** Texto a bytes UTF-8 (lo mismo que TextEncoder, escrito aquí porque dominio/ no usa objetos del navegador). */
function utf8(texto: string): Uint8Array {
  const out: number[] = [];
  for (const ch of texto) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** Huella SHA-256 en hexadecimal de un texto (UTF-8), igual a sha256Hex de la 2.x. */
export function sha256Hex(texto: string): string {
  const datos = utf8(texto);
  const largo = datos.length;
  const bloques = Math.ceil((largo + 9) / 64) * 64;
  const m = new Uint8Array(bloques);
  m.set(datos);
  m[largo] = 0x80;
  const vista = new DataView(m.buffer);
  vista.setUint32(bloques - 8, Math.floor((largo * 8) / 0x100000000));
  vista.setUint32(bloques - 4, (largo * 8) >>> 0);
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const w = new Uint32Array(64);
  for (let o = 0; o < bloques; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] as number,
        b = w[i - 2] as number;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e as number, 6) ^ rotr(e as number, 11) ^ rotr(e as number, 25);
      const ch = ((e as number) & (f as number)) ^ (~(e as number) & (g as number));
      const t1 = ((hh as number) + S1 + ch + (K[i] as number) + (w[i] as number)) >>> 0;
      const S0 = rotr(a as number, 2) ^ rotr(a as number, 13) ^ rotr(a as number, 22);
      const mj =
        ((a as number) & (b as number)) ^ ((a as number) & (c as number)) ^ ((b as number) & (c as number));
      const t2 = (S0 + mj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = ((d as number) + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = ((h[0] as number) + (a as number)) >>> 0;
    h[1] = ((h[1] as number) + (b as number)) >>> 0;
    h[2] = ((h[2] as number) + (c as number)) >>> 0;
    h[3] = ((h[3] as number) + (d as number)) >>> 0;
    h[4] = ((h[4] as number) + (e as number)) >>> 0;
    h[5] = ((h[5] as number) + (f as number)) >>> 0;
    h[6] = ((h[6] as number) + (g as number)) >>> 0;
    h[7] = ((h[7] as number) + (hh as number)) >>> 0;
  }
  return [...h].map(x => x.toString(16).padStart(8, '0')).join('');
}

/** Crea el siguiente evento de la cadena (demoAudit de la 2.x). */
export function nuevoEvento(
  anteriores: readonly EventoAuditoria[],
  datos: {
    tabla: string;
    accion: string;
    registro_id: string;
    usuario: string;
    payload: unknown;
    cambios?: unknown;
    created_at: string;
  }
): EventoAuditoria {
  const prev = anteriores.length
    ? (anteriores[anteriores.length - 1] as EventoAuditoria).hash
    : HUELLA_INICIAL;
  const base = { ...datos, cambios: datos.cambios ?? {} };
  return {
    id: anteriores.length + 1,
    ...base,
    prev_hash: prev,
    hash: sha256Hex(textoParaHuella(prev, base))
  };
}
