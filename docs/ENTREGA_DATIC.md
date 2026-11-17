# Control de Entes · Entrega a DATIC

**Fecha:** 16 de noviembre de 2026
**Entrega:** responsable del proyecto en la Alcaldía de Santiago de Cali
**Recibe:** Departamento Administrativo de Tecnologías de la Información y las Comunicaciones (DATIC)
**Repositorio:** https://github.com/seguimiento-control-entes-cali/control-entes

Este documento resume qué es Control de Entes, en qué estado se entrega, cómo está construido y probado, y cuáles son
las dos opciones para su operación: **seguir con Supabase** o **instalarlo en el servidor de la Alcaldía**. Al final está
la hoja de ruta (fases F5 a F8) para que DATIC continúe.

---

## 1. Qué es Control de Entes

Aplicación web (PWA) del Despacho del Alcalde para hacer seguimiento a los requerimientos de los entes de control
(contralorías, procuraduría, personería y otros) y a los planes de mejoramiento suscritos con las contralorías.

| Módulo | Qué hace |
|---|---|
| Centro de mando e Informe ejecutivo | Resumen de cumplimiento, alertas y planes; informe con huella digital. |
| Requerimientos | Tablero, semáforo por días hábiles, carga de la respuesta ORFEO con su PDF, alertas y escalamiento. |
| Histórico y Cumplimiento | Histórico por vigencia (cargado desde el Excel de control) e indicadores por organismo. |
| Directorio y Notificaciones | Responsables por dependencia; avisos por WhatsApp y correo con registro en la bitácora. |
| Cruces y temas | Relación de radicados por número y por tema. |
| Planes de mejoramiento | Formulación, avances con soporte y validación, calificación CGSC, Formularios 14 y 14.1 de la CGR, importación desde Excel o PDF, exportación en el formato de cada contraloría, plazos de la norma, prórrogas, archivo documental y papelera. |
| Auditoría, Actividad, Cuentas y Configuración | Cadena de auditoría SHA-256, actividad por usuario, cuentas con MFA, copias de seguridad e integridad de archivos. |

**Roles:** `admin` (Super administrador), `alcalde`, `control_interno` (supervisión) y `secretario`, `enlace` (solo su
dependencia).

---

## 2. Estado en que se entrega

| Versión | Dónde | Estado |
|---|---|---|
| **2.6.2** (HTML y JavaScript) | Raíz del sitio publicado | En uso. Es la versión de referencia. |
| **3.0** (React + TypeScript) | `/v3/` del mismo sitio | **Todas las pantallas de la 2.x**, con la misma apariencia, conectada a la misma base. |

Fases del plan de migración (`docs/migracion/README.md`):

| Fase | Estado |
|---|---|
| Trabajo previo (bloqueos de instalación de la 2.6.1) | Terminado |
| F0 Preparación, F1 Cimientos, F2 Primeras pantallas | Terminadas |
| F3 Pantallas restantes | **Terminada el 16-nov-2026** |
| F4 Base de datos bajo control | Hecha en el repositorio; falta comparar con producción (§5) |
| F5 a F8 (backend y retiro de la 2.x) | **Hoja de ruta para DATIC** (§8) |

**Pendientes conocidos de la 3.0** (no impiden su uso; la 2.x los cubre):
- Recorridos automáticos de punta a punta en navegador real (Playwright) por rol.
- Revisión con usuarios piloto (requiere autorización de DATIC).
- En el menú: selector «Ver como» de la demostración y contadores rojos («Mi cuenta» ya está en la 3.0 desde el 16-nov).
- El resumen semanal por correo y el aviso diario de planes están **apagados** hasta que DATIC autorice el piloto.

---

## 3. Qué se entrega

| Elemento | Dónde |
|---|---|
| Código de la 2.x | `src/`, `public/`, `scripts/`, `vendor/` |
| Código de la 3.0 | `frontend/` (React 18, TypeScript estricto, Vite) |
| Base de datos | `supabase/01` a `26` (scripts numerados) y `supabase/00_instalar_todo.sql` (instalador completo) |
| Funciones del servidor | `supabase/functions/` (`gestion-cuentas`, `respaldo`, `resumen-semanal`, `avisos-planes`) |
| Pruebas | `tests/` (2.x, base de datos y funciones) y `frontend/pruebas/` + `frontend/src/**/*.test.*` (3.0) |
| Revisión automática | `.github/workflows/` (pruebas en dos zonas horarias, compilación y publicación) |
| Documentación | `docs/` (arquitectura, modelo de datos, reglas de negocio, seguridad, respaldos, despliegue y migración) |
| Manuales (Word y PDF) | `docs/manuales/`: instalación y puesta en marcha (incluye el piloto con Control Interno), manejo y administración, módulos, y técnico de construcción |

