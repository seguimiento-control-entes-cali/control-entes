// F4 · Base de datos bajo control. Calcula la huella del esquema public a partir de los scripts del repositorio,
// SIN conectarse a Supabase: instala supabase/00_instalar_todo.sql en un PostgreSQL local (PGlite, en memoria) y corre
// supabase/consultas/huella_esquema.sql (la MISMA consulta que se corre en producción, de solo lectura).
//   npm run bd:huella                       guarda supabase/huella_esquema.json
//   npm run bd:huella:revisar               falla si la huella guardada no coincide con los scripts (CI)
//   npm run bd:huella -- --comparar <archivo.json>   compara con la huella de producción y lista las diferencias
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..', '..');
const INSTALADOR = path.join(RAIZ, 'supabase', '00_instalar_todo.sql');
const CONSULTA = path.join(RAIZ, 'supabase', 'consultas', 'huella_esquema.sql');
const DESTINO = path.join(RAIZ, 'supabase', 'huella_esquema.json');
const args = process.argv.slice(2);
const revisar = args.includes('--revisar');
const iComparar = args.indexOf('--comparar');

/** Huella de los scripts del repositorio. */
export async function huellaDeScripts() {
  const db = new PGlite({ extensions: { pgcrypto } });
  // Lo mínimo de Supabase que necesitan los scripts (igual que tipos-bd.mjs y tests/rls.test.mjs)
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema extensions; create schema auth; create schema storage;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    grant usage on schema public, auth, storage, extensions to anon, authenticated, service_role;
  `);
  await db.exec(fs.readFileSync(INSTALADOR, 'utf8'));
  const r = await db.query(fs.readFileSync(CONSULTA, 'utf8'));
  await db.close();
  return JSON.parse(r.rows[0].huella);
}

/** Lee una huella pegada desde el editor SQL de Supabase (el JSON, o la tabla con la columna «huella»). */
export function leerHuella(texto) {
  const t = texto.trim();
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('El archivo no contiene la huella (un JSON que empieza con «{»).');
  return JSON.parse(t.slice(i, j + 1).replace(/""/g, '"'));
}

const CLAVES = {
  tablas: x => x.tabla,
  columnas: x => `${x.tabla}.${x.columna}`,
  restricciones: x => `${x.tabla} · ${x.nombre}`,
  indices: x => `${x.tabla} · ${x.nombre}`,
  vistas: x => x.vista,
  funciones: x => `${x.nombre}(${x.argumentos})`,
  disparadores: x => `${x.tabla} · ${x.nombre}`,
  politicas: x => `${x.tabla} · ${x.nombre}`,
  permisos_tablas: x => `${x.tabla} · ${x.rol} · ${x.permiso}`,
  permisos_funciones: x => `${x.funcion}(${x.argumentos}) · ${x.rol}`
};
const NOMBRES = {
  tablas: 'Tablas',
  columnas: 'Columnas',
  restricciones: 'Restricciones',
  indices: 'Índices',
  vistas: 'Vistas',
  funciones: 'Funciones',
  disparadores: 'Disparadores',
  politicas: 'Políticas RLS',
  permisos_tablas: 'Permisos sobre tablas',
  permisos_funciones: 'Permisos para ejecutar funciones'
};

/** Diferencias entre dos huellas, por sección: solo en a, solo en b y distintos. */
export function compararHuellas(a, b) {
  const out = {};
  for (const [sec, clave] of Object.entries(CLAVES)) {
    const ma = new Map((a[sec] ?? []).map(x => [clave(x), x]));
    const mb = new Map((b[sec] ?? []).map(x => [clave(x), x]));
    const soloA = [...ma.keys()].filter(k => !mb.has(k));
    const soloB = [...mb.keys()].filter(k => !ma.has(k));
    const distintos = [...ma.keys()]
      .filter(k => mb.has(k) && JSON.stringify(ma.get(k)) !== JSON.stringify(mb.get(k)))
      .map(k => ({ clave: k, a: ma.get(k), b: mb.get(k) }));
    if (soloA.length || soloB.length || distintos.length) out[sec] = { soloA, soloB, distintos };
  }
  return out;
}

/** Informe en español de las diferencias (a = repositorio, b = producción). */
export function informe(dif, nombreA = 'repositorio', nombreB = 'producción') {
  const secciones = Object.keys(dif);
  if (!secciones.length)
    return `Sin diferencias: el esquema de ${nombreB} es igual al de los scripts del ${nombreA}.`;
  const l = [];
  for (const sec of secciones) {
    const d = dif[sec];
    l.push(`\n## ${NOMBRES[sec] ?? sec}`);
    if (d.soloA.length) l.push(`Solo en el ${nombreA} (${d.soloA.length}):`, ...d.soloA.map(x => '  - ' + x));
    if (d.soloB.length) l.push(`Solo en ${nombreB} (${d.soloB.length}):`, ...d.soloB.map(x => '  - ' + x));
    if (d.distintos.length) {
      l.push(`Distintos (${d.distintos.length}):`);
      for (const x of d.distintos) {
        l.push('  - ' + x.clave);
        for (const k of Object.keys({ ...x.a, ...x.b }))
          if (JSON.stringify(x.a[k]) !== JSON.stringify(x.b[k]))
            l.push(
              `      ${k}: ${nombreA} = ${JSON.stringify(x.a[k])} | ${nombreB} = ${JSON.stringify(x.b[k])}`
            );
      }
    }
  }
  return l.join('\n');
}

const principal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (principal) {
  const h = await huellaDeScripts();
  const texto = JSON.stringify(h, null, 2) + '\n';
  if (iComparar >= 0) {
    const archivo = args[iComparar + 1];
    if (!archivo)
      throw new Error('Indique el archivo con la huella de producción: --comparar <archivo.json>');
    const prod = leerHuella(fs.readFileSync(archivo, 'utf8'));
    console.log(informe(compararHuellas(h, prod)));
  } else if (revisar) {
    const guardada = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : '';
    if (guardada !== texto) {
      console.error(
        'La huella del esquema (supabase/huella_esquema.json) no coincide con los scripts. Corra «npm run bd:huella» y revise el cambio.'
      );
      if (guardada)
        console.error(informe(compararHuellas(JSON.parse(guardada), h), 'archivo guardado', 'scripts'));
      process.exit(1);
    }
    console.log('Huella del esquema al día con los scripts.');
  } else {
    fs.writeFileSync(DESTINO, texto);
    const n = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.length]));
    console.log('Huella guardada en supabase/huella_esquema.json:', JSON.stringify(n));
  }
}
