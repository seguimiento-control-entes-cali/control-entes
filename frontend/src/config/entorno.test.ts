import { describe, expect, it } from 'vitest';
import { leerEntorno } from './entorno';

const URL_OK = 'https://abcdefghijklmnopqrst.supabase.co';
const CLAVE_OK = 'sb_publishable_EJEMPLO_de_prueba_123';

describe('leerEntorno', () => {
  it('sin variables arranca en demo', () => {
    expect(leerEntorno({}).variante).toBe('demo');
  });

  it('institucional exige dirección y clave publicable', () => {
    expect(() => leerEntorno({ VITE_VARIANTE: 'institucional' })).toThrow(/VITE_SUPABASE_URL/);
    expect(() => leerEntorno({ VITE_VARIANTE: 'institucional', VITE_SUPABASE_URL: URL_OK })).toThrow(
      /ANON_KEY/
    );
    expect(
      leerEntorno({
        VITE_VARIANTE: 'institucional',
        VITE_SUPABASE_URL: URL_OK + '/',
        VITE_SUPABASE_ANON_KEY: CLAVE_OK
      })
    ).toEqual({ variante: 'institucional', supabaseUrl: URL_OK, supabaseAnonKey: CLAVE_OK, remitente: '' });
  });

  it('remitente: solo un correo @cali.gov.co (como la 2.x); si no, queda vacío', () => {
    expect(leerEntorno({ VITE_REMITENTE: ' Nombre.Apellido@cali.gov.co ' }).remitente).toBe(
      'nombre.apellido@cali.gov.co'
    );
    expect(leerEntorno({ VITE_REMITENTE: 'alguien@gmail.com' }).remitente).toBe('');
    expect(leerEntorno({ VITE_REMITENTE: 'x@caliXgovXco' }).remitente).toBe('');
  });

  it('rechaza claves secretas en cualquier variante', () => {
    expect(() => leerEntorno({ VITE_SUPABASE_ANON_KEY: 'sb_secret_EJEMPLO' })).toThrow(/secreta/);
  });

  it('rechaza variantes desconocidas y direcciones sin https', () => {
    expect(() => leerEntorno({ VITE_VARIANTE: 'produccion' })).toThrow(/VITE_VARIANTE/);
    expect(() =>
      leerEntorno({
        VITE_VARIANTE: 'institucional',
        VITE_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co',
        VITE_SUPABASE_ANON_KEY: CLAVE_OK
      })
    ).toThrow(/https/);
  });
});
