// Paridad con la 2.x · integridad y respaldo de archivos: CRC-32 y ZIP byte por byte con el código REAL de la 2.x
// (crc32 y zipCrear), manifiesto, e inventario en la demo y con Supabase simulado. Datos FICTICIOS.
import { afterEach, describe, expect, it, vi } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO } from '../src/datos/demo';
import { datosSupabase } from '../src/datos/supabase';
import {
  ENCABEZADO_MANIFIESTO,
  crc32,
  crearZip,
  csvManifiesto,
  filaManifiesto,
  utf8
} from '../src/dominio/respaldo-archivos';

afterEach(() => {
  vi.useRealTimers();
});
const bytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0));

describe('paridad con la 2.x · ZIP de archivos', () => {
  const d2 = cargarApp(['crc32', 'zipCrear']) as {
    crc32: (u8: Uint8Array) => number;
    zipCrear: (a: { nombre: string; datos: Uint8Array }[]) => { arrayBuffer(): Promise<ArrayBuffer> };
  };
  it('CRC-32 igual (y el valor conocido de "123456789")', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    for (const s of ['', 'a', '%PDF-ficticio', 'ñandú y tildes', 'x'.repeat(5000)])
      expect(crc32(utf8(s)), s.slice(0, 20)).toBe(d2.crc32(utf8(s)));
  });
  it('UTF-8 igual a TextEncoder', () => {
    const { TextEncoder: TE } = globalThis as unknown as {
      TextEncoder: new () => { encode(s: string): Uint8Array };
    };
    for (const s of ['MANIFIESTO.csv', 'archivo/pm-1/2026/a-Oficio_Nº_1.pdf', 'ñ á é í ó ú 😀', '﻿"a","b"'])
      expect([...utf8(s)], s).toEqual([...new TE().encode(s)]);
  });
  it('mismo ZIP byte por byte con la misma hora', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 16, 17, 45, 31));
    const archivos = [
      { nombre: 'MANIFIESTO.csv', datos: utf8(csvManifiesto([ENCABEZADO_MANIFIESTO])) },
      { nombre: 'soportes/pm/pm-1/a-1_1.pdf', datos: bytes('%PDF-ficticio-1') },
      { nombre: 'archivo/pm-1/2026/x-Informe_ñ.pdf', datos: bytes('%PDF-ficticio-2'.repeat(300)) }
    ];
    const nuestro = crearZip(archivos, new Date());
    const suyo = new Uint8Array(await d2.zipCrear(archivos).arrayBuffer());
    expect(nuestro.length).toBe(suyo.length);
    expect([...nuestro]).toEqual([...suyo]);
  });
  it('manifiesto: FALTA, HUELLA DISTINTA u OK; comillas escapadas', () => {
    const it0 = {
      deposito: 'archivo' as const,
      path: 'p/a.pdf',
      nombre: 'Oficio "1".pdf',
      sha256: 'abc',
      origen: 'Archivo documental'
    };
    expect(filaManifiesto(it0, null).at(-1)).toBe('FALTA');
    expect(filaManifiesto(it0, 'xyz').at(-1)).toBe('HUELLA DISTINTA');
    expect(filaManifiesto(it0, 'abc').at(-1)).toBe('OK');
    expect(filaManifiesto({ ...it0, sha256: '' }, 'xyz').at(-1)).toBe('OK');
    expect(csvManifiesto([['a', 'Oficio "1"']])).toBe('﻿"a","Oficio ""1"""');
  });
});

describe('inventario de archivos', () => {
  it('demo: los documentos subidos en la sesión, con su huella y su contenido', async () => {
    const d = crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
    await d.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO);
    await d.auth.verificarCodigo(CODIGO_DEMO);
    expect(await d.planes.inventarioArchivos()).toEqual([]);
    const buf = bytes('%PDF-oficio').buffer;
    await d.planes.subirDocumento(
      { name: 'Oficio.pdf', size: buf.byteLength, arrayBuffer: () => Promise.resolve(buf) },
      { plan_id: 'pm-demo-1', tipo: 'oficio' }
    );
    const inv = await d.planes.inventarioArchivos();
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ deposito: 'archivo', nombre: 'Oficio.pdf', origen: 'Archivo documental' });
    const b = await d.planes.descargarArchivo(inv[0] as never);
    expect(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).toBe('%PDF-oficio');
  });
  it('Supabase: respuestas, avances y documentos (en la papelera también), por páginas', async () => {
    const filas: Record<string, unknown[]> = {
      requerimientos: [
        { radicado: 'R-1', soporte_path: 'req/r1.pdf', soporte_hash: 'h1' },
        { radicado: 'R-2', soporte_path: null, soporte_hash: null }
      ],
      pm_avances: [{ id: 'v-1', soporte_path: 'pm/p/a_1.pdf', soporte_hash: null }],
      archivo_documentos: [
        { path: 'pm/2026/x.pdf', nombre: 'x.pdf', sha256: 'h3', eliminado_at: '2026-11-01' }
      ]
    };
    const sb = {
      from: (t: string) => {
        const q = { select: () => q, range: () => Promise.resolve({ data: filas[t] ?? [], error: null }) };
        return q;
      },
      storage: {
        from: (b: string) => ({
          download: (p: string) =>
            Promise.resolve(
              p === 'req/r1.pdf'
                ? { data: { arrayBuffer: () => Promise.resolve(bytes('R').buffer) }, error: null }
                : { data: null, error: { message: 'no existe en ' + b } }
            )
        })
      }
    };
    const p = datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]).planes;
    const inv = await p.inventarioArchivos();
    expect(inv.map(x => [x.deposito, x.nombre, x.sha256, x.origen])).toEqual([
      ['soportes', 'Respuesta R-1.pdf', 'h1', 'Respuesta de requerimiento'],
      ['soportes', 'Avance v-1.pdf', '', 'Soporte de avance'],
      ['archivo', 'x.pdf', 'h3', 'Archivo documental (en la papelera)']
    ]);
    expect(await p.descargarArchivo(inv[0] as never)).not.toBeNull();
    expect(await p.descargarArchivo(inv[1] as never)).toBeNull();
  });
});
