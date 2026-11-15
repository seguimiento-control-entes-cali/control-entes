// @vitest-environment jsdom
// Planes (entrega 4a): tarjeta de la norma CGSC en el plan y solicitud de prórroga de una acción con sus requisitos.
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(cleanup);

it('Super administrador: ve la norma del plan CGSC y la prórroga verifica los requisitos (arts. 15 y 16)', async () => {
  window.location.hash = '';
  sessionStorage.setItem('ce_mfa_aviso', '1');
  render(
    <App
      demo
      datos={arrancar({})}
      cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    />
  );
  fireEvent.change(await screen.findByLabelText(/correo institucional/i), {
    target: { value: 'admin.demo@cali.gov.co' }
  });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'demo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  const menu = within(await screen.findByRole('navigation', { name: 'Menú principal' }, { timeout: 8000 }));
  fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
  fireEvent.click(
    await screen.findByRole(
      'button',
      { name: /Abrir Auditoría de cumplimiento a la contratación/ },
      { timeout: 8000 }
    )
  );
  expect(await screen.findByText(/^Resolución Reglamentaria 1000\.30\.00\.24\./)).toBeTruthy();
  expect(screen.getByText(/Registre la fecha de radicación del informe final/)).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: /^Prórroga$/ })[0] as HTMLElement);
  const v = await screen.findByRole('dialog');
  expect(within(v).getByText('Prórroga de la fecha de finalización (art. 16)')).toBeTruthy();
  const req = within(v).getByLabelText('Requisitos');
  expect(within(req).getByText('Se solicita por una sola vez (art. 16)')).toBeTruthy();
  fireEvent.click(within(v).getByRole('button', { name: /Registrar solicitud/ }));
  expect(await screen.findByText(/^No cumple: /)).toBeTruthy();
});
