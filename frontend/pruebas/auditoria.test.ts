// Cadena de custodia SHA-256: la huella en código se compara con la de Node (crypto oficial) y la verificación
// con la misma lógica de la 2.x (db.verify en demostración).
import { describe, expect, it } from 'vitest';
import cargarApp from '../../tests/cargar-app.cjs';
import {
  formatoFechaHora,
  nuevoEvento,
  sha256Hex,
  textoParaHuella,
  verificarCadena,
  type EventoAuditoria
} from '../src/dominio/auditoria';

// Huellas oficiales calculadas con el módulo crypto de Node (createHash('sha256')) el 11-nov-2026
const OFICIALES: [string, string][] = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  [
    'Control de Entes · Alcaldía de Santiago de Cali ñ ÁÉÍÓÚ 😀',
    '686e8688c4ec469000ac50f710271b8568f9f3442014119435f09fddcee5cac2'
  ],
  [
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'd5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072'
  ],
  [
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    '04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e'
  ],
  ['x'.repeat(64), '7ce100971f64e7001e8fe5a51973ecdfe1ced42befe7ee8d5fd6219506b5393c'],
  ['y'.repeat(1000), '7e33ae3f1e88ddf3291109cc366b12dcd8bf8fe77bec53009f200a76e4649c07']
];

describe('SHA-256 en código', () => {
  it('da la misma huella que la implementación oficial (textos cortos, largos, con tildes y en el borde de bloque)', () => {
    for (const [t, h] of OFICIALES) expect(sha256Hex(t), t.slice(0, 20)).toBe(h);
  });
});

describe('cadena de auditoría', () => {
  const crear = () => {
    const ev: EventoAuditoria[] = [];
    for (let i = 0; i < 5; i++)
      ev.push(
        nuevoEvento(ev, {
          tabla: 'requerimientos',
          accion: i ? 'UPDATE' : 'INSERT',
          registro_id: 'R-' + i,
          usuario: 'admin.demo@cali.gov.co',
          payload: { asunto: 'Asunto ' + i, valor: 100.5 },
          cambios: i ? { estado: ['abierto', 'cerrado'] } : {},
          created_at: `2026-11-1${i}T15:00:00.000Z`
        })
      );
    return ev;
  };
  it('una cadena íntegra verifica; la huella sigue el mismo texto de la 2.x', () => {
    const ev = crear();
    expect(verificarCadena(ev)).toEqual({ ok: true, total: 5, primer_id_roto: null });
    expect(ev[0]?.prev_hash).toBe('0'.repeat(64));
    expect(ev[1]?.prev_hash).toBe(ev[0]?.hash);
    expect(ev[0]?.hash).toBe(sha256Hex(textoParaHuella('0'.repeat(64), ev[0] as EventoAuditoria)));
  });
  it('alterar un evento rompe la cadena justo en ese evento (como "Simular manipulación" de la 2.x)', () => {
    const ev = crear();
    (ev[1]?.payload as Record<string, unknown>).asunto = 'ALTERADO';
    expect(verificarCadena(ev)).toEqual({ ok: false, total: 2, primer_id_roto: 2 });
  });
  it('borrar un evento también la rompe', () => {
    const ev = crear();
    ev.splice(2, 1);
    expect(verificarCadena(ev)).toEqual({ ok: false, total: 3, primer_id_roto: 4 });
  });
  it('fecha y hora igual que fmtTs de la 2.x', () => {
    const d2 = cargarApp(['fmtTs']) as { fmtTs: (s: string) => string };
    for (const s of [
      '2026-11-11T15:04:00.000Z',
      '2026-01-01T04:59:59Z',
      'no es fecha',
      '2024-02-29T23:30:00-05:00'
    ])
      expect(formatoFechaHora(s), s).toBe(d2.fmtTs(s));
  });
});
