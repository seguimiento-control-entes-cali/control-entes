# Despliegue

## 1. Base de datos (Supabase)

**Instalación nueva:** en SQL Editor ejecutar `supabase/00_instalar_todo.sql` en un proyecto vacío. Contiene los
scripts 01 a 24 en una sola transacción, salvo el 11 (datos reales, en `datos_privados/`), el 15 (ya no hace nada),
el 21 y el 25 (programan las tareas: ejecutarlos aparte después, ver "Seguridad y resumen semanal" y "Aviso diario"). Lo genera
`node scripts/generar-instalador.mjs` a partir de los scripts; no se edita a mano.
**Instalación existente:** ejecutar solo los scripts que falten, en orden (por ejemplo `08_cruces_temas.sql` y `09_hoja_excel.sql`).

Cargar datos (desde `datos_privados/`, nunca desde el repositorio):

1. Generar los CSV con el ETL:
   `python etl/run_etl.py --2024 ... --2025 ... --2026 ... --gabinete ... --salida datos_privados --corte AAAA-MM-DD`
2. Recargar el histórico: en SQL Editor `truncate public.historico_requerimientos;` y luego Table Editor >
   `historico_requerimientos` > Insert > Import data from CSV > `historico_requerimientos.csv`.
3. Directorio: importar `directorio_gabinete.csv` en `directorio` (después del histórico).
4. Verificar: `select * from v_directorio_verificacion;` debe devolver cero filas.

Las correcciones manuales de tema (`tema_manual`) y las revisiones de cruces (`cruce_revision`) no se pierden al
recargar el histórico: se identifican por vigencia, ORFEO, número del ente y organismo.

## Versión 2.6.1: fecha de Colombia en la base de datos

**Base de datos.** Después del 20 (y del 21, si se programan las tareas), ejecutar
`22_fecha_colombia.sql`. El servidor está en UTC: entre las 7:00 p. m. y la medianoche de Colombia, `current_date`
da el día siguiente. El 22 lo reemplaza por `public.hoy_colombia()` en la vista `v_requerimientos`, en el valor por
defecto de la fecha de radicación y en cuatro funciones (requiere los scripts 01, 12, 13 y 20). No cambia la zona
horaria de la base ni ningún dato. Es idempotente y va en una sola transacción: si una función o la vista no es la
versión esperada, se detiene sin cambiar nada. Conserva los permisos de la vista y de las funciones.

El SQL Editor muestra solo el resultado de la última consulta (los permisos): después, ejecutar aparte el `select`
de verificación del final del script; todas sus columnas deben salir en `true`.

**Copias de seguridad en formato 3.** Ejecutar `23_respaldo_texto.sql` y después volver a desplegar la función
`respaldo` (en ese orden; si se despliega antes, la copia sigue en el formato 2 con un aviso). Ver `docs/RESPALDOS.md`.

**Aviso diario de planes de mejoramiento** (solo cuando DATIC autorice el piloto; queda apagado hasta que se active):
1. Ejecutar `24_avisos_planes.sql` (casilla de activación apagada, correo de copia y tabla `pm_avisos`).
2. Desplegar la función `avisos-planes` **sin** verificación JWT (valida por su cuenta quién la llama). Tiene dos
   archivos (`index.ts` y `reglas.js`): con la CLI, `supabase functions deploy avisos-planes`; para pegarla en el
   editor del panel, generar un solo archivo con `node scripts/funcion-para-pegar.mjs avisos-planes` y pegar
   `build/funciones/avisos-planes/index.ts`. Usa los mismos secretos del resumen semanal (`SMTP_USER`, `SMTP_PASS`,
   `RESUMEN_CLAVE`, `SITIO_URL`).
3. Ejecutar `25_programar_avisos.sql`: programa la tarea de lunes a viernes a las 7:00 a. m. y la deja **desactivada**.
4. En la app: Configuración → Aviso diario de planes → escribir el correo de copia de Control Interno → Guardar →
   *Ver qué se enviaría hoy* (vista previa, no envía nada).
5. Para empezar a enviar: marcar la casilla y Guardar, y activar la tarea:
   `select cron.alter_job(jobid, active := true) from cron.job where jobname = 'avisos-planes';`

## Versión 2.6: norma CGSC, memoria y paquete para DATIC

**Base de datos.** Ejecutar en orden, si no se han ejecutado: `18_planes_pdf_y_traslados.sql`,
`19_planes_calificacion_cgsc.sql` y `20_norma_cgsc_y_memoria.sql`. Son idempotentes y no borran datos. El 20 crea
el depósito privado `archivo`, las tablas de prórrogas, informes semestrales y archivo documental, y la papelera.

