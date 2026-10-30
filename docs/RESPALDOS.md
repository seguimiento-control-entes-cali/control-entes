# Copias de seguridad y restauración

## Qué se respalda
La función `respaldo` (supabase/functions/respaldo) guarda en el bucket privado `respaldos` un archivo
`respaldo_AAAA-MM-DD_HHMM.json.gz` con **todas las tablas de la app** (21 tablas: requerimientos, histórico,
planes de mejoramiento, directorio, notificaciones, cuentas, configuración, auditoría, etc.) y la lista de
carpetas de soportes PDF. Se conservan las **12 copias más recientes**.

No incluye: los archivos PDF de soporte (siguen en el bucket `soportes`) ni las contraseñas de los usuarios
(las administra Supabase Auth).

## Cuándo se hace
- **Automática:** cada domingo a las 11:00 p. m. (hora de Colombia), programada por `supabase/21_programar_tareas_boveda.sql`.
- **Manual:** Configuración → Copias de seguridad → *Crear copia ahora* (solo el Super administrador, con su código de dos pasos).
- **Fuera de Supabase:** descargue una copia a un equipo o carpeta institucional al menos una vez al mes
  (*Descargar* en la misma tarjeta). Una copia que solo vive en el mismo proveedor no protege si se pierde el proyecto.

## Instalación
1. Ejecutar `supabase/17_respaldos_y_monitoreo.sql` (bucket `respaldos` y tabla de eventos; ya no programa la copia).
2. Desplegar la función `respaldo` y desactivar *Verify JWT with legacy secret* en su configuración.
   Usa los secretos ya existentes (`RESUMEN_CLAVE`; `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase).
3. Revisar los secretos de la bóveda (ver la sección siguiente) y ejecutar `supabase/21_programar_tareas_boveda.sql`.
   Programa la copia semanal (activa) y el resumen semanal (desactivado). Si falta un secreto, se detiene sin
   cambiar nada.
4. En la app: *Crear copia ahora* y comprobar que aparece en la lista.

## Secretos de la bóveda (Vault) para las tareas programadas
Las tareas programadas no tienen escrita la dirección del proyecto ni la clave: las leen de la bóveda cada vez
que corren. Se necesitan dos secretos:

| Nombre | Contenido |
|---|---|
| `ce_proyecto_url` | La dirección del proyecto, `https://<proyecto>.supabase.co`, sin barra final y sin `/functions/v1`. |
| `ce_resumen_clave` | El mismo texto del secreto `RESUMEN_CLAVE` de las funciones `respaldo` y `resumen-semanal`. |

**1. Verificar que existen (proyecto en uso).** En producción ya existen (creados el 25-oct-2026). Esta consulta
muestra solo los nombres y las fechas, nunca el valor:

```sql
select name, created_at, updated_at from vault.secrets
where name in ('ce_proyecto_url', 'ce_resumen_clave') order by name;
```

Debe devolver las dos filas. Para revisar el formato de la dirección sin mostrarla:

```sql
select decrypted_secret ~ '^https://[^/[:space:]]+$' as formato_ok
from vault.decrypted_secrets where name = 'ce_proyecto_url';
```

**2. Crearlos (solo en una instalación nueva).** Desde la sección **Vault** del panel de Supabase: agregar un
secreto nuevo con el nombre exacto de la tabla y su valor. No crearlos con `vault.create_secret(...)` en el SQL
Editor: el valor quedaría escrito en el historial de consultas. Nunca copiar los valores en archivos, commits ni
mensajes.

## Restaurar
1. Descargar la copia (`respaldo_….json.gz`).
2. Generar el SQL de restauración:
   ```
   node scripts/restaurar-respaldo.mjs respaldo_2026-10-25_2300.json.gz
   node scripts/restaurar-respaldo.mjs respaldo_2026-10-25_2300.json.gz --tablas requerimientos,pm_acciones
   ```
3. Ejecutar `restaurar.sql` con psql (la cadena de conexión está en Supabase → Connect):
   ```
   psql "postgresql://postgres:<clave>@<servidor>:5432/postgres" -f restaurar.sql
   ```
   Todo ocurre en una sola transacción: si algo falla, la base queda exactamente como estaba.
   Al final muestra, por tabla, los registros restaurados frente a los de la copia.

La restauración está pensada para el **mismo proyecto** (recuperar datos borrados o dañados). Para trasladar
la app a otro servidor se usa el paquete de instalación institucional.

## Prueba realizada
Base con 3.568 registros del histórico, 159 requerimientos y datos de prueba con caracteres especiales:
copia → borrado de 1.869 registros y modificación de otros → restauración. Las huellas MD5 de cada tabla
quedaron **idénticas** a las de antes del daño y los contadores de identificadores continúan correctamente.


## Archivos (versión 2.6)

La copia semanal guarda los **datos** y, desde la versión 2.6, el **inventario** de archivos (depósito, ruta y
huella SHA-256). Los archivos se respaldan aparte, desde Configuración → Copias de seguridad:

- **Verificar archivos:** descarga cada soporte y documento y compara su huella con la registrada.
- **Descargar archivos (ZIP):** todos los archivos y `MANIFIESTO.csv` con sus huellas. Guárdelo fuera del
  servidor (por ejemplo, en el repositorio documental de la Alcaldía) al menos una vez al mes.

Para restaurarlos (en el mismo proyecto o en un servidor nuevo), descomprima el ZIP y ejecute:

```
node scripts/restaurar-archivos.mjs <carpeta> --prueba                                   # solo verifica huellas
node scripts/restaurar-archivos.mjs <carpeta> --url https://… --clave <service_role>     # sube lo que falte
```

El script no sube un archivo cuya huella no coincida con la del manifiesto. La clave `service_role` solo se usa en
el computador de quien restaura; nunca va en la aplicación.

## Papelera (versión 2.6)

Lo que se elimina en Planes de mejoramiento (planes, hallazgos, acciones, traslados) se puede restaurar desde
**Planes de mejoramiento → Papelera**, con todo lo que se eliminó junto (un plan vuelve con sus hallazgos,
acciones y avances). Usa la bitácora de auditoría, que guarda la fila completa de cada eliminación. Los
documentos del archivo van a la papelera y solo el Super administrador los elimina definitivamente.
