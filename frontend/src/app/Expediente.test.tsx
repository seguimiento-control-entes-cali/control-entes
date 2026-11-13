// @vitest-environment jsdom
// Expediente de dependencia en la demo (datos ficticios de datos/demo/): elegir dependencia y ver el detalle.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

const montar = () => {
  window.location.hash = '';
  sessionStorage.setItem('ce_mfa_aviso', '1'); // sin el aviso de "Recomendado" en estas pruebas
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

afterEach(cleanup);

describe('3.0 · Expediente de dependencia (demo)', () => {
  it('Super administrador: elige la dependencia, ve indicadores y abre el detalle de un pendiente', async () => {
    montar();
    await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Expediente de dependencia' }));
    const lista = (await screen.findByRole('combobox', { name: 'Dependencia' })) as HTMLSelectElement;
    expect(lista.options.length).toBeGreaterThan(5);
    const otra = [...lista.options].map(o => o.value).find(v => v !== lista.value) ?? '';
    fireEvent.change(lista, { target: { value: otra } });
    expect(await screen.findByRole('heading', { name: otra, level: 2 })).toBeTruthy();
    for (const t of ['Evaluados', 'A tiempo', 'Respondidos tarde', 'Sin respuesta'])
      expect(screen.getByText(t, { selector: 'small' })).toBeTruthy();
    const tabla = within(screen.getByRole('table'));
    const filas = tabla.getAllByRole('row').slice(1);
    const primera = filas[0];
    if (primera && primera.classList.contains('click')) {
      fireEvent.click(primera);
      expect(await screen.findByRole('dialog')).toBeTruthy();
      expect(screen.getByText('Organismo responsable')).toBeTruthy();
    }
  });
});
