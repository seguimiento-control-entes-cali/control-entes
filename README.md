# Control de Entes · Alcaldía Distrital de Santiago de Cali

Aplicación web instalable (PWA) para el seguimiento de los requerimientos que los entes de control
(Contraloría, Procuraduría, Personería, Defensoría y otros) dirigen a las dependencias de la Alcaldía.
Despacho del Alcalde · Oficina de la Secretaría Privada.

- **Centro de mando** para el Alcalde: incumplimiento global, semáforo por dependencia, máquina del tiempo, cola de acción.
- **Expediente por dependencia**: cada secretario o director ve solo la suya (garantizado en la base de datos con RLS).
- **Notificaciones** por WhatsApp y correo institucional a secretarios y directores, con bitácora.
- **Cruces y temas**: clasificación por tema y alertas cuando varios entes piden sobre el mismo contrato, expediente o radicado.
- **Carga del Excel de control** desde la app, con vista previa de cambios y filas para revisar.
- **Planes de mejoramiento** de la Contraloría General de Santiago de Cali (formato PM_01) y de la Contraloría General de la República (Formularios 14 y 14.1): importación y exportación de Excel, reporte de avances con soporte, validación por Control Interno e indicadores de cumplimiento y avance.
- **Informe ejecutivo** en PDF con huella SHA-256, **auditoría inmutable** y registro de actividad.
- Funciona en computador y celular; se instala como app y abre sin conexión.

---

## Inicio rápido (5 minutos)

Requisitos: [Node.js 18 o superior](https://nodejs.org) y un editor (se recomienda Visual Studio Code).

```bash
npm install          # solo instala las herramientas de formato y revisión (la app no tiene dependencias)
npm run dev          # abre http://localhost:5173 con datos de ejemplo; se recarga al guardar
```

En Visual Studio Code, al abrir la carpeta aparecerán las extensiones recomendadas (Prettier, ESLint, EditorConfig).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local con datos de ejemplo y recarga automática |
| `npm run build` | Construye la versión institucional (Supabase) en `dist/institucional/` |
| `npm run build:demo` | Construye la demostración en `dist/demo/` y el archivo único `dist/Control_de_Entes_DEMO.html` |
| `npm run build:privada` | Construye el archivo con datos reales a partir de `datos_privados/` (no se publica) |
| `npm test` | Construye y ejecuta las 34 verificaciones de reglas de negocio |
| `npm run lint` | Revisión estática con ESLint de toda la aplicación |
| `npm run formato` | Formatea el código con Prettier |

Pruebas de extremo a extremo (recorren cada pantalla y botón con cada rol): ver `tests/e2e/recorrido.py`.

## Estructura

```
control-entes/
├── configuracion.json        ← URL y clave pública de Supabase, remitente de correos (lo único que se configura)
├── src/
│   ├── index.html            ← plantilla HTML (marcado de la app)
│   ├── css/01…14-*.css       ← estilos por sección
│   ├── js/01…21-*.js         ← lógica por sección (configuración, datos, reglas, cada pantalla, acciones, planes, arranque)
│   └── assets/escudo.png     ← escudo oficial de la Alcaldía
├── public/                   ← service worker, manifiesto e íconos (se copian a la publicación)
├── datos/demo/               ← datos ficticios para la demostración
├── datos_privados/           ← datos reales (EXCLUIDOS de git)
├── supabase/                 ← base de datos: tablas, seguridad RLS, auditoría (00 = instalador completo)
├── etl/                      ← convierte los Excel de control en CSV para Supabase (Python)
├── scripts/                  ← build.mjs (construcción), servidor.mjs (desarrollo), extraer-js.mjs (lint)
├── tests/                    ← reglas de negocio (Node) y recorrido de extremo a extremo (Playwright)
├── vendor/                   ← íconos y fuentes para la versión sin conexión
├── docs/                     ← arquitectura, guía de desarrollo, despliegue, seguridad, modelo de datos, reglas
└── .github/workflows/        ← pruebas automáticas y publicación en GitHub Pages
```

**Cómo funciona la construcción:** `scripts/build.mjs` une la plantilla, los estilos y los 21 archivos de
lógica en un único `index.html` autosuficiente (así funciona sin servidor, como app instalable y sin conexión).
Nunca se edita el archivo publicado: se edita `src/` y se reconstruye. Detalle en `docs/ARQUITECTURA.md`.

## Variantes

| Variante | Datos | Conexión | Para qué |
|---|---|---|---|
| `institucional` | Supabase (reales, protegidos por RLS) | Requiere `configuracion.json` | Uso diario de la Alcaldía |
| `demo` | Ficticios (`datos/demo/`) | No | Presentaciones públicas y pruebas |
| `privada` | Reales locales (`datos_privados/`) | No | Presentaciones internas sin conexión. **No publicar** |

## Documentación

| Documento | Contenido |
|---|---|
| [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) | Capas, flujo de datos, mapa de archivos y pantallas |
| [docs/GUIA_DESARROLLO.md](docs/GUIA_DESARROLLO.md) | Cómo hacer cambios: agregar una pantalla, un botón, un rol, un tema; convenciones |
| [docs/DESPLIEGUE.md](docs/DESPLIEGUE.md) | Supabase, GitHub Pages, actualizaciones e instalación en el celular |
| [docs/SEGURIDAD.md](docs/SEGURIDAD.md) | RLS, claves, datos personales, auditoría |
| [docs/MODELO_DE_DATOS.md](docs/MODELO_DE_DATOS.md) | Tablas, vistas y funciones de la base de datos |
| [docs/REGLAS_DE_NEGOCIO.md](docs/REGLAS_DE_NEGOCIO.md) | Oportunidad, semáforo, directorio, cruces y temas, permisos |
| [docs/PLANES_DE_MEJORAMIENTO.md](docs/PLANES_DE_MEJORAMIENTO.md) | Formatos PM_01 y F14/F14.1, indicadores, flujo de avances, importación y exportación |
| [CHANGELOG.md](CHANGELOG.md) | Historial de versiones |

## Licencia y terceros

Software de uso institucional de la Alcaldía Distrital de Santiago de Cali. Componentes de terceros en
[LICENCIAS-TERCEROS.md](LICENCIAS-TERCEROS.md).
