// @vitest-environment jsdom
// Planes de mejoramiento en la demo (consulta): resumen, detalle del plan con sus pestañas, historial, "Mis acciones de
// mejora" del enlace, y la tarjeta del Centro de mando y la sección del Informe ejecutivo.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(cleanup);

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
  if (correo.startsWith('admin')) {
    fireEvent.change(await screen.findByLabelText(/código de 6 dígitos/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  }
  return within(await screen.findByRole('navigation', { name: 'Menú principal' }));
}
const kpi = (t: string) =>
  Number(screen.getByText(t, { selector: 'small' }).nextElementSibling?.textContent ?? 'NaN');

describe('3.0 · Planes de mejoramiento (demo, consulta)', () => {
  it('Super administrador: resumen, detalle del plan CGSC con calificación, pestañas e historial', async () => {
    const menu = await entrar('admin.demo@cali.gov.co');
    // La tarjeta de planes ya está en el Centro de mando
    expect(
      await screen.findByRole('heading', { name: 'Planes de mejoramiento', level: 3 }, { timeout: 8000 })
    ).toBeTruthy();
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    await screen.findByText(/^Formulación, avance y cumplimiento frente a la Contraloría/);
    // 3 planes: los 2 de la 2.x y el ficticio en formulación del script 28 (con 1 acción de Salud)
    expect(kpi('Planes')).toBe(3);
    expect(kpi('Acciones')).toBe(7);
    expect(kpi('Avances por validar')).toBe(1);
    expect(screen.getByRole('table', { name: 'Acciones que requieren atención' })).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /Abrir Auditoría de cumplimiento a la contratación/ })
    );
    expect(await screen.findByText('Calificación según la metodología de la CGSC')).toBeTruthy();
    expect(screen.getAllByText(/^Hallazgo \d$/)).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Por validar/ }));
    expect(await screen.findByRole('table', { name: 'Avances por validar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Calidad de datos/ }));
    expect(await screen.findByText(/vencida sin cumplir y sin avance en validación/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Hallazgos y acciones/ }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Historial' })[0] as HTMLElement);
    const v = await screen.findByRole('dialog');
    expect(within(v).getByText('Historial de avances')).toBeTruthy();
    expect(within(v).getByText(/Se capacitó a la totalidad de supervisores/)).toBeTruthy();
  });

  it('el Informe ejecutivo incluye la sección de planes', async () => {
    const menu = await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Informe ejecutivo' }));
    expect(await screen.findByRole('heading', { name: '7. Planes de mejoramiento' })).toBeTruthy();
  });

  it('Enlace: "Mis acciones de mejora" con solo las acciones de su dependencia', async () => {
    const menu = await entrar('enlace.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Mis acciones de mejora' }));
    expect(await screen.findByRole('heading', { name: 'Mis acciones de mejora' })).toBeTruthy();
    expect(kpi('Asignadas')).toBe(3); // 2 de la 2.x + 1 del plan en formulación (script 28)
    expect(screen.getByText(/Secretaría de Salud Pública · acciones asignadas/)).toBeTruthy();
  });
});
