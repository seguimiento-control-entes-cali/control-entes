// Los tipos generados de la base (src/datos/supabase/tipos.generados.ts) sí protegen: un nombre de tabla o de
// columna mal escrito NO compila. Si los tipos dejaran de aplicarse, `npm run tipos` fallaría en los @ts-expect-error.
import { describe, expect, it } from 'vitest';
import type { ClienteSupabase } from '../src/datos/supabase';
import type { Database } from '../src/datos/supabase/tipos.generados';

type Tablas = Database['public']['Tables'];

// Nunca se ejecuta: solo lo revisa el compilador
export function soloCompilador(sb: ClienteSupabase) {
  void sb.from('profiles').select('id, rol, dependencia_id');
  // @ts-expect-error tabla inexistente
  void sb.from('perfiles').select('*');
  // @ts-expect-error columna inexistente en profiles
  void sb.from('profiles').insert({ id: 'x', rol: 'admin', columna_que_no_existe: 1 });
  // @ts-expect-error id de accesos es identity ALWAYS: no se escribe
  void sb.from('accesos').insert({ id: 5 });
}

describe('tipos generados de la base', () => {
  it('incluyen las tablas que usa la 3.0 con sus columnas', () => {
    const columnas: Record<
      keyof Pick<Tablas, 'profiles' | 'entes' | 'dependencias' | 'config' | 'accesos'>,
      string[]
    > = {
      profiles: [
        'id',
        'email',
        'nombre',
        'rol',
        'dependencia_id',
        'activo'
      ] satisfies (keyof Tablas['profiles']['Row'])[],
      entes: ['id', 'nombre', 'sigla', 'tipo', 'activo'] satisfies (keyof Tablas['entes']['Row'])[],
      dependencias: ['id', 'nombre', 'activo'] satisfies (keyof Tablas['dependencias']['Row'])[],
      config: ['id', 'dias_rojo', 'correo_disciplinario'] satisfies (keyof Tablas['config']['Row'])[],
      accesos: ['id', 'user_id', 'created_at'] satisfies (keyof Tablas['accesos']['Row'])[]
    };
    expect(Object.keys(columnas)).toHaveLength(5);
  });
});
