// Genera src/datos/supabase/tipos.generados.ts (D-25) a partir de los scripts del repositorio, SIN conectarse a Supabase:
// instala supabase/00_instalar_todo.sql en un PostgreSQL local (PGlite, en memoria) y lee tablas, vistas, funciones y
// enumeraciones del esquema public. El formato es el de `supabase gen types typescript`, para que supabase-js lo use.
// Las diferencias entre los scripts y producción se resuelven en la F4 (pg_dump de producción, plan §F4).
//   npm run tipos:bd           regenera el archivo
//   npm run tipos:bd:revisar   falla si el archivo no coincide con los scripts (lo corre `npm run verificar` y la CI)
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const INSTALADOR = path.join(AQUI, '..', '..', 'supabase', '00_instalar_todo.sql');
const DESTINO = path.join(AQUI, '..', 'src', 'datos', 'supabase', 'tipos.generados.ts');
const revisar = process.argv.includes('--revisar');

const db = new PGlite({ extensions: { pgcrypto } });
// Lo mínimo de Supabase que necesitan los scripts (igual que tests/rls.test.mjs)
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

const filas = async sql => (await db.query(sql)).rows;
const enums = await filas(`
  select t.typname as nombre, array_agg(e.enumlabel order by e.enumsortorder) as valores
  from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by t.typname`);
const columnas = await filas(`
  select c.relname as tabla, c.relkind as tipo, a.attname as columna, a.attnum as orden,
         t.typname as udt, t.typtype as clase, et.typname as elemento,
         not a.attnotnull as nula, a.atthasdef as tiene_def, a.attidentity as identidad, a.attgenerated as generada
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
  order by c.relname, a.attnum`);
const funciones = await filas(`
  select p.proname as nombre, coalesce(p.proargnames, '{}') as nombres, p.proargmodes as modos,
         array(select format_type(x, null) from unnest(p.proargtypes) x) as tipos_entrada,
         array(select format_type(x, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) x) as tipos_todos,
         format_type(p.prorettype, null) as devuelve, p.proretset as conjunto, rt.typname as udt_devuelve
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and p.prokind = 'f' and rt.typname <> 'trigger'
  order by p.proname, p.oid`);
await db.close();

