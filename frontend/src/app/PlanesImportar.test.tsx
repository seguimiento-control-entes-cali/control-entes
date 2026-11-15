// @vitest-environment jsdom
// Planes de mejoramiento en la demo (entrega 3a): importar un plan FICTICIO en Excel desde la ventana, revisar lo leído,
// asignar la dependencia que falta e importar; el plan nuevo queda abierto.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import * as X from 'xlsx';
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
  return within(await screen.findByRole('navigation', { name: 'Menú principal' }, { timeout: 8000 }));
}

function planExcel(): File {
  const aoa = [
    ['CONTRALORÍA GENERAL DE SANTIAGO DE CALI'],
    ['FORMATO PM_01 CGSC - PLAN DE MEJORAMIENTO'],
    ['Nombre de la actuación de control fiscal (2): ', 'Auditoría ficticia a la gestión documental'],
    ['Fecha de suscripción (4): 15 de enero de 2026'],
    [
      'N° hallazgo (6)',
      'Descripción de la condición y causa del hallazgo (7)',
      'Connotación del hallazgo (8)',
      'Acción de Correctiva (10)',
      'Meta (11)',
      'Lugar de verificación (13)',
      'Fecha terminación de la Actividad (14)',
      'Responsable (Nombre y Cargo) (15)'
    ],
    [
      '1',
      'Los expedientes no tienen tabla de retención',
      'Administrativa',
      'Actualizar la tabla de retención',
      'Tabla actualizada',
      'Secretaría de Salud Pública',
      '31/12/2026',
      'Secretario de Salud Pública'
    ],
    [
      '2',
      'El archivo de gestión no está inventariado',
      'Administrativa disciplinaria',
      'Inventariar el archivo de gestión',
      'Inventario',
      '',
      '30/09/2026',
      'Persona sin dependencia reconocible'
    ]
  ];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), 'Formato PM_01 CGSC - PLAN ');
  const bin = X.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const f = new File([bin], 'plan-ficticio.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  // jsdom no siempre trae File.arrayBuffer: se da el mismo contenido
  Object.defineProperty(f, 'arrayBuffer', { value: () => Promise.resolve(bin) });
  return f;
}

describe('3.0 · Planes de mejoramiento (demo, importar)', () => {
  it('Super administrador: importa un plan en Excel, asigna la dependencia faltante y queda abierto', async () => {
    const menu = await entrarAdmin();
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    fireEvent.click(await screen.findByRole('button', { name: /Importar Excel/ }, { timeout: 8000 }));
    const v = await screen.findByRole('dialog');
    expect(within(v).getByText('Importar plan de mejoramiento desde Excel')).toBeTruthy();
    const importar = within(v).getByRole('button', { name: /^Importar$/ }) as HTMLButtonElement;
    expect(importar.disabled).toBe(true);
    fireEvent.change(within(v).getByLabelText('Archivo del plan o del informe final'), {
      target: { files: [planExcel()] }
    });
    expect(
      await within(v).findByText(/Hoja «Formato PM_01 CGSC - PLAN » · 2 hallazgos · 2 acciones/)
    ).toBeTruthy();
    expect(
      (within(v).getByLabelText('Nombre del ejercicio de fiscalización *') as HTMLTextAreaElement).value
    ).toBe('Auditoría ficticia a la gestión documental');
    expect(within(v).getByText('Sin errores')).toBeTruthy();
    // La segunda acción no tiene dependencia reconocida: aviso en rojo
    expect(within(v).getByText(/Fila 7: no se reconoció la dependencia responsable/)).toBeTruthy();
    const dep = within(v).getByLabelText('Asignar a todas las que están sin asignar') as HTMLSelectElement;
    fireEvent.change(dep, { target: { value: (dep.options[1] as HTMLOptionElement).value } });
    expect(within(v).queryByText(/Fila 7: no se reconoció la dependencia responsable/)).toBeNull();
    fireEvent.click(importar);
    expect(await screen.findByText('Plan importado: 2 hallazgos y 2 acciones')).toBeTruthy();
    expect(await screen.findByText('Actualizar la tabla de retención')).toBeTruthy();
    expect(screen.getAllByText(/^Hallazgo \d$/)).toHaveLength(2);
  });

  it('sin fecha de suscripción no deja importar hasta escribirla', async () => {
    const menu = await entrarAdmin();
    fireEvent.click(menu.getByRole('link', { name: 'Planes de mejoramiento' }));
    fireEvent.click(await screen.findByRole('button', { name: /Importar Excel/ }, { timeout: 8000 }));
    const v = await screen.findByRole('dialog');
    fireEvent.change(within(v).getByLabelText('Archivo del plan o del informe final'), {
      target: { files: [planExcel()] }
    });
    const fs = (await within(v).findByLabelText('Fecha de suscripción *')) as HTMLInputElement;
    fireEvent.change(fs, { target: { value: '' } });
    expect(within(v).getByText('Indica la fecha de suscripción del plan.')).toBeTruthy();
    expect((within(v).getByRole('button', { name: /^Importar$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(fs, { target: { value: '2026-01-20' } });
    expect(within(v).getByText('Sin errores')).toBeTruthy();
  });
});