**Cómo empezar** (equipo técnico):
1. Clonar el repositorio; Node.js 22.
2. 2.x: `npm ci` y `node tests/ejecutar-pruebas.cjs` en la raíz.
3. 3.0: `cd frontend`, `npm ci`, `npm run verificar` (tipos, formato, lint, pruebas y compilación) y `npm run dev` para
   la demostración (datos ficticios, sin conexión a Supabase).
4. Publicar: solo con `node scripts/publicar-pages.mjs` (exige el árbol limpio y `main` al día; después de publicar
   verifica que el sitio responda y que cada archivo citado exista).

---

## 4. Cómo está construida la 3.0

```
NAVEGADOR · PWA React + TypeScript
  features/   pantallas (una carpeta por módulo)
  dominio/    reglas puras: semáforo, días hábiles con festivos de Colombia, indicadores, planes, lector del Excel
  datos/      ÚNICO lugar que conoce Supabase
    contratos/  interfaces por módulo
    supabase/   implementación con supabase-js
    demo/       implementación en memoria (datos ficticios)
            │ supabase-js (clave pública; la protección es RLS)
SUPABASE · PostgreSQL + RLS + funciones RPC + auditoría · Auth con MFA · Storage · Edge Functions · pg_cron
```

- **Una regla de lint impide** que una pantalla hable con Supabase directamente: todo pasa por los contratos de
  `datos/`. Así, cambiar a un backend propio (F5-F6) no toca las pantallas.
- **Paridad con la 2.x:** cada regla de negocio de la 3.0 tiene una prueba que ejecuta el código real de la 2.x con los
  mismos datos ficticios y exige el mismo resultado (cálculos, importación, exportación a Excel celda por celda, ZIP
  byte por byte, mensajes).
- **Revisión en GitHub:** ningún cambio entra a `main` sin las seis revisiones en verde (pruebas en UTC y en
  America/Bogota, tipos, formato, lint, compilación y huella de la base).

---

## 5. Base de datos bajo control (F4)

- Cada cambio de la base es un **script numerado** en `supabase/`; `00_instalar_todo.sql` instala una base nueva.
- La **huella del esquema** (`supabase/consultas/huella_esquema.sql`, de solo lectura) describe tablas, columnas,
  restricciones, índices, vistas, funciones (con la huella md5 de su código), disparadores, políticas RLS y permisos.
- `npm run bd:huella:revisar` compara la huella guardada con los scripts y la revisión de GitHub lo exige.
- `npm run bd:huella -- --comparar <archivo>` compara con la huella de producción e informa cada diferencia.
- Detalle y decisión (sin Alembic por ahora): `docs/migracion/F4_BASE_BAJO_CONTROL.md`.

**Pendiente:** correr la consulta en producción, comparar y resolver cada diferencia con un script numerado.

---

## 6. Seguridad y continuidad

- **Acceso:** Supabase Auth con verificación en dos pasos obligatoria para el Super administrador; políticas RLS en todas
  las tablas; secretaría y enlace solo ven su dependencia.
- **Auditoría:** cada cambio queda en `audit_log` con una cadena SHA-256; `verificar_cadena_auditoria` comprueba que no
  se haya alterado.
- **Copias:** respaldo completo cada domingo (se conservan 12) y descarga manual; los archivos (PDF y documentos) se
  verifican por huella y se descargan en ZIP con manifiesto desde Configuración. Ver `docs/RESPALDOS.md`.
- **Claves:** en el código solo está la clave pública (`sb_publishable_…`). Las claves secretas viven en la bóveda de
  Supabase y en los secretos de GitHub; ninguna está en el repositorio.
- **Datos:** el repositorio no contiene datos reales; la demostración usa datos ficticios.

---

## 7. Dos opciones de operación

### Opción A · Seguir con Supabase

La aplicación queda como está: base, usuarios, archivos y funciones en Supabase; el sitio en GitHub Pages.

