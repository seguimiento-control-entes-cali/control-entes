// @vitest-environment jsdom
// Histórico de radicados en la demo (datos ficticios de datos/demo/historico.json: 2.568 radicados).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  await screen.findByRole('navigation', { name: 'Menú principal' });
}
async function abrirHistorico() {
  fireEvent.click(menu().getByRole('link', { name: 'Histórico de radicados' }));
  await screen.findByRole('heading', { name: 'Histórico de radicados', level: 2 });
  return screen.findByText(/registros · corte de datos/);
}
const filas = () => screen.getAllByRole('row').slice(1);

afterEach(cleanup);

describe('3.0 · Histórico de radicados (demo)', () => {
  it('supervisión: ve los 2.568 radicados de 100 en 100, filtra y abre el detalle', async () => {
    montar();
    await entrar('despacho.demo@cali.gov.co');
    const cuenta = await abrirHistorico();
    expect(cuenta.textContent).toBe('2.568 de 2.568 registros · corte de datos 29/07/2026');
    expect(filas()).toHaveLength(100);
    expect(screen.getByText('1 / 26')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('2 / 26')).toBeTruthy();
    // filtro por vigencia: vuelve a la primera página
    fireEvent.change(screen.getByLabelText('Vigencia'), { target: { value: '2025' } });
    expect(screen.getByText(/^1\.290 de 2\.568 registros/)).toBeTruthy();
    expect(screen.getByText('1 / 13')).toBeTruthy();
    // búsqueda sin resultados
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'no-existe-xyz' } });
    expect(screen.getByText('Sin resultados')).toBeTruthy();
    // detalle de un radicado
    fireEvent.change(screen.getByLabelText('Vigencia'), { target: { value: 'todas' } });
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'EJ-2024-0001' } });
    expect(filas().length).toBeGreaterThan(0);
    fireEvent.click(filas()[0] as HTMLElement);
    const ventana = await screen.findByRole('dialog');
    expect(within(ventana).getByRole('heading', { name: 'EJ-2024-0001' })).toBeTruthy();
    expect(within(ventana).getByText('Organismo responsable')).toBeTruthy();
    fireEvent.click(within(ventana).getByRole('button', { name: 'Cerrar ventana' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('secretario: solo ve los radicados de su dependencia', async () => {
    montar();
    await entrar('secretaria.demo@cali.gov.co');
    const cuenta = await abrirHistorico();
    expect(cuenta.textContent).toMatch(/^93 de 93 registros/);
    expect(filas().every(f => f.textContent?.includes('Secretaría de Salud Pública'))).toBe(true);
  });
});
