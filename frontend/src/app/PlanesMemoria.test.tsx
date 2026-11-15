// @vitest-environment jsdom
// Planes (entrega 4b): pestaña Documentos (subir un documento ficticio y enviarlo a la papelera) y Papelera (restaurar).
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('Super administrador: sube un documento, lo envía a la papelera y lo restaura', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
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
  fireEvent.click(await screen.findByRole('button', { name: /^Documentos/ }));
  expect(await screen.findByText(/Aún no hay documentos/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Subir documento/ }));
  const v = await screen.findByRole('dialog');
  fireEvent.click(within(v).getByRole('button', { name: /Subir/ }));
  expect(await screen.findByText('Elija el archivo')).toBeTruthy();
  const f = new File(['%PDF-ficticio'], 'Oficio ficticio.pdf', { type: 'application/pdf' });
  Object.defineProperty(f, 'arrayBuffer', {
    value: () => Promise.resolve(Uint8Array.from('%PDF-ficticio', c => c.charCodeAt(0)).buffer)
  });
  fireEvent.change(within(v).getByLabelText(/Archivo \(PDF/), { target: { files: [f] } });
  fireEvent.click(within(v).getByRole('button', { name: /Subir/ }));
  expect(await screen.findByText('Documento guardado en el archivo del plan')).toBeTruthy();
  expect(await screen.findByText('Oficio ficticio.pdf')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Enviar a la papelera' }));
  expect(await screen.findByText('Documento enviado a la papelera')).toBeTruthy();
  expect(await screen.findByText(/Aún no hay documentos/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Planes$/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Papelera/ }));
  const p = await screen.findByRole('dialog');
  expect(within(p).getByText('Oficio ficticio.pdf')).toBeTruthy();
  fireEvent.click(within(p).getByRole('button', { name: /Restaurar/ }));
  expect(await screen.findByText('Documento restaurado')).toBeTruthy();
  expect(await within(p).findByText('No hay documentos en la papelera.')).toBeTruthy();
});
