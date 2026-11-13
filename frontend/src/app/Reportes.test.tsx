// @vitest-environment jsdom
// Reportes y exportación en la demo: consolidado por ente, vigencia y exportación CSV.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('3.0 · Reportes y exportación (demo)', () => {
  it('muestra el consolidado de la vigencia y exporta control_entes_<vigencia>.csv', async () => {
    window.location.hash = '';
    sessionStorage.setItem('ce_mfa_aviso', '1');
    render(
      <App
        datos={arrancar({})}
        cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      />
    );
    await screen.findByLabelText(/correo institucional/i);
    fireEvent.change(screen.getByLabelText(/correo institucional/i), {
      target: { value: 'despacho.demo@cali.gov.co' }
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'demo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    const menu = within(await screen.findByRole('navigation', { name: 'Menú principal' }));
    fireEvent.click(menu.getByRole('link', { name: 'Reportes y exportación' }));
    const Y = new Date().getFullYear();
    expect(
      await screen.findByRole('heading', { name: `Consolidado de cumplimiento — vigencia ${Y}` })
    ).toBeTruthy();
    const tabla = screen.getByRole('table', { name: 'Consolidado por ente de control' });
    expect(within(tabla).getAllByRole('row').length).toBeGreaterThan(2);
    const crear = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let nombre = '';
    clic.mockImplementation(function (this: HTMLAnchorElement) {
      nombre = this.download;
    });
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));
    expect(crear).toHaveBeenCalled();
    expect(nombre).toBe(`control_entes_${Y}.csv`);
  });
});
