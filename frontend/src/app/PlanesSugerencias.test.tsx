// @vitest-environment jsdom
// Planes (entrega 4c-1): sugerencias de acciones según la causa y traslados de hallazgos con incidencia.
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(cleanup);

it('Super administrador: usa una sugerencia en una acción nueva y registra un traslado', async () => {
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
  // Sugerencias: solo al agregar una acción
  fireEvent.click((await screen.findAllByRole('button', { name: /^Acción$/ }))[0] as HTMLElement);
  let v = await screen.findByRole('dialog');
  expect(within(v).getByText(/Sugerencias según la causa del hallazgo/)).toBeTruthy();
  fireEvent.click(within(v).getAllByRole('button', { name: 'Usar' })[0] as HTMLElement);
  expect(await screen.findByText('Sugerencia cargada: revise y ajuste antes de guardar')).toBeTruthy();
  const accion = within(v).getByLabelText(/Acción correctiva/) as HTMLTextAreaElement;
  expect(accion.value.length).toBeGreaterThan(20);
  expect((within(v).getByLabelText(/Fecha de terminación/) as HTMLInputElement).value).toMatch(
    /^\d{4}-\d{2}-\d{2}$/
  );
  fireEvent.click(within(v).getByRole('button', { name: 'Cancelar' }));
  // Traslados: en los hallazgos con incidencia disciplinaria, fiscal, penal, sancionatoria u otra
  fireEvent.click((await screen.findAllByRole('button', { name: /Registrar traslado/ }))[0] as HTMLElement);
  v = await screen.findByRole('dialog');
  fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
  expect(await screen.findByText('Indique a quién se trasladó')).toBeTruthy();
  fireEvent.change(within(v).getByLabelText(/Trasladado a/), {
    target: { value: 'Procuraduría General de la Nación' }
  });
  fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
  expect(await screen.findByText('Traslado guardado')).toBeTruthy();
  expect(await screen.findByText(/^Procuraduría General de la Nación · \d{2}\/\d{2}\/\d{4}$/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Editar traslado' })).toBeTruthy();
});
