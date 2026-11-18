// Archivo CSV igual al de la 2.x (csvDownload de src/js/09-cumplimiento-e-historico.js): marca UTF-8 (BOM) para que
// Excel muestre bien las tildes, separador ";" y cada valor entre comillas.

// Un texto que empieza por = + - @ (o tabulador / retorno) Excel lo toma como fórmula: se le antepone un apóstrofo
// para que se vea como texto. Los números y los textos numéricos («-5», «12,5%») se dejan iguales.
const FORMULA = /^[=+\-@\t\r]/;
const NUMERICO = /^[-+]?\d[\d.,]*%?$/;
export function neutralizarFormula(v: unknown): string {
  const s = String(v == null ? '' : v);
  return typeof v === 'string' && FORMULA.test(s) && !NUMERICO.test(s) ? "'" + s : s;
}

export function textoCsv(filas: readonly (readonly unknown[])[]): string {
  const q = (v: unknown) => '"' + neutralizarFormula(v).replace(/"/g, '""') + '"';
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
