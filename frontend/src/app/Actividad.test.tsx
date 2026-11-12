// @vitest-environment jsdom
// Actividad y cambios en la demo: un cambio en el directorio aparece con su detalle (campo: antes → después), las
// cuatro pestañas funcionan y el acceso queda registrado.
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

afterEach(cleanup);

describe('3.0 · Actividad y cambios (demo)', () => {
  it('Despacho: ve el cambio que hizo en el directorio y su propio acceso', async () => {
    montar();
    await screen.findByLabelText(/correo institucional/i);
    escribir(/correo institucional/i, 'despacho.demo@cali.gov.co');
    escribir(/contraseña/i, 'demo');
    ingresar();
    await screen.findByRole('navigation', { name: 'Menú principal' });

    fireEvent.click(menu().getByRole('link', { name: 'Directorio del gabinete' }));
    const forms = await screen.findAllByRole('form');
    const f = within(forms[0] as HTMLElement);
    fireEvent.change(f.getByLabelText('Nombre completo'), { target: { value: 'Ana María Pérez' } });
    fireEvent.click(f.getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Directorio actualizado');

    fireEvent.click(menu().getByRole('link', { name: 'Actividad y cambios' }));
    await screen.findByRole('heading', { name: 'Actividad y cambios', level: 2 });
    await screen.findByText('Cambios registrados');
    expect(screen.getByText('MODIFICÓ')).toBeTruthy();
    // igual que auditWhat de la 2.x: el nombre del responsable tiene prioridad sobre el organismo
    expect(screen.getByText('Directorio: Ana María Pérez')).toBeTruthy();
    expect(screen.getByText('Nombre: Responsable Ejemplo → Ana María Pérez')).toBeTruthy();
    // filtro por acción
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'DELETE' } });
    expect(screen.getByText('Sin cambios para este filtro')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Actividad por usuario' }));
    // el correo también aparece en el menú (usuario conectado): se toma el de la tabla
    const fila = screen
      .getAllByText('despacho.demo@cali.gov.co')
      .map(e => e.closest('tr'))
      .find(Boolean) as HTMLElement;
    expect(within(fila).getByText('Alcalde / Despacho')).toBeTruthy();
    expect(within(fila).queryByText('Nunca')).toBeNull();
    expect(within(fila).getByText('ACTIVO')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Seguimiento de notificaciones' }));
    expect(screen.getAllByText('NUNCA NOTIFICADA').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: 'Informes generados' }));
    expect(screen.getByText('Aún no se ha generado ningún informe')).toBeTruthy();
  });
});
