import { describe, expect, it } from 'vitest';
import { crearDatos } from '../src/datos/index';
import { CLAVE_DEMO, CODIGO_DEMO, PERFILES_DEMO } from '../src/datos/demo';
import { ErrorDatos } from '../src/datos/contratos';
import { esRol } from '../src/dominio/roles';

const demo = () => crearDatos({ variante: 'demo', supabaseUrl: '', supabaseAnonKey: '' });

describe('capa de datos · demostración', () => {
  it('una cuenta ficticia por rol, todas @cali.gov.co', () => {
    expect(PERFILES_DEMO.map(p => p.rol).sort()).toEqual([
      'admin',
      'alcalde',
      'control_interno',
      'enlace',
      'secretario'
    ]);
    for (const p of PERFILES_DEMO) {
      expect(esRol(p.rol)).toBe(true);
      expect(p.correo).toMatch(/^[a-z.]+@cali\.gov\.co$/);
    }
  });

  it('ingreso sin código para enlace; perfil y salida', async () => {
    const d = demo();
    const r = await d.auth.ingresar('ENLACE.demo@cali.gov.co ', CLAVE_DEMO);
    expect(r.tipo).toBe('listo');
    expect((await d.identidad.miPerfil())?.rol).toBe('enlace');
    await d.auth.salir();
    expect(await d.auth.sesionActual()).toBeNull();
    expect(await d.identidad.miPerfil()).toBeNull();
  });

  it('el Super administrador pide el código de verificación', async () => {
    const d = demo();
    expect(await d.auth.ingresar('admin.demo@cali.gov.co', CLAVE_DEMO)).toEqual({ tipo: 'requiere_codigo' });
    expect(await d.auth.sesionActual()).toBeNull();
    await expect(d.auth.verificarCodigo('000000')).rejects.toMatchObject({ codigo: 'codigo' });
    const s = await d.auth.verificarCodigo(CODIGO_DEMO);
    expect(s.nivel).toBe('aal2');
    expect((await d.identidad.miPerfil())?.rol).toBe('admin');
  });

  it('credenciales incorrectas', async () => {
    const d = demo();
    await expect(d.auth.ingresar('enlace.demo@cali.gov.co', 'otra')).rejects.toBeInstanceOf(ErrorDatos);
    await expect(d.auth.ingresar('nadie@cali.gov.co', CLAVE_DEMO)).rejects.toMatchObject({
      codigo: 'credenciales'
    });
  });

  it('catálogos de supabase/02_seed.sql (10 entes, 30 dependencias) y configuración por defecto', async () => {
    const d = demo();
    expect(await d.catalogos.entes()).toHaveLength(10);
    const deps = await d.catalogos.dependencias();
    expect(deps).toHaveLength(30);
    expect(deps.find(x => x.id === 21)?.nombre).toBe('Secretaría de Salud Pública');
    expect(await d.catalogos.configuracion()).toEqual({ diasRojo: 5, correoDisciplinario: '' });
  });

  it('la variante institucional usa la implementación real (sin conectarse al crearla)', () => {
    const d = crearDatos({
      variante: 'institucional',
      supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
      supabaseAnonKey: 'sb_publishable_EJEMPLO_de_prueba'
    });
    expect(typeof d.auth.ingresar).toBe('function');
  });
});
