// @vitest-environment jsdom
// Cuentas y roles en la demo: preparar y activar la cuenta de una dependencia, invitar usuario y cambiar un rol.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    <App datos={arrancar({})} cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })} />
  );
  await screen.findByLabelText(/correo institucional/i);
  fireEvent.change(screen.getByLabelText(/correo institucional/i), {
    target: { value: 'admin.demo@cali.gov.co' }
  });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'demo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  const menu = within(await screen.findByRole('navigation', { name: 'Menú principal' }));
  fireEvent.click(menu.getByRole('link', { name: 'Cuentas y roles' }));
  await screen.findByText('Cuentas por dependencia');
}
const kpi = (t: string) =>
  Number(
    (screen.getByText(t, { selector: 'small' }).nextElementSibling?.firstChild?.textContent ?? 'NaN').trim()
  );

describe('3.0 · Cuentas y roles (demo)', () => {
  it('prepara la cuenta de una dependencia (sin correos) y luego la activa', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await entrarAdmin();
    const sinAntes = kpi('Sin cuenta');
    expect(sinAntes).toBeGreaterThan(0);
    const fila = screen
      .getAllByRole('button', { name: /Preparar cuenta$/ })[0]
      ?.closest('.dir-row') as HTMLElement;
    fireEvent.click(within(fila).getByRole('button', { name: /Preparar cuenta$/ }));
    expect(await screen.findByText(/Cuenta preparada para .*, sin activar \(simulado\)\./)).toBeTruthy();
    await waitFor(() => expect(within(fila).getByText('Preparada, sin activar')).toBeTruthy());
    expect(kpi('Sin cuenta')).toBe(sinAntes - 1);
    fireEvent.click(within(fila).getByRole('button', { name: /Activar e invitar/ }));
    expect(await screen.findByText(/Cuenta activada\. Enlace enviado a .* \(simulado\)\./)).toBeTruthy();
    await waitFor(() => expect(within(fila).getByText('Activa')).toBeTruthy());
  });

  it('invitar usuario valida los datos; cambiar el rol de otra cuenta', async () => {
    await entrarAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Invitar usuario/ }));
    const v = await screen.findByRole('dialog');
    fireEvent.change(within(v).getByLabelText('Nombre completo'), { target: { value: 'Laura Gómez' } });
    fireEvent.change(within(v).getByLabelText('Correo institucional'), {
      target: { value: 'laura.gomez@cali.gov.co' }
    });
    fireEvent.change(within(v).getByLabelText('Rol'), { target: { value: 'enlace' } });
    fireEvent.click(within(v).getByRole('button', { name: /Enviar invitación/ }));
    expect(await within(v).findByText('Un enlace operativo debe tener dependencia.')).toBeTruthy();
    const dep = within(v).getByLabelText(/Dependencia/) as HTMLSelectElement;
    fireEvent.change(dep, { target: { value: (dep.options[1] as HTMLOptionElement).value } });
    fireEvent.click(within(v).getByRole('button', { name: /Enviar invitación/ }));
    expect(await screen.findByText(/Invitación enviada a laura\.gomez@cali\.gov\.co/)).toBeTruthy();
    const otras = await screen.findByRole('table', { name: 'Otras cuentas' });
    expect(await within(otras).findByText('laura.gomez@cali.gov.co')).toBeTruthy();
    fireEvent.change(within(otras).getByLabelText('Rol de despacho.demo@cali.gov.co'), {
      target: { value: 'control_interno' }
    });
    fireEvent.click(
      within(within(otras).getByText('despacho.demo@cali.gov.co').closest('tr') as HTMLElement).getByRole(
        'button',
        {
          name: 'Guardar'
        }
      )
    );
    expect(await screen.findByText('Cuenta actualizada')).toBeTruthy();
  });
});
