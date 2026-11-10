import { describe, expect, it } from 'vitest';
import {
  cargoPorNivel,
  filasCsvDirectorio,
  filtrarFilas,
  organismosPrincipales,
  resumirDirectorio,
  validarResponsable,
  type Responsable
} from './directorio';

const R = (organismo: string, nombre = '', telefono = '', correo = ''): Responsable => ({
  organismo,
  cargo: 'Director(a)',
  nombre,
  telefono,
  correo
});

describe('directorio del gabinete', () => {
  it('solo dependencias principales, sin repetir, en orden alfabético', () => {
    expect(
      organismosPrincipales([
        { nombre: 'Secretaría de Salud', nivel: 'Secretaría' },
        { nombre: 'Concejo', nivel: 'Otro' },
        { nombre: 'DAGMA', nivel: 'Departamento' },
        { nombre: 'Secretaría de Salud', nivel: 'Secretaría' },
        { nombre: 'Árbol UAE', nivel: 'UAE' }
      ])
    ).toEqual(['Árbol UAE', 'DAGMA', 'Secretaría de Salud']);
  });

  it('resume estados, huérfanos y celulares duplicados', () => {
    const lista = [
      R('Secretaría de Salud', 'Ana Pérez', '573001234567'),
      R('DAGMA', 'Ana', '573001234567'),
      R('Oficina que no existe', 'Luis Gómez', '573009999999')
    ];
    const r = resumirDirectorio(['DAGMA', 'Secretaría de Salud', 'Secretaría de Educación'], lista);
    expect(r.filas.map(f => [f.organismo, f.estado])).toEqual([
      ['DAGMA', 'nombre'],
      ['Secretaría de Salud', 'ok'],
      ['Secretaría de Educación', 'sin']
    ]);
    expect({ listas: r.listas, incompletas: r.incompletas, sin: r.sinResponsable, total: r.total }).toEqual({
      listas: 1,
      incompletas: 1,
      sin: 1,
      total: 3
    });
    expect(r.huerfanos.map(h => h.organismo)).toEqual(['Oficina que no existe']);
    expect(r.duplicados).toEqual([{ celular: '573001234567', organismos: ['Secretaría de Salud', 'DAGMA'] }]);
    // la llave ignora tildes y mayúsculas
    expect(resumirDirectorio(['SECRETARIA DE SALUD'], lista).filas[0]?.estado).toBe('ok');
  });

  it('filtra por texto (sin tildes) y por estado', () => {
    const r = resumirDirectorio(
      ['DAGMA', 'Secretaría de Salud'],
      [R('Secretaría de Salud', 'Ana Pérez', '3001234567')]
    );
    expect(filtrarFilas(r.filas, 'salud', 'todos')).toHaveLength(1);
    expect(filtrarFilas(r.filas, 'ana perez', 'todos')).toHaveLength(1);
    expect(filtrarFilas(r.filas, '', 'pend').map(f => f.organismo)).toEqual(['DAGMA']);
    expect(filtrarFilas(r.filas, '', 'ok').map(f => f.organismo)).toEqual(['Secretaría de Salud']);
    expect(filtrarFilas(r.filas, '', 'sin').map(f => f.organismo)).toEqual(['DAGMA']);
  });

  it('valida igual que "Guardar" de la 2.x', () => {
    const base = R('DAGMA');
    const lista = [base, R('Secretaría de Salud', 'Ana Pérez', '573001234567', 'ana.perez@cali.gov.co')];
    const v = (e: Partial<{ cargo: string; nombre: string; telefono: string; correo: string }>) =>
      validarResponsable({ cargo: '', nombre: '', telefono: '', correo: '', ...e }, base, 0, lista);
    expect(v({ telefono: '12345' })).toEqual({ error: 'El celular debe tener 10 dígitos e iniciar en 3' });
    expect(v({ nombre: 'Luis' })).toEqual({ error: 'Escribe el nombre completo: nombres y apellidos' });
    expect(v({ telefono: '3101234567' })).toEqual({
      error: 'Agrega el nombre completo del responsable antes de guardar el celular'
    });
    expect(v({ nombre: 'Luis Gómez', correo: 'luis@gmail.com' })).toEqual({
      error: 'El correo debe ser institucional: nombre.apellido@cali.gov.co'
    });
    expect(v({ nombre: 'Luis Gómez', correo: 'ANA.PEREZ@cali.gov.co' })).toEqual({
      error: 'Ese correo ya está asignado a Salud'
    });
    expect(v({ nombre: 'Luis Gómez', telefono: '300 123 4567' })).toEqual({
      error: 'Ese celular ya está asignado a Salud'
    });
    expect(
      v({ cargo: '', nombre: '  Luis   Gómez ', telefono: '310 123 4567', correo: ' Luis.Gomez@cali.gov.co' })
    ).toEqual({
      fila: {
        organismo: 'DAGMA',
        cargo: 'Director(a)',
        nombre: 'Luis Gómez',
        telefono: '573101234567',
        correo: 'luis.gomez@cali.gov.co'
      }
    });
  });

  it('cargo sugerido y archivo CSV', () => {
    expect(cargoPorNivel('Secretaría')).toBe('Secretario(a) de Despacho');
    expect(cargoPorNivel('Despacho')).toBe('Secretario(a) Privado(a)');
    expect(cargoPorNivel('Departamento')).toBe('Director(a)');
    expect(filasCsvDirectorio([R('DAGMA', 'Ana Pérez', '573001234567')])).toEqual([
      ['Dependencia', 'Cargo', 'Nombre', 'Celular'],
      ['DAGMA', 'Director(a)', 'Ana Pérez', '573001234567']
    ]);
  });
});
