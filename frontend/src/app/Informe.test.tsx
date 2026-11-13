// @vitest-environment jsdom
// Informe ejecutivo en la demo (datos ficticios de datos/demo/): filtros, huella, descarga del PDF registrada en la
// auditoría y alcance del enlace (solo su dependencia).
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

describe('3.0 · Informe ejecutivo (demo)', () => {
  it('Super administrador: informe general, filtro por dependencia, huella y PDF registrado', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    montar();
    await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Informe ejecutivo' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Informe ejecutivo de cumplimiento frente a los entes de control'
      })
    ).toBeTruthy();
    expect(screen.getByText(/Todas las dependencias · Vigencia 2024 - 2026/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: '4. Cumplimiento por dependencia' })).toBeTruthy();
    expect(screen.getByText(/^Las dependencias con mayor número de incumplimientos son:/)).toBeTruthy();
    const huella = document.querySelector('.rfoot span')?.textContent ?? '';
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    // Una sola dependencia: sin semáforo de dependencias, y cambia la huella
    const sel = screen.getByRole('combobox', { name: 'Dependencia' }) as HTMLSelectElement;
    fireEvent.change(sel, { target: { value: sel.options[1]?.value } });
    expect(screen.queryByRole('heading', { name: '4. Cumplimiento por dependencia' })).toBeNull();
    expect(document.querySelector('.rfoot span')?.textContent).not.toBe(huella);
    // Sin casos críticos
    expect(screen.getByRole('heading', { name: /Casos críticos/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Incluir casos críticos/ }));
    expect(screen.queryByRole('heading', { name: /Casos críticos/ })).toBeNull();
    // PDF: queda en Actividad (informes generados) y se abre la impresión
    fireEvent.click(screen.getByRole('button', { name: /Descargar PDF/ }));
    await waitFor(() => expect(imprimir).toHaveBeenCalled());
  });

  it('Enlace: "Informe de mi dependencia", sin elegir dependencia', async () => {
    montar();
    await entrar('enlace.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Informe de mi dependencia' }));
    await screen.findByRole('heading', {
      name: 'Informe ejecutivo de cumplimiento frente a los entes de control'
    });
    expect(screen.queryByRole('combobox', { name: 'Dependencia' })).toBeNull();
    expect(screen.queryByText(/Todas las dependencias · Vigencia/)).toBeNull();
    expect(screen.getByRole('heading', { name: '4. Entes de control con más incumplimientos' })).toBeTruthy();
  });
});
