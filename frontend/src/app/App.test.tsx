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
    expect((await screen.findByRole('alert')).textContent).toMatch(/incorrectos/);
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
    expect(await screen.findByRole('heading', { name: 'Mi dependencia', level: 3 })).toBeTruthy();
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
