// Paridad con la 2.x · directorio del gabinete: compara las reglas de dominio/directorio.ts con el código REAL de la
// 2.x (src/js/10-historico-y-directorio-datos.js, cargado con tests/cargar-app.cjs).
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import {
  claveOrganismo,
  esNombreCompleto,
  estadoContacto,
  formatoCelular,
  NIVELES_PRINCIPALES,
  nombreCorto,
  normalizarCelular,
  normalizarCorreo
} from '../src/dominio/directorio';

const d2 = cargarApp([
  'orgKey',
  'normPhone',
  'fmtPhone',
  'normMail',
  'fullName',
  'ctStatus',
  'shortOrg',
  'MAIN_NIV'
]) as {
  orgKey: (s: string) => string;
  normPhone: (s: string) => string;
  fmtPhone: (s: string) => string;
  normMail: (s: string) => string;
  fullName: (s: string) => boolean;
  ctStatus: (x: unknown) => string;
  shortOrg: (s: string) => string;
  MAIN_NIV: string[];
};

const textos = [
  '',
  '  ',
  'Secretaría de Salud Pública',
  'SECRETARIA DE SALUD PUBLICA',
  'Secretaría  de   Salud (Pública)',
  'Departamento Administrativo de Gestión del Medio Ambiente (DAGMA)',
  'Oficina de la Secretaría Privada y Despacho del Alcalde',
  'Unidad Administrativa Especial de Servicios Públicos',
  'Secretaría del Deporte y la Recreación',
  'ñandú ÁÉÍÓÚ',
  'Departamento Administrativo de Tecnologías de la Información y las Comunicaciones'
];
const celulares = [
  '',
  '3001234567',
  '300 123 4567',
  '+57 300 123 4567',
  '573001234567',
  '2001234567',
  '30012345',
  'abc'
];
const correos = [
  '',
  'Ana.Perez@cali.gov.co',
  ' ana@cali.gov.co ',
  'ana@gmail.com',
  'ana@cali.gov.co.co',
  'a b@cali.gov.co'
];
const nombres = ['', 'Ana', 'Ana Pérez', 'A B', 'Ana  María', '  José   de la Cruz  '];

describe('paridad con la 2.x · directorio del gabinete', () => {
  it('mismos niveles principales', () => expect([...NIVELES_PRINCIPALES]).toEqual(d2.MAIN_NIV));
  it('misma llave de organismo y mismo nombre corto', () => {
    for (const t of textos) {
      expect(claveOrganismo(t), t).toBe(d2.orgKey(t));
      expect(nombreCorto(t), t).toBe(d2.shortOrg(t));
    }
  });
  it('mismo celular, correo y nombre completo', () => {
    for (const c of celulares) {
      expect(normalizarCelular(c), c).toBe(d2.normPhone(c));
      expect(formatoCelular(normalizarCelular(c)), c).toBe(d2.fmtPhone(d2.normPhone(c)));
    }
    for (const c of correos) expect(normalizarCorreo(c), c).toBe(d2.normMail(c));
    for (const n of nombres) expect(esNombreCompleto(n), n).toBe(d2.fullName(n));
  });
  it('mismo estado de cada contacto', () => {
    expect(estadoContacto(null)).toBe(d2.ctStatus(null));
    for (const nombre of nombres)
      for (const telefono of celulares) {
        const x = { organismo: 'X', cargo: 'Director(a)', nombre, telefono, correo: '' };
        expect(estadoContacto(x), nombre + '|' + telefono).toBe(d2.ctStatus(x));
      }
  });
});