const ENUMS = new Set(enums.map(e => e.nombre));
const RELACIONES = new Map(
  columnas.map(c => [c.tabla, c.tipo === 'r' || c.tipo === 'p' ? 'Tables' : 'Views'])
);
const NUM = new Set(['int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'oid']);
const TEXTO = new Set([
  'text',
  'varchar',
  'bpchar',
  'uuid',
  'date',
  'time',
  'timetz',
  'timestamp',
  'timestamptz',
  'interval',
  'inet',
  'cidr',
  'citext',
  'bytea',
  'name',
  'regclass',
  'tsvector'
]);
const deUdt = udt => {
  if (NUM.has(udt)) return 'number';
  if (TEXTO.has(udt)) return 'string';
  if (udt === 'bool') return 'boolean';
  if (udt === 'json' || udt === 'jsonb') return 'Json';
  if (ENUMS.has(udt)) return `Database['public']['Enums']['${udt}']`;
  if (RELACIONES.has(udt)) return `Database['public']['${RELACIONES.get(udt)}']['${udt}']['Row']`;
  return 'unknown';
};
const tsDe = c => (c.elemento ? deUdt(c.elemento) + '[]' : deUdt(c.udt));
const deFormato = f => {
  const arreglo = f.endsWith('[]');
  const base = f.replace(/\[\]$/, '').replace(/\(.*\)$/, '');
  const mapa = {
    integer: 'int4',
    bigint: 'int8',
    smallint: 'int2',
    'double precision': 'float8',
    real: 'float4',
    boolean: 'bool',
    'character varying': 'varchar',
    character: 'bpchar',
    'timestamp with time zone': 'timestamptz',
    'timestamp without time zone': 'timestamp',
    'time without time zone': 'time'
  };
  const t = deUdt(mapa[base] ?? base);
  return arreglo ? t + '[]' : t;
};

const porTabla = new Map();
for (const c of columnas) {
  if (!porTabla.has(c.tabla)) porTabla.set(c.tabla, { tipo: c.tipo, cols: [] });
  porTabla.get(c.tabla).cols.push(c);
}
const sangria = (n, s) =>
  s
    .split('\n')
    .map(l => (l ? ' '.repeat(n) + l : l))
    .join('\n');
const bloque = pares => (pares.length ? `{\n${pares.join('\n')}\n}` : '{}');

const tablas = [],
  vistas = [];
for (const [nombre, { tipo, cols }] of porTabla) {
  const row = cols.map(c => `  ${c.columna}: ${tsDe(c)}${c.nula ? ' | null' : ''}`);
  if (tipo === 'r' || tipo === 'p') {
    const ins = cols.map(c => {
      const t = `${tsDe(c)}${c.nula ? ' | null' : ''}`;
      if (c.generada === 's' || c.identidad === 'a') return `  ${c.columna}?: never`;
      return `  ${c.columna}${c.nula || c.tiene_def || c.identidad ? '?' : ''}: ${t}`;
    });
    const upd = cols.map(c =>
      c.generada === 's' || c.identidad === 'a'
        ? `  ${c.columna}?: never`
        : `  ${c.columna}?: ${tsDe(c)}${c.nula ? ' | null' : ''}`
    );
    tablas.push(
      `${nombre}: {\n  Row: ${sangria(2, bloque(row)).trimStart()}\n  Insert: ${sangria(2, bloque(ins)).trimStart()}\n  Update: ${sangria(2, bloque(upd)).trimStart()}\n  Relationships: []\n}`
    );
  } else {
    const r = cols.map(c => `  ${c.columna}: ${tsDe(c)} | null`);
    vistas.push(`${nombre}: {\n  Row: ${sangria(2, bloque(r)).trimStart()}\n  Relationships: []\n}`);
  }
}

// Funciones (RPC): una entrada por nombre; si hay varias firmas, se unen
const porFuncion = new Map();
for (const f of funciones) {
  const nombresEntrada = f.modos
    ? f.nombres.filter((_, i) => ['i', 'b', 'v'].includes(f.modos[i]))
    : f.nombres;
  const args = f.tipos_entrada.map((t, i) => `  ${nombresEntrada[i] || 'arg' + (i + 1)}: ${deFormato(t)}`);
  // RETURNS TABLE (...): columnas de salida (modo 't')
  const salida = (f.modos ?? [])
    .map((m, i) => (m === 't' ? `${f.nombres[i]}: ${deFormato(f.tipos_todos[i])}` : null))
    .filter(Boolean);
  const ret =
    f.udt_devuelve === 'void'
      ? 'undefined'
      : salida.length
        ? `{ ${salida.join('; ')} }${f.conjunto ? '[]' : ''}`
        : deFormato(f.devuelve) + (f.conjunto ? '[]' : '');
  const firma = `{\n  Args: ${sangria(2, args.length ? bloque(args) : 'Record<PropertyKey, never>').trimStart()}\n  Returns: ${ret}\n}`;
  if (!porFuncion.has(f.nombre)) porFuncion.set(f.nombre, []);
  if (!porFuncion.get(f.nombre).includes(firma)) porFuncion.get(f.nombre).push(firma);
}
const fns = [...porFuncion].map(
  ([n, firmas]) => `${n}:\n${firmas.map(s => sangria(2, '| ' + s.replace(/\n/g, '\n  '))).join('\n')}`
);
const lista = (items, vacio) => (items.length ? `{\n${sangria(2, items.join('\n'))}\n}` : vacio);
const enumsTs = enums.map(e => `${e.nombre}: ${e.valores.map(v => `'${v}'`).join(' | ')}`);

const texto = `// ARCHIVO GENERADO por frontend/scripts/tipos-bd.mjs (npm run tipos:bd). NO EDITAR A MANO.
// Fuente: supabase/00_instalar_todo.sql instalado en PGlite (sin conectarse a Supabase). Diferencias con producción: F4.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: ${sangria(4, lista(tablas, '{ [_ in never]: never }')).trimStart()}
    Views: ${sangria(4, lista(vistas, '{ [_ in never]: never }')).trimStart()}
    Functions: ${sangria(4, lista(fns, '{ [_ in never]: never }')).trimStart()}
    Enums: ${sangria(4, lista(enumsTs, '{ [_ in never]: never }')).trimStart()}
    CompositeTypes: { [_ in never]: never };
  };
}
`;

const { format, resolveConfig } = await import('prettier');
const final = await format(texto, { ...(await resolveConfig(DESTINO)), filepath: DESTINO });
if (revisar) {
  const actual = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, 'utf8') : '';
  if (actual !== final) {
    console.error(
      'tipos.generados.ts no coincide con supabase/00_instalar_todo.sql: ejecute npm run tipos:bd'
    );
    process.exit(1);
  }
  console.log(
    `tipos de la base al día (${tablas.length} tablas, ${vistas.length} vistas, ${porFuncion.size} funciones)`
  );
} else {
  fs.writeFileSync(DESTINO, final);
  console.log(
    `escrito ${path.relative(process.cwd(), DESTINO)}: ${tablas.length} tablas, ${vistas.length} vistas, ${porFuncion.size} funciones, ${enums.length} enumeraciones`
  );
}
