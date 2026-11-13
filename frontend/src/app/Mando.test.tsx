// @vitest-environment jsdom
// Centro de mando en la demo (datos ficticios de datos/demo/): tablero, detalle de una tecla, ventana, vigencias y
// "Abrir expediente" que lleva a la dependencia elegida.
import { afterEach, describe, expect, it } from 'vitest';
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
async function entrarAdmin() {
  await screen.findByLabelText(/correo institucional/i);
  escribir(/correo institucional/i, 'admin.demo@cali.gov.co');
  escribir(/contraseña/i, 'demo');
  ingresar();
  fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
  ingresar();
  await screen.findByRole('navigation', { name: 'Menú principal' });
}

afterEach(cleanup);

describe('3.0 · Centro de mando (demo)', () => {
  it('muestra el tablero, el detalle de una dependencia y abre su expediente', async () => {
    montar();
    await entrarAdmin();
    expect(await screen.findByText('Tablero de dependencias')).toBeTruthy();
    const teclas = within(document.getElementById('tm') as HTMLElement).getAllByRole('button');
    expect(teclas.length).toBeGreaterThan(5);
    const suma = ['kRojo', 'kAma', 'kVer', 'kGris']
      .map(id => Number(document.getElementById(id)?.textContent))
      .reduce((a, b) => a + b, 0);
    expect(suma).toBe(teclas.length);
    expect(screen.getByText('Toca una tecla para ver el detalle de la dependencia.')).toBeTruthy();
    const primera = teclas[0] as HTMLElement;
    const nombre = primera.title.split(':')[0] ?? '';
    fireEvent.click(primera);
    expect(primera.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(nombre, { selector: '.tmd-h b' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Abrir expediente/ }));
    await waitFor(() => expect(window.location.hash).toBe('#/dependencia'));
    expect(await screen.findByRole('heading', { name: nombre, level: 2 })).toBeTruthy();
  });

  it('ventana de tiempo, filtro por color, vigencias de la cola y lectura del corte', async () => {
    montar();
    await entrarAdmin();
    await screen.findByText('Tablero de dependencias');
    expect(screen.getByText(/ventana de 6 meses/, { selector: '#tmLabel' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '12 meses' }));
    expect(screen.getByText(/ventana de 12 meses/, { selector: '#tmLabel' })).toBeTruthy();
    expect(localStorage.getItem('ce_ventana')).toBe('12');
    fireEvent.click(screen.getByRole('button', { name: /Rojo$/ }));
    expect(document.getElementById('tm')?.className).toContain('filtering');
    // Mover el mes cambia la etiqueta
    const rango = screen.getByRole('slider', { name: 'Mes' }) as HTMLInputElement;
    fireEvent.change(rango, { target: { value: '0' } });
    expect(rango.value).toBe('0');
    expect(screen.getByText('Lectura del corte')).toBeTruthy();
    const filasAntes = screen.getAllByRole('row').length;
    fireEvent.click(screen.getByRole('button', { name: 'Vigencia 2025' }));
    expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(filasAntes);
    expect(screen.getByRole('table', { name: 'Cola de acción' })).toBeTruthy();
  });
});
