// @vitest-environment jsdom
// Carga del Excel de control en la demo: un libro FICTICIO de la vigencia 2026, vista previa, confirmación y el
// histórico reemplazado (solo en este navegador, como la 2.x en la demostración).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import * as X from 'xlsx';
import { App } from './App';
import { arrancar } from './arranque';

// jsdom no trae Blob.arrayBuffer (los navegadores sí)
if (!('arrayBuffer' in Blob.prototype))
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    value(this: Blob) {
      return new Promise<ArrayBuffer>(ok => {
        const r = new FileReader();
        r.onload = () => ok(r.result as ArrayBuffer);
        r.readAsArrayBuffer(this);
      });
    }
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);
function excel2026(): File {
  const filas = [
    [],
    [
      'No. Orden',
      'Radicado ente',
      'Ente externo',
      'Radicación en ORFEO',
      'Fecha radicación',
      'Clase',
      'Organismo',
      'Asunto',
      'Días hábiles',
      'Fecha máxima',
      'ORFEO respuesta',
      'Fecha de respuesta',
      'Estado',
      'Observaciones'
    ],
    [
      1,
      'P-1',
      'Contraloría General de Santiago de Cali',
      20264100000001,
      D(2026, 1, 13),
      'Requerimiento',
      'Secretaría de Turismo',
      'Prueba uno',
      10,
      D(2026, 1, 27),
      20264100000555,
      D(2026, 1, 20),
      'Cerrado',
      null
    ],
    [
      2,
      'P-2',
      'Procuraduría',
      20264100000002,
      D(2026, 2, 2),
      'Requerimiento',
      'Oficina inventada de prueba',
      'Prueba dos',
      10,
      D(2026, 2, 16),
      null,
      null,
      'Abierto',
      null
    ]
  ];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(filas, { cellDates: true }), 'CONTROL');
  const bin = X.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([bin], 'Control Vigencia 2026.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

describe('3.0 · Cargar Excel de control (demo)', () => {
  it('lee el libro, muestra la vista previa y reemplaza la vigencia en el histórico de la demo', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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
    const menu = within(await screen.findByRole('navigation', { name: 'Menú principal' }));
    fireEvent.click(menu.getByRole('link', { name: 'Configuración' }));
    fireEvent.click(await screen.findByRole('button', { name: /Cargar Excel de control/ }));
    const v = await screen.findByRole('dialog');
    fireEvent.change(within(v).getByLabelText('Excel de control'), { target: { files: [excel2026()] } });
    expect(await within(v).findByText('Vigencia 2026')).toBeTruthy();
    expect(within(v).getByText('2 registros leídos')).toBeTruthy();
    expect(within(v).getByText(/Organismos que no se reconocieron \(1\)/)).toBeTruthy();
    fireEvent.click(within(v).getByRole('button', { name: /Cargar vigencia 2026/ }));
    expect(
      await screen.findByText(/Modo demostración: la carga se aplicó solo en este navegador/)
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    // El histórico de la demo ahora trae solo esos 2 radicados de 2026
    fireEvent.click(menu.getByRole('link', { name: 'Histórico de radicados' }));
    await screen.findByRole('heading', { name: 'Histórico de radicados', level: 2 });
    const vig = (await screen.findByLabelText('Vigencia')) as HTMLSelectElement;
    fireEvent.change(vig, { target: { value: '2026' } });
    await waitFor(() => expect(screen.getByText(/^2 de [0-9.]+ registros/)).toBeTruthy());
  });

  it('un libro sin hoja CONTROL se rechaza con un mensaje claro', async () => {
    const { leerLibro } = await import('../dominio/excel-control/lectura');
    expect(() => leerLibro({ control: null, noRespuesta: null }, 'otro.xlsx')).toThrow(
      '«otro.xlsx» no tiene la hoja CONTROL.'
    );
  });
});
