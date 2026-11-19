// @vitest-environment jsdom
// Planes de mejoramiento · QUIÉN HACE QUÉ (script 28) en la demo: la dependencia formula el análisis de causa y
// las acciones de SU hallazgo y lo envía; Control Interno solo lo ve y lo valida o lo devuelve con observación.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(() => cleanup());

async function entrar(correo: string) {
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
  fireEvent.change(screen.getByLabelText(/correo institucional/i), { target: { value: correo } });
  fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'demo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  const menu = within(await screen.findByRole('navigation', { name: 'Menú principal' }, { timeout: 8000 }));
  fireEvent.click(menu.getByRole('link', { name: /Planes de mejoramiento|Mis acciones de mejora/ }));
  // Supervisión: desde la lista de planes. Dependencia: desde «Hallazgos por formular» en Mis acciones de mejora.
  fireEvent.click(
    await screen.findByRole(
      'button',
      {
        name: /Abrir Actuación especial de fiscalización a la contratación en salud|Formular hallazgo 1 de Actuación especial/
      },
      { timeout: 8000 }
    )
  );
}
/** La tarjeta de un hallazgo del plan en formulación. */
const hallazgo = async (n: string) =>
  within((await screen.findByText('Hallazgo ' + n, {}, { timeout: 8000 })).closest('section') as HTMLElement);

describe('3.0 · Planes: la dependencia formula, Control Interno valida (script 28)', () => {
  it('la dependencia diligencia el análisis de causa de su hallazgo y ve qué le falta para enviar', async () => {
    await entrar('secretaria.demo@cali.gov.co');
    const h1 = await hallazgo('1');
    expect(h1.getByText('En formulación')).toBeTruthy();
    const enviar = h1.getByRole('button', { name: /Enviar a Control Interno/ }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    fireEvent.click(h1.getByRole('button', { name: /Análisis de causa/ }));
    const v = within(await screen.findByRole('dialog'));
    fireEvent.change(v.getByLabelText(/Herramienta principal/), { target: { value: 'cinco_porques' } });
    fireEvent.change(v.getByLabelText(/Causa raíz \(conclusión/), {
      target: { value: 'No existe control de oportunidad en la publicación' }
    });
    fireEvent.click(v.getByRole('tab', { name: '5 porqués' }));
    fireEvent.change(v.getByLabelText('Fila 1: 1 porqué'), { target: { value: 'No se revisa el plazo' } });
    fireEvent.click(v.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const h1b = await hallazgo('1');
    expect(await h1b.findByText(/No existe control de oportunidad/)).toBeTruthy();
    // Sin acciones todavía: el botón de enviar sigue inactivo y le dice qué falta
    expect(h1b.getByText(/formular al menos una acción/)).toBeTruthy();
    expect(h1b.getByRole('button', { name: /Formato de Calidad/ })).toBeTruthy();
    // El hallazgo ya enviado no se puede cambiar ni volver a enviar
    const h2 = await hallazgo('2');
    expect(h2.getByText('En revisión de Control Interno')).toBeTruthy();
    expect(h2.queryByRole('button', { name: /Enviar a Control Interno/ })).toBeNull();
    expect(h2.getByRole('button', { name: /Ver análisis de causa/ })).toBeTruthy();
  });

  it('Control Interno ve lo que hizo la dependencia (solo lectura) y lo devuelve con observación', async () => {
    await entrar('control.interno.demo@cali.gov.co');
    const h2 = await hallazgo('2');
    // No formula: no tiene «Acción» ni edita el análisis
    expect(h2.queryByRole('button', { name: /^ Acción$|^Acción$/ })).toBeNull();
    fireEvent.click(h2.getByRole('button', { name: /Ver análisis de causa/ }));
    const v = within(await screen.findByRole('dialog'));
    expect((v.getByLabelText(/Causa raíz \(conclusión/) as HTMLTextAreaElement).value).toMatch(
      /control periódico/
    );
    expect(
      (v.getByLabelText(/Causa raíz \(conclusión/) as HTMLTextAreaElement).closest('fieldset')?.disabled
    ).toBe(true);
    expect(v.queryByRole('button', { name: /Guardar/ })).toBeNull();
    fireEvent.click(v.getByRole('button', { name: 'Cerrar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click((await hallazgo('2')).getByRole('button', { name: /Devolver/ }));
    const d = within(await screen.findByRole('dialog'));
    const boton = d.getByRole('button', { name: /Devolver/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true); // sin observación no se devuelve
    fireEvent.change(d.getByLabelText(/Ajustes que debe hacer/), {
      target: { value: 'La meta debe ser medible por trimestre' }
    });
    fireEvent.click(boton);
    const h2b = await hallazgo('2');
    expect(await h2b.findByText('Devuelto para ajustes')).toBeTruthy();
    expect(h2b.getByText(/La meta debe ser medible por trimestre/)).toBeTruthy();
  });

  it('Control Interno valida', async () => {
    await entrar('control.interno.demo@cali.gov.co');
    fireEvent.click((await hallazgo('2')).getByRole('button', { name: /Validar/ }));
    expect(await (await hallazgo('2')).findByText('Validado por Control Interno')).toBeTruthy();
  });
});
