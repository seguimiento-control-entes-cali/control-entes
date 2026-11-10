// Límite de errores (plan §10, F1): si una pantalla falla, la aplicación no queda en blanco; muestra un mensaje en
// español y permite volver a intentar. No muestra detalles técnicos al usuario.
import { Component, type ErrorInfo, type ReactNode } from 'react';

export class LimiteErrores extends Component<{ children: ReactNode }, { fallo: boolean }> {
  override state = { fallo: false };

  static getDerivedStateFromError() {
    return { fallo: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // En la 2.x estos errores se registran con registrar_error_app (script 17); se conecta con la capa de datos real.
    console.error('Error en la pantalla:', error.message, info.componentStack);
  }

  override render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div className="error-pantalla" role="alert">
        <h2>Algo salió mal en esta pantalla</h2>
        <p>Sus datos no se perdieron. Vuelva a intentar; si el problema continúa, avise al administrador.</p>
        <button
          type="button"
          className="boton boton-primario"
          onClick={() => this.setState({ fallo: false })}
        >
          Volver a intentar
        </button>
      </div>
    );
  }
}
