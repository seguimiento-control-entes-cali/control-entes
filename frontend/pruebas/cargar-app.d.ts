// Tipo del cargador de la 2.x (tests/cargar-app.cjs), usado solo por las pruebas de paridad.
declare module '*/tests/cargar-app.cjs' {
  const cargarApp: (nombres: string[], ce?: Record<string, unknown>) => unknown;
  export default cargarApp;
}
