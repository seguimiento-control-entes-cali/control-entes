# 0002 · Etapa 1 solo frontend; el backend se queda como está
Estado: aceptada
Fecha: 2026-11-08 (decisión D-23 tomada el 2026-10-27 en la revisión 3; fecha de la Etapa 2 ajustada en la revisión 4)

## Contexto
El plan original priorizaba la base de datos y el backend (D-04). El proyecto pidió cambiar la prioridad: primero la
interfaz nueva, sin arriesgar la base de datos ni las funciones del servidor que hoy funcionan en producción.

## Decisión
En la Etapa 1 (hasta el 2026-12-11) solo se construye el frontend 3.0. El backend actual (`supabase/`: tablas, RLS,
funciones RPC y Edge Functions) **no se modifica** por la migración. Si una pantalla necesita un cambio de esquema,
se registra en la bitácora y se entrega como script nuevo numerado, igual que hoy. La Etapa 2 (FastAPI) empieza el
2026-12-14.

## Consecuencias
- El riesgo en producción es bajo: la 3.0 usa las mismas tablas, políticas y funciones que la 2.x.
- La 3.0 habla con Supabase desde el navegador durante la Etapa 1; por eso la capa de datos es delgada (ADR 0003),
  para cambiarla por la API sin tocar pantallas en la Etapa 2.
- Las correcciones del backend que surjan siguen el flujo actual (scripts numerados, aprobación de Erika).

## Alternativas consideradas
- Backend primero (D-04, descartada en la revisión 3): retrasaba lo visible para los usuarios.
- Hacer las dos a la vez: demasiado riesgo para un equipo pequeño.
