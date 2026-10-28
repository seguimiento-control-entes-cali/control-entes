# Historial de versiones

## 2.6.0 · octubre 2026
**Planes de mejoramiento según las Resoluciones Reglamentarias de la CGSC 24.043 y 24.003**
- Resolución aplicable por plan (según la fecha de suscripción, o fijada a mano).
- Calificación por acción: 0 o 2 en la 24.043; 0, 1 o 2 en la 24.003 (art. 12). La sugerencia automática ya no
  propone 1 (era un criterio propio, no de la norma). La base de datos rechaza el 1 en planes de la 24.043.
- Plazo máximo de las acciones: 6 meses (24.043) o 1 año (24.003), art. 5.
- Presentación del plan: 15 días hábiles desde la radicación del informe final, con semáforo (art. 7).
- Informes semestrales de avance: cortes 30-jun y 31-dic, vencimiento a 15 días hábiles, registro del envío,
  exportación con las columnas 16, 17 y 18 (art. 11), aviso en la pantalla principal y en el resumen semanal.
- Prórrogas de presentación del plan o de un informe semestral (art. 15) y de una acción (art. 16), con
  verificación de requisitos; la de acción conserva la fecha original.
- Nuevo plan por acciones con calificación inferior a 100 (art. 12, par. 5), con el 30 % del tiempo en la 24.043.
- Connotación y traslado «otra incidencia» (DIAN, Ministerio de Salud, Superintendencias, ADRES), art. 2.
- Nombre del archivo exportado según el SIA Contralorías: FORMATO_202001_PM_CGSC_….

**Memoria de la aplicación**
- Archivo documental de cada plan (pestaña Documentos): informe final, plan en Excel, formatos exportados,
  informes semestrales y oficios, con huella SHA-256 y radicado ORFEO; se guardan solos al importar y exportar.
- Papelera: restaurar planes (con sus hallazgos, acciones, avances y traslados), hallazgos, acciones, traslados
  y documentos. Funciona también con lo eliminado antes de esta versión.
- Respaldo de archivos: verificar integridad y descargar todo en un ZIP con manifiesto de huellas;
  `scripts/restaurar-archivos.mjs` los restaura comprobando cada huella. La copia semanal incluye las tablas
  nuevas, los traslados (antes faltaban) y el inventario de archivos.

**Paquete para DATIC**
- Sin dependencias de internet: librerías, fuentes e íconos en la carpeta `vendor/` publicada con la app.
- `config.js`: dirección del servidor y clave pública en un solo archivo, editable sin reconstruir.
- Documentación: despliegue, respaldos, reglas de la norma y licencias de terceros.

**Correcciones**
- La primera versión de la papelera habría agrupado todas las eliminaciones anteriores en una sola (encontrado en
  pruebas y corregido antes de publicar).

