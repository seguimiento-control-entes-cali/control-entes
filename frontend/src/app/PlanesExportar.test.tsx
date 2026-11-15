// @vitest-environment jsdom
// Planes de mejoramiento en la demo (entrega 3b): exportar el plan CGSC (PM_01 + PM_02) y el de la CGR (F14 y 14.1)
// con el nombre de archivo de la 2.x; el enlace no tiene la barra del plan (como en la 2.x).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { App } from './App';
import { arrancar } from './arranque';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
  return within(await screen.findByRole('navigation', { name: 'Menú principal' }, { timeout: 8000 }));
}
/** La descarga del navegador: SheetJS crea un enlace con URL.createObjectURL y lo pulsa. */
function interceptarDescarga() {
  const archivos: string[] = [];
  const u = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
  u.createObjectURL = vi.fn(() => 'blob:prueba');
  u.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    archivos.push(this.download);
  });
  return archivos;
}

describe('3.0 · Planes de mejoramiento (demo, exportar)', () => {
  it('Super administrador: exporta el plan CGSC con el nombre del SIA Contralorías', async () => {
    const archivos = interceptarDescarga();
    const menu = await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: /Abrir Auditoría de cumplimiento a la contratación/ },
        { timeout: 8000 }
      )
    );
    fireEvent.click(await screen.findByRole('button', { name: /Exportar formato/ }));
    const v = await screen.findByRole('dialog');
    expect(within(v).getByText('Exportar en el formato de la contraloría')).toBeTruthy();
    const fmt = within(v).getByLabelText('Formato') as HTMLSelectElement;
    expect(fmt.value).toBe('PM_01_CGSC');
    expect([...fmt.options].map(o => o.value)).toEqual(['PM_01_CGSC', 'PM_01_AVANCE', 'F14_CGR']);
    fireEvent.click(within(v).getByRole('button', { name: /Descargar Excel/ }));
    expect(await screen.findByText(/^Formato descargado: FORMATO_202001_PM_CGSC_\d{6}_AC/)).toBeTruthy();
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toMatch(/^FORMATO_202001_PM_CGSC_\d{6}_AC.*\.xlsx$/);
  });

  it('informe semestral y F14: nombres de archivo; sin fecha de corte no descarga', async () => {
    const archivos = interceptarDescarga();
    const menu = await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: /Abrir Auditoría de cumplimiento a la contratación/ },
        { timeout: 8000 }
      )
    );
    fireEvent.click(await screen.findByRole('button', { name: /Exportar formato/ }));
    let v = await screen.findByRole('dialog');
    fireEvent.change(within(v).getByLabelText('Formato'), { target: { value: 'PM_01_AVANCE' } });
    fireEvent.change(within(v).getByLabelText('Fecha de corte / evaluación'), { target: { value: '' } });
    fireEvent.click(within(v).getByRole('button', { name: /Descargar Excel/ }));
    expect(await screen.findByText('Indica la fecha de corte')).toBeTruthy();
    fireEvent.change(within(v).getByLabelText('Fecha de corte / evaluación'), {
      target: { value: '2026-06-30' }
    });
    fireEvent.click(within(v).getByRole('button', { name: /Descargar Excel/ }));
    expect(
      await screen.findByText(/^Formato descargado: FORMATO_202001_PM_CGSC_202606_AC.*_AVANCE\.xlsx/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Exportar formato/ }));
    v = await screen.findByRole('dialog');
    fireEvent.change(within(v).getByLabelText('Formato'), { target: { value: 'F14_CGR' } });
    fireEvent.change(within(v).getByLabelText('Fecha de corte / evaluación'), {
      target: { value: '2026-06-30' }
    });
    fireEvent.click(within(v).getByRole('button', { name: /Descargar Excel/ }));
    expect(await screen.findByText(/^Formato descargado: F14_CGR_.*_corte_2026-06-30\.xlsx/)).toBeTruthy();
    expect(archivos).toHaveLength(2);
  });

  it('Enlace: su vista (Mis acciones de mejora) no abre el plan: sin exportar ni editar, igual que la 2.x', async () => {
    interceptarDescarga();
    const menu = await entrar('enlace.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Mis acciones de mejora' }));
    await screen.findByRole('heading', { name: 'Mis acciones de mejora' }, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: /Editar plan/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Exportar formato/ })).toBeNull();
  });
});
