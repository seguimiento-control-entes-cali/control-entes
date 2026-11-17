// Límite de errores (plan §10, F1): si una pantalla falla, la aplicación no queda en blanco; muestra un mensaje en
// español y permite volver a intentar. No muestra detalles técnicos al usuario.
import { Component, type ErrorInfo, type ReactNode } from 'react';

export class LimiteErrores extends Component<
  { children: ReactNode; alError?: (mensaje: string, detalle: Record<string, unknown>) => void },
  { fallo: boolean }
> {
  override state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Igual que la 2.x: queda en «Salud del sistema» (registrar_error_app del script 17)
    console.error('Error en la pantalla:', error.message, info.componentStack);
    this.props.alError?.(error.message, {
      tipo: 'pantalla',
      componente: (info.componentStack ?? '').slice(0, 300)
    });
  }

  override render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="card empty" role="alert">
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        <h3>Algo salió mal en esta pantalla</h3>
        <p className="muted">
          Sus datos no se perdieron. Vuelva a intentar; si el problema continúa, avise al administrador.
        </p>
        <button type="button" className="btn primary" onClick={() => this.setState({ fallo: false })}>
          Volver a intentar
        </button>
      </div>
    );
  }
}
