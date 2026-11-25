// @vitest-environment jsdom
// Recorridos de la 3.0 en modo demostración: ingreso, código de verificación, menú por rol, pantallas y salida.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';
import type { Datos } from '../datos/contratos';

const montar = () => {
  window.location.hash = '';
  return render(
    <App datos={arrancar({})} cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />
  );
};
const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const menu = () => within(screen.getByRole('navigation', { name: 'Menú principal' }));
const ingresar = () => fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

afterEach(cleanup);

describe('3.0 · ingreso y menú (demo)', () => {
  it('muestra el ingreso y rechaza credenciales incorrectas', async () => {
    montar();
    expect(await screen.findByLabelText(/correo institucional/i)).toBeTruthy();
    escribir(/correo institucional/i, 'enlace.demo@cali.gov.co');
    escribir(/contraseña/i, 'otra');
    ingresar();
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /contraseña de todos los usuarios es «demo»/
    );
    // Una cuenta real escrita en la app de prueba: lo dice claramente
    escribir(/correo institucional/i, 'persona.real@cali.gov.co');
    ingresar();
    expect((await screen.findByRole('alert')).textContent).toMatch(/APP DE PRUEBA/);
  });

  it('la app de prueba muestra los usuarios de prueba y los llena con un clic', async () => {
    window.location.hash = '';
    render(
      <App
        demo
        datos={arrancar({})}
        cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      />
    );
    const lista = await screen.findByRole('note', { name: 'Usuarios de prueba' });
    fireEvent.click(within(lista).getByRole('button', { name: /Control Interno/ }));
    expect((screen.getByLabelText(/correo institucional/i) as HTMLInputElement).value).toBe(
      'control.interno.demo@cali.gov.co'
    );
    expect(screen.queryByRole('button', { name: /Olvidaste/ })).toBeNull();
  });

  it('la app real lleva las cuentas de prueba a la app de prueba; las demás siguen igual', async () => {
    window.location.hash = '';
    render(
      <App
        appPrueba="https://ejemplo.gov.co/control-entes/prueba/"
        datos={arrancar({})}
        cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      />
    );
    await screen.findByLabelText(/correo institucional/i);
    // Una cuenta real no se desvía: se consulta como siempre
    escribir(/correo institucional/i, 'persona.real@cali.gov.co');
    escribir(/contraseña/i, 'x');
    ingresar();
    await screen.findByRole('alert');
    expect(screen.queryByText(/Abriéndola/)).toBeNull();
    // Una cuenta de prueba: aviso y paso a la app de prueba
    escribir(/correo institucional/i, ' Secretaria.Demo@cali.gov.co ');
    escribir(/contraseña/i, 'demo');
    ingresar();
    expect(await screen.findByText(/cuenta de la APP DE PRUEBA/)).toBeTruthy();
  });

  it('la app de prueba deja puesto el usuario que llega desde la app real', async () => {
    window.history.replaceState(null, '', '/?correo=control.interno.demo%40cali.gov.co');
    try {
      window.location.hash = '';
      render(
        <App
          demo
          datos={arrancar({})}
          cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        />
      );
      const correo = (await screen.findByLabelText(/correo institucional/i)) as HTMLInputElement;
      expect(correo.value).toBe('control.interno.demo@cali.gov.co');
      expect((screen.getByLabelText(/contraseña/i) as HTMLInputElement).value).toBe('demo');
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });

  it('enlace: entra sin código, ve "Mi dependencia" y no ve opciones de supervisión', async () => {
    montar();
    await screen.findByLabelText(/correo institucional/i);
    escribir(/correo institucional/i, 'enlace.demo@cali.gov.co');
    escribir(/contraseña/i, 'demo');
    ingresar();
    await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(menu().getByRole('link', { name: 'Mi dependencia' })).toBeTruthy();
    expect(menu().queryByRole('link', { name: 'Centro de mando' })).toBeNull();
    expect(menu().queryByRole('link', { name: 'Configuración' })).toBeNull();
    // barra del celular: las 3 primeras opciones del rol y "Más"
    const pestanas = within(screen.getByRole('navigation', { name: 'Accesos rápidos' }));
    // igual que la 2.x: Mi dependencia, Requerimientos, ORFEO e Informe, y "Menú"
    expect(pestanas.getAllByRole('link').map(a => a.textContent)).toEqual([
      'Mi dependencia',
      'Requerim.',
      'ORFEO',
      'Informe'
    ]);
    expect(pestanas.getByRole('button', { name: 'Menú administrativo' })).toBeTruthy();
    // abre en su pantalla inicial (igual que la 2.x)
    // su expediente, sin la lista para elegir otra dependencia (scopeOrg de la 2.x)
    expect(
      await screen.findByRole('heading', { name: 'Pendientes y vencidos de esta dependencia', level: 3 })
    ).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Dependencia' })).toBeNull();
    expect(window.location.hash).toBe('#/dependencia');
  });

  it('Super administrador: pide el código, luego ve todo el menú; una pantalla ajena lleva a la inicial; salir', async () => {
    montar();
    await screen.findByLabelText(/correo institucional/i);
    escribir(/correo institucional/i, 'admin.demo@cali.gov.co');
    escribir(/contraseña/i, 'demo');
    ingresar();
    const campo = await screen.findByLabelText(/código de 6 dígitos/i);
    fireEvent.change(campo, { target: { value: '12' } });
    ingresar();
    expect((await screen.findByRole('alert')).textContent).toMatch(/6 dígitos/);
    fireEvent.change(campo, { target: { value: '123456' } });
    ingresar();
    await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(menu().getByRole('link', { name: 'Configuración' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Centro de mando', level: 2 })).toBeTruthy();
    fireEvent.click(menu().getByRole('link', { name: 'Auditoría' }));
    expect(await screen.findByRole('heading', { name: 'Auditoría', level: 2 })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByLabelText(/correo institucional/i)).toBeTruthy();
  });
});

describe('3.0 · contraseña nueva y verificación en dos pasos (demo)', () => {
  const montarCon = (datos: Datos, llegadaClave = false) => {
    window.location.hash = '';
    return render(
      <App
        datos={datos}
        llegadaClave={llegadaClave}
        cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      />
    );
  };
  const entrar = async (correo: string) => {
    await screen.findByLabelText(/correo institucional/i);
    escribir(/correo institucional/i, correo);
    escribir(/contraseña/i, 'demo');
    ingresar();
  };

  it('al llegar desde el correo de recuperación pide la contraseña nueva antes de mostrar la app', async () => {
    montarCon(arrancar({}), true);
    await entrar('enlace.demo@cali.gov.co');
    expect(await screen.findByRole('heading', { name: 'Defina su contraseña' })).toBeTruthy();
    escribir(/contraseña nueva/i, 'corta1');
    escribir(/repita la contraseña/i, 'corta1');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Mínimo 10/);
    escribir(/contraseña nueva/i, 'abcde12345');
    escribir(/repita la contraseña/i, 'abcde12345');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await screen.findByRole('navigation', { name: 'Menú principal' });
    expect((await screen.findByRole('status')).textContent).toBe('Contraseña actualizada');
  });

  it('enlace protegido del correo: NO se usa al abrir la página (filtros de correo), solo al oprimir «Continuar»', async () => {
    const datos = arrancar({});
    const usados: string[] = [];
    datos.auth.confirmarEnlace = async (token, tipo) => {
      usados.push(token + ':' + tipo);
      // Simula la sesión que abre el enlace
      await datos.auth.ingresar('enlace.demo@cali.gov.co', 'demo');
    };
    window.location.hash = '';
    render(
      <App
        datos={datos}
        enlace={{ tokenHash: 'abcdefghij123', tipo: 'invite' }}
        cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      />
    );
    expect(await screen.findByRole('heading', { name: 'Bienvenido(a) a Control de Entes' })).toBeTruthy();
    // Abrir la página (lo que hace el filtro del correo) no gasta el enlace
    expect(usados).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Defina su contraseña' })).toBeTruthy();
    expect(usados).toEqual(['abcdefghij123:invite']);
  });

  it('enlace ya usado o vencido: lo dice con claridad y no deja la pantalla en blanco', async () => {
    const datos = arrancar({});
    window.location.hash = '';
    render(
      <App
        datos={datos}
        enlace={{ tokenHash: 'abcdefghij123', tipo: 'recovery' }}
        cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/demostración/);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeTruthy();
  });

  it('Super administrador sin celular verificado: debe activar la verificación antes de entrar', async () => {
    const datos = arrancar({});
    let activa = false;
    const confirmar = datos.auth.confirmarVerificacion;
    datos.auth.tieneVerificacion = async () => activa;
    datos.auth.confirmarVerificacion = async (f, c) => {
      await confirmar(f, c);
      activa = true;
    };
    montarCon(datos);
    await entrar('admin.demo@cali.gov.co');
    fireEvent.change(await screen.findByLabelText(/código de 6 dígitos de la app/i), {
      target: { value: '123456' }
    });
    ingresar();
    expect(await screen.findByRole('heading', { name: 'Active la verificación en dos pasos' })).toBeTruthy();
    expect(await screen.findByAltText(/código QR/i)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Menú principal' })).toBeNull();
    const campo = screen.getByLabelText(/escriba el código de 6 dígitos/i);
    fireEvent.change(campo, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/no es correcto/);
    fireEvent.change(campo, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByRole('navigation', { name: 'Menú principal' });
  });

  it('Super administrador sin celular: "Cerrar sesión" vuelve al ingreso', async () => {
    const datos = arrancar({});
    datos.auth.tieneVerificacion = async () => false;
    montarCon(datos);
    await entrar('admin.demo@cali.gov.co');
    fireEvent.change(await screen.findByLabelText(/código de 6 dígitos de la app/i), {
      target: { value: '123456' }
    });
    ingresar();
    await screen.findByAltText(/código QR/i);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByLabelText(/correo institucional/i)).toBeTruthy();
  });

  it('Despacho sin celular: entra y recibe una sola vez la recomendación', async () => {
    sessionStorage.clear();
    montarCon(arrancar({}));
    await entrar('despacho.demo@cali.gov.co');
    await screen.findByRole('navigation', { name: 'Menú principal' });
    expect((await screen.findByRole('status')).textContent).toMatch(/Recomendado: active la verificación/);
    expect(sessionStorage.getItem('ce_mfa_aviso')).toBe('1');
  });
});
