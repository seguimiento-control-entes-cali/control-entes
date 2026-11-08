# Modelo de datos (Supabase / PostgreSQL)

Ejecutar en orden los scripts de `supabase/` (o `00_instalar_todo.sql` en un proyecto vacío, que contiene del 01
al 24 salvo el 11, el 15 y el 21, y no trae el 25; ver `docs/DESPLIEGUE.md`).

| Tabla / vista | Para qué sirve | Quién lee | Quién escribe |
|---|---|---|---|
| `profiles` | Cuenta: rol, dependencia, activo | propio; admin/alcalde/control_interno todos | admin |
| `entes`, `dependencias` | Catálogos | usuarios activos | admin |
| `requerimientos` | Módulo operativo (requerimientos vivos) | por dependencia | admin / enlace (crear); cierre vía RPC |
| `historico_requerimientos` | Histórico 2024-2026 clasificado | supervisión todo; secretario/enlace su dependencia | importación (service role) |
| `v_cumplimiento_organismo` | Ranking y semáforo por organismo y vigencia | igual que el histórico | solo lectura |
| `directorio` | Secretarios y directores (nombre, celular) | supervisión todo; otros su dependencia | admin, alcalde |
| `notificaciones` | Bitácora de WhatsApp enviados | igual que directorio | admin, alcalde, control_interno (solo insertar) |
| `accesos` | Quién ingresó y cuándo | supervisión; cada uno el suyo | cada usuario (insertar) |
| `informes` | Informes generados con su huella | supervisión; cada uno los suyos | cada usuario (insertar) |
| `alertas_log` | Escalamientos del módulo operativo | supervisión | RPC `escalar_requerimiento` |
| `tema_manual` | Corrección manual del tema de un requerimiento | usuarios activos | admin, alcalde, control_interno |
| `cruce_revision` | Confirmación o descarte de un cruce entre entes | usuarios activos | admin, alcalde, control_interno |
| `v_directorio_verificacion` | Inconsistencias entre dependencias, histórico, directorio y cuentas | supervisión | solo lectura |
| `cuentas_eventos` | Bitácora de invitaciones, cambios de titular, enlaces de contraseña y activaciones | supervisión | solo la Edge Function |
| `pm_planes` | Planes de mejoramiento (PM_01 CGSC, F14 CGR) | supervisión todo; secretario/enlace los que tienen acciones suyas | admin, control_interno |
| `pm_hallazgos` | Hallazgos de cada plan | igual que el plan (por acciones) | admin, control_interno |
| `pm_acciones` | Acciones con meta, plazo y dependencia; avance validado | supervisión todo; secretario/enlace su dependencia | admin, control_interno (el avance solo por RPC) |
| `pm_avances` | Reportes de avance con soporte y su revisión | supervisión todo; secretario/enlace su dependencia | RPC `pm_reportar_avance`, `pm_revisar_avance`, `pm_importar` |
| `audit_log` | Cadena de auditoría SHA-256 | supervisión | solo triggers |

## RPC (funciones que llama la app)
- `cerrar_requerimiento(p_id, p_orfeo, p_fecha, p_path, p_hash)`: valida formato de ORFEO, fecha, dependencia y duplicados.
- `escalar_requerimiento(p_id, p_canal)`
- `verificar_cadena_auditoria()` -> `(ok, total, primer_id_roto)`
- `current_rol()`, `current_dep()`, `current_dep_name()`: usadas por las políticas RLS.

## Auditoría inmutable
Cada INSERT/UPDATE/DELETE de las tablas auditadas agrega una fila a `audit_log` con:
`hash = SHA256(prev_hash | tabla | accion | registro_id | usuario | fecha UTC (AAAA-MM-DDTHH:MI:SS.US) | payload | cambios)`.
En UPDATE, `cambios` guarda `{campo: {de, a}}`. Los triggers bloquean UPDATE, DELETE y TRUNCATE sobre `audit_log`.
Un cliente puede recalcular la cadena con esa fórmula para verificarla sin confiar en el servidor.

## Importación de datos
1. `python etl/run_etl.py ...` genera `historico_requerimientos.csv` y `directorio_gabinete.csv`.
2. Importarlos desde Table Editor > Insert > Import data from CSV (usa credenciales de administrador, no pasa por RLS).

## Columna `hoja_excel` (script 09)
`CONTROL` para los requerimientos de la hoja de control; `NO RESPUESTA` para los oficios de 2024 y 2025 que no exigen respuesta.
