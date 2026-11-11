// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Kpi, LimiteErrores, Modal, ProveedorAvisos, Tabla, useAvisos, Vacio } from './index';

afterEach(cleanup);

describe('componentes base', () => {
  it('Tabla: encabezados, filas y estado vacío', () => {
    const filas = [
      { id: 1, nombre: 'Secretaría de Salud Pública', casos: 3 },
      { id: 2, nombre: 'Secretaría de Educación', casos: 0 }
    ];
    const columnas = [
      { clave: 'n', titulo: 'Dependencia', celda: (f: (typeof filas)[number]) => f.nombre },
      { clave: 'c', titulo: 'Casos', celda: (f: (typeof filas)[number]) => f.casos, derecha: true }
    ];
    render(<Tabla titulo="Casos por dependencia" columnas={columnas} filas={filas} claveFila={f => f.id} />);
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Dependencia', 'Casos']);
    expect(screen.getAllByRole('row')).toHaveLength(3);
    cleanup();
    render(<Tabla titulo="x" columnas={columnas} filas={[]} claveFila={f => f.id} vacio="Sin casos" />);
    expect(screen.getByRole('status').textContent).toContain('Sin casos');
  });

  it('Kpi y Vacio', () => {
    render(
      <>
        <Kpi valor={12} etiqueta="En rojo" tono="rojo" />
        <Vacio titulo="Nada por aquí">Pruebe otro filtro.</Vacio>
      </>
    );
    expect(screen.getByText('12').closest('.kpi')?.className).toBe('card kpi r');
    expect(screen.getByRole('status').textContent).toContain('Pruebe otro filtro.');
  });

  it('Modal: abre con su título y se cierra con el botón', () => {
    function Prueba() {
      const [abierto, setAbierto] = useState(true);
      return (
        <Modal abierto={abierto} titulo="Detalle del requerimiento" alCerrar={() => setAbierto(false)}>
          <p>Contenido</p>
        </Modal>
      );
    }
    render(<Prueba />);
    expect(screen.getByRole('heading', { name: 'Detalle del requerimiento' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('heading', { name: 'Detalle del requerimiento' })).toBeNull();
  });

  it('Avisos emergentes: aparecen y desaparecen solos', () => {
    vi.useFakeTimers();
    function Boton() {
      const avisar = useAvisos();
      return <button onClick={() => avisar('Guardado', 'ok')}>Guardar</button>;
    }
    render(
      <ProveedorAvisos duracion={1000}>
        <Boton />
      </ProveedorAvisos>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByRole('status').textContent).toBe('Guardado');
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByText('Guardado')).toBeNull();
    vi.useRealTimers();
  });

  it('Límite de errores: una pantalla que falla muestra el mensaje y no deja la app en blanco', () => {
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Falla(): never {
      throw new Error('falla de prueba');
    }
    render(
      <LimiteErrores>
        <Falla />
      </LimiteErrores>
    );
    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal');
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
    silencio.mockRestore();
  });
});
