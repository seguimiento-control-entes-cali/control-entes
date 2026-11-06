#!/usr/bin/env node
/* =====================================================================
   Genera supabase/00_instalar_todo.sql uniendo, en orden, los scripts de supabase/ para instalar la base
   completa en un proyecto de Supabase VACÍO, en una sola transacción (si algo falla, no queda nada a medias).

   Uso:
     node scripts/generar-instalador.mjs             → escribe supabase/00_instalar_todo.sql
     node scripts/generar-instalador.mjs --revisar   → solo comprueba que el archivo esté al día (lo usa la prueba)

   No incluye:
     11  correos del directorio: tiene datos reales y vive en datos_privados/, nunca en el repositorio.
     15  ya no hace nada (la programación de tareas pasó al 21).
     21  programa las tareas (pg_cron) leyendo la bóveda: se ejecuta aparte, solo donde haya que programarlas.
   Los begin; y commit; propios de cada script se quitan: todo el instalador va en una sola transacción.
   ===================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(RAIZ, 'supabase');
const SALIDA = path.join(DIR, '00_instalar_todo.sql');
export const EXCLUIDOS = { '11': 'datos reales', '15': 'ya no hace nada', '21': 'programa tareas' };
/* Las 26 tablas de la app (las mismas de la copia de seguridad) para la verificación final */
const TABLAS = ['config', 'entes', 'dependencias', 'profiles', 'directorio', 'requerimientos', 'alertas_log', 'notificaciones',
  'informes', 'accesos', 'historico_requerimientos', 'historico_cargas', 'tema_manual', 'cruce_revision', 'cuentas_eventos',
  'pm_planes', 'pm_hallazgos', 'pm_acciones', 'pm_avances', 'pm_traslados', 'pm_prorrogas', 'archivo_documentos',
  'pm_informes_avance', 'eventos_sistema', 'audit_log', 'pm_restauraciones'];

export function generar() {
  const scripts = fs.readdirSync(DIR).filter(f => /^\d{2}_.+\.sql$/.test(f) && !f.startsWith('00_')).sort()
    .filter(f => !(f.slice(0, 2) in EXCLUIDOS));
  const partes = scripts.map(f => {
    const texto = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n')
      .split('\n').filter(l => !/^(begin|commit);\s*$/i.test(l)).join('\n').replace(/\n+$/, '');
    return `-- >>>>>>>>>>>>>>>>>>>> ${f} <<<<<<<<<<<<<<<<<<<<\n${texto}\n`;
  });
  const cabecera = `-- =====================================================================
-- INSTALADOR COMPLETO · Control de Entes · Alcaldía de Santiago de Cali
-- GENERADO por scripts/generar-instalador.mjs: no editar a mano; editar los scripts y volver a generarlo.
-- Contiene, en orden: ${scripts.map(f => f.slice(0, 2)).join(', ')}.
-- No contiene: ${Object.entries(EXCLUIDOS).map(([n, m]) => `${n} (${m})`).join(', ')}.
-- Ejecutar UNA sola vez en el SQL Editor de un proyecto de Supabase VACÍO. Va en una sola transacción: si algo
-- falla, no queda nada instalado. No trae datos reales: solo los catálogos de entes y dependencias (02).
-- Al final, la verificación: tablas_faltantes debe ser 0 y funciones_ok true.
-- =====================================================================
begin;

`;
  const pie = `
commit;

-- >>>>>>>>>>>>>>>>>>>> Verificación de la instalación <<<<<<<<<<<<<<<<<<<<
select
  (select count(*) from unnest(array[${TABLAS.map(t => `'${t}'`).join(', ')}]) as t
    where to_regclass('public.' || t) is null) as tablas_faltantes,
  (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
    and proname in ('verificar_cadena_auditoria', 'hoy_colombia', 'respaldo_lote')) = 3 as funciones_ok;
`;
  return cabecera + partes.join('\n') + pie;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const texto = generar();
  if (process.argv.includes('--revisar')) {
    const actual = fs.existsSync(SALIDA) ? fs.readFileSync(SALIDA, 'utf8').replace(/\r\n/g, '\n') : '';
    if (actual !== texto) {
      console.error('supabase/00_instalar_todo.sql no está al día: ejecute node scripts/generar-instalador.mjs');
      process.exit(1);
    }
    console.log('supabase/00_instalar_todo.sql está al día');
  } else {
    fs.writeFileSync(SALIDA, texto);
    console.log(`✓ supabase/00_instalar_todo.sql: ${texto.split('\n').length} líneas`);
  }
}
