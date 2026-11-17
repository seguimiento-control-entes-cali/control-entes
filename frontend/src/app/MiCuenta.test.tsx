// @vitest-environment jsdom
// «Mi cuenta y seguridad» (botón de la llave), igual a la 2.x: cuenta y rol, cambiar la contraseña con sus reglas y el
// estado de la verificación en dos pasos (en la demostración no hay celulares reales).
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(cleanup);

it('Control Interno: abre Mi cuenta, valida la contraseña nueva y la guarda', async () => {
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
    target: { value: 'control.interno.demo@cali.gov.co' }
  });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'demo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mi cuenta y seguridad' }, { timeout: 8000 }));
  let v = await screen.findByRole('dialog');
  expect(within(v).getByText('control.interno.demo@cali.gov.co')).toBeTruthy();
  expect(within(v).getByText('Control Interno')).toBeTruthy();
  expect(within(v).getByText('No disponible en modo demostración.')).toBeTruthy();
  fireEvent.click(within(v).getByRole('button', { name: /Cambiar mi contraseña/ }));
  v = await screen.findByRole('dialog');
  fireEvent.change(within(v).getByLabelText('Contraseña nueva'), { target: { value: 'corta1' } });
  fireEvent.change(within(v).getByLabelText('Repite la contraseña'), { target: { value: 'corta1' } });
  fireEvent.click(within(v).getByRole('button', { name: /Guardar contraseña/ }));
  expect(await within(v).findByText(/Mínimo 10 caracteres/, { selector: '.err' })).toBeTruthy();
  fireEvent.change(within(v).getByLabelText('Contraseña nueva'), { target: { value: 'ClaveNueva2026' } });
  fireEvent.change(within(v).getByLabelText('Repite la contraseña'), { target: { value: 'ClaveNueva2026' } });
  fireEvent.click(within(v).getByRole('button', { name: /Guardar contraseña/ }));
  expect(await screen.findByText('Contraseña actualizada (simulado en modo demostración)')).toBeTruthy();
});