| | |
|---|---|
| **Esfuerzo para empezar** | Ninguno: ya funciona. |
| **Qué hace DATIC** | Administrar las cuentas de Supabase y GitHub, revisar las copias semanales, aplicar los scripts nuevos y autorizar el piloto. |
| **Ventajas** | Sin migración ni riesgo de traslado; actualizaciones de seguridad de la plataforma a cargo de Supabase; respaldos ya probados (copia y restauración verificadas por huella). |
| **Cuidados** | Los datos están en la nube de un proveedor externo; revisar el plan contratado (límites y costo) y la política de datos de la Alcaldía; la clave pública es visible en el navegador (protegida por RLS) hasta cerrar el acceso directo (F7). |
| **Siguiente paso opcional** | Backend propio en Python (F5 a F7) alojado donde DATIC decida, manteniendo Supabase como base. |

### Opción B · Instalar en el servidor de la Alcaldía

Hay dos caminos, de menor a mayor esfuerzo:

**B1 · Supabase autohospedado** (Docker en un servidor de la Alcaldía). Es el mismo software de Supabase (PostgreSQL,
Auth, Storage, funciones) instalado en casa.
- Cambio en el código: mínimo (la dirección del proyecto y las claves, que se fijan al construir).
- Pasos: preparar el servidor con Docker y certificado TLS; instalar con `supabase/00_instalar_todo.sql`; restaurar la
  última copia (`docs/RESPALDOS.md` describe la restauración y su verificación por huellas); copiar los archivos de los
  depósitos; recrear las cuentas (los usuarios definen contraseña nueva) y las tareas programadas.
- DATIC asume: actualizaciones de seguridad, respaldos del servidor, monitoreo y disponibilidad.

**B2 · PostgreSQL propio + backend en Python** (fases F5 a F8). Se reemplazan Auth, Storage y las funciones de Supabase
por un backend FastAPI propio sobre un PostgreSQL de la Alcaldía.
- La 3.0 ya está preparada: solo se reemplaza `datos/supabase/` por `datos/api/`, módulo por módulo, sin tocar
  pantallas.
- Es el camino de mayor control y también el de mayor esfuerzo: backend, autenticación con MFA, almacenamiento de
  archivos, tareas programadas y pruebas de seguridad por rol.

### Comparación

| Criterio | A · Supabase | B1 · Supabase en casa | B2 · Backend propio |
|---|---|---|---|
| Esfuerzo inicial | Ninguno | Medio | Alto |
| Cambios en el código | Ninguno | Mínimos | Capa de datos y backend nuevo |
| Datos en servidores de la Alcaldía | No | Sí | Sí |
| Operación a cargo de DATIC | Baja | Alta | Alta |
| Riesgo de la transición | Ninguno | Medio (traslado de datos y archivos) | Medio-alto |

**Sugerencia:** operar con la opción A mientras DATIC define dónde alojar (decisión D-19 del plan) y, si la política de
datos lo exige, pasar a B1 o B2 por fases, con la 2.x y la 3.0 conviviendo hasta terminar.

---

## 8. Hoja de ruta para DATIC (F5 a F8)

| Fase | Contenido | Criterio de salida |
|---|---|---|
| F4 (cierre) | Comparar la huella con producción y resolver diferencias; línea base de Alembic (`0001`) con el instalador y `alembic stamp` en producción. | «Sin diferencias». |
| F5 · Esqueleto del backend | FastAPI (monolito modular), rol de base `ce_app` sin acceso total, contexto de usuario por transacción (RLS sigue funcionando), módulos `identidad` y `auditoria`, OpenAPI → cliente TS. Decidir el alojamiento (D-19). | Backend en preproducción. |
| F6 · Módulos | Por módulo: casos de uso, pruebas de paridad y RLS, `datos/api/<modulo>.ts`; un worker reemplaza las funciones programadas. | La 3.0 ya no usa `datos/supabase/`. |
| F7 · Cierre del acceso directo | Desactivar la Data API pública, cerrar el registro abierto y rotar claves. | El navegador no habla con Supabase. |
| F8 · Retiro del legado | Retirar la 2.x, el ETL y las funciones; mover los scripts a `docs/historico/`. | Una sola versión. |

El detalle técnico (capas, seguridad, base y tareas programadas del backend) está en `docs/migracion/README.md` §9.

---

## 9. Condiciones vigentes

- **Sin cambios en producción del 19-dic-2026 al 6-ene-2027.**
- El resumen semanal y el aviso diario de planes **no se encienden** sin autorización de DATIC.
- Todo cambio en Supabase (SQL, funciones, secretos, configuración) se hace con aprobación y queda en un script numerado y
  en la bitácora (`docs/migracion/README.md` §13).
