// Comprueba que las reglas de capas (docs/migracion/README.md §7.1) siguen activas: si alguien las desactiva o rompe
// la configuración de ESLint, esta prueba falla en la CI. Analiza código de ejemplo sin crear archivos.
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const reglas = async (codigo: string, archivo: string) => {
  const [r] = await eslint.lintText(codigo, { filePath: archivo });
  return (r?.messages ?? []).map(m => m.ruleId);
};

describe('fronteras entre capas', () => {
  it('features/ no puede usar datos/supabase', async () => {
    expect(await reglas("import '../datos/supabase/index';\n", 'src/features/ejemplo.ts')).toContain(
      'boundaries/element-types'
    );
  });

  it('supabase-js solo se importa dentro de datos/supabase', async () => {
    const codigo = "import { createClient } from '@supabase/supabase-js';\nexport const c = createClient;\n";
    expect(await reglas(codigo, 'src/app/ejemplo.ts')).toContain('no-restricted-imports');
    expect(await reglas(codigo, 'src/datos/supabase/ejemplo.ts')).not.toContain('no-restricted-imports');
  });

  it('dominio/ no usa React ni el navegador', async () => {
    expect(
      await reglas(
        "import { useState } from 'react';\nexport const u = useState;\n",
        'src/dominio/ejemplo.ts'
      )
    ).toContain('no-restricted-imports');
    expect(await reglas('export const l = () => window.location;\n', 'src/dominio/ejemplo.ts')).toContain(
      'no-restricted-globals'
    );
  });

  it('una importación permitida no da error', async () => {
    expect(
      await reglas(
        "import { textoVersion } from '../dominio/version';\nexport const t = textoVersion;\n",
        'src/features/ejemplo.ts'
      )
    ).toEqual([]);
  });
});
