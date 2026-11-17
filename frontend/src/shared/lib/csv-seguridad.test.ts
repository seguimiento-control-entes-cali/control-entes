import { describe, expect, it } from 'vitest';
import { neutralizarFormula, textoCsv } from './csv';

describe('CSV sin fórmulas (inyección en Excel)', () => {
  it('antepone apóstrofo a textos que Excel tomaría como fórmula', () => {
    expect(neutralizarFormula('=HYPERLINK("http://x")')).toBe('\'=HYPERLINK("http://x")');
    expect(neutralizarFormula('+cmd')).toBe("'+cmd");
    expect(neutralizarFormula('-1+2*A1')).toBe("'-1+2*A1");
    expect(neutralizarFormula('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  it('deja iguales números, textos numéricos y textos normales', () => {
    expect(neutralizarFormula(-5)).toBe('-5');
    expect(neutralizarFormula('-5')).toBe('-5');
    expect(neutralizarFormula('12,5%')).toBe('12,5%');
    expect(neutralizarFormula('Secretaría de Salud')).toBe('Secretaría de Salud');
    expect(neutralizarFormula(null)).toBe('');
  });
  it('el archivo conserva BOM, separador y comillas', () => {
    expect(textoCsv([['a', '=1'], [2, 'b"c']])).toBe('﻿"a";"\'=1"\r\n"2";"b""c"');
  });
});
