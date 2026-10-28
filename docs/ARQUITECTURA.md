# Arquitectura

Aplicación web instalable (PWA) conectada a Supabase. El código fuente está separado por secciones en
`src/` y se construye en un único `index.html` autosuficiente, que es lo que se publica.

## Por qué un único archivo publicado

- **Funciona sin servidor propio**: GitHub Pages (o cualquier hosting estático) lo sirve tal cual.
- **Funciona sin conexión**: el service worker guarda un solo archivo; la variante `privada` y la demo
  offline abren incluso con doble clic desde el computador.
- **Sin dependencias en tiempo de ejecución** salvo `supabase-js` (CDN, versión fijada 2.45.4) y los
  íconos/fuentes (CDN, o incrustados con `--offline`).

El precio de esa decisión es que los 21 archivos de `src/js/` comparten un **único ámbito**: no son
módulos ES con `import`/`export`, sino secciones que `scripts/build.mjs` une en orden dentro de una función
`(function(){ 'use strict'; … })();`. Por eso:

- Lo que declara un archivo se puede usar desde cualquier otro (cada archivo indica en su encabezado de qué depende).
- La revisión con ESLint se hace sobre el resultado unido (`npm run lint`), donde detecta variables no
  definidas, código inalcanzable, claves duplicadas, etc.
- Las pruebas cargan los archivos reales de `src/js/` (ver `tests/cargar-app.cjs`).

Migrar a módulos ES con un empaquetador (Vite, esbuild) es posible más adelante sin cambiar la lógica:
cada archivo ya es una unidad coherente.

