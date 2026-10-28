# Planes de mejoramiento

Módulo para formular, hacer seguimiento y reportar los planes de mejoramiento suscritos con:

- **Contraloría General de Santiago de Cali (CGSC)**: formato **PM_01 CGSC**, columnas (1) a (18).
- **Contraloría General de la República (CGR)**: **Formulario 14** (suscripción) y **Formulario 14.1** (seguimiento).

Código: `src/js/19-planes-de-mejoramiento.js`, `src/css/14-planes-de-mejoramiento.css`.
Base de datos: `supabase/13_planes_mejoramiento.sql`. Pruebas: `tests/planes.test.cjs`.

## Modelo

```
plan (formato, contraloría, ejercicio, fecha de suscripción, …)
 └─ hallazgo (número, condición, causa, efecto, connotaciones, cuantía, macroproceso)
     └─ acción (acción, propósito, actividades, meta, unidad, cantidad, inicio, fin,
                dependencia responsable, responsable, fuente y lugar de verificación)
         └─ avance (fecha de corte, avance ACUMULADO, descripción, ORFEO, PDF,
                    estado: por validar → validado | devuelto)
```

| Columna PM_01 | Campo | Columna F14 / F14.1 | Campo |
|---|---|---|---|
| (1) Entidad auditada | `entidad` | ENTIDAD / NIT | `entidad`, `nit` |
| (2) Nombre del ejercicio de fiscalización | `ejercicio` | REPRESENTANTE LEGAL | `representante_legal` |
| (3) Tipo de ejercicio | `tipo_ejercicio` | PERIODO FISCAL | `periodo_auditado` |
| (4) Fecha de suscripción | `fecha_suscripcion` | MODALIDAD DE AUDITORÍA | `modalidad` |
| (5) Vigencia PVCFT | `vigencia_pvcft` | FECHA DE SUSCRIPCIÓN | `fecha_suscripcion` |
| (6) N.º hallazgo | `numero` | Código hallazgo | `numero` |
| (7) Descripción de la condición y causa | `descripcion` (+ `causa`) | Descripción / Causa / Efecto | `descripcion`, `causa`, `efecto` |
| (8) Connotación | `connotaciones` | Acción de mejoramiento | `accion` |
| (9) Macroproceso, criterio u otro | `macroproceso` | Propósito de la acción | `proposito` |
| (10) Acción correctiva | `accion` | Descripción de las actividades | `actividad` |
| (11) Meta | `meta` (cantidad 100 %) | Unidad de medida / Cantidad | `unidad_medida`, `cantidad` |
| (12) Fuente de verificación | `fuente_verificacion` | Fecha iniciación | `fecha_inicio` |
| (13) Lugar de verificación | `lugar_verificacion` | Fecha terminación | `fecha_fin` |
| (14) Fecha terminación | `fecha_fin` | Área responsable | `dependencia_id` |
| (15) Responsable (nombre y cargo) | `responsable` + `dependencia_id` | Avance físico (F14.1) | avance validado |
| (16) Descripción del avance | avance validado | Observaciones (F14.1) | descripción del avance |
| (17) Fecha de corte del avance | avance validado | Fecha de evaluación (F14.1) | fecha de corte |
| (18) % de avance | avance validado | | |

El PM_01 no trae fecha de inicio: se usa la fecha de suscripción del plan (editable por acción).

## Indicadores (metodología del Formulario 14.1 de la CGR)

Son las mismas fórmulas de la plantilla oficial (verificadas recalculando en Excel/LibreOffice):

- Plazo en semanas = (fecha fin − fecha inicio) / 7
- % avance = mín(1, avance físico / cantidad de la meta)
- PLAI = plazo × % avance; PLAVI = PLAI si la acción venció a la fecha de evaluación; PAAVI = plazo si venció
- **Cumplimiento (CPM)** = Σ PLAVI / Σ PAAVI · **Avance (AP)** = Σ PLAI / Σ plazo

Solo cuentan los avances **validados** con fecha de corte hasta la fecha de evaluación. Si a esa fecha no hay
metas vencidas, el cumplimiento se muestra como "—" (no se inventa un 0 %). Para el PM_01 se aplican las mismas
fórmulas como referencia interna.

Estado de cada acción hoy: **cumplida** (100 %), **vencida** (pasó la fecha fin sin 100 %), **vence en 30 días**,
**en término**. Además: *por validar* (hay un reporte pendiente) y *devuelta* (Control Interno la devolvió).

## Flujo