## 2.5.4 · octubre 2026
- **Corrección de seguridad (base de datos):** escalar_requerimiento, pm_revisar_avance, pm_importar y pm_eliminar_plan no rechazaban una sesión sin rol (contraseña sin el código de verificación o cuenta desactivada), porque `NULL not in (...)` no es verdadero. Ahora comparan con `coalesce(current_rol(), '')`. Comprobado: con el identificador de un plan, una sesión sin código podía eliminarlo; ya no. El script 19 corrige las bases ya instaladas.
- **Control Interno, responsable de los planes,** puede también eliminar un plan (antes, solo el Super administrador). Se mantiene la regla: no se elimina un plan con avances reportados por las dependencias.
- **Calificación de la Contraloría General de Santiago de Cali** en los planes PM_01, con las fórmulas del propio formato (cumplimiento = promedio × 100 / 2; efectividad = promedio × 100 / 2; calificación = cumplimiento × 0,2 + efectividad × 0,8; concepto «Cumple» desde 80 puntos). El cumplimiento de cada acción se sugiere con los avances validados (2, 1 o 0) y Control Interno califica la efectividad; el estado de la acción queda C (cerrada) o A (abierta).
- **Exportación idéntica al formato PM_01 CGSC versión 2020** (columnas A a P, títulos, lista de connotaciones y fórmulas L8, L9, M9, S5 y S7) más la hoja **PM_02 · papel de trabajo PT 03-PF** de evaluación. Verificado recalculando en LibreOffice: los valores coinciden con la app. El archivo exportado se vuelve a importar sin perder datos (el avance validado viaja en la descripción del avance).
- **Revisión de Control Interno a la formulación**: observación por acción (pendiente / atendida); las observaciones DACI del Excel se importan en cada acción. **Aprobar y suscribir**: exige que todos los hallazgos tengan acciones y que no haya observaciones pendientes; registra fecha y radicado del envío.
- **Oficio de remisión del informe** enlazado al plan (se sugiere solo por el número de la actuación: «896-2025», «Nº 896, vigencia 2025», «896 de 2025»), con su semáforo; al aprobar el plan se ofrece registrar la respuesta del oficio con el radicado y la fecha ya diligenciados.
- **Validaciones de formulación**: verbo en infinitivo, meta medible, fuente de verificación y plazo máximo de 6 meses en planes de la CGSC (aviso al guardar y en «Calidad de datos»).
- Importación de libros con PM_01 y PM_02: se lee la hoja del plan, no la de evaluación.
- Base de datos: `supabase/19_planes_calificacion_cgsc.sql`. Sin el script 19 la app oculta estas funciones y sigue funcionando.
- **Planes de mejoramiento desde el informe final en PDF**: "Importar" acepta el PDF del informe de la Contraloría (pdf.js, cargado solo cuando se usa). Lee la portada (actuación, número y fecha del informe), cada hallazgo con su dependencia, connotaciones, condición, causa, efecto y cuantía fiscal; omite la tabla de contenido y valida contra la "Relación de hallazgos". Crea el plan **en formulación**, con los hallazgos y sin acciones. Probado con el informe real AEF/DF 896-2025.
- **Sugerencias de acciones de mejora** según la causa del hallazgo (pagos y respaldo presupuestal, supervisión, planeación contractual y estudio del mercado, gestión documental, información contable, metas): acción, meta, unidad, fuente de verificación y plazo, que se cargan en el formulario para ajustarlas.
- **Traslados de hallazgos** con incidencia disciplinaria, fiscal, penal o sancionatoria: a quién, radicado, fecha y estado; aviso en "Calidad de datos" cuando falta registrarlos. Solo los ven el Despacho y Control Interno.
- Dependencia del hallazgo (aunque no tenga acciones), propuesta por defecto al formular las acciones.
- Instalación: los scripts 00 y 01 recrean la vista v_requerimientos (antes, volver a ejecutar el 00 después del 12 fallaba porque el 12 agrega columnas a requerimientos). Ahora todos los scripts, del 00 al 18, se pueden ejecutar varias veces en cualquier orden.
- Base de datos: `supabase/18_planes_pdf_y_traslados.sql` (columna dependencia en hallazgos, tabla pm_traslados con RLS y auditoría, pm_importar actualizada).
- Planes de mejoramiento, lectura del PM_01 CGSC versión 2020 (probado con el plan real de la AEF/DF 896-2025): reconoce "Nombre/Tipo de la actuación", separa las "Observaciones DACI" (antes se tomaban como avance) y las guarda en el plan con un aviso, extrae la causa de la descripción ("Lo anterior, causado por…"), asigna la dependencia por el lugar de verificación, el responsable o el título del hallazgo, y avisa cuando hallazgos del mismo plan o de planes anteriores tienen la misma causa (hallazgo recurrente, sugerir acción transversal).
- **Vista previa por rol** (solo Super administrador): selector junto a la vigencia para ver la app como Alcalde, Control Interno, Secretario o Enlace de una dependencia, con los mismos filtros que aplicaría la base de datos. Es de solo lectura: mientras está activa se bloquean todas las escrituras, cargas, envíos y funciones del servidor. "Volver a mi vista" restaura todo.
- Verificación en dos pasos: el código QR ahora se dibuja bien (el SVG se codifica) y se pide activarla apenas se define la contraseña desde una invitación.
- Resumen semanal: redacción "el resumen semanal de su dependencia, …".

