// @vitest-environment jsdom
// El campo de contraseña tiene el ojito para ver lo escrito y volver a ocultarlo.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CampoClave } from './componentes';

afterEach(() => cleanup());

describe('CampoClave', () => {
  it('oculta por defecto y muestra u oculta con el ojito', () => {
    render(<CampoClave etiqueta="Contraseña" id="c" defaultValue="Secreta123" />);
    const campo = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(campo.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar lo escrito' }));
    expect(campo.type).toBe('text');
    expect(campo.value).toBe('Secreta123');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar lo escrito' }));
    expect(campo.type).toBe('password');
  });
});
