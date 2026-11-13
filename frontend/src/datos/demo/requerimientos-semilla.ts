// Requerimientos de la demostración: los mismos 15 de la 2.x (src/js/04-capa-de-datos.js, seed de DEMO.reqs), con
// fechas relativas a hoy. Los ids de ente y dependencia se pasan a los catálogos de la 3.0 (supabase/02_seed.sql).
import { sumarDias } from '../../dominio/fechas';
import type { Requerimiento } from '../../dominio/requerimientos';

/** Ente de la 2.x → ente de la 3.0 (CGR, Contraloría de Cali, Procuraduría, Personería de Cali). */
const ENTE: Readonly<Record<number, number>> = { 1: 2, 2: 1, 3: 8, 4: 6 };
/** Dependencia de la 2.x → la de la 3.0 (Educación, Salud, Infraestructura, Hacienda, Movilidad, Gobierno,
 *  Seguridad y Justicia, Control Interno). */
const DEP: Readonly<Record<number, number>> = { 1: 15, 2: 21, 3: 18, 4: 7, 5: 19, 6: 17, 7: 22, 8: 3 };

// [ente, dependencia, asunto, días desde la radicación, días a la fecha límite, cerrado hace (null = abierto)]
const SEMILLA: readonly [number, number, string, number, number, number | null][] = [
  [2, 1, 'Auditoría de cumplimiento de recursos PAE e infraestructura educativa.', -10, -1, null],
  [4, 2, 'Requerimiento sobre planta de personal asistencial en red hospitalaria oriente.', -9, 2, null],
  [1, 4, 'Solicitud de información sobre recursos SGP en educación y salud.', -8, 3, null],
  [3, 8, 'Seguimiento al plan de mejoramiento institucional.', -4, 5, null],
  [3, 3, 'Informe técnico sobre plan de manejo de tráfico en la Calle 5ta.', -6, 8, null],
  [4, 6, 'Traslado por competencia de derecho de petición ciudadano.', -2, 9, null],
  [2, 4, 'Reporte de ejecución presupuestal del trimestre.', -5, 11, null],
  [3, 5, 'Seguimiento a plan de acción sobre señalización vial.', -3, 14, null],
  [2, 1, 'Auditoría regular a la gestión contractual.', -40, -20, -22],
  [1, 4, 'Rendición de cuentas sobre recursos de regalías.', -60, -35, -37],
  [3, 2, 'Petición sobre atención en centros de salud del oriente.', -50, -30, -33],
  [4, 7, 'Informe sobre convivencia y seguridad en comunas.', -45, -25, -26]
];

export function semillaRequerimientos(hoy: string): Requerimiento[] {
  const Y = +hoy.slice(0, 4);
  let n = 4800;
  const base = SEMILLA.map(([e, d, asunto, fr, fl, fc], i): Requerimiento => {
    const frad = sumarDias(hoy, fr);
    const cerrado = fc !== null;
    return {
      id: 'd' + (i + 1),
      radicado: frad.slice(0, 4) + 'EE' + String((n += 137)).padStart(6, '0'),
      vigencia: +frad.slice(0, 4),
      ente_id: ENTE[e] as number,
      dependencia_id: DEP[d] as number,
      asunto,
      fecha_radicacion: frad,
      fecha_limite: sumarDias(hoy, fl),
      estado: cerrado ? 'cerrado' : 'abierto',
      orfeo_salida: cerrado ? String(Y) + '4143010000' + String(171 + i * 31).padStart(6, '0') : null,
      fecha_cierre: cerrado ? sumarDias(hoy, fc) : null,
      soporte_path: null,
      soporte_hash: null,
      escalado_at: null
    };
  });
  const anteriores: [number, string, number, number, string][] = [
    [Y - 1, 'EE011203', 2, 1, 'Auditoría a la gestión contractual de la vigencia anterior.'],
    [Y - 1, 'EE022410', 3, 5, 'Seguimiento a señalización vial.'],
    [Y - 2, 'EE009812', 2, 3, 'Auditoría a obras de espacio público.']
  ];
  return base.concat(
    anteriores.map(([y, rad, e, d, asunto], i) => ({
      id: 'h' + i,
      radicado: y + rad,
      vigencia: y,
      ente_id: ENTE[e] as number,
      dependencia_id: DEP[d] as number,
      asunto,
      fecha_radicacion: y + '-03-10',
      fecha_limite: y + '-04-02',
      estado: 'cerrado',
      orfeo_salida: String(y) + '412301000' + String(100 + i * 17).padStart(5, '0'),
      fecha_cierre: y + '-03-30',
      soporte_path: null,
      soporte_hash: null,
      escalado_at: null
    }))
  );
}
