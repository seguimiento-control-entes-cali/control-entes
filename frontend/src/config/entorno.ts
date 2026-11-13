// Configuración por ambiente (plan §5 y §6): lee y valida las variables VITE_* al arrancar.
// Validación escrita a mano (sin Zod) para no agregar dependencias antes de aprobarlas; mismas reglas que pide el plan.

export type VarianteEntorno = 'institucional' | 'demo' | 'privada';

export interface Entorno {
  variante: VarianteEntorno;
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Cuenta institucional desde la que se redactan los correos (VITE_REMITENTE; vacío si no es @cali.gov.co). */
  remitente?: string;
}

export class ErrorEntorno extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorEntorno';
  }
}

const VARIANTES: readonly VarianteEntorno[] = ['institucional', 'demo', 'privada'];

/**
 * Valida las variables. En la demo no hace falta Supabase. En las demás se exige la dirección https de un
 * proyecto de Supabase y una clave PÚBLICA (sb_publishable_… o la anon JWT); una clave secreta se rechaza siempre,
 * porque terminaría publicada en el navegador.
 */
export function leerEntorno(env: Record<string, string | undefined>): Entorno {
  const variante = (env.VITE_VARIANTE || 'demo').trim() as VarianteEntorno;
  if (!VARIANTES.includes(variante))
    throw new ErrorEntorno(`VITE_VARIANTE debe ser ${VARIANTES.join(', ')} (llegó "${variante}")`);
  const supabaseUrl = (env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY || '').trim();
  const r = (env.VITE_REMITENTE || '').trim().toLowerCase();
  const remitente = /^[a-z0-9._%+-]+@cali\.gov\.co$/.test(r) ? r : '';

  if (/^sb_secret_/.test(supabaseAnonKey) || /service_role/i.test(supabaseAnonKey))
    throw new ErrorEntorno(
      'VITE_SUPABASE_ANON_KEY tiene una clave secreta: use solo la clave publicable (sb_publishable_…)'
    );
  if (variante === 'demo') return { variante, supabaseUrl, supabaseAnonKey, remitente };

  if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(supabaseUrl))
    throw new ErrorEntorno('VITE_SUPABASE_URL debe ser https://<proyecto>.supabase.co');
  if (
    !/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(supabaseAnonKey) &&
    !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(supabaseAnonKey)
  )
    throw new ErrorEntorno(
      'VITE_SUPABASE_ANON_KEY debe ser la clave publicable del proyecto (sb_publishable_…)'
    );
  return { variante, supabaseUrl, supabaseAnonKey, remitente };
}
