# Plan de migración · Control de Entes 3.0

> **Estado del plan:** Fase F0 en curso (adelantada al 2026-11-08) · **Última actualización:** 2026-11-08
> Este documento es la fuente de verdad de la migración. Cada fase termina actualizando la sección
> [13. Estado y bitácora](#13-estado-y-bitácora) y, si hubo una decisión nueva, la tabla de
> [4. Decisiones](#4-decisiones-de-arquitectura).

---

## Índice

1. [Objetivo, etapas y alcance](#1-objetivo-etapas-y-alcance)
2. [Punto de partida](#2-punto-de-partida)
3. [Arquitectura por etapa](#3-arquitectura-por-etapa)
4. [Decisiones de arquitectura](#4-decisiones-de-arquitectura)
5. [Tecnologías](#5-tecnologías)
6. [Estructura del repositorio](#6-estructura-del-repositorio)
7. [Etapa 1 · Frontend con capa de datos delgada](#7-etapa-1--frontend-con-capa-de-datos-delgada)
8. [Etapa 1 · Despliegue](#8-etapa-1--despliegue)
9. [Etapa 2 · Backend FastAPI como intermediario](#9-etapa-2--backend-fastapi-como-intermediario)
10. [Fases de ejecución](#10-fases-de-ejecución)
11. [Estándares de ingeniería](#11-estándares-de-ingeniería)
12. [Riesgos y mitigaciones](#12-riesgos-y-mitigaciones)
13. [Estado y bitácora](#13-estado-y-bitácora)

---

## 1. Objetivo, etapas y alcance

La migración se hace en **dos etapas**. La urgencia es que el frontend tenga forma de proyecto real, listo
para desplegarse; el backend se queda como está hasta la Etapa 2.

| | **Etapa 1 · Frontend** (ahora → 2026-12-11; antes 2026-11-13) | **Etapa 2 · Backend** (desde 2026-12-14; antes 2026-11-17) |
|---|---|---|
| Frontend | **React + TypeScript + Vite**, por funcionalidades, desplegable | se completa y cambia su capa de datos al backend, módulo por módulo |
| Acceso a datos | **directo a Supabase** (`supabase-js`) pero **solo** a través de la capa `src/datos/` | **solo a través de FastAPI** |
| Backend | **sin cambios**: Supabase con RLS, RPC, triggers, Edge Functions y pg_cron, tal como está hoy | **FastAPI** monolito modular por capas como único intermediario |
| Base de datos y archivos | Supabase (sin cambios) | Supabase (sin cambios de proveedor), esquema gobernado con Alembic |

**La pieza que une las dos etapas es la capa de datos del frontend (§7.2).** Las pantallas nunca hablan con
Supabase; hablan con contratos TypeScript. En la Etapa 2 se cambia la implementación de cada contrato
(de Supabase a la API) sin tocar las pantallas.

**Lo que NO cambia en ninguna etapa:**
- La base de datos se queda en Supabase. Los archivos se quedan en Supabase Storage (sin S3 ni MinIO).
  Las cuentas siguen en Supabase Auth.
- Las reglas de negocio: la migración es **funcionalmente equivalente**; las mejoras se hacen después.
- La cadena de auditoría SHA-256 (`audit_log`) no se altera y debe verificar `ok = true`.

---

## 2. Punto de partida

Inventario del sistema actual (versión 2.6.0) que hay que cubrir:

| Elemento | Cantidad | Dónde |
|---|---|---|
| Tablas | 26 | `supabase/01` a `20` (`cuentas_eventos` está en `10_cuentas.sql`) |
| Vistas | `v_requerimientos`, `v_cumplimiento_organismo`, `v_directorio_verificacion` | idem |
| Funciones RPC / guardas / triggers | ~45 | idem |
| Políticas RLS | todas las tablas de `public` y 3 buckets | idem |
| Edge Functions | `gestion-cuentas`, `respaldo`, `resumen-semanal` | `supabase/functions/` |
| Tareas programadas | `respaldo-semanal`, `resumen-semanal` (pg_cron → pg_net) | `15`, `17` |
| Buckets privados | `soportes`, `respaldos`, `archivo` | `01`, `17`, `20` |
| Lector de Excel de control | 2 implementaciones (Python `etl/clean.py`, JS `20-carga-excel.js`) | `etl/`, `src/js/` |
| Frontend | 21 archivos JS (~580 KB, uno de 199 KB), 14 CSS, 101 `innerHTML` | `src/` |
| Pantallas | 20 rutas, 5 roles | `docs/ARQUITECTURA.md` |

Roles: `admin`, `alcalde`, `control_interno` (supervisión), `secretario`, `enlace` (acotados a su dependencia).

---

## 3. Arquitectura por etapa

### Etapa 1 (ahora)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NAVEGADOR · PWA React + TypeScript                                      │
│                                                                          │
│   features/*  (pantallas, componentes, hooks TanStack Query)             │
│        │  solo importan contratos                                        │
│   dominio/    (reglas puras TS: semáforo, días hábiles, estadísticas,    │
│        │       temas, indicadores PM, lector del Excel)                  │
│   datos/  ◄── CAPA DELGADA: único lugar que conoce Supabase              │
│     contratos/   interfaces por módulo (RepositorioRequerimientos …)     │
│     supabase/    implementación con supabase-js + tipos generados        │
│     demo/        implementación en memoria (variante demo)               │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ supabase-js (clave pública, como hoy)
┌───────────────────────────────▼──────────────────────────────────────────┐
│  SUPABASE · SIN CAMBIOS                                                  │
│  PostgreSQL + RLS + RPC + triggers de auditoría · Auth + MFA · Storage · │
│  Edge Functions (gestion-cuentas, respaldo, resumen-semanal) · pg_cron   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Etapa 2 (desde el 2026-12-14; antes, mediados de noviembre)

```
 NAVEGADOR  features/* ─► dominio/ ─► datos/contratos ─► datos/api/ (cliente OpenAPI)
                                                              │ HTTPS + cookie httpOnly
 BACKEND    FastAPI · monolito modular (api → aplicacion → dominio ← infraestructura)
                                                              │ SQL (ce_app) · Auth · Storage
 SUPABASE   misma base, mismos usuarios, mismos buckets; Data API pública desactivada al final
```

---

## 4. Decisiones de arquitectura

Estado: ✅ tomada · 🟡 propuesta, por confirmar · ⏳ se decide en la fase indicada · ❌ descartada.
La columna **Etapa** indica cuándo aplica. Cada decisión importante tiene su ADR en `docs/migracion/adr/`.

| # | Decisión | Etapa | Estado | Justificación |
|---|---|---|---|---|
| D-01 | Backend en **Python + FastAPI** | 2 | ✅ | Pedido del proyecto. |
| D-02 | Backend como **monolito modular por capas** | 2 | ✅ | Equipo pequeño, dominio cohesionado. |
| D-03 | Frontend **React + TypeScript + Vite** | 1 | ✅ | Ver §7. |
| D-04 | ~~Prioridad base de datos + backend~~ → reemplazada por D-23 | — | ❌ | Cambio de prioridad (revisión 3). |
| D-05 | **La base de datos se queda en Supabase** | 1-2 | ✅ | Funciona bien; sin riesgo de traslado. |
| D-06 | Esquema gobernado con **Alembic** sobre la base de Supabase | 2 | 🟡 | Versionado y revisable en PR. |
| D-07 | Migración **incremental**: la 3.0 en `/v3/` convive con la 2.x | 1-2 | 🟡 | Sin apagón funcional. |
| D-08 | Invariantes y auditoría en la base, orquestación en Python | 2 | 🟡 | No se pierde ninguna protección. |
| D-09 | RLS se mantiene; el backend fija el usuario por transacción | 2 | 🟡 | Ver §9.4. |
| D-10 | **Supabase Auth se mantiene** (en Etapa 1 desde el navegador; en Etapa 2 vía backend) | 1-2 | ✅ | Los usuarios no cambian de contraseña. |
| D-11 | Proveedor de identidad externo | — | ❌ | Fuera de alcance. |
| D-12 | **Archivos en Supabase Storage**, sin S3 ni MinIO | 1-2 | ✅ | Pedido del proyecto. |
| D-13 | Worker con APScheduler reemplaza pg_cron y Edge Functions | 2 | 🟡 | Sin infraestructura extra. |
| D-14 | Lector del Excel de control: **en Etapa 1 se porta a TS** en `dominio/` con las pruebas actuales; en Etapa 2 pasa al backend (`etl/clean.py`) | 1-2 | 🟡 | Hoy funciona en el navegador; no se cambia de lugar dos veces en Etapa 1. |
| D-15 | Contrato API OpenAPI → cliente TS generado | 2 | 🟡 | El frontend no compila si el contrato cambia. |
| D-16 | Variante demo: **implementación en memoria de los contratos** (`datos/demo/`), portada del objeto `DEMO` | 1 | 🟡 | Funciona sin red y sin Supabase. |
| D-17 | Destino de la variante "privada" (HTML único con datos reales) | 1 (F2) | ⏳ | Confirmar si aún se usa. |
| D-18 | Lectura de PDF de planes en el cliente o en el backend | 2 | ⏳ | En Etapa 1 se queda en el cliente (`pdfjs-dist`). |
| D-19 | Dónde se aloja el backend | 2 | ⏳ | Depende de DATIC. |
| D-20 | **El backend es el único intermediario** entre la interfaz y Supabase | 2 | ✅ | Pedido del proyecto; aplazado a la Etapa 2. |
| D-21 | Sesión con cookie httpOnly cifrada | 2 | 🟡 | Protege los tokens contra XSS. |
| D-22 | Desactivar la Data API pública y el registro abierto al terminar | 2 | 🟡 | Cierra el acceso directo. |
| D-23 | **Etapa 1 = solo frontend; el backend se queda como está hoy hasta el 2026-12-14 (antes, mediados de noviembre; ajustado en la revisión 4)** | 1 | ✅ | Pedido del proyecto (revisión 3). |
| D-24 | **Capa de datos delgada** `src/datos/`: único lugar que importa `supabase-js`; pantallas solo usan contratos | 1 | ✅ | Pedido del proyecto ("una capa pequeña"); permite cambiar a la API sin tocar pantallas. |
| D-25 | Tipos de la base **generados** (`supabase gen types typescript`) y regenerados en la CI | 1 | 🟡 | Un cambio de esquema rompe la compilación, no producción. |
| D-26 | Despliegue de la 3.0 como sitio estático en el mismo hosting actual (GitHub Pages) bajo `/v3/` | 1 | 🟡 | Sin infraestructura nueva; se publica junto a la 2.x. |

---

## 5. Tecnologías

### Etapa 1 · Frontend
| Uso | Herramienta |
|---|---|
| Lenguaje | TypeScript (`strict`) |
| Build | Vite |
| UI | React 18 |
| Rutas | React Router |
| Datos del servidor | TanStack Query |
| Formularios y validación | React Hook Form + Zod |
| Acceso a Supabase | `@supabase/supabase-js` 2.x (solo dentro de `src/datos/supabase/`) |
| Tipos de la base | Supabase CLI: `supabase gen types typescript` |
| Configuración por ambiente | variables `VITE_*` validadas con Zod al arrancar |
| Excel | `xlsx` (SheetJS, el que ya se usa) |
| PDF | `pdfjs-dist` (el que ya se usa) |
| PWA | `vite-plugin-pwa` (Workbox) |
| Gráficos | los SVG actuales migrados a componentes; Recharts si se necesitan más |
| Calidad | ESLint + Prettier (configuración actual) + `eslint-plugin-boundaries`, `tsc --noEmit` |
| Pruebas | Vitest + Testing Library; Playwright (recorridos por rol) |
| Gestor de paquetes | npm (el que ya se usa) |

### Etapa 2 · Backend
Python 3.12 · `uv` · FastAPI + Uvicorn · Pydantic v2 · SQLAlchemy 2.0 async + `asyncpg` · Alembic · `httpx`
para Auth y Storage de Supabase · `pyjwt` · `aiosmtplib` · `openpyxl`/`xlrd`/`pandas` · `holidays` ·
APScheduler · `ruff`, `mypy --strict`, `import-linter` · `pytest` + Supabase CLI local ·
`openapi-typescript` + `openapi-fetch` en el frontend.

---

## 6. Estructura del repositorio

Monorepo. La app 2.x **no se mueve** hasta el final, para no romper la publicación vigente.

```
control-entes/
├── src/ scripts/ public/ vendor/ tests/   # app actual 2.x (sigue publicada hasta F8)
├── supabase/                              # backend actual: SIN CAMBIOS en Etapa 1
├── etl/
│
├── frontend/                              # ◄ ETAPA 1
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── .env.example                       # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VARIANTE
│   ├── public/                            # íconos, manifiesto
│   ├── src/
│   │   ├── main.tsx
│   │   ├── app/                           # rutas, Layout, proveedores, GuardaRol, manejo de errores
│   │   ├── config/entorno.ts              # lee y valida import.meta.env
│   │   ├── datos/                         # ◄ CAPA DELGADA (§7.2)
│   │   │   ├── index.ts                   # crearDatos(variante) → { auth, requerimientos, … }
│   │   │   ├── contratos/                 # interfaces y tipos por módulo
│   │   │   ├── supabase/                  # implementación real + tipos.generados.ts
│   │   │   └── demo/                      # implementación en memoria
│   │   ├── dominio/                       # reglas puras TS + pruebas
│   │   ├── features/<funcionalidad>/      # componentes/, hooks.ts, index.ts
│   │   ├── shared/ui/                     # Tabla, Modal, Semaforo, Kpi, Toast…
│   │   ├── shared/lib/                    # fechas, formato, utilidades
│   │   └── styles/                        # tokens (docs/tokens.json) y temas
│   └── e2e/                               # Playwright
│
├── backend/                               # ◄ ETAPA 2 (no se crea antes de 2026-12-14)
│
└── docs/migracion/
    ├── README.md                          # este documento
    └── adr/
```

---

## 7. Etapa 1 · Frontend con capa de datos delgada

### 7.1 Capas del frontend

```
features/  ──►  dominio/  y  datos/contratos   (las pantallas)
datos/supabase/, datos/demo/  ──►  datos/contratos  (implementaciones)
dominio/  ──►  nada (TypeScript puro)
```

| Capa | Contiene | No puede |
|---|---|---|
| `features/` | Pantallas, componentes, hooks de TanStack Query, formularios | importar `supabase-js` ni `datos/supabase/` |
| `dominio/` | Reglas puras: semáforo, oportunidad, días hábiles, estadísticas, temas, cruces, indicadores PM, lector del Excel | importar React, `datos/` ni nada del navegador |
| `datos/contratos/` | Interfaces (`RepositorioRequerimientos`) y tipos de entrada/salida del dominio | depender de Supabase |
| `datos/supabase/` | Implementación con `supabase-js`, tipos generados, traducción de errores | ser importada fuera de `datos/` |
| `datos/demo/` | Implementación en memoria con datos de `datos/demo/*.json` | ser importada fuera de `datos/` |
| `shared/` | UI genérica y utilidades sin negocio | importar `features/` |

`eslint-plugin-boundaries` y `no-restricted-imports` (prohíbe `@supabase/supabase-js` fuera de
`src/datos/supabase/`) verifican estas reglas en la CI.

### 7.2 La capa de datos

Es pequeña a propósito: no tiene lógica de negocio. Solo **traduce** entre las pantallas y Supabase.

```ts
// datos/contratos/requerimientos.ts
export interface Requerimiento { id: string; radicado: string; vigencia: number; ente: string;
  dependencia: string; fechaLimite: string; estado: 'abierto' | 'cerrado'; semaforo: Semaforo; diasRestantes: number }
export interface CierreRequerimiento { id: string; orfeo: string; fecha: string; soporte: File }

export interface RepositorioRequerimientos {
  listar(filtro: FiltroRequerimientos): Promise<Requerimiento[]>;
  crear(datos: NuevoRequerimiento): Promise<Requerimiento>;
  cerrar(cierre: CierreRequerimiento): Promise<void>;      // hoy: Storage + RPC cerrar_requerimiento
  escalar(id: string, canal: CanalAlerta): Promise<void>;  // hoy: RPC escalar_requerimiento
}
```

```ts
// datos/supabase/requerimientos.ts  (Etapa 1)
export const requerimientosSupabase = (sb: ClienteSupabase): RepositorioRequerimientos => ({
  async listar(f) {
    const { data, error } = await sb.from('v_requerimientos').select('*').eq('vigencia', f.vigencia);
    if (error) throw traducirError(error);
    return data.map(aRequerimiento);
  },
  // …
});
```

```ts
// datos/index.ts
export function crearDatos(variante: Variante): Datos {
  if (variante === 'demo') return datosDemo();
  const sb = crearClienteSupabase(entorno.supabaseUrl, entorno.supabaseAnonKey);
  return {
    auth: authSupabase(sb),
    requerimientos: requerimientosSupabase(sb),
    // En Etapa 2 se cambia línea por línea:  requerimientos: requerimientosApi(api),
  };
}
```

Las pantallas usan los datos solo a través de hooks:

```ts
// features/requerimientos/hooks.ts
export const useRequerimientos = (f: FiltroRequerimientos) => {
  const { requerimientos } = useDatos();
  return useQuery({ queryKey: ['requerimientos', f], queryFn: () => requerimientos.listar(f) });
};
```

**Contratos por módulo** (los mismos 11 módulos que tendrá el backend en la Etapa 2):

| Contrato | Envuelve hoy (Supabase) | Archivos JS actuales |
|---|---|---|
| `auth` | `auth.signInWithPassword`, MFA (`mfa.challenge/verify`), `signOut`, `resetPasswordForEmail` | 21 |
| `identidad` | `profiles`, `accesos`, Edge `gestion-cuentas` | 08, 17, 21 |
| `catalogos` | `entes`, `dependencias`, `config` | 04, 08 |
| `directorio` | `directorio`, `v_directorio_verificacion` | 10, 15 |
| `requerimientos` | `v_requerimientos`, `alertas_log`, RPC `cerrar_requerimiento`, `escalar_requerimiento` | 04, 07 |
| `historico` | `historico_requerimientos`, `historico_cargas`, RPC `cargar_historico` | 09, 10, 20 |
| `analitica` | `v_cumplimiento_organismo`, `tema_manual`, `cruce_revision`, `informes` | 09, 11, 12, 13, 16 |
| `notificaciones` | `notificaciones` | 14 |
| `planes` | tablas `pm_*`, RPC `pm_*` | 19 |
| `archivo` | Storage `soportes`, `archivo`; `archivo_documentos` | 04, 19 |
| `auditoria` | `audit_log`, RPC `verificar_cadena_auditoria`, `registrar_error_app` | 08 |
| `respaldos` | Storage `respaldos`, Edge `respaldo` | 08 |

### 7.3 Dominio en TypeScript

Lo que hoy está mezclado con las vistas se extrae a `dominio/` como funciones puras, con las pruebas
actuales portadas a Vitest:

| Regla | Origen | Pruebas actuales a portar |
|---|---|---|
| Semáforo y decoración de requerimientos vivos | 05, 09 (`decorate`, `semOf`, `SEMP`) | `tests/reglas.test.cjs` |
| Días hábiles y festivos de Colombia | 02, 10 | `tests/reglas.test.cjs` |
| Estadísticas, alcance por organismo, enmascarado de datos personales | 10 (`statsOf`, `scopeOrg`, `maskPII`, `normPhone`) | `tests/reglas.test.cjs` |
| Temas automáticos y cruces | 11 (`temasAuto`, `cruceData`) | — (crear) |
| Indicadores de planes (Formulario 14.1), calificación CGSC | 19 (`pmIndic`) | `tests/planes.test.cjs` |
| Lector de los Excel de control | 20 | `tests/excel-control.test.cjs`, `tests/paridad-etl.cjs` |
| Modelo del informe ejecutivo | 16 (`reportModel`) | — (crear) |

Regla: **ninguna función de `dominio/` cambia de resultado** respecto a la 2.x. Cada una tiene una prueba
de paridad con los mismos datos que usan las pruebas actuales.

### 7.4 Principios de la interfaz

- **Por funcionalidad** (`features/planes/…`), no por tipo de archivo.
- React escapa el HTML: se eliminan los 101 `innerHTML` y el escape manual `esc()`.
- Los estilos (`src/css/01-14`) pasan a **CSS Modules** por componente + tokens de `docs/tokens.json` como
  variables CSS; se conservan los temas actuales (incluido "sala de control").
- El `switch` de `18-acciones.js` desaparece: cada botón tiene su manejador en su componente.
- El estado global `S` se reemplaza por TanStack Query (datos del servidor), la URL (filtros, vista,
  vigencia) y estado local.
- Los permisos por pantalla de `NAV` (03) pasan a `app/rutas.tsx` con `GuardaRol`. Son cosméticos: la
  protección real sigue siendo RLS en Supabase.
- Errores no controlados → límite de error de React + `auditoria.registrarError()` (RPC `registrar_error_app`, ya existe).

### 7.5 Correspondencia con el código actual

| Actual (`src/js/`) | Destino (`frontend/src/`) |
|---|---|
| 01 configuración | `config/entorno.ts` |
| 02 utilidades | `shared/lib/` y `dominio/fechas.ts` |
| 03 estado, roles y `NAV` | `app/rutas.tsx`, `app/GuardaRol.tsx`, `dominio/roles.ts` |
| 04 capa de datos, `DEMO` | `datos/supabase/*`, `datos/demo/*` |
| 05 reglas | `dominio/semaforo.ts` |
| 06 interfaz base | `shared/ui/` (Modal, Toast, Nav, Tabbar) y `app/Layout.tsx` |
| 07 operación | `features/requerimientos/`, `features/tablero/`, `features/carga-orfeo/`, `features/alertas/` |
| 08 catálogos y seguridad | `features/catalogos/`, `features/reportes/`, `features/auditoria/`, `features/cuentas/`, `features/configuracion/` |
| 09 cumplimiento e histórico | `features/cumplimiento/`, `features/historico/` |
| 10 datos de histórico y directorio | `datos/supabase/historico.ts`, `dominio/estadisticas.ts` |
| 11 cruces y temas | `dominio/temas.ts`, `features/cruces/` |
| 12 centro de mando | `features/mando/` |
| 13 expediente | `features/dependencia/` |
| 14 notificaciones | `features/notificaciones/` |
| 15 directorio | `features/directorio/` |
| 16 informe ejecutivo | `dominio/informe.ts`, `features/informe/` |
| 17 actividad | `features/actividad/` |
| 18 acciones | se reparte en los componentes |
| 19 planes (199 KB + 57 KB) | `dominio/planes/`, `features/planes/{planes,hallazgos,acciones,avances,prorrogas,informes,importacion,papelera}/` |
| 20 carga de Excel | `dominio/excel-control/`, `features/carga-excel/` |
| 21 arranque, sesión, MFA, service worker | `main.tsx`, `features/ingreso/`, `vite-plugin-pwa` |

---

## 8. Etapa 1 · Despliegue

Objetivo: que la 3.0 se pueda publicar con un solo comando o un *merge* a `main`, igual de fácil que hoy.

| Tema | Cómo queda |
|---|---|
| Hosting | Estático, en el mismo GitHub Pages: la 2.x sigue en la raíz y la 3.0 en `/v3/` (D-26). Vite con `base: '/control-entes/v3/'` |
| Ambientes | `.env.development` (Supabase local o preproducción), `.env.production` (proyecto actual). Las variables se validan al arrancar; si falta una, la app muestra un error claro |
| Claves | Solo la clave **pública** (anon/publishable), igual que hoy. La CI rechaza una `service_role` (se porta la verificación de `scripts/build.mjs`) |
| Variante demo | `npm run build:demo` → `VITE_VARIANTE=demo`, sin Supabase, con `datos/demo/` |
| CI (`.github/workflows/frontend.yml`) | `npm ci` → `tsc --noEmit` → ESLint → Vitest → build → Playwright contra la demo → publicar en `/v3/` |
| Versionado | `package.json` del frontend con versión semántica; se muestra en la pantalla de Configuración y en el pie |
| PWA | `vite-plugin-pwa`: el service worker se versiona solo (no más `CACHE` manual en `sw.js`) y avisa "hay una versión nueva" |
| Recursos sin conexión | Fuentes e íconos como dependencias npm (`@fontsource/*`, `@fortawesome/*`) empaquetadas por Vite: no se depende de CDN |
| Calidad mínima para publicar | CI en verde; sin errores de tipos; Lighthouse PWA y accesibilidad ≥ 90 en la pantalla de ingreso y el tablero |

---

## 9. Etapa 2 · Backend FastAPI como intermediario

> Comienza **a partir del 2026-12-14** (antes 2026-11-17; ver §10). Nada de esta sección se construye en la Etapa 1. Se mantiene aquí
> para que la Etapa 1 no tome decisiones que la contradigan.

### 9.1 Principio
El backend pasa a ser el **único intermediario** (D-20). La base, los usuarios y los archivos se quedan en
Supabase. El frontend no cambia sus pantallas: solo se reemplaza, módulo por módulo, `datos/supabase/x.ts`
por `datos/api/x.ts`.

### 9.2 Capas y módulos

```
api  ──►  aplicacion  ──►  dominio  ◄──  infraestructura
```

| Capa | Contiene | No puede |
|---|---|---|
| `api/` | Routers FastAPI, esquemas Pydantic | contener reglas de negocio ni SQL |
| `aplicacion/` | Casos de uso, permisos, unidad de trabajo | importar FastAPI ni SQLAlchemy |
| `dominio/` | Entidades, reglas puras, interfaces (`Protocol`) | importar infraestructura |
| `infraestructura/` | Repositorios SQLAlchemy, adaptadores de Auth, Storage, SMTP, Excel | ser importada por `dominio/` |

Módulos (los mismos contratos de §7.2): `identidad`, `catalogos`, `directorio`, `requerimientos`,
`historico`, `analitica`, `notificaciones`, `planes`, `archivo`, `auditoria`, `respaldos`.
Mapa detallado de tablas, RPC y Edge Functions por módulo: tabla de §7.2 (columna "Envuelve hoy").

```
backend/
├── pyproject.toml · uv.lock · alembic.ini · Dockerfile
├── migrations/                     # 0001_linea_base (pg_dump de producción + alembic stamp), 0002_rol_aplicacion…
├── src/control_entes/
│   ├── main.py
│   ├── core/                       # config, db, sesion, seguridad, permisos, contexto_bd, errores,
│   │                               # supabase_auth, supabase_storage, correo, registro
│   ├── shared/                     # dias_habiles, paginacion, tipos
│   ├── modules/<modulo>/{api,aplicacion,dominio,infraestructura}/
│   └── worker/                     # APScheduler: respaldo y resumen semanal
└── tests/{unit,integracion,rls,auditoria,paridad,api}/
```

### 9.3 API
`/api/v1/<modulo>/…` · errores RFC 9457 (`problem+json`) con `codigo` estable · paginación
`{ items, total }` · OpenAPI exportado en la CI → `frontend/src/datos/api/esquema.d.ts`.

### 9.4 Seguridad
- Ingreso, MFA, renovación y cierre de sesión **a través del backend** contra Supabase Auth; cookie
  httpOnly + Secure + SameSite=Strict cifrada; cabecera anti-CSRF.
- El backend se conecta con el rol **`ce_app` sin `BYPASSRLS`** y, por transacción:
  `set_config('request.jwt.claims', '{"sub": …, "role": "authenticated"}', true)` + `set local role authenticated`.
  Así RLS, `current_rol()` y la auditoría funcionan sin cambiar el SQL.
- Conexión por el pooler de Supabase (en modo transacción: `statement_cache_size=0` en `asyncpg`).
- Archivos: el backend sube y transmite desde Supabase Storage con el token del usuario.
- Al final: Data API pública desactivada, registro abierto cerrado y claves rotadas (D-22).

### 9.5 Base de datos
- **No se traslada.** Línea base con `pg_dump --schema-only` de producción (desfase conocido: 3 funciones del script 22 tenían en
  producción espacios en líneas en blanco; el 22 las dejó iguales al repositorio), `alembic stamp` sin cambios.
- Desde ahí, todo cambio de esquema es una migración Alembic revisada en PR. Alembic solo administra `public`.
- Ambientes: Supabase CLI local y en la CI; segundo proyecto para preproducción.
- Pruebas: matriz RLS rol × tabla × operación a través del backend; cadena de auditoría recalculada en Python.

### 9.6 Tareas programadas
Worker con APScheduler y `pg_advisory_lock` reemplaza pg_cron → Edge Functions (`respaldo`, `resumen-semanal`).
Las Edge Functions se retiran cuando su módulo esté en producción.

---

## 10. Fases de ejecución

Cada fase tiene **entregables** y un **criterio de salida**. Las fechas son estimaciones para una o dos
personas y se ajustan al cerrar cada fase.

> **Calendario (revisión 4, 2026-10-30).** Festivos en Colombia considerados: 2-nov, 16-nov y 8-dic de 2026, y
> 11-ene-2027 (Reyes Magos, trasladado).
>
> **Por qué se ajustó.** La revisión 3 ponía la Etapa 1 del 2026-10-28 al 2026-11-13 y la Etapa 2 desde el
> 2026-11-17. No se cumplió porque antes de la F0 hay que cerrar los bloqueos de instalación de la 2.6.1 y el aviso
> diario de planes, se trabaja una tarea a la vez con plan y aprobación, y la F0 no estaba aprobada al 2026-10-30.
> Fechas nuevas: **Etapa 1 hasta el 2026-12-11** (antes 2026-11-13) y **Etapa 2 desde el 2026-12-14** (antes
> 2026-11-17).
>
> **Condiciones fijas:**
> - **Sin cambios en producción del 2026-12-19 al 2027-01-06**; se retoman normalmente desde el 2027-01-07. Del 14 al
>   18-dic, la Etapa 2 solo hace pasos de lectura en producción (por ejemplo, el `pg_dump --schema-only` de la F4) y
>   trabajo local.
> - **Pausa por vacaciones** de la responsable del 2026-12-23 al 2027-01-07: la Etapa 2 se detiene y sigue el
>   2027-01-07. Los pasos que cambian producción, como el `alembic stamp` de la F4, se retoman a partir del 2027-01-07.
> - **El resumen semanal y el aviso diario de planes no se encienden** hasta que DATIC autorice el piloto.
> - **El proyecto de Supabase de prueba** (para verificar los bloqueos 4 y 5) se decide antes de empezar el bloqueo 4.

#### Trabajo previo a la F0 (bloqueos de instalación de la 2.6.1)

| Orden | Tarea | Fechas planeadas | Depende de Erika | Estado |
|---|---|---|---|---|
| 1 | Bloqueo 1 · `configuracion.json` al proyecto de EE. UU. | — | — | Resuelto 2026-10-29 (commit 53cbca1) |
| 2 | Bloqueo 2 · Tareas programadas desde la bóveda (script 21) | 2026-10-29 → 10-30 | Consulta de producción y aprobación | Resuelto 2026-10-29 (commit 1a1ceee). Producción ya leía de la bóveda; el 21 no se ejecutó en producción. |
| 3 | Bloqueo 3 · `current_date` en SQL (script 22) | 2026-11-03 → 11-04 | `show timezone;`, aprobar y ejecutar el script | Resuelto 2026-11-02 (commit 0fa8da8; ejecutado y verificado en producción) |
| 4 | Bloqueo 6 · Caché del service worker con la versión publicable | 2026-11-05 | Autorizar la construcción de la demo y probar en Chrome | Resuelto 2026-11-02 (demo en localhost; sin cambios en el repositorio) |
| 5 | Bloqueo 4 · Escala decimal en el respaldo (script 23, formato 3) | 2026-11-06 → 11-10 | Crear el proyecto de prueba; desplegar la función | En curso (junto con el 5, en el proyecto de prueba) |
| 6 | Bloqueo 5 · `00_instalar_todo.sql` completo (generado) | 2026-11-11 → 11-12 | Instalarlo en el proyecto de prueba | En curso (junto con el 4) |
| 7 | Aviso diario de planes (`avisos-planes`, scripts 24 y 25) | 2026-11-13, 11-17 → 11-18 | Aprobar, desplegar y ejecutar el 24 y el 25; queda **apagado** | Escrito y probado (5-nov-2026); falta aprobar e instalar |

```
ETAPA 1 (frontend)                         ETAPA 2 (backend, desde 2026-12-14)
F0 ─► F1 ─► F2 ──────────► F3 pantallas restantes (sobre Supabase) ─────────┐
                           F4 BD bajo control ─► F5 esqueleto ─► F6 módulos ─┴► F7 cierre ─► F8 retiro
```

### Etapa 1 · Frontend

#### F0 · Preparación (adelantada: 2026-11-08 → 2026-11-10; rev. 4: 2026-11-19 → 2026-11-23)
- [ ] Repositorio git con `main` protegida y PR obligatorio (pendiente: al crear el repositorio en GitHub).
- [x] `frontend/` con Vite + React + TypeScript strict, ESLint/Prettier actuales, Vitest.
- [x] Reglas de fronteras (§7.1) activas en ESLint (y comprobadas por `frontend/pruebas/fronteras.test.ts`).
- [ ] CI `frontend.yml` (tipos, lint, pruebas, build) en verde; la CI de la 2.x sigue igual (escrita en
      `.github/workflows/frontend.yml` y probada en el equipo; falta verla en verde en GitHub).
- [x] La tarea `.github/workflows/frontend.yml` (en lugar de una plantilla en `frontend/ci/`) corre las pruebas en **dos zonas horarias**, `TZ=UTC` y
      `TZ=America/Bogota`: las del frontend y las de la 2.x (`node tests/ejecutar-pruebas.cjs`). Decidido en la tarea
      2.6.2 (28-oct-2026), donde una prueba fallaba solo con la hora de Colombia.
- [x] ADR 0001 (D-03), 0002 (D-23), 0003 (D-24) en `docs/migracion/adr/`.

**Salida:** `npm run dev` levanta una página vacía con la CI en verde.

#### F1 · Cimientos (2026-11-24 → 2026-12-02; antes 2026-11-03 → 2026-11-06)
- [x] `config/entorno.ts` con validación; `.env.example` (2026-11-08; validación a mano, sin Zod, hasta aprobar dependencias;
      rechaza claves secretas).
- [ ] Tipos generados de Supabase (`datos/supabase/tipos.generados.ts`) y script `npm run tipos:bd`.
- [x] `datos/`: `crearDatos`, contratos `auth`, `identidad`, `catalogos`; implementaciones Supabase y demo (2026-11-08: contratos,
      `crearDatos` y demo hechos con pruebas en `frontend/pruebas/datos-demo.test.ts`; 2026-11-09: implementación Supabase con
      `@supabase/supabase-js` 2.118.0, probada con un cliente simulado en `frontend/pruebas/datos-supabase.test.ts`; falta
      la prueba con la base real, junto con Erika).
- [ ] Ingreso con verificación en dos pasos, cierre de sesión y restablecimiento de contraseña (2026-11-08: pantalla y
      recorridos hechos en demo, `src/app/App.test.tsx`; falta la implementación Supabase).
- [x] `app/`: Layout, navegación y barra de pestañas por rol, `GuardaRol`, límite de errores (2026-11-08/09: marco y menú por
      rol con paridad con NAV de la 2.x, barra del celular con 3 accesos y "Más", pantallas ajenas al rol llevan a la
      inicial, `LimiteErrores`).
- [x] `shared/ui/` base: Botón, Tarjeta, Kpi, Tabla, Modal, Toast, Semáforo, Vacío; tokens y temas (2026-11-09: todos los
      componentes hechos con pruebas en `shared/ui/ui.test.tsx`; temas claro y oscuro con los colores de `docs/tokens.json`, automático según el equipo
      o elegido con el botón "Tema").
- [x] `dominio/`: semáforo, días hábiles, roles con sus pruebas portadas (adelantado el 2026-11-08: `fechas.ts`,
      `dias-habiles.ts`, `semaforo.ts`, `roles.ts`; paridad con el código real de la 2.x en `frontend/pruebas/paridad-2x.test.ts`:
      festivos 2020-2035, cada día de 2024-2031 y el semáforo con umbrales 1, 5 y 30, en UTC y America/Bogota).
- [x] PWA con `vite-plugin-pwa`; fuentes e íconos empaquetados (2026-11-10: vite-plugin-pwa 2.0.0; guarda solo la
      aplicación, nunca respuestas de Supabase; probado en Edge: abre e ingresa en demo sin internet).
- [ ] Publicación automática en `/v3/` (demo y real).

**Salida:** un usuario real inicia sesión en `/v3/`, ve el menú de su rol y la versión demo funciona sin red.

#### F2 · Primeras pantallas (2026-12-03 → 2026-12-11, sin el 8-dic; antes 2026-11-09 → 2026-11-13)
- [ ] Contratos `historico`, `directorio`, `auditoria` (Supabase + demo).
- [ ] `dominio/estadisticas.ts` (`statsOf`, `scopeOrg`, `maskPII`) con pruebas de paridad.
- [ ] Pantallas: **Directorio**, **Histórico** (con detalle), **Cumplimiento**, **Auditoría** (con verificación de la cadena), **Actividad**.
- [ ] Playwright: ingreso y recorrido de esas pantallas por rol (supervisión y secretario).
- [ ] Decidir D-17 (variante privada).
- [ ] Revisión con usuarios piloto.

**Salida:** la 3.0 publicada en `/v3/` con 5 pantallas reales, probadas y aprobadas por el piloto.

### Etapa 2 · Backend (desde 2026-12-14, pausa del 2026-12-23 al 2027-01-07) y resto del frontend

#### F3 · Pantallas restantes sobre Supabase (en paralelo con F4-F6)
- [ ] Ola A: Mando, Dependencia, Cruces (`dominio/temas.ts`), Informe ejecutivo (`dominio/informe.ts`), Entes/Dependencias.
- [ ] Ola B: Requerimientos, Tablero, Carga ORFEO, Alertas, Notificaciones, Carga de Excel (`dominio/excel-control/` con `tests/excel-control.test.cjs` y paridad ETL).
- [ ] Ola C: Planes de mejoramiento completo (`dominio/planes/` con `tests/planes.test.cjs`).
- [ ] Ola D: Cuentas, Configuración, Reportes, Respaldos.

**Salida:** la 3.0 cubre las 20 rutas; la 2.x se puede retirar de la raíz.

#### F4 · Base de datos bajo control
- [ ] `pg_dump --schema-only` de producción, comparación con `supabase/01-20`, resolución de diferencias.
- [ ] Alembic `0001_linea_base` + `alembic stamp` en producción; Supabase CLI local y en la CI.
- [ ] Prueba: Supabase vacío → `upgrade head` = esquema de producción; cadena de auditoría verificada en la CI.

#### F5 · Esqueleto del backend
- [ ] FastAPI con `core/`, rol `ce_app` (`0002_rol_aplicacion`), contexto de usuario por transacción.
- [ ] Módulo `identidad` (ingreso, MFA y sesión por cookie) y `auditoria` como módulos de referencia.
- [ ] Suite RLS a través del backend; OpenAPI → `frontend/src/datos/api/`.
- [ ] Decidir D-19 (alojamiento) y desplegar en preproducción.

#### F6 · Módulos del backend y cambio de la capa de datos
Por cada módulo, en este orden: `catalogos`, `directorio`, `historico`, `analitica`, `archivo`,
`requerimientos`, `notificaciones`, `planes`, `respaldos`:
- [ ] Casos de uso + pruebas de dominio, integración, RLS y paridad.
- [ ] `datos/api/<modulo>.ts` implementa el contrato; se cambia en `crearDatos`; Playwright en verde.
- [ ] Worker reemplaza `respaldo` y `resumen-semanal`; se retiran las Edge Functions y pg_cron.

**Salida:** `crearDatos` ya no usa `datos/supabase/`; `supabase-js` desaparece del frontend.

#### F7 · Cierre del acceso directo
- [ ] Una semana de registros sin uso de la Data API por clientes.
- [ ] Desactivar la Data API pública, cerrar el registro abierto, rotar claves.
- [ ] Playwright falla si el navegador hace peticiones a `*.supabase.co`.

#### F8 · Retiro del legado
- [ ] Retirar la 2.x (`src/`, `scripts/build.mjs`, `public/`, `vendor/`), `etl/` y `supabase/functions/`.
- [ ] Mover `supabase/*.sql` a `docs/historico/`; actualizar toda la documentación de `docs/`.

---

## 11. Estándares de ingeniería

**Código**
- TypeScript: `strict: true`, sin `any` explícito, ESLint + Prettier con la configuración actual, fronteras
  entre capas verificadas en la CI.
- Python (Etapa 2): `ruff`, `mypy --strict`, `import-linter`.
- Nombres de dominio en español, como el código actual.

**Pruebas (umbral para aprobar un PR)**
- `dominio/` del frontend: cobertura ≥ 90 %, con paridad respecto a la 2.x.
- Cada implementación de `datos/` tiene pruebas contra la demo; las de Supabase, contra Supabase local cuando exista (F4).
- Cada pantalla tiene al menos un recorrido Playwright por rol que la usa.
- Etapa 2: toda tabla con RLS tiene casos por rol; toda RPC reemplazada tiene prueba de paridad.

**Flujo de trabajo**
- Ramas `tipo/descripcion-corta`; commits con *Conventional Commits* (`feat(historico): …`).
- PR con revisión y CI en verde; ningún cambio directo en `main` ni en la base de producción.
- Versionado semántico; `CHANGELOG.md` por versión.
- En Etapa 1 **no se modifica el backend** (`supabase/`). Si una pantalla necesita un cambio de esquema, se
  registra en la bitácora y se resuelve con un script nuevo numerado, como hasta hoy, hasta que exista Alembic (F4).

**ADR** (`docs/migracion/adr/NNNN-titulo.md`)
```
# NNNN · Título
Estado: propuesta | aceptada | reemplazada por NNNN
Fecha: AAAA-MM-DD
## Contexto
## Decisión
## Consecuencias
## Alternativas consideradas
```

**Definición de terminado** de una pantalla: componentes + contrato de datos (Supabase y demo) + reglas en
`dominio/` con pruebas + Playwright por rol + aprobada en el piloto + fila en la bitácora.

---

## 12. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Plazo de la Etapa 1 (16 días hábiles para F0-F2, desde el 2026-11-19) | Alto | Alcance acotado a F0-F2 (cimientos + 5 pantallas); el resto sigue en F3 sin bloquear el backend |
| Sin proyecto de Supabase de prueba | Medio | Se decide antes del bloqueo 4; sin él, los bloqueos 4 y 5 se verifican con datos ficticios y el calendario puede correrse 2 a 3 días |
| Sin repositorio en GitHub para la F0 ("main protegida") | Medio | La F0 puede avanzar sin ese punto y completarlo cuando exista el repositorio de la Alcaldía |
| Piloto no autorizado por DATIC al cerrar la F2 | Medio | La revisión con usuarios piloto de la F2 queda pendiente; no bloquea el inicio de la Etapa 2 |
| Diferencias de cálculo al portar reglas a TS | Alto | Pruebas de paridad con los mismos datos de las pruebas actuales; la 2.x sigue disponible para comparar |
| Una pantalla importa Supabase directamente y rompe la Etapa 2 | Alto | Regla ESLint que lo prohíbe fuera de `datos/supabase/`, verificada en la CI |
| Cambio de esquema que rompe la 3.0 | Medio | Tipos generados; `npm run tipos:bd` en la CI falla si el esquema cambió sin regenerar |
| Módulo de planes demasiado grande | Medio | Ola C propia, dividido en submódulos, cuando el patrón ya está probado |
| Dos versiones de la app conviviendo | Medio | Misma base y mismos usuarios; la 3.0 en `/v3/`; congelar funcionalidades nuevas en la 2.x salvo correcciones |
| Clave pública de Supabase visible en el navegador (igual que hoy) | Medio | Aceptado en Etapa 1: la protección es RLS. Se elimina en F7 |
| Romper la cadena de auditoría | Crítico | La Etapa 1 no toca la base; en la Etapa 2, auditoría en triggers sin cambios y verificación en la CI |
| Dependencia de DATIC para alojar el backend | Bajo | Solo bloquea el paso a producción del backend (F5-F7) |

---

## 13. Estado y bitácora

### Fase actual

| Etapa | Fase | Estado | Inicio | Fin | Fechas anteriores (rev. 3) |
|---|---|---|---|---|---|
| 1 | Trabajo previo: bloqueos 2.6.1 y aviso diario | 🔵 en curso | 2026-10-29 | (2026-11-18) | — |
| 1 | F0 Preparación | 🔵 en curso (adelantada) | 2026-11-08 | (2026-11-10) | 2026-10-28 → 10-30; rev. 4: 2026-11-19 → 11-23 |
| 1 | F1 Cimientos del frontend | ⬜ | (2026-11-24) | (2026-12-02) | 2026-11-03 → 11-06 |
| 1 | F2 Primeras pantallas | ⬜ | (2026-12-03) | (2026-12-11) | 2026-11-09 → 11-13 |
| 2 | F3 Pantallas restantes | ⬜ | (2026-12-14) | | 2026-11-17 |
| 2 | F4 Base de datos bajo control | ⬜ | (2026-12-14) | | 2026-11-17 |
| 2 | F5 Esqueleto del backend | ⬜ | | | |
| 2 | F6 Módulos del backend | ⬜ | | | |
| 2 | F7 Cierre del acceso directo | ⬜ | | | |
| 2 | F8 Retiro del legado | ⬜ | | | |

Leyenda: ⬜ no iniciada · 🔵 en curso · ✅ terminada · ⛔ bloqueada. Fechas entre paréntesis = planeadas.
Pausa: 2026-12-23 → 2027-01-07. Sin cambios en producción del 2026-12-19 al 2027-01-06.

### Bitácora

| Fecha | Fase | Evento / decisión |
|---|---|---|
| 2026-10-27 | — | Plan creado. Decisiones tomadas: D-01 FastAPI, D-02 monolito modular por capas, D-03 React + TypeScript + Vite, D-04 prioridad a la base de datos y el backend. |
| 2026-10-27 | — | Revisión 2: la base se queda en Supabase (D-05), los archivos en Supabase Storage sin S3/MinIO (D-12), Supabase Auth se mantiene (D-10), el backend será el único intermediario (D-20). Se descarta el proveedor de identidad externo (D-11). |
| 2026-10-27 | — | Revisión 3: **cambio de prioridad**. Etapa 1 = solo frontend, conectado directo a Supabase mediante una capa de datos delgada (D-23, D-24); el backend se queda como está. La Etapa 2 (FastAPI) empieza el 2026-11-17. D-04 queda reemplazada. |
| 2026-10-30 | — | **Revisión 4: calendario ajustado** (aprobado por Erika el 2026-10-29). Etapa 1 hasta el 2026-12-11 (antes 2026-11-13); Etapa 2 desde el 2026-12-14 (antes 2026-11-17). Motivo: antes de la F0 se cierran los bloqueos de instalación de la 2.6.1 y el aviso diario de planes; se trabaja una tarea a la vez con aprobación; la F0 no estaba aprobada. Orden: bloqueos 2 a 6, aviso diario de planes, F0. Bloqueo 1 resuelto el 2026-10-29 (53cbca1) y bloqueo 2 el 2026-10-29 (1a1ceee). Condiciones: sin cambios en producción del 2026-12-19 al 2027-01-06 (se retoman desde el 2027-01-07); vacaciones del 2026-12-23 al 2027-01-07, con la Etapa 2 en pausa; festivo 2027-01-11; el resumen semanal y el aviso diario no se encienden hasta que DATIC autorice el piloto; el proyecto de Supabase de prueba se decide antes del bloqueo 4. |
| 2026-11-08 | F0 | **F0 adelantada** (aprobada por Erika el 2026-11-08): se presenta el 2026-11-10. Se hace en paralelo con el traslado a GitHub; el aviso diario se instala después (queda apagado hasta que DATIC autorice el piloto). Bloqueos 4 y 5 probados en `control-entes-prueba` y 23 + funciones `respaldo` y `resumen-semanal` en producción el 2026-11-07. Hecho en la rama `feat/f0-preparacion`: `frontend/` con React 18.3.1, TypeScript 5.8.3 estricto, Vite 6.3.5, Vitest 3.2.4, ESLint 9.29.0 con `eslint-plugin-boundaries` 5.0.1 (reglas de §7.1 comprobadas por `frontend/pruebas/fronteras.test.ts`), CI `.github/workflows/frontend.yml` en UTC y America/Bogota (frontend y 2.x) y ADR 0001-0003. Falta: `main` protegida, al existir el repositorio en GitHub. |
