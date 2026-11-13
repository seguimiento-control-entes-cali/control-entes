// Paridad con la 2.x · Cuentas y roles, con el código REAL de la 2.x (estadoCuenta y cuentaDe de
// src/js/08-vistas-catalogos-y-seguridad.js) en los cinco estados posibles.
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import {
  cuentaDe,
  estadoCuenta,
  otrasCuentas,
  validarInvitacion,
  validarTitular,
  type Cuenta
} from '../src/dominio/cuentas';
import type { Responsable } from '../src/dominio/directorio';

const DEPS = [
  { id: 1, nombre: 'Secretaría de Cultura' },
  { id: 2, nombre: 'Secretaría de Salud Pública' },
  { id: 3, nombre: 'Secretaría de Turismo' },
  { id: 4, nombre: 'Secretaría de Educación' },
  { id: 5, nombre: 'Secretaría de Gobierno' }
];
const t = (organismo: string, nombre: string, correo: string): Responsable => ({
  organismo,
  cargo: 'Secretario(a) de Despacho',
  nombre,
  telefono: '',
  correo
});
const DIR: Responsable[] = [
  t('Secretaría de Cultura', 'Ana Pérez', 'ana.perez@cali.gov.co'),
  t('Secretaría de Salud Pública', 'Luis', ''),
  t('Secretaría de Turismo', 'Rosa Díaz', 'rosa.diaz@cali.gov.co'),
  t('Secretaría de Educación', 'Juan Gil', 'juan.gil@cali.gov.co'),
  t('secretaria de gobierno', 'Eva Ruiz', 'eva.ruiz@cali.gov.co')
];
const c = (id: string, email: string, rol: string, dep: number | null, activo: boolean): Cuenta => ({
  id,
  email,
  nombre: id,
  rol,
  dependencia_id: dep,
  activo
});
const CUENTAS: Cuenta[] = [
  c('a', 'rosa.diaz@cali.gov.co', 'secretario', 3, false),
  c('b', 'otro@cali.gov.co', 'secretario', 4, true),
  c('c', 'EVA.RUIZ@cali.gov.co', 'secretario', 5, true),
  c('d', 'admin@cali.gov.co', 'admin', null, true),
  c('e', 'enlace@cali.gov.co', 'enlace', 2, true)
];

describe('paridad con la 2.x · Cuentas y roles', () => {
  it('mismo estado (sin cuenta, faltan datos, preparada, correo distinto y activa) y misma cuenta', () => {
    const d2 = cargarApp(['estadoCuenta', 'cuentaDe', 'S', 'DIRLIST', 'PERFILES']) as {
      estadoCuenta: (o: string) => [string, string, string];
      cuentaDe: (o: string) => { id: string } | null;
      S: { deps: unknown[] };
      DIRLIST: Responsable[];
      PERFILES: Cuenta[];
    };
    d2.S.deps = DEPS;
    d2.DIRLIST.push(...DIR);
    d2.PERFILES.push(...CUENTAS);
    const estados = DEPS.map(x => estadoCuenta(x.nombre, DEPS, CUENTAS, DIR));
    expect(estados.map(e => e[0])).toEqual(['sin', 'incompleto', 'inactiva', 'distinto', 'activa']);
    for (const x of DEPS) {
      expect(estadoCuenta(x.nombre, DEPS, CUENTAS, DIR), x.nombre).toEqual(d2.estadoCuenta(x.nombre));
      expect(cuentaDe(x.nombre, DEPS, CUENTAS)?.id ?? null, x.nombre).toBe(d2.cuentaDe(x.nombre)?.id ?? null);
    }
  });

  it('otras cuentas y validaciones con los textos de la 2.x', () => {
    expect(
      otrasCuentas(
        CUENTAS,
        DEPS.map(x => x.nombre),
        DEPS
      ).map(x => x.id)
    ).toEqual(['d', 'e']);
    const ok = { nombre: 'Ana  Pérez', correo: 'ana.perez@cali.gov.co', telefono: '' };
    expect(validarTitular(ok, null, CUENTAS)).toBeNull();
    expect(validarTitular({ ...ok, nombre: 'Ana' }, null, CUENTAS)).toBe(
      'Escribe el nombre completo: nombres y apellidos.'
    );
    expect(validarTitular({ ...ok, correo: 'ana@gmail.com' }, null, CUENTAS)).toBe(
      'El correo debe ser institucional @cali.gov.co.'
    );
    expect(validarTitular({ ...ok, telefono: '12345' }, null, CUENTAS)).toBe(
      'El celular debe tener 10 dígitos e iniciar en 3.'
    );
    expect(validarTitular({ ...ok, correo: 'admin@cali.gov.co' }, null, CUENTAS)).toBe(
      'Ese correo ya pertenece a otra cuenta (admin@cali.gov.co).'
    );
    expect(validarTitular({ ...ok, correo: 'rosa.diaz@cali.gov.co' }, 'a', CUENTAS)).toBeNull();
    expect(
      validarInvitacion({ nombre: 'Ana', correo: 'ana.perez@cali.gov.co', rol: 'admin', dependencia: '' })
    ).toBe('Escribe el nombre completo.');
    expect(
      validarInvitacion({
        nombre: 'Ana Pérez',
        correo: 'ana.perez@cali.gov.co',
        rol: 'enlace',
        dependencia: ''
      })
    ).toBe('Un enlace operativo debe tener dependencia.');
  });
});
