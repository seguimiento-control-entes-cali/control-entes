// Implementación Supabase probada con un cliente simulado (sin red ni base real): mismos pasos que la 2.x.
import { describe, expect, it } from 'vitest';
import { datosSupabase } from '../src/datos/supabase';

interface Escenario {
  claveOk?: boolean;
  perfil?: Record<string, unknown> | null;
  aal?: { currentLevel: string; nextLevel: string };
  codigoOk?: boolean;
}

function cliente(e: Escenario) {
  const llamadas: string[] = [];
  let sesion: { user: { id: string; email: string } } | null = null;
  let nivel = e.aal ?? { currentLevel: 'aal1', nextLevel: 'aal1' };
  const consulta = (tabla: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      order: () => Promise.resolve({ data: [{ id: 1, nombre: 'X', tabla }], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: tabla === 'profiles' ? e.perfil : { dias_rojo: 7, correo_disciplinario: 'd@cali.gov.co' },
          error: null
        }),
      insert: () => {
        llamadas.push('insert ' + tabla);
        return Promise.resolve({ data: null, error: null });
      }
    };
    return q;
  };
  const sb = {
    from: consulta,
    auth: {
      signInWithPassword: async () => {
        if (!e.claveOk) return { data: { session: null }, error: { message: 'Invalid login' } };
        sesion = { user: { id: 'u1', email: 'persona@cali.gov.co' } };
        return { data: { session: sesion }, error: null };
      },
      signOut: async () => {
        llamadas.push('signOut');
        sesion = null;
        return { error: null };
      },
      getSession: async () => ({ data: { session: sesion } }),
      resetPasswordForEmail: async (_c: string, o: { redirectTo: string }) => {
        llamadas.push('reset ' + o.redirectTo);
        return { error: null };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: nivel }),
        listFactors: async () => ({ data: { totp: [{ id: 'f1', status: 'verified' }] }, error: null }),
        challengeAndVerify: async ({ code }: { code: string }) => {
          if (!e.codigoOk || code !== '123456') return { error: { message: 'Invalid TOTP' } };
          nivel = { currentLevel: 'aal2', nextLevel: 'aal2' };
          return { error: null };
        }
      }
    }
  };
  return { datos: datosSupabase(sb as unknown as Parameters<typeof datosSupabase>[0]), llamadas };
}

const PERFIL = {
  id: 'u1',
  email: 'persona@cali.gov.co',
  nombre: 'Persona',
  rol: 'enlace',
  dependencia_id: 21,
  activo: true
};

describe('capa de datos · Supabase (cliente simulado)', () => {
  it('contraseña incorrecta', async () => {
    await expect(cliente({ claveOk: false }).datos.auth.ingresar('a@cali.gov.co', 'x')).rejects.toMatchObject(
      {
        codigo: 'credenciales'
      }
    );
  });

  it('cuenta inactiva: cierra la sesión y avisa, como la 2.x', async () => {
    const c = cliente({ claveOk: true, perfil: { ...PERFIL, activo: false } });
    await expect(c.datos.auth.ingresar('persona@cali.gov.co', 'ok')).rejects.toMatchObject({
      codigo: 'cuenta_inactiva'
    });
    expect(c.llamadas).toContain('signOut');
  });

  it('sin perfil: cierra la sesión', async () => {
    const c = cliente({ claveOk: true, perfil: null });
    await expect(c.datos.auth.ingresar('persona@cali.gov.co', 'ok')).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
    expect(c.llamadas).toContain('signOut');
  });

  it('sin verificación en dos pasos: entra y devuelve el perfil', async () => {
    const c = cliente({ claveOk: true, perfil: PERFIL });
    expect((await c.datos.auth.ingresar('persona@cali.gov.co', 'ok')).tipo).toBe('listo');
    expect(await c.datos.identidad.miPerfil()).toMatchObject({ rol: 'enlace', dependenciaId: 21 });
    await c.datos.identidad.registrarAcceso();
    expect(c.llamadas).toContain('insert accesos');
  });

  it('con verificación en dos pasos: pide el código; sin él no hay sesión; con él sí', async () => {
    const c = cliente({
      claveOk: true,
      perfil: { ...PERFIL, rol: 'admin' },
      aal: { currentLevel: 'aal1', nextLevel: 'aal2' },
      codigoOk: true
    });
    expect(await c.datos.auth.ingresar('persona@cali.gov.co', 'ok')).toEqual({ tipo: 'requiere_codigo' });
    expect(await c.datos.identidad.miPerfil()).toBeNull();
    await expect(c.datos.auth.verificarCodigo('000000')).rejects.toMatchObject({ codigo: 'codigo' });
    expect((await c.datos.auth.verificarCodigo('123 456')).nivel).toBe('aal2');
    expect((await c.datos.identidad.miPerfil())?.rol).toBe('admin');
  });

  it('un rol desconocido en la base no se acepta', async () => {
    const c = cliente({ claveOk: true, perfil: { ...PERFIL, rol: 'root' } });
    await expect(c.datos.auth.ingresar('persona@cali.gov.co', 'ok')).rejects.toMatchObject({
      codigo: 'sin_permiso'
    });
  });

  it('recuperar contraseña vuelve a la dirección indicada; catálogos y configuración', async () => {
    const c = cliente({ claveOk: true, perfil: PERFIL });
    await c.datos.auth.recuperarClave(
      ' persona@cali.gov.co ',
      'https://seguimiento-control-entes-cali.github.io/control-entes/v3/'
    );
    expect(c.llamadas).toContain('reset https://seguimiento-control-entes-cali.github.io/control-entes/v3/');
    expect(await c.datos.catalogos.entes()).toHaveLength(1);
    expect(await c.datos.catalogos.configuracion()).toEqual({
      diasRojo: 7,
      correoDisciplinario: 'd@cali.gov.co'
    });
  });
});
