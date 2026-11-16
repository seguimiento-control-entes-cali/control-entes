// @vitest-environment jsdom
// Planes (entrega 4c-2): «Aprobar y suscribir» bloqueado sin acciones y «Notificar» a una dependencia con acciones
// vencidas o por vencer (mensaje de la 2.x, WhatsApp abierto en otra pestaña y registro en la bitácora).
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function entrarAdmin() {
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
}

it('Aprobar y suscribir: un plan en formulación sin acciones no se puede aprobar', async () => {
  await entrarAdmin();
  fireEvent.click(await screen.findByRole('button', { name: /Nuevo plan/ }, { timeout: 8000 }));
  const v = await screen.findByRole('dialog');
  fireEvent.change(within(v).getByLabelText(/Nombre del ejercicio/), {
    target: { value: 'Auditoría ficticia en formulación' }
  });
  fireEvent.change(within(v).getByLabelText(/Fecha de suscripción/), { target: { value: '2026-11-01' } });
  fireEvent.change(within(v).getByLabelText('Estado'), { target: { value: 'formulacion' } });
  fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Aprobar y suscribir/ }));
  const a = await screen.findByRole('dialog');
  expect(within(a).getByText('El plan no tiene acciones.')).toBeTruthy();
  expect((within(a).getByRole('button', { name: /Aprobar y suscribir/ }) as HTMLButtonElement).disabled).toBe(
    true
  );
});

it('Notificar: mensaje de la 2.x a la dependencia y registro al abrir WhatsApp', async () => {
  const abrir = vi.spyOn(window, 'open').mockReturnValue(null);
  await entrarAdmin();
  fireEvent.click(
    (await screen.findAllByRole('button', { name: /Notificar/ }, { timeout: 8000 }))[0] as HTMLElement
  );
  const v = await screen.findByRole('dialog');
  const msg = within(v).getByLabelText('Mensaje') as HTMLTextAreaElement;
  expect(msg.value).toMatch(/^Respetado\(a\) secretario\(a\) \/ director\(a\):/);
  expect(msg.value).toMatch(/Despacho del Alcalde$/);
  fireEvent.change(within(v).getByLabelText('Celular (WhatsApp)'), { target: { value: '300 123 4567' } });
  fireEvent.click(within(v).getByRole('button', { name: /WhatsApp/ }));
  expect(await screen.findByText('Notificación preparada y registrada en la bitácora')).toBeTruthy();
  expect(String(abrir.mock.calls[0]?.[0])).toMatch(/^https:\/\/wa\.me\/573001234567\?text=Respetado/);
});
