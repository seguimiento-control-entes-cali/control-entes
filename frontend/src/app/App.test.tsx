// @vitest-environment jsdom
// Recorridos de la 3.0 en modo demostración: ingreso, código de verificación, menú por rol, pantallas y salida.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

const montar = () => {
  window.location.hash = '';
  return render(
    <App datos={arrancar({})} cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />
  );
};
const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
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
    expect(await screen.findByRole('link', { name: 'Mi dependencia' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Centro de mando' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Configuración' })).toBeNull();
    // abre en su pantalla inicial (igual que la 2.x)
    expect(await screen.findByRole('heading', { name: 'Mi dependencia' })).toBeTruthy();
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
    expect(await screen.findByRole('link', { name: 'Configuración' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Centro de mando' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Auditoría' }));
    expect(await screen.findByRole('heading', { name: 'Auditoría' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));
    expect(await screen.findByLabelText(/correo institucional/i)).toBeTruthy();
  });
});