**Funciones del servidor.** Volver a desplegar `respaldo` (copia las tablas nuevas e incluye el inventario de
archivos con sus huellas) y `resumen-semanal` (avisa los informes semestrales de avance por presentar).

**Archivos a publicar.** `index.html`, `sw.js`, `manifest.webmanifest`, `icons/`, **`config.js`** y la carpeta
**`vendor/`** (librerías, fuentes e íconos). Sin `vendor/` la app no carga íconos, fuentes ni los lectores de
Excel y PDF.

**Cambiar de servidor (por ejemplo, al de la Alcaldía).** Solo se edita `config.js`:

```js
window.CE_CONFIG = { supabaseUrl: 'https://servidor.cali.gov.co', supabaseAnonKey: '<clave pública>', remitente: '<correo>' };
```

No hay que reconstruir la app. Supabase se puede instalar en un servidor propio con Docker (proyecto de código
abierto); los scripts 00 a 20 son PostgreSQL estándar. Ver también `docs/RESPALDOS.md` para trasladar los datos
(`scripts/restaurar-respaldo.mjs`) y los archivos (`scripts/restaurar-archivos.mjs`).

## Módulo operativo conectado al histórico (versión 2.2)

"Cargar respuesta ORFEO", "Requerimientos", "Tablero y métricas" y "Alertas" trabajan sobre los casos
abiertos del histórico. Ejecutar una vez `supabase/12_operativo_desde_historico.sql`: lleva a
`requerimientos` los casos sin respuesta y pendientes en término, enlazados por `hist_key`, sin modificar el
histórico, y muestra la conciliación por vigencia (la columna "faltan" debe quedar en 0).
Después de cada recarga del histórico ejecutar `select public.sembrar_desde_historico();` para traer los
casos abiertos nuevos. Los cierres registrados en la app se conservan.

## Planes desde el PDF, sugerencias y traslados (versión 2.5.4)

1. Ejecutar `supabase/18_planes_pdf_y_traslados.sql` y luego `supabase/19_planes_calificacion_cgsc.sql` (idempotentes; requieren el 13).
2. Publicar la versión. Sin el script 18 la app sigue funcionando: los traslados muestran el aviso de que falta el script
   y los hallazgos importados desde PDF no guardan su dependencia.
3. El lector de PDF (pdf.js 3.11.174) se sirve desde `vendor/web/` (publicado como `vendor/`), sin internet, y el service worker lo guarda para uso sin conexión.

## Carga del Excel de control (versión 2.5)

1. Ejecutar `supabase/16_carga_excel.sql` (idempotente; requiere 03, 09 y 12).
2. En la app, como Super administrador: Histórico de radicados → **Cargar Excel de control** (o Configuración).
   Elegir el Excel de la vigencia (uno o varios), revisar la vista previa y confirmar.
3. Ya no hace falta el ETL en Python ni importar CSV en el Table Editor. El ETL se conserva como respaldo y para
   verificar: `node tests/paridad-etl.cjs <excels...> <historico_requerimientos.csv>` debe dar 0 diferencias.

## Seguridad y resumen semanal (versión 2.4)

1. Ejecutar `supabase/14_seguridad_y_resumen.sql` (idempotente). Activa la exigencia de verificación en dos pasos
   para los roles de supervisión que la tengan configurada y agrega los parámetros del resumen semanal.
2. Volver a desplegar la función `gestion-cuentas` con el código de esta versión: ahora también exige el código de
   verificación en dos pasos a quien ya la activó (antes solo lo exigía la base de datos).
3. Verificación en dos pasos: Supabase la trae activa por defecto (Authentication → Multi-Factor → TOTP habilitado).
   Al ingresar, el Super administrador debe activarla. Si alguien pierde el celular: Authentication → Users →
   el usuario → borrar su factor MFA; en el siguiente ingreso lo activa de nuevo.
