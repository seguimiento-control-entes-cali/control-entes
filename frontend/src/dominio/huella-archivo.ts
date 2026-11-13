// Huella SHA-256 de un archivo (sha256Hex de la 2.x con un ArrayBuffer): la calcula el navegador (Web Crypto).
/** Lo que se necesita de un archivo elegido (File del navegador): leer sus bytes y, si lo trae, su nombre. */
export interface ArchivoSoporte {
  arrayBuffer(): Promise<ArrayBuffer>;
  name?: string;
}
interface CriptoWeb {
  subtle: { digest(algoritmo: string, datos: ArrayBuffer): Promise<ArrayBuffer> };
}
export async function huellaArchivo(archivo: ArchivoSoporte): Promise<string> {
  const { crypto } = globalThis as unknown as { crypto: CriptoWeb };
  const h = await crypto.subtle.digest('SHA-256', await archivo.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}
