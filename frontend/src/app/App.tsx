// Pantalla inicial de la Fase 0: confirma que la base técnica funciona. Las pantallas reales llegan en F1 y F2.
import { textoVersion } from '../dominio/version';

export function App() {
  return (
    <main className="f0">
      <section className="f0-tarjeta" aria-labelledby="f0-titulo">
        <p className="f0-etiqueta">Alcaldía Distrital de Santiago de Cali</p>
        <h1 id="f0-titulo">Control de Entes 3.0</h1>
        <p>
          Base técnica de la versión nueva lista (Fase 0 del plan de migración). La aplicación en uso sigue
          siendo la versión 2.x, sin cambios.
        </p>
        <ul>
          <li>React, TypeScript estricto y Vite</li>
          <li>Reglas de capas verificadas automáticamente</li>
          <li>Pruebas en hora UTC y hora de Colombia</li>
        </ul>
        <p className="f0-version">{textoVersion('3.0.0-f0', 'demo')}</p>
      </section>
    </main>
  );
}