## 2.5.3 · octubre 2026
- **Copias de seguridad**: función `respaldo` (todas las tablas en un .json.gz en el bucket privado `respaldos`, se conservan 12), copia automática los domingos a las 11:00 p. m. (`supabase/17_respaldos_y_monitoreo.sql`), tarjeta en Configuración para crear y descargar copias, y `scripts/restaurar-respaldo.mjs` para restaurar en una sola transacción. Probado: copia → daño → restauración con huellas idénticas. Ver docs/RESPALDOS.md.
- **Salud del sistema**: tabla `eventos_sistema`; el resumen semanal y las copias dejan ahí su resultado; los errores del navegador de cualquier usuario se registran (limitados) y el Super administrador los ve y marca como revisados en Configuración.
- Incluye la 2.5.2 (preparar cuentas sin activar).

## 2.5.2 · octubre 2026
- Cuentas y roles: "Preparar cuentas sin activar" crea las cuentas de los titulares sin enviar ningún correo; quedan bloqueadas. "Activar e invitar" las activa una por una y envía el enlace para definir la contraseña. Se mantiene "Crear e invitar ya" para crear y activar de inmediato.
- Función gestion-cuentas: acciones nuevas `preparar` y `activar_invitar`.

## 2.5.2 · octubre 2026
- Cuentas: "Preparar cuentas sin activar" crea las cuentas de los titulares con su correo institucional sin enviar ningún correo; quedan bloqueadas. "Activar e invitar" las activa una por una y envía el enlace para definir la contraseña. Acciones nuevas `preparar` y `activar_invitar` en la función `gestion-cuentas`.

## 2.5.1 · octubre 2026
- Requerimientos: los radicados largos sin espacios se parten en varias líneas y la columna del botón "Cerrar" queda siempre visible (antes se cortaba a la derecha con zoom alto).
- Resultado de la carga del Excel: cada número aparece al lado de su título (antes quedaban ocultos a la derecha).
- Resumen semanal: el botón "Enviar prueba a mi correo" muestra el error real del servidor de correo (antes decía "No hay dependencias con pendientes"). La función deja el error en sus registros.

## 2.5.0 · octubre 2026
- **Carga del Excel de control desde la app** (Super administrador): botón "Cargar Excel de control" en Histórico de radicados y en Configuración. Lee las hojas CONTROL y NO RESPUESTA (formatos 2024-2025 y 2026), muestra por vigencia los registros nuevos, los que cambian de estado, los que ya no aparecen y los casos abiertos, lista las filas para revisar (descargables en CSV) y los organismos no reconocidos, y reemplaza la vigencia en una sola operación (`supabase/16_carga_excel.sql`, función `cargar_historico`). Las respuestas registradas en la app se conservan, los casos abiertos nuevos pasan a "Cargar respuesta ORFEO" y los que el Excel ya trae respondidos salen de pendientes. Cada carga queda en `historico_cargas` y en la auditoría.
- El lector (`src/js/20-carga-excel.js`) reproduce `etl/load.py` y `etl/clean.py` regla por regla: verificado con los Excel reales 2024-2026, 3.568 registros idénticos campo por campo (`tests/paridad-etl.cjs`) y 27 pruebas sintéticas (`tests/excel-control.test.cjs`).
- **Corrección en el ETL**: con pandas 3 las celdas vacías de "ORFEO de la respuesta" quedaban como el texto "nan" (343 registros) y 5 casos "Cerrado" sin ORFEO ni fecha se contaban como respondidos. Corregido en `etl/clean.py` y en la app.
- Las funciones del servidor `gestion-cuentas` y `resumen-semanal` también exigen el código de verificación en dos pasos a quien la tiene activa.
- El arranque pasa a `src/js/21-arranque.js`.
- Incluye todo lo de la 2.4.0.

