import { describe, expect, it } from 'vitest';
import {
  CAMPOS_CATALOGO,
  COLUMNAS_CATALOGO,
  limpiarCatalogo,
  puedeEditarCatalogos,
  textoCelda,
  TIPOS_ENTE,
  TITULO_VENTANA
} from './catalogos';

describe('catálogos (entes y dependencias), igual que vCatalog, catModal y saveCat de la 2.x', () => {
  it('solo el Super administrador edita', () => {
    expect(puedeEditarCatalogos('admin')).toBe(true);
    for (const r of ['alcalde', 'control_interno', 'secretario', 'enlace'] as const)
      expect(puedeEditarCatalogos(r)).toBe(false);
  });

  it('tipos de ente, columnas y campos en el orden de la 2.x', () => {
    expect(TIPOS_ENTE).toEqual(['Fiscal', 'Ministerio Público', 'Político', 'Disciplinario', 'Otro']);
    expect(COLUMNAS_CATALOGO.entes.map(c => c[1])).toEqual(['Nombre', 'Sigla', 'Tipo']);
    expect(COLUMNAS_CATALOGO.dependencias.map(c => c[1])).toEqual([
      'Dependencia',
      'Secretario(a)',
      'Correo',
      'Teléfono'
    ]);
    expect(CAMPOS_CATALOGO.dependencias.map(c => c[1])).toEqual([
      'Dependencia',
      'Secretario(a) de Despacho',
      'Correo institucional',
      'Teléfono celular (para WhatsApp)'
    ]);
  });

  it('título de la ventana', () => {
    expect(TITULO_VENTANA('entes', false)).toBe('Agregar ente de control');
    expect(TITULO_VENTANA('dependencias', true)).toBe('Editar dependencia');
  });

  it('celda vacía se muestra como guion largo', () => {
    expect(textoCelda('')).toBe('—');
    expect(textoCelda(null)).toBe('—');
    expect(textoCelda('CGR')).toBe('CGR');
  });

  it('quita espacios y exige el nombre', () => {
    expect(limpiarCatalogo({ nombre: '  Personería  ', sigla: ' PDC ', activo: true })).toEqual({
      ok: true,
      valor: { nombre: 'Personería', sigla: 'PDC', activo: true }
    });
    expect(limpiarCatalogo({ nombre: '   ', sigla: 'X' })).toEqual({
      ok: false,
      error: 'El nombre es obligatorio'
    });
  });
});