1. **Formular o importar** (Super administrador o Control Interno): botón *Importar Excel* (PM_01 o F14/F14.1) o
   *Nuevo plan* → hallazgos → acciones. La importación muestra una vista previa: formato detectado, datos del
   plan, dependencia reconocida para cada acción (editable), errores que bloquean y avisos. Es atómica: o entra
   todo o nada. No permite importar dos veces el mismo plan.
2. **Reportar avance** (la dependencia, desde *Mis acciones de mejora*): fecha de corte, avance acumulado,
   descripción y soporte (PDF o radicado ORFEO; al menos uno). Una acción solo puede tener un reporte por validar.
3. **Validar o devolver** (Control Interno o Super administrador): al validar, el avance pasa a la acción y a los
   indicadores; al devolver, la observación es obligatoria y la dependencia la ve.
4. **Exportar** el formato de la contraloría a una fecha de corte: PM_01 (con firmas) o F14 + F14.1 (con
   fórmulas, totales y evaluación). Revisarlo y firmarlo antes de cargarlo al aplicativo de la contraloría.
5. **Notificar** a la dependencia (WhatsApp o correo) las acciones vencidas y por vencer; queda en la bitácora.

La pestaña **Calidad de datos** lista lo que impide medir o exportar bien: acciones sin dependencia, sin meta o sin
fuente de verificación, plazo de cero días, fechas anteriores a la suscripción, hallazgos sin acciones, NIT faltante.

## Seguridad (garantizada por la base de datos)

- Formulan y editan: `admin` y `control_interno`. Ven todo: también `alcalde`.
- `secretario` y `enlace` ven solo las acciones de su dependencia (y sus hallazgos y planes) y reportan solo esas.
- El avance de una acción no se puede editar directamente: solo cambia al validar un reporte o al importar.
- No se borran acciones, hallazgos ni planes con avances reportados por las dependencias.
- Todo queda en la cadena de auditoría SHA-256.

## Instalación

Ejecutar una vez `supabase/13_planes_mejoramiento.sql` en el SQL Editor (es idempotente). Al final muestra el
conteo de las cuatro tablas (en cero la primera vez). Si no se ha ejecutado, la pantalla lo indica.

La lectura y escritura de Excel usa SheetJS 0.18.5 (cdnjs), que se descarga solo al importar o exportar y queda
guardado por el service worker.


## Reglas de la Contraloría General de Santiago de Cali (versión 2.6)

Fuente: Resolución Reglamentaria 1000.30.00.24.043 del 17 de junio de 2024 y Resolución Reglamentaria
1000.30.00.24.003 del 16 de enero de 2024. Código: `src/js/19-planes-norma-y-memoria.js` y
`supabase/20_norma_cgsc_y_memoria.sql`.

| Regla | 24.043 (planes desde el 1-ene-2025) | 24.003 (planes presentados del 24-ene al 31-dic-2024) | Artículo |
|---|---|---|---|
| Calificación de cada acción | 0 o 2 | 0, 1 o 2 (el 1 solo con metas parciales fijadas) | 12 |
| Ponderación y concepto | 20 % cumplimiento, 80 % efectividad; «Cumple» desde 80 puntos | Igual | 12 y par. 4 |
| Plazo máximo de una acción | 6 meses | 1 año | 5 |
| Presentación del plan | 15 días hábiles desde la radicación del informe final | Igual | 7 |
| Informes semestrales | 15 días hábiles después del 30-jun y del 31-dic; columnas 16, 17 y 18 | Igual | 11 |
| Prórroga de presentación (plan o informe semestral) | Una vez; pedida con 5 días hábiles de antelación; máximo 5 días hábiles | Igual | 15 |
| Prórroga de una acción | Una vez; más de la mitad de la meta cumplida; máximo 30 % del plazo inicial; pedida 15 días hábiles antes | Igual | 16 |
| Acciones con menos de 100 puntos | Nuevo plan con el 30 % del tiempo inicial | Nuevo plan con Control Interno (mecanismo interno) | 12, par. 5 |
| Otra incidencia | Traslado a DIAN, Ministerio de Salud, Superintendencias, ADRES… | — | 2 |

La resolución aplicable se deduce de la fecha de suscripción (art. 19 y 20 de la 24.043) y se puede fijar a mano
en el plan. La base de datos impide calificar con 1 en planes de la 24.043 y verifica en las prórrogas de acción el
avance validado y el 30 %; los días hábiles los verifica la aplicación con el calendario de festivos de Colombia
(incluida la Ley 2578 de 2026).

Nombre del anexo para el SIA Contralorías (manual «Subida de planes de mejoramiento»):
`FORMATO_202001_PM_CGSC_<AAAAMM>_<sigla>_<número>_<año>.xlsx`.
