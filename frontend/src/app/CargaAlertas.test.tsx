// @vitest-environment jsdom
// Cargar respuesta ORFEO y Alertas y escalamiento en la demo: cerrar un caso con PDF (queda en verde) y escalar.
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
const pdf = (cabecera = '%PDF-1.4') =>
  new File([cabecera + ' prueba'], 'soporte.pdf', { type: 'application/pdf' });

// jsdom no trae Blob.arrayBuffer (los navegadores sí): se lee con FileReader, como haría un navegador viejo
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

afterEach(cleanup);

describe('3.0 · Cargar respuesta ORFEO y Alertas (demo)', () => {
  it('Cerrar desde Requerimientos: valida, cierra con huella y el caso queda en verde', async () => {
    montar();
    await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: 'Requerimientos' }));
    const tabla = await screen.findByRole('table', { name: 'Requerimientos de la vigencia' });
    const fila = within(tabla)
      .getAllByRole('row')
      .find(f => within(f).queryByRole('button', { name: /Cerrar/ }));
    const radicado = fila?.children[1]?.textContent ?? '';
    fireEvent.click(within(fila as HTMLElement).getByRole('button', { name: /Cerrar/ }));
    await screen.findByRole('heading', { name: 'Registrar respuesta ORFEO' });
    const sel = screen.getByLabelText('Requerimiento pendiente') as HTMLSelectElement;
    expect(sel.selectedOptions[0]?.textContent).toMatch(new RegExp('^' + radicado));
    // Validaciones
    escribir('Radicado ORFEO de salida', '12ab3');
    expect((screen.getByLabelText('Radicado ORFEO de salida') as HTMLInputElement).value).toBe('123');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y marcar en verde/ }));
    expect(await screen.findByText('El radicado ORFEO debe tener entre 10 y 20 dígitos')).toBeTruthy();
    escribir('Radicado ORFEO de salida', '2026414301000099');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y marcar en verde/ }));
    expect(await screen.findByText('Adjunta el soporte en PDF')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Soporte PDF'), { target: { files: [pdf('PK..')] } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar y marcar en verde/ }));
    expect(await screen.findByText('El archivo no parece ser un PDF válido')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Soporte PDF'), { target: { files: [pdf()] } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar y marcar en verde/ }));
    expect(await screen.findByText(new RegExp(`^${radicado} cerrado · huella [0-9a-f]{10}…$`))).toBeTruthy();
    // Vuelve a Requerimientos y el caso ya está cerrado
    const t2 = await screen.findByRole('table', { name: 'Requerimientos de la vigencia' });
    await waitFor(() => {
      const f2 = within(t2)
        .getAllByRole('row')
        .find(f => f.children[1]?.textContent === radicado);
      expect(within(f2 as HTMLElement).getByText('CERRADO')).toBeTruthy();
    });
  });

  it('Alertas: registra el escalamiento de uno y luego de todos los pendientes', async () => {
    montar();
    await entrar('admin.demo@cali.gov.co');
    fireEvent.click(menu().getByRole('link', { name: /Alertas y escalamiento/ }));
    const titulo = await screen.findByRole('heading', { name: /requerimiento\(s\) crítico\(s\)/ });
    expect(titulo.textContent).toMatch(/vencido\(s\)/);
    const wa = within(document.querySelector('.alert-card') as HTMLElement).getByRole('link', {
      name: /WhatsApp/
    }) as HTMLAnchorElement;
    expect(wa.href).toMatch(/^https:\/\/wa\.me\/\d*\?text=Cordial%20saludo/);
    const n = screen.getAllByRole('button', { name: 'Registrar' }).length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Registrar' })[0] as HTMLElement);
    expect(await screen.findByText('Escalamiento registrado')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText(/^Escalado /)).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: `Registrar escalamiento de ${n - 1}` }));
    expect(await screen.findByText(`${n - 1} escalamiento(s) registrado(s)`)).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByRole('button', { name: 'Registrar' })).toHaveLength(0));
  });

  it('Secretario: puede cerrar pero no escalar', async () => {
    montar();
    await entrar('secretaria.demo@cali.gov.co');
    expect(menu().queryByRole('link', { name: /Alertas y escalamiento/ })).toBeNull();
    expect(menu().getByRole('link', { name: /Cargar respuesta ORFEO/ })).toBeTruthy();
  });
});