## 2.4.0 · octubre 2026
- **Días hábiles con festivos de Colombia**: la app ya descuenta los festivos (Ley 51 de 1983 y el nuevo festivo de la Ley 2578 de 2026, 9 de julio). Antes solo descontaba sábados y domingos al medir retrasos de respuestas cerradas en la app. Verificado contra la librería del ETL para 2020 a 2035.
- **Nuevo requerimiento**: se escribe el término en días hábiles y la fecha límite se calcula sola (se puede ajustar).
- **Centro de mando**: la ventana del tablero se elige entre 3, 6 y 12 meses (por defecto 6) y se recuerda en el navegador. Menos dependencias quedan "sin muestra".
- **Planes de mejoramiento en el centro de mando** (cumplimiento, avance, vencidas, por vencer y por validar) y **en el informe ejecutivo** (tabla por plan y acciones vencidas).
- **Verificación en dos pasos** (app autenticadora): obligatoria para el Super administrador, recomendada para Alcalde y Control Interno. La base de datos no reconoce el rol de supervisión a quien la activó si entró solo con contraseña (supabase/14). Nueva ventana "Mi cuenta y seguridad" (botón de la llave).
- **Resumen semanal por correo** a cada secretario o director, los lunes a las 7:00 a. m.: Edge Function `resumen-semanal`, programación con pg_cron (supabase/15) y control en Configuración (activar y enviar prueba).
- **Corrección**: la pastilla "EN LÍNEA" de la barra superior se cortaba en la versión institucional (compartía el estilo del punto del centro de mando).
- ETL: `holidays>=0.106` para incluir el festivo de la Ley 2578 de 2026.

## 2.3.0 · octubre 2026
- Módulo **Planes de mejoramiento** (menú Mejoramiento; para secretarios y directores, "Mis acciones de mejora"): plan → hallazgos → acciones → avances.
- Formatos: PM_01 de la Contraloría General de Santiago de Cali (columnas 1 a 18) y Formularios 14 y 14.1 de la Contraloría General de la República.
- Importación de Excel (.xlsx y .xls) con vista previa: formato detectado, celdas combinadas, fechas en cualquier forma, dependencia reconocida por acción (editable), errores que bloquean y avisos; atómica y sin duplicados.
- Reporte de avance por la dependencia con PDF o radicado ORFEO; validación o devolución por Control Interno o el Super administrador; solo lo validado cuenta.
- Indicadores con las fórmulas de la plantilla oficial del Formulario 14.1 (CPM = Σ PLAVI / Σ PAAVI, AP = Σ PLAI / Σ plazo) a la fecha de evaluación elegida.
- Exportación del PM_01 (con firmas) y de los Formularios 14 y 14.1 (con fórmulas, totales y evaluación) a una fecha de corte.
- Semáforo por acción, pestañas Por validar, Calidad de datos e Historial, y notificación por WhatsApp o correo a la dependencia.
- Base de datos: script `supabase/13_planes_mejoramiento.sql` (tablas `pm_*`, RLS, auditoría y funciones `pm_reportar_avance`, `pm_revisar_avance`, `pm_importar`, `pm_eliminar_plan`), probado en PostgreSQL 16.
- Código: `src/js/19-planes-de-mejoramiento.js`, `src/css/14-planes-de-mejoramiento.css`; el arranque pasa a `src/js/20-arranque.js`.
- Pruebas: 88 verificaciones nuevas (`tests/planes.test.cjs`, incluye ida y vuelta de los Excel y la plantilla oficial de la CGR); las 32 fórmulas exportadas recalculadas en LibreOffice coinciden con la app; recorrido de todas las pantallas y botones sin errores.

