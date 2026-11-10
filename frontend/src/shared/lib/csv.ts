// Archivo CSV igual al de la 2.x (csvDownload de src/js/09-cumplimiento-e-historico.js): marca UTF-8 (BOM) para que
// Excel muestre bien las tildes, separador ";" y cada valor entre comillas.

export function textoCsv(filas: readonly (readonly unknown[])[]): string {
  const q = (v: unknown) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  return '﻿' + filas.map(r => r.map(q).join(';')).join('\r\n');
}

/** Descarga el CSV en el navegador. */
export function descargarCsv(nombre: string, filas: readonly (readonly unknown[])[]): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([textoCsv(filas)], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
