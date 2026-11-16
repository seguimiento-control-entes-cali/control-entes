// @vitest-environment jsdom
// Planes de mejoramiento en la demo (entrega 2, edición): formular plan → hallazgo → acción, revisar avances (devolver
// exige el motivo; validar actualiza la acción) y el enlace reporta el avance de su dependencia.
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
const escribir = (v: HTMLElement, etiqueta: string | RegExp, valor: string) =>
  fireEvent.change(within(v).getByLabelText(etiqueta), { target: { value: valor } });
const kpi = (t: string) =>
  Number(screen.getByText(t, { selector: 'small' }).nextElementSibling?.textContent ?? 'NaN');

describe('3.0 · Planes de mejoramiento (demo, edición)', () => {
  it('Super administrador: crea un plan, le agrega un hallazgo y una acción', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const menu = await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    fireEvent.click(await screen.findByRole('button', { name: /Nuevo plan/ }, { timeout: 8000 }));
    let v = await screen.findByRole('dialog');
    expect(within(v).getByText('Nuevo plan de mejoramiento')).toBeTruthy();
    // Sin nombre del ejercicio no guarda (mismo mensaje de la 2.x)
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Escribe el nombre del ejercicio de fiscalización')).toBeTruthy();
    escribir(v, /Nombre del ejercicio de fiscalización/, 'Auditoría de prueba a la gestión documental');
    escribir(v, /Fecha de suscripción/, '2026-10-01');
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Plan creado. Ahora agrega sus hallazgos y acciones.')).toBeTruthy();
    // Queda abierto el plan nuevo, sin hallazgos
    fireEvent.click(await screen.findByRole('button', { name: /Agregar hallazgo/ }));
    v = await screen.findByRole('dialog');
    escribir(v, /N\.º o código del hallazgo/, '1');
    escribir(v, /Descripción de la condición del hallazgo/, 'Los expedientes no tienen tabla de retención');
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Hallazgo agregado')).toBeTruthy();
    expect(await screen.findByText('Hallazgo 1')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Formular con sugerencias/ }));
    v = await screen.findByRole('dialog');
    expect(within(v).getByText(/Agregar acción · hallazgo 1/)).toBeTruthy();
    escribir(v, /Acción correctiva/, 'Actualizar la tabla de retención documental');
    escribir(v, /Unidad de medida/, 'Documentos');
    escribir(v, /Cantidad de la meta/, '1');
    escribir(v, /Fecha de inicio/, '2026-10-01');
    escribir(v, /Fecha de terminación/, '2026-12-31');
    // Sin dependencia nadie podría reportar: no guarda
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(
      await screen.findByText('Asigna la dependencia responsable: sin ella nadie podrá reportar el avance')
    ).toBeTruthy();
    const dep = within(v).getByLabelText(/Dependencia responsable/) as HTMLSelectElement;
    fireEvent.change(dep, { target: { value: (dep.options[1] as HTMLOptionElement).value } });
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Acción agregada')).toBeTruthy();
    expect(await screen.findByText('Actualizar la tabla de retención documental')).toBeTruthy();
    // La nueva acción ya tiene sus botones de edición
    expect(screen.getByRole('button', { name: 'Editar acción' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar acción' })).toBeTruthy();
  });

  it('Super administrador: devolver exige el motivo; validar saca el avance de la lista por validar', async () => {
    const menu = await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    await screen.findByText(/^Formulación, avance y cumplimiento/, undefined, { timeout: 8000 });
    expect(kpi('Avances por validar')).toBe(1);
    fireEvent.click(
      screen.getByRole('button', { name: /Abrir Auditoría de cumplimiento a la contratación/ })
    );
    fireEvent.click(await screen.findByRole('button', { name: /Por validar/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revisar' }));
    const v = await screen.findByRole('dialog');
    expect(within(v).getByText('Revisar avance reportado')).toBeTruthy();
    fireEvent.click(within(v).getByRole('button', { name: /Devolver/ }));
    expect(await screen.findByText('Indica a la dependencia por qué se devuelve el avance')).toBeTruthy();
    fireEvent.click(within(v).getByRole('button', { name: /Validar/ }));
    expect(
      await screen.findByText('Avance validado: el indicador de la acción quedó actualizado')
    ).toBeTruthy();
    expect(await screen.findByText('No hay avances pendientes de validación')).toBeTruthy();
  });

  it('Super administrador: califica una acción (CGSC) y registra y atiende una observación de Control Interno', async () => {
    const menu = await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    fireEvent.click(
      await screen.findByRole(
        'button',
        { name: /Abrir Auditoría de cumplimiento a la contratación/ },
        { timeout: 8000 }
      )
    );
    fireEvent.click((await screen.findAllByRole('button', { name: /Calificar/ }))[0] as HTMLElement);
    let v = await screen.findByRole('dialog');
    expect(within(v).getByText('Calificar acción · metodología CGSC')).toBeTruthy();
    const e = within(v).getByLabelText(/Efectividad/) as HTMLSelectElement;
    fireEvent.change(e, { target: { value: (e.options[e.options.length - 1] as HTMLOptionElement).value } });
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Calificación guardada')).toBeTruthy();
    const antes = screen.getAllByRole('button', { name: 'Observación de Control Interno' }).length;
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Observación de Control Interno' })[0] as HTMLElement
    );
    v = await screen.findByRole('dialog');
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Escriba la observación')).toBeTruthy();
    escribir(v, /Observación a la formulación/, 'La meta no es medible: precisar el indicador');
    fireEvent.click(within(v).getByRole('button', { name: /Guardar/ }));
    expect(await screen.findByText('Observación registrada')).toBeTruthy();
    expect(await screen.findByText('La meta no es medible: precisar el indicador')).toBeTruthy();
    // Con observación ya no se ofrece registrar otra en esa acción
    expect(screen.getAllByRole('button', { name: 'Observación de Control Interno' })).toHaveLength(antes - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar atendida' }));
    expect(await screen.findByText('Observación marcada como atendida')).toBeTruthy();
    expect(await screen.findByText(/Control Interno \(atendida\)/)).toBeTruthy();
  });

  it('Enlace: reporta el avance de una acción de su dependencia y queda por validar', async () => {
    // Si el acumulado queda por debajo del ya validado, la 2.x pregunta antes de enviar
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const menu = await entrar('enlace.demo@cali.gov.co');
    fireEvent.click(menu.getByRole('link', { name: 'Mis acciones de mejora' }));
    await screen.findByRole('heading', { name: 'Mis acciones de mejora' }, { timeout: 8000 });
    // El enlace no formula planes
    expect(screen.queryByRole('button', { name: /Nuevo plan/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar acción' })).toBeNull();
    const botones = screen.getAllByRole('button', { name: /Reportar avance/ });
    fireEvent.click(botones[0] as HTMLElement);
    const v = await screen.findByRole('dialog');
    escribir(v, /Fecha de corte/, '2026-11-01');
    escribir(v, /Avance acumulado/, '1');
    escribir(v, /Descripción del avance de la acción/, 'Se realizó la primera actividad prevista');
    // Sin PDF ni radicado no se envía
    fireEvent.click(within(v).getByRole('button', { name: /Enviar avance/ }));
    expect(await screen.findByText('Adjunta el PDF del soporte o indica el radicado ORFEO')).toBeTruthy();
    escribir(v, /Radicado ORFEO del soporte/, '2026000000001');
    fireEvent.click(within(v).getByRole('button', { name: /Enviar avance/ }));
    expect(
      await screen.findByText('Avance enviado. Queda pendiente de validación por Control Interno.')
    ).toBeTruthy();
    // Con el avance pendiente ya no se puede reportar otro en esa acción; queda "Historial"
    expect(screen.queryAllByRole('button', { name: /Reportar avance/ })).toHaveLength(botones.length - 1);
    expect(window.confirm).toHaveBeenCalled();
  });
});