## 2.2.0 · octubre 2026
- Módulo operativo conectado al histórico: "Cargar respuesta ORFEO", "Requerimientos", "Tablero y métricas" y "Alertas" ya no salen vacíos. Script `supabase/12_operativo_desde_historico.sql` siembra los 154 casos abiertos reales (2026: 19 vencidos y 7 en término; 2025: 102; 2024: 26), enlazados por `hist_key`, sin modificar el histórico; es idempotente.
- Al cerrar un caso con ORFEO, fecha y PDF, el histórico lo muestra como respondido (a tiempo o tarde, con días hábiles de retraso) y el cumplimiento se recalcula; los cierres sobreviven a una recarga del histórico.
- Cargar respuesta ORFEO: buscador por radicado, ente, dependencia o asunto.
- Soporte PDF: el nombre del archivo se limpia (los radicados de los entes traen espacios, barras y tildes).
- Pruebas: 40 verificaciones; script SQL probado en PostgreSQL 16 con los 3.568 registros reales, permisos por rol, ORFEO duplicado y formato de radicado.

## 2.1.1 · octubre 2026
- Barra superior: el reloj y el indicador "En línea" ya no se encogen ni se cortan en el borde derecho; si falta espacio se acorta el subtítulo de la pantalla.

## 2.1.0 · octubre 2026
- Diseño sólido en toda la app: se elimina el efecto vidrio translúcido que apagaba los colores del semáforo; fondos, tarjetas y barras opacos.
- Verde del semáforo corregido: el tema oscuro usaba un verde menta que se confundía con el azul de la interfaz.
- Centro de mando: titular con el estado de la alcaldía ("N dependencias en rojo y M en riesgo") y tablero de teclas sólidas, una por dependencia, del color de su semáforo, ordenadas de mayor a menor incumplimiento. La tecla se hunde al presionarla y muestra el detalle con la barra de zonas del semáforo y el botón "Abrir expediente".
- Leyenda completa del semáforo y regla visible de muestra insuficiente (menos de 3 casos evaluados).
- Celular: barras superior e inferior opacas, cifras apiladas en las teclas y el detalle se desplaza a la vista al presionar.
- Nuevo archivo de estilos src/css/13-tablero-solido.css.

## 2.0.1 · octubre 2026
- Corrección: el directorio leído de Supabase no traía el correo institucional del titular; por eso las cuentas aparecían como "Faltan datos del titular" y, al editar el directorio, el correo podía borrarse.
- Prueba nueva que impide que este error vuelva (35 verificaciones).

## 2.0.0 · octubre 2026
- Cuentas por dependencia con el correo institucional del titular, creadas por invitación (Edge Function `gestion-cuentas`, script `10`).
- "Cambiar titular": actualiza directorio y cuenta de acceso en un paso cuando cambia el secretario o director.
- "Cambiar mi contraseña" y "¿Olvidaste tu contraseña?"; definición de contraseña al abrir la invitación.
- Código fuente organizado para editores: `src/` con 19 archivos de lógica, 12 de estilos y plantilla HTML; construcción con `scripts/build.mjs`.
- Configuración en `configuracion.json` (ya no se edita el código para conectar Supabase).
- Variantes institucional, demo y privada como opción de construcción.
- Cruces y temas: clasificación por tema y alertas de cruce entre entes (script `08`).
- Histórico 2026 actualizado con corte 14/10/2026 (488 registros).
- Se incorporan los oficios de la hoja "NO RESPUESTA" de 2024 y 2025 (883) como "No requiere respuesta" (script `09`).
- ETL robusto ante cambios de formato del Excel 2026 (detecta la fila de encabezados y valida columnas).
- Pruebas: 34 verificaciones de reglas, ESLint sin errores, recorrido de extremo a extremo por rol.

## 1.x · julio a octubre 2026
- PWA de un solo archivo, Supabase con RLS, centro de mando, notificaciones, directorio, informe ejecutivo, auditoría.
