// @vitest-environment jsdom
// Auditoría en la demo: la cadena empieza íntegra, guardar en el directorio agrega un evento y simular una
// manipulación hace que la verificación la detecte (igual que la demo de la 2.x).
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
const estado = () => screen.getAllByRole('status').find(e => e.className === 'sub') as HTMLElement;

afterEach(cleanup);

describe('3.0 · Auditoría (demo)', () => {
  it('Despacho: verifica la cadena, guarda un cambio, simula una manipulación y la detecta', async () => {
    montar();
    await screen.findByLabelText(/correo institucional/i);
    escribir(/correo institucional/i, 'despacho.demo@cali.gov.co');
    escribir(/contraseña/i, 'demo');
    ingresar();
    await screen.findByRole('navigation', { name: 'Menú principal' });

    // un cambio en el directorio deja un evento en la pista
    fireEvent.click(menu().getByRole('link', { name: 'Directorio del gabinete' }));
    const forms = await screen.findAllByRole('form');
    const f = within(forms[0] as HTMLElement);
    fireEvent.change(f.getByLabelText('Nombre completo'), { target: { value: 'Ana María Pérez' } });
    fireEvent.click(f.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Directorio actualizado');

    fireEvent.click(menu().getByRole('link', { name: 'Auditoría' }));
    await screen.findByRole('heading', { name: 'Auditoría', level: 2 });
    await screen.findByText('Verificar integridad');
    expect(screen.getAllByRole('row')).toHaveLength(3); // encabezado + carga inicial + cambio del directorio
    expect(screen.getByText('directorio')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Verificar integridad' }));
    expect((await screen.findByText('Cadena íntegra.')).closest('.card')?.className).toContain('chain-ok');
    expect(estado().textContent).toMatch(/2 evento\(s\) verificados/);

    fireEvent.click(screen.getByRole('button', { name: 'Simular manipulación' }));
    await screen.findByText('Se alteró en memoria el evento #2. Verifica la integridad.');
    fireEvent.click(screen.getByRole('button', { name: 'Verificar integridad' }));
    expect((await screen.findByText('Integridad comprometida.')).closest('.card')?.className).toContain(
      'chain-bad'
    );
    expect(estado().textContent).toMatch(/se rompe en el evento #2/);
  });

  it('enlace no tiene la Auditoría', async () => {
    montar();
    await screen.findByLabelText(/correo institucional/i);
    escribir(/correo institucional/i, 'enlace.demo@cali.gov.co');
    escribir(/contraseña/i, 'demo');
    ingresar();
    await screen.findByRole('navigation', { name: 'Menú principal' });
    expect(menu().queryByRole('link', { name: 'Auditoría' })).toBeNull();
  });
});
