# 0003 · Capa de datos delgada (`src/datos/`)
Estado: aceptada
Fecha: 2026-11-08 (decisión D-24 tomada el 2026-10-27)

## Contexto
En la Etapa 1 la 3.0 se conecta directo a Supabase; en la Etapa 2 lo hará a través del backend FastAPI (D-20). Si las
pantallas usaran `supabase-js` directamente, habría que reescribirlas todas al cambiar de Supabase a la API.

## Decisión
`frontend/src/datos/` es el único lugar que conoce Supabase:
- `datos/contratos/`: interfaces y tipos por módulo (por ejemplo `RepositorioRequerimientos`), sin Supabase.
- `datos/supabase/`: la implementación real; **único lugar donde se importa `@supabase/supabase-js`**.
- `datos/demo/`: implementación en memoria para la variante de demostración (D-16).
- `datos/index.ts`: `crearDatos(variante)` entrega la implementación que corresponde.
Las pantallas (`features/`) solo usan `dominio/` y `datos/contratos`. La capa no tiene reglas de negocio: solo traduce.

Las reglas se verifican automáticamente: `eslint-plugin-boundaries` (capas) y `no-restricted-imports`
(`supabase-js` fuera de `datos/supabase/`), configuradas en `frontend/eslint.config.js` y comprobadas por
`frontend/pruebas/fronteras.test.ts`, que falla si alguien las desactiva.

## Consecuencias
- En la Etapa 2 se agrega `datos/api/` con los mismos contratos y las pantallas no cambian.
- La demo funciona sin red ni Supabase con los mismos contratos.
- Cada contrato nuevo exige dos implementaciones (Supabase y demo) con sus pruebas.

## Alternativas consideradas
- Llamar a `supabase-js` desde las pantallas: más rápido al principio, caro en la Etapa 2.
- Un ORM o una capa genérica de repositorios: más código del necesario para el tamaño del proyecto.
