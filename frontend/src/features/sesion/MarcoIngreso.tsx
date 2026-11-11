// Tarjeta de ingreso igual a la de la 2.x (src/index.html, #loginScreen): fondo, escudo, título y subtítulo.
import type { ReactNode } from 'react';
import escudo from '../../../../src/assets/escudo.png';

export function MarcoIngreso({
  titulo,
  subtitulo,
  children
}: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
}) {
  return (
    <main className="login">
      <div className="card">
        <div className="shield">
          <img src={escudo} alt="Escudo de Santiago de Cali" />
        </div>
        <h2 style={{ textAlign: 'center', fontSize: '1.3rem' }}>{titulo}</h2>
        <p className="muted" style={{ textAlign: 'center', margin: '4px 0 20px', fontSize: '.84rem' }}>
          {subtitulo}
        </p>
        {children}
      </div>
    </main>
  );
}