## Capas

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PRESENTACIÓN  06 interfaz base · 07 08 09 12 13 14 15 16 17 vistas         │
│               18 acciones (un manejador de clics para todos los botones)   │
├──────────────────────────────────────────────────────────────────────────┤
│ DOMINIO       05 reglas del módulo operativo · 09 semáforo · 10 estadísticas│
│               y datos personales · 11 temas y cruces · 14 mensajes          │
├──────────────────────────────────────────────────────────────────────────┤
│ DATOS         04 objeto db (Supabase real o simulación en memoria)          │
│               10 carga del histórico, directorio y bitácora                 │
├──────────────────────────────────────────────────────────────────────────┤
│ SUPABASE      Auth + Postgres + RLS + Storage + RPC + auditoría (supabase/) │
├──────────────────────────────────────────────────────────────────────────┤
│ ETL           Excel de control + directorio → CSV (etl/, Python)            │
└──────────────────────────────────────────────────────────────────────────┘
```

## Mapa de archivos

| Archivo | Contenido principal |
|---|---|
| `01-configuracion.js` | `CFG` y `REMITENTE` desde `configuracion.json`; `ES_DEMO_PUBLICA`, `ES_PRIVADA` |
| `02-utilidades.js` | `$`, `$$`, `esc`, fechas, `lsGet`/`lsSet`, `sha256Hex` |
| `03-estado-y-permisos.js` | `S` (estado), `ROLES`, `NAV` (menú y permisos por pantalla), `TITLES` |
| `04-capa-de-datos.js` | `db` (todas las lecturas/escrituras), `DEMO` (base simulada), `demoAudit` |
| `05-reglas-de-negocio.js` | `decorate` (semáforo de requerimientos vivos), `reload` |
| `06-interfaz-base.js` | `toast`, `openModal`, `renderNav`, `renderTabbar`, `go`, `render` |
| `07-vistas-operacion.js` | `vTablero`, `vReqs`, `vCarga`, `vAlertas` |
| `08-vistas-catalogos-y-seguridad.js` | `vCatalog`, `vReportes`, `vAuditoria`, `verifyChain`, `vCuentas`, `vConfig` |
| `09-cumplimiento-e-historico.js` | `SEMP`, `semOf`, `vCumplimiento`, `vHistorico`, `histDetail` |
| `10-historico-y-directorio-datos.js` | `HIST`, `DIRLIST`, `loadHist`, `loadDir`, `scopeOrg`, `hrows`, `statsOf`, `maskPII`, `normPhone` |
| `11-cruces-y-temas.js` | `temasAuto`, `idsOf`, `cruceData`, `vCruces` |
| `12-centro-de-mando.js` | `vMando`, `renderBrief`, `buildTreemap`/`paintTreemap` (mosaico), `queueData` |
| `13-expediente-dependencia.js` | `vDependencia` |
| `14-notificaciones.js` | `buildMsg`, `notifyModal`, `sendWa`, `sendMail`, `despachoModal`, `vNotificaciones` |
| `15-directorio.js` | `vDirectorio` |
| `16-informe-ejecutivo.js` | `reportModel`, `reportHtml`, gráficos SVG, `vInforme` |
| `17-actividad.js` | `vActividad` |
| `18-acciones.js` | `document.addEventListener('click', …)`: un `case` por cada `data-act` |
| `19-planes-de-mejoramiento.js` | `PM`, `pmLoad`, `pmIndic` (Formulario 14.1), `vPlanes`, importación y exportación de Excel (PM_01 CGSC, F14/F14.1 CGR), `pmAct` |
| `20-carga-excel.js` | lector de los Excel de control (port de `etl/`), vista previa, `cargar_historico`, `ceAct` |
| `21-arranque.js` | creación del cliente Supabase, inicio de sesión (con verificación en dos pasos), service worker |

## Mapa de pantallas

| Ruta (`S.view`) | Función | Roles | Archivo |
|---|---|---|---|
| `mando` | `vMando` | admin, alcalde, control_interno | 12 |
| `dependencia` | `vDependencia` | todos (secretario/enlace: la suya) | 13 |
| `notificaciones` | `vNotificaciones` | supervisión | 14 |
| `informe` | `vInforme` | todos (acotado por rol) | 16 |
| `tablero`, `requerimientos`, `carga`, `alertas` | `vTablero`, `vReqs`, `vCarga`, `vAlertas` | según rol | 07 |
| `entes`, `dependencias`, `directorio` | `vCatalog`, `vDirectorio` | supervisión | 08, 15 |
| `cumplimiento`, `historico` | `vCumplimiento`, `vHistorico` | supervisión / todos | 09 |
| `cruces` | `vCruces` | todos (secretario: su dependencia) | 11 |
| `planes` | `vPlanes` | todos (secretario/enlace: sus acciones) | 19 |
| `reportes`, `actividad`, `auditoria`, `cuentas`, `config` | `vReportes`, `vActividad`, `vAuditoria`, `vCuentas`, `vConfig` | admin / supervisión | 08, 17 |

Los roles de cada pantalla se definen **solo** en `NAV` (`03-estado-y-permisos.js`). La interfaz oculta lo
que un rol no puede ver, pero la protección real está en las políticas RLS de Supabase.

## Flujo de datos

1. `21-arranque.js` crea el cliente Supabase si hay URL y clave pública; si no, entra en modo demostración (`DEMO`).
2. Tras iniciar sesión, `afterLogin` carga el perfil (rol y dependencia) y luego `loadHist`, `loadDir`, `loadNotifs`, `loadCruceMeta` y `pmLoad`.
3. Las vistas leen `HIST.rows` mediante `hrows()`, que ya viene acotado por RLS en el servidor (y por `scopeOrg` en la interfaz).
4. Las escrituras pasan por `db.*` o por las funciones de cada módulo (`saveDirRow`, `logNotif`, `saveTemaManual`, `saveCruceRev`).
5. La auditoría se llena sola con triggers en la base de datos: la app nunca escribe en `audit_log`.

## Construcción

`scripts/build.mjs`:

1. Lee `configuracion.json` y arma el objeto `CE_BUILD` (variante, versión, URL, clave pública, remitente).
   Rechaza una `service_role` key y una URL mal formada.
2. Une `src/css/*.css` y `src/js/*.js` en orden numérico (cada bloque lleva un comentario con su archivo de origen).
3. Incrusta el escudo (`src/assets/escudo.png`) y, según la variante, los datos (`datos/demo/` o `datos_privados/`).
4. Reemplaza los marcadores de `src/index.html` (`{{TITULO}}`, `{{ICONOS}}`, `{{CSS}}`, `{{ESCUDO}}`, `{{DATOS}}`, `{{JS}}`) y
   verifica que cada uno exista exactamente una vez.
5. Escribe el resultado y copia `public/` (service worker, manifiesto, íconos) junto al `index.html`.
