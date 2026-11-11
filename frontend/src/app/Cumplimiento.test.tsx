// @vitest-environment jsdom
// Cumplimiento por secretaría en la demo (2.568 radicados ficticios de datos/demo/historico.json).
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
const filas = () => screen.getAllByRole('row').slice(1);

afterEach(cleanup);

describe('3.0 · Cumplimiento por secretaría (demo)', () => {
  it('Control Interno: ve los totales, el ranking, cambia el orden y abre los radicados incumplidos', async () => {
    montar();
    await entrar('control.interno.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Cumplimiento por secretaría' }));
    await screen.findByRole('heading', { name: 'Cumplimiento por secretaría', level: 2 });
    await screen.findByText('Evaluados');
    expect(screen.getByText('% de incumplimiento')).toBeTruthy();
    expect(screen.getByText(/Semáforo: verde menos de 20% · rojo desde 40% · mínimo 10 casos/)).toBeTruthy();
    const antes = filas().map(f => f.textContent);
    expect(antes.length).toBeGreaterThan(5);
    fireEvent.click(screen.getByRole('button', { name: 'Por % de incumplimiento' }));
    expect(screen.getByRole('button', { name: 'Por % de incumplimiento' }).className).toBe('on');
    // vigencia: cambia los totales
    fireEvent.change(screen.getByLabelText('Vigencia'), { target: { value: '2024' } });
    expect(filas().length).toBeGreaterThan(0);
    // detalle del primer organismo
    const primero = filas()[0] as HTMLElement;
    const org = primero.querySelector('.org')?.textContent ?? '';
    fireEvent.click(primero);
    const ventana = await screen.findByRole('dialog');
    expect(within(ventana).getByRole('heading', { name: org })).toBeTruthy();
    expect(
      within(ventana).getByText(/radicado\(s\) con respuesta tardía o sin respuesta en la vigencia 2024/)
    ).toBeTruthy();
  });

  it('secretario y enlace no tienen esta pantalla', async () => {
    montar();
    await entrar('secretaria.demo@cali.gov.co');
    expect(menu().queryByRole('link', { name: 'Cumplimiento por secretaría' })).toBeNull();
  });
});