4. Resumen semanal:
   - Edge Functions → crear `resumen-semanal` con el código de `supabase/functions/resumen-semanal/index.ts`,
     **sin** verificación JWT (la función valida por su cuenta quién la llama).
   - Secretos: `SMTP_USER` (correo @cali.gov.co que envía), `SMTP_PASS` (contraseña de aplicación de ese correo, la
     misma que se usó para el SMTP de Supabase), `RESUMEN_CLAVE` (texto largo aleatorio). `SITIO_URL` ya existe.
   - Programación: verificar que existen en la bóveda los secretos `ce_proyecto_url` y `ce_resumen_clave` y, solo en
     una instalación nueva, crearlos desde la sección Vault del panel (ver `docs/RESPALDOS.md`, "Secretos de la
     bóveda"). Luego ejecutar `supabase/21_programar_tareas_boveda.sql`, que deja el resumen **desactivado**. El
     script 15 ya no programa nada.
   - Activar la tarea solo cuando DATIC autorice el piloto:
     `select cron.alter_job(jobid, active := true) from cron.job where jobname = 'resumen-semanal';`
   - En la app: Configuración → Resumen semanal por correo → Enviar prueba a mi correo; luego activarlo y Guardar.

## Planes de mejoramiento (versión 2.3)

Ejecutar una vez `supabase/13_planes_mejoramiento.sql` (idempotente). Crea las tablas `pm_*`, sus reglas de
seguridad, la auditoría y las funciones de reporte, validación e importación. Ver `docs/PLANES_DE_MEJORAMIENTO.md`.

El número 11 corresponde al script de correos del directorio, que contiene datos reales: se guarda en
`datos_privados/` y nunca se sube al repositorio.

## Cuentas por dependencia (una sola vez)

Las cuentas se crean por invitación: cada titular recibe un correo y define su propia contraseña. Crear cuentas y
cambiar correos exige la `service_role` key, que por seguridad vive solo en el servidor, dentro de la Edge Function
`gestion-cuentas` (código en `supabase/functions/gestion-cuentas/index.ts`).

1. Ejecutar `supabase/10_cuentas.sql`.
2. Desplegar la función. Opción A (sin instalar nada): Supabase > **Edge Functions** > **Deploy a new function** >
   **Via Editor**, nombre exacto `gestion-cuentas`, pegar el contenido de `index.ts` y desplegar.
   Opción B (CLI): `supabase functions deploy gestion-cuentas`.
3. Edge Functions > Secrets: agregar `SITIO_URL` con la dirección publicada de la app (por ejemplo
   `https://<organizacion>.github.io/control-entes/`). Es a donde llevan los enlaces de los correos.
4. Authentication > URL Configuration: poner la misma dirección en **Site URL** y en **Redirect URLs**.
5. Authentication > Emails > **SMTP Settings**: configurar el servidor de correo institucional (Google Workspace).
   El correo que trae Supabase por defecto solo permite unos pocos envíos por hora y no alcanza para invitar a todo
   el gabinete. Recomendado también: traducir al español las plantillas "Invite user" y "Reset password".
6. En la app: **Cuentas y roles** > **Crear cuentas pendientes**. Cuando cambie un secretario o director:
   **Cambiar titular** en su dependencia (actualiza el directorio y la cuenta en un solo paso).

## 2. Configuración

Editar `configuracion.json` con la Project URL y la clave pública (anon o publishable) de Supabase
(Project Settings > API Keys). Nunca la `service_role`: la construcción la rechaza. La construcción genera
`config.js` con esos valores; en producción se puede editar `config.js` directamente sin reconstruir.

## 3. Publicación en GitHub Pages

Repositorio institucional (decidido el 3-nov-2026): organización de GitHub `seguimiento-control-entes-cali`,
repositorio `control-entes`. Dirección pública de la app: https://seguimiento-control-entes-cali.github.io/control-entes/
(antes https://sentisalud.github.io/control-entes/). El plan del traslado y su orden están en el CLAUDE.md.

1. Subir el repositorio a GitHub (sin `datos_privados/`, ya está en `.gitignore`).
2. Settings > Pages > Build and deployment > Source: **GitHub Actions**.
3. Publicar **a mano**: pestaña **Actions** → *Publicar en GitHub Pages* → **Run workflow**. Ejecuta
   `.github/workflows/publicar.yml`: corre todas las pruebas en UTC y America/Bogota, construye la versión
   institucional y la publica. Subir cambios a `main` ya no publica solo, para que no salga una versión sin terminar.
   Cada envío sí ejecuta `.github/workflows/pruebas.yml` (formato, ESLint y pruebas).
4. Al cambiar de dirección: en Supabase (Authentication → URL Configuration) agregar la nueva a **Redirect URLs** sin
   quitar la vieja, probar, y solo entonces cambiar la **Site URL** y el secreto `SITIO_URL` de las funciones.

Alternativa sin GitHub Actions: `npm run build` y subir el contenido de `dist/institucional/` a cualquier hosting estático con HTTPS.

## 4. Actualizaciones en celulares instalados

Al publicar una versión nueva, cambiar `version` en `package.json` y `CACHE` en `public/sw.js`. Los celulares
descargan la versión nueva la siguiente vez que abren la app con conexión.

## 5. Instalación en el celular

Abrir la dirección publicada en Chrome (Android) o Safari (iPhone) > menú > **Agregar a la pantalla de inicio**.
