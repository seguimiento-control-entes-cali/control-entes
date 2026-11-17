// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { AvisoVersionNueva } from './version-nueva';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function swFalso(controlador: boolean) {
  const sw = new EventTarget() as EventTarget & {
    controller: object | null;
    getRegistration: () => Promise<{ update: () => Promise<void> }>;
  };
  sw.controller = controlador ? {} : null;
  const update = vi.fn().mockResolvedValue(undefined);
  sw.getRegistration = () => Promise.resolve({ update });
  vi.stubGlobal('navigator', { ...navigator, serviceWorker: sw });
  return { sw, update };
}

describe('Aviso de versión nueva', () => {
  it('con la app ya controlada por el service worker, un cambio de versión ofrece actualizar sin cerrar', () => {
    const { sw } = swFalso(true);
    render(<AvisoVersionNueva />);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      sw.dispatchEvent(new Event('controllerchange'));
    });
    expect(screen.getByRole('status').textContent).toMatch(/versión nueva/);
    expect(screen.getByRole('button', { name: 'Actualizar ahora' })).toBeTruthy();
  });

  it('la primera instalación (sin service worker previo) no muestra aviso', () => {
    const { sw } = swFalso(false);
    render(<AvisoVersionNueva />);
    act(() => {
      sw.dispatchEvent(new Event('controllerchange'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('al volver a la ventana busca si hay versión nueva', async () => {
    const { update } = swFalso(true);
    render(<AvisoVersionNueva />);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(update).toHaveBeenCalled();
  });
});
