// Integridad y respaldo de archivos (Configuración → Copias de seguridad). Copia de src/js/19-planes-norma-y-memoria.js
// de la 2.x (archivoInventario, crc32, zipCrear y el manifiesto de archivoZip): ZIP sin compresión (método «stored»)
// que se abre con cualquier descompresor, con un MANIFIESTO.csv de huellas SHA-256. Sin APIs del navegador.

/** Un archivo guardado en un depósito, con la huella registrada en la base de datos. */
export interface ArchivoInventario {
  deposito: 'soportes' | 'archivo';
  path: string;
  nombre: string;
  sha256: string;
  origen: string;
}

const CRC_TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** CRC-32 (el de ZIP). */
export function crc32(u8: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = (CRC_TABLA[(c ^ (u8[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** Texto → bytes UTF-8 (lo que hace TextEncoder, sin depender del navegador). */
export function utf8(s: string): Uint8Array {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}
/** zipCrear: ZIP «stored» con nombres en UTF-8 (bandera 0x0800); la fecha es la hora local de creación. */
export function crearZip(archivos: readonly { nombre: string; datos: Uint8Array }[], d: Date): Uint8Array {
  const partes: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let off = 0;
  const hora = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff,
    fecha = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  archivos.forEach(({ nombre, datos }) => {
    const n = utf8(nombre),
      crc = crc32(datos),
      h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(8, 0, true);
    h.setUint16(10, hora, true);
    h.setUint16(12, fecha, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, datos.length, true);
    h.setUint32(22, datos.length, true);
    h.setUint16(26, n.length, true);
    h.setUint16(28, 0, true);
    partes.push(new Uint8Array(h.buffer), n, datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, fecha, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, datos.length, true);
    c.setUint32(24, datos.length, true);
    c.setUint16(28, n.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), n);
    off += 30 + n.length + datos.length;
  });
  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, archivos.length, true);
  e.setUint16(10, archivos.length, true);
  e.setUint32(12, tamCentral, true);
  e.setUint32(16, off, true);
  const todo = [...partes, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(todo.reduce((s, x) => s + x.length, 0));
  let k = 0;
  for (const x of todo) {
    out.set(x, k);
    k += x.length;
  }
  return out;
}
/** Encabezado del MANIFIESTO.csv (archivoZip). */
export const ENCABEZADO_MANIFIESTO = [
  'deposito',
  'ruta',
  'nombre',
  'origen',
  'sha256_registrado',
  'sha256_descargado',
  'estado'
];
/** Fila del manifiesto: FALTA, HUELLA DISTINTA u OK. */
export function filaManifiesto(it: ArchivoInventario, shaDescargado: string | null): string[] {
  if (shaDescargado == null) return [it.deposito, it.path, it.nombre, it.origen, it.sha256, '', 'FALTA'];
  return [
    it.deposito,
    it.path,
    it.nombre,
    it.origen,
    it.sha256,
    shaDescargado,
    it.sha256 && shaDescargado !== it.sha256 ? 'HUELLA DISTINTA' : 'OK'
  ];
}
/** CSV con todas las celdas entre comillas y fin de línea CRLF; con BOM para que Excel lea las tildes. */
export const csvManifiesto = (filas: readonly (readonly string[])[]) =>
  '﻿' + filas.map(f => f.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
