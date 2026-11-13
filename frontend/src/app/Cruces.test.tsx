// @vitest-environment jsdom
// Cruces y temas en la demo (datos ficticios de datos/demo/): pestañas, matriz y corregir un tema.
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

describe('3.0 · Cruces y temas (demo)', () => {
  it('Super administrador: ve las alertas de mismo tema, la matriz y corrige un tema', async () => {
    montar();
    await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Cruces y temas' }));
    expect(await screen.findByText('Cruces exactos entre entes')).toBeTruthy();
    // La demo no cita números en los asuntos: no hay cruces exactos
    expect(screen.getByText(/No hay requerimientos de entes distintos/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Mismo tema \d/ }));
    expect((await screen.findAllByText('Mismo tema, varios entes')).length).toBeGreaterThan(1);
    expect(screen.getAllByRole('button', { name: /Confirmar cruce/ }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Temas' }));
    expect(await screen.findByRole('heading', { name: 'Requerimientos por tema y ente' })).toBeTruthy();
    const sel = (
      await screen.findAllByRole('combobox', { name: 'Tema del requerimiento' })
    )[0] as HTMLSelectElement;
    const otro = [...sel.options].map(o => o.value).find(v => v !== sel.value && v !== 'sin') ?? '';
    fireEvent.change(sel, { target: { value: otro } });
    expect(await screen.findByText(/Tema actualizado a/)).toBeTruthy();
    expect((await screen.findAllByText(/Clasificado por admin.demo@cali.gov.co/)).length).toBeGreaterThan(0);
  });

  it('Enlace: ve el tema sin poder cambiarlo ni revisar cruces', async () => {
    montar();
    await entrar('enlace.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Temas y cruces' }));
    expect(await screen.findByText('Cruces exactos entre entes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Mismo tema \d/ }));
    expect(screen.queryByRole('button', { name: /Confirmar cruce/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Temas' }));
    await screen.findByRole('heading', { name: 'Requerimientos por tema y ente' });
    expect(screen.queryAllByRole('combobox', { name: 'Tema del requerimiento' })).toHaveLength(0);
    expect(screen.queryByRole('combobox', { name: 'Dependencia' })).toBeNull();
  });
});
