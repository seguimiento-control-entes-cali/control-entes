// @vitest-environment jsdom
// Configuración en la demo: versión, umbral del semáforo (cambia el Tablero al momento), resumen y aviso diario.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(cleanup);

async function entrarAdmin() {
  window.location.hash = '';
  sessionStorage.setItem('ce_mfa_aviso', '1');
  render(
    <App
      demo
      datos={arrancar({})}
      cliente={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    />
  );
  await screen.findByLabelText(/correo institucional/i);
  fireEvent.change(screen.getByLabelText(/correo institucional/i), {
    target: { value: 'admin.demo@cali.gov.co' }
  });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'demo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  return within(await screen.findByRole('navigation', { name: 'Menú principal' }));
}

describe('3.0 · Configuración (demo)', () => {
  it('guarda el umbral del semáforo y el Tablero lo usa; valida el rango', async () => {
    const menu = await entrarAdmin();
    fireEvent.click(menu.getByRole('link', { name: 'Configuración' }));
    expect(await screen.findByText(/^Control de Entes versión /)).toBeTruthy();
    const dias = screen.getByLabelText(/Días para considerar un requerimiento crítico/);
    fireEvent.change(dias, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar parámetros/ }));
    expect(await screen.findByText('Los días deben estar entre 1 y 30')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Días para considerar un requerimiento crítico/), {
      target: { value: '3' }
    });
    fireEvent.click(screen.getByRole('button', { name: /Guardar parámetros/ }));
    expect(await screen.findByText('Parámetros guardados')).toBeTruthy();
    fireEvent.click(menu.getByRole('link', { name: 'Tablero y métricas' }));
    expect(await screen.findByText('Umbral crítico: 3 días o menos')).toBeTruthy();
  });

  it('resumen semanal y aviso diario: guardar, validar la copia y avisos de la demostración', async () => {
    const menu = await entrarAdmin();
    fireEvent.click(menu.getByRole('link', { name: 'Configuración' }));
    fireEvent.click(await screen.findByLabelText(/Enviar el resumen semanal automáticamente/));
    fireEvent.click(
      within(screen.getByText('Resumen semanal por correo').closest('.card') as HTMLElement).getByRole(
        'button',
        { name: /^Guardar$/ }
      )
    );
    expect(
      await screen.findByText('Resumen semanal activado: se enviará los lunes a las 7:00 a. m.')
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Enviar prueba a mi correo/ }));
    expect(await screen.findByText('En modo demostración no se envían correos')).toBeTruthy();
    const aviso = screen.getByText('Aviso diario de planes de mejoramiento').closest('.card') as HTMLElement;
    fireEvent.change(within(aviso).getByLabelText('Correo de copia a Control Interno'), {
      target: { value: 'ci@gmail.com' }
    });
    fireEvent.click(within(aviso).getByRole('button', { name: /^Guardar$/ }));
    expect(
      await screen.findByText('El correo de copia a Control Interno debe ser @cali.gov.co')
    ).toBeTruthy();
    expect(screen.getByText('En modo demostración no se crean copias de seguridad.')).toBeTruthy();
    expect(screen.getByText('En modo demostración no hay funciones automáticas.')).toBeTruthy();
  });
});
