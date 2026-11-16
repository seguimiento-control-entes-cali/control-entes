# F4 · Base de datos bajo control

**Decisión de Erika (2026-11-16):** la F4 se hace **sin Alembic**. Alembic es una herramienta de Python y va con el
backend en Python (FastAPI) de la F5, que queda en la hoja de ruta de DATIC. Hasta entonces, la base queda bajo control
con los scripts numerados del repositorio y una **huella del esquema** que se compara con producción y que la revisión
de GitHub verifica en cada cambio.

## Qué controla la base

| Pieza | Dónde | Para qué |
|---|---|---|
| Scripts numerados `01` a `26` | `supabase/` | Cada cambio de la base es un script nuevo, con número, que se ejecuta una sola vez. |
| Instalador completo | `supabase/00_instalar_todo.sql` | Instala una base nueva en una transacción (lo genera `scripts/generar-instalador.mjs`). |
| Consulta de huella (solo lectura) | `supabase/consultas/huella_esquema.sql` | Describe el esquema `public` sin leer datos: tablas y RLS, columnas, restricciones, índices, vistas, funciones (con la huella md5 de su código), disparadores, políticas RLS y permisos de `anon`, `authenticated` y `service_role`. |
| Huella de los scripts | `supabase/huella_esquema.json` | La misma consulta sobre los scripts, instalados en un PostgreSQL local en memoria (PGlite). |
| Programa | `frontend/scripts/huella-bd.mjs` | Calcula la huella, la revisa y compara con producción. |

## Cómo se usa

- `npm run bd:huella` (en `frontend/`): vuelve a calcular la huella después de cambiar un script y la guarda.
- `npm run bd:huella:revisar`: falla si la huella guardada no coincide con los scripts. Está dentro de
  `npm run verificar`, así que **la revisión de GitHub no deja unir un cambio de la base sin su huella al día**.
- **Comparar con producción** (solo lectura, no cambia nada):
  1. En Supabase → SQL Editor del proyecto de producción, pegar y ejecutar `supabase/consultas/huella_esquema.sql`.
  2. Copiar el resultado (una sola celda, «huella») y guardarlo en un archivo de texto, por ejemplo `produccion.txt`
     (fuera del repositorio).
  3. En `frontend/`: `npm run bd:huella -- --comparar ruta/produccion.txt`. El informe, en español, dice qué hay solo
     en el repositorio, qué hay solo en producción y qué es distinto.
  4. Cada diferencia se resuelve con un script numerado nuevo (con aprobación, como siempre) y se registra en la
     bitácora; la meta es «Sin diferencias».

## Límites conocidos

- La huella cubre el esquema `public`. Los esquemas propios de Supabase (`auth`, `storage`, `cron`, `vault`) no se
  comparan: los administra Supabase.
- Los scripts de programación de tareas (`15`, `21`, `25`) no están en el instalador; sus tareas viven en `cron` y no
  aparecen en la huella.
- El texto de los valores por defecto y de las políticas puede variar entre versiones de PostgreSQL (la de producción y
  la de PGlite). Si una diferencia es solo de forma (mismo significado), se anota en la bitácora y no se corrige.

## Para DATIC (F5 en adelante)

Al crear el backend en Python, la línea base de Alembic (`0001_linea_base`) se arma con `00_instalar_todo.sql` y se
marca en producción con `alembic stamp` (sin cambiar nada). Desde ahí cada cambio es una migración de Alembic, y la
comparación de huellas de este documento sirve para comprobar que Alembic y producción sigan iguales.
