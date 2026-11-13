// @vitest-environment jsdom
// Directorio del gabinete en la demo (datos ficticios de datos/demo/): por rol, editar, validar y buscar.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

const montar = () => {
  window.location.hash = '';
  sessionStorage.setItem('ce_mfa_aviso', '1'); // sin el aviso de "Recomendado" en estas pruebas
  return render(
    <App datos={arrancar({})} cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />
  );
};
const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const ingresar = () => fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
const menu = () => within(screen.getByRole('navigation', { name: 'Menú principal' }));
async function entrar(correo: string) {
  await screen.findByLabelText(/correo institucional/i);
  escribir(/correo institucional/i, correo);
  escribir(/contraseña/i, 'demo');
  ingresar();
  if (correo.startsWith('admin')) {
    fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
    ingresar();
  }
  await screen.findByRole('navigation', { name: 'Menú principal' });
}
async function abrirDirectorio() {
  fireEvent.click(menu().getByRole('link', { name: 'Directorio del gabinete' }));
  await screen.findByRole('heading', { name: 'Directorio del gabinete', level: 2 });
  return screen.findAllByRole('form');
}

afterEach(cleanup);

describe('3.0 · Directorio del gabinete (demo)', () => {
  it('Super administrador: ve los indicadores, valida y guarda un responsable', async () => {
    montar();
    await entrar('admin.demo@cali.gov.co');
    await abrirDirectorio();
    expect(screen.getByText('Falta nombre o celular')).toBeTruthy();
    expect(screen.getByText('Inconsistencias')).toBeTruthy();
    const formularios = screen.getAllByRole('form');
    expect(formularios.length).toBeGreaterThan(20);
    const primero = within(formularios[0] as HTMLElement);
    fireEvent.change(primero.getByLabelText('Celular (WhatsApp)'), { target: { value: '12345' } });
    fireEvent.click(primero.getByRole('button', { name: 'Guardar' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'El celular debe tener 10 dígitos e iniciar en 3'
    );
    fireEvent.change(primero.getByLabelText('Nombre completo'), { target: { value: 'Ana María Pérez' } });
    fireEvent.change(primero.getByLabelText('Celular (WhatsApp)'), { target: { value: '310 555 1234' } });
    fireEvent.click(primero.getByRole('button', { name: 'Guardar' }));
    expect((await screen.findByText('Directorio actualizado')).textContent).toBe('Directorio actualizado');
    expect(await screen.findByDisplayValue('Ana María Pérez')).toBeTruthy();
  });

  it('busca sin tildes y filtra por estado', async () => {
    montar();
    await entrar('admin.demo@cali.gov.co');
    await abrirDirectorio();
    fireEvent.change(screen.getByPlaceholderText('Buscar dependencia, nombre o cargo'), {
      target: { value: 'salud publica' }
    });
    const titulos = [...document.querySelectorAll('.dir-org')].map(h => h.textContent);
    expect(titulos.length).toBeGreaterThan(0);
    expect(titulos.every(t => /salud/i.test(t ?? ''))).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Buscar dependencia, nombre o cargo'), {
      target: { value: 'zzz no existe' }
    });
    expect(screen.getByText('Ninguna dependencia coincide con la búsqueda')).toBeTruthy();
  });

  it('Control Interno: lo ve, pero no puede editar', async () => {
    montar();
    await entrar('control.interno.demo@cali.gov.co');
    await abrirDirectorio();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
    expect(screen.queryAllByRole('textbox', { name: 'Nombre completo' })).toHaveLength(0);
  });

  it('Enlace: no tiene el Directorio en su menú y la dirección lleva a su pantalla inicial', async () => {
    montar();
    await entrar('enlace.demo@cali.gov.co');
    expect(menu().queryByRole('link', { name: 'Directorio del gabinete' })).toBeNull();
    window.location.hash = '#/directorio';
    expect(
      await screen.findByRole('heading', { name: 'Pendientes y vencidos de esta dependencia', level: 3 })
    ).toBeTruthy();
    await waitFor(() => expect(window.location.hash).toBe('#/dependencia'));
  });
});
