// @vitest-environment jsdom
// Notificaciones en la demo: notificar desde el Centro de mando (WhatsApp), verla en la bitácora y marcada en el
// Modo despacho; el botón del Expediente solo para supervisión.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

const montar = () => {
  window.location.hash = '';
  sessionStorage.setItem('ce_mfa_aviso', '1');
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('3.0 · Notificaciones (demo)', () => {
  it('notificar por WhatsApp desde la cola, verla en la bitácora y marcada en el Modo despacho', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    montar();
    await entrar('admin.demo@cali.gov.co');
    await screen.findByText('Tablero de dependencias');
    const cola = screen.getByRole('table', { name: 'Cola de acción' });
    fireEvent.click(within(cola).getAllByRole('button', { name: /Notificar/ })[0] as HTMLElement);
    const ventana = await screen.findByRole('dialog');
    expect(within(ventana).getByRole('heading', { name: /^Notificar a / })).toBeTruthy();
    const msg = within(ventana).getByLabelText('Vista previa (editable)') as HTMLTextAreaElement;
    expect(msg.value).toMatch(/^Cordial saludo/);
    expect(msg.value).toMatch(/Despacho del Alcalde\nAlcaldía de Santiago de Cali$/);
    // Cambiar la plantilla regenera el mensaje
    fireEvent.change(within(ventana).getByLabelText('Mensaje'), { target: { value: 'desempeno' } });
    expect((within(ventana).getByLabelText('Vista previa (editable)') as HTMLTextAreaElement).value).toMatch(
      /resumen de cumplimiento/
    );
    fireEvent.change(within(ventana).getByLabelText('Celular (WhatsApp)'), {
      target: { value: '3001234567' }
    });
    expect(within(ventana).getByText('Se enviará a +57 300 123 4567')).toBeTruthy();
    fireEvent.click(within(ventana).getByRole('button', { name: /WhatsApp/ }));
    await waitFor(() => expect(abrir).toHaveBeenCalled());
    expect(String(abrir.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/wa\.me\/573001234567\?text=Cordial%20saludo/
    );
    expect(await screen.findByText(/Notificación preparada en WhatsApp para .* y registrada/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(menu().getByRole('link', { name: 'Notificaciones WhatsApp' }));
    expect(await screen.findByText(/^1 notificación\(es\) registrada\(s\)/)).toBeTruthy();
    const tabla = screen.getByRole('table', { name: 'Notificaciones registradas' });
    expect(within(tabla).getByText('Resumen de desempeño')).toBeTruthy();
    expect(within(tabla).getByText('admin.demo@cali.gov.co')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Modo despacho/ }));
    const desp = await screen.findByRole('dialog');
    expect(within(desp).getByText('NOTIFICADA HOY')).toBeTruthy();
    expect(within(desp).getByRole('button', { name: 'Reenviar' })).toBeTruthy();
    // "Preparar" abre la ventana de notificar de esa dependencia
    fireEvent.click(within(desp).getAllByRole('button', { name: /Preparar|Reenviar/ })[0] as HTMLElement);
    expect(await screen.findByRole('heading', { name: /^Notificar a / })).toBeTruthy();
  });

  it('correo: exige un correo @cali.gov.co', async () => {
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    montar();
    await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Expediente de dependencia' }));
    fireEvent.click(await screen.findByRole('button', { name: /Notificar por WhatsApp/ }));
    const ventana = await screen.findByRole('dialog');
    fireEvent.change(within(ventana).getByLabelText('Correo institucional del destinatario'), {
      target: { value: 'alguien@gmail.com' }
    });
    fireEvent.click(within(ventana).getByRole('button', { name: /Enviar por correo/ }));
    expect(
      await screen.findByText(/Ingresa el correo institucional \(@cali\.gov\.co\) del destinatario/)
    ).toBeTruthy();
    expect(abrir).not.toHaveBeenCalled();
  });

  it('el enlace no ve el botón de notificar en su expediente', async () => {
    montar();
    await entrar('enlace.demo@cali.gov.co');
    await screen.findByRole('heading', { name: 'Pendientes y vencidos de esta dependencia', level: 3 });
    expect(screen.queryByRole('button', { name: /Notificar por WhatsApp/ })).toBeNull();
  });
});
