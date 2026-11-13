// @vitest-environment jsdom
// Módulo operativo en la demo: Tablero y métricas, selector de vigencia, Requerimientos (filtros, detalle y Nuevo).
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
const escribir = (etiqueta: RegExp | string, valor: string) =>
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
const Y = new Date().getFullYear();
const kpi = (n: string) => Number(screen.getByText(n).nextElementSibling?.textContent ?? 'NaN');

afterEach(cleanup);

describe('3.0 · Tablero y Requerimientos (demo)', () => {
  it('Super administrador: tablero, cambio de vigencia, lista, detalle y nuevo requerimiento', async () => {
    montar();
    await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Tablero y métricas' }));
    await screen.findByText('Total solicitudes');
    const total = kpi('Total solicitudes');
    expect(total).toBeGreaterThan(0);
    expect(kpi('Críticas') + kpi('En término') + kpi('Cerradas')).toBe(total);
    expect(screen.getByText('Umbral crítico: 5 días o menos')).toBeTruthy();
    // Vigencia anterior: los requerimientos de años anteriores de la demo (cerrados)
    const sel = screen.getByRole('combobox', { name: 'Vigencia' });
    fireEvent.change(sel, { target: { value: String(Y - 1) } });
    await waitFor(() => expect(kpi('Cerradas')).toBeGreaterThan(0));
    expect(kpi('Críticas')).toBe(0);
    fireEvent.change(sel, { target: { value: String(Y) } });

    fireEvent.click(menu().getByRole('link', { name: 'Requerimientos' }));
    const tabla = await screen.findByRole('table', { name: 'Requerimientos de la vigencia' });
    const filas = () => within(tabla).getAllByRole('row').length - 1;
    expect(filas()).toBe(total);
    expect(screen.getByText(`${total} de ${total} requerimientos · vigencia ${Y}`)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'verde' } });
    expect(within(tabla).queryAllByText('CRÍTICO')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'señalización' } });
    expect(filas()).toBe(1);
    fireEvent.click(within(tabla).getAllByRole('row')[1] as HTMLElement);
    const det = await screen.findByRole('dialog');
    expect(within(det).getByText('Seguimiento a plan de acción sobre señalización vial.')).toBeTruthy();
    fireEvent.click(within(det).getByRole('button', { name: 'Cerrar' }));
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: /Nuevo/ }));
    const nuevo = await screen.findByRole('dialog');
    fireEvent.change(within(nuevo).getByLabelText('Radicado de entrada'), { target: { value: 'abc' } });
    fireEvent.click(within(nuevo).getByRole('button', { name: /Guardar/ }));
    expect(await within(nuevo).findByText(`Radicado inválido. Ejemplo: ${Y}EE004812`)).toBeTruthy();
    fireEvent.change(within(nuevo).getByLabelText('Radicado de entrada'), {
      target: { value: `${Y}ee777001` }
    });
    fireEvent.change(within(nuevo).getByLabelText('Asunto'), {
      target: { value: 'Solicitud de prueba de la demo' }
    });
    // El término recalcula la fecha límite en días hábiles
    const fl = within(nuevo).getByLabelText('Fecha límite de respuesta') as HTMLInputElement;
    const antes = fl.value;
    fireEvent.change(within(nuevo).getByLabelText(/Término para responder/), { target: { value: '15' } });
    expect(fl.value > antes).toBe(true);
    fireEvent.click(within(nuevo).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText(`Requerimiento ${Y}EE777001 registrado`)).toBeTruthy();
    await waitFor(() => expect(filas()).toBe(total + 1));
  });

  it('Enlace: solo ve su dependencia y no puede registrar en otra', async () => {
    montar();
    await entrar('enlace.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Requerimientos' }));
    const tabla = await screen.findByRole('table', { name: 'Requerimientos de la vigencia' });
    const deps = within(tabla)
      .getAllByRole('row')
      .slice(1)
      .map(f => f.children[3]?.textContent);
    expect(new Set(deps)).toEqual(new Set(['Secretaría de Salud Pública']));
    fireEvent.click(screen.getByRole('button', { name: /Nuevo/ }));
    const nuevo = await screen.findByRole('dialog');
    expect(
      (within(nuevo).getByLabelText('Dependencia responsable') as HTMLSelectElement).selectedOptions[0]
        ?.textContent
    ).toBe('Secretaría de Salud Pública');
    fireEvent.change(within(nuevo).getByLabelText('Dependencia responsable'), {
      target: {
        value: (within(nuevo).getByRole('option', { name: 'Secretaría de Cultura' }) as HTMLOptionElement)
          .value
      }
    });
    fireEvent.change(within(nuevo).getByLabelText('Radicado de entrada'), {
      target: { value: `${Y}EE777002` }
    });
    fireEvent.change(within(nuevo).getByLabelText('Asunto'), { target: { value: 'Otra dependencia' } });
    fireEvent.click(within(nuevo).getByRole('button', { name: /Guardar/ }));
    expect(await within(nuevo).findByText('Tu rol no tiene permiso para esta operación')).toBeTruthy();
  });
});
