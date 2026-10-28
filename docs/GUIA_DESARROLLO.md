# Guía de desarrollo

## Preparar el equipo

1. Instalar [Node.js 18 o superior](https://nodejs.org) y [Visual Studio Code](https://code.visualstudio.com).
2. Abrir la carpeta del repositorio en VS Code y aceptar las extensiones recomendadas (Prettier, ESLint, EditorConfig).
3. En una terminal dentro de la carpeta:

```bash
npm install
npm run dev
```

4. Abrir http://localhost:5173. La app arranca en modo demostración con datos ficticios; arriba aparece
   **"Ver como"** para probar cada rol. Al guardar cualquier archivo de `src/` el navegador se recarga solo.

Para trabajar contra la base real: llenar `configuracion.json` y ejecutar `npm run dev -- --variante institucional`.

## Reglas de oro

1. **Se edita `src/`, nunca el archivo publicado.** `dist/` y `build/` se regeneran en cada construcción.
2. **Los permisos reales están en Supabase.** Ocultar un botón no protege nada: toda restricción nueva se
   implementa en las políticas RLS de `supabase/` y, además, en la interfaz.
3. **Nada de datos reales en el repositorio.** Solo en `datos_privados/` (excluido de git) o en Supabase.
4. **Antes de entregar un cambio:** `npm run formato && npm run lint && npm test` (lo mismo corre GitHub en cada envío).
5. **Al publicar una versión nueva**, subir el número de `version` en `package.json` y el nombre de `CACHE`
   en `public/sw.js`; así los celulares que tienen la app instalada descargan la actualización.

## Cómo está organizado el código

Ver el mapa completo en [ARQUITECTURA.md](ARQUITECTURA.md). Resumen:

- **Estilos**: `src/css/01…13`. El archivo `13-tablero-solido.css` (versión 2.1) se carga al final: superficies sólidas, colores del semáforo (`--sem-*`) y tablero de teclas del centro de mando. El archivo `11-tema-sala-de-control.css` define el tema oscuro y sobrescribe
  colores de los anteriores; si un color no cambia al editar `01-base-y-variables.css`, revisa el 11.
- **Lógica**: `src/js/01…19`, unidos en un mismo ámbito. Cada archivo empieza con un encabezado que dice qué
  contiene y de qué depende.
- **Botones**: no se usan `onclick`. Cada botón lleva `data-act="nombreAccion"` (y datos extra en `data-*`); un
  único manejador en `18-acciones.js` decide qué hacer con un `switch`.
- **Pantallas**: cada una es una función `vNombre(c)` que recibe el contenedor `c` y escribe su HTML.
- **Texto dinámico**: todo lo que viene de datos se escapa con `esc()` antes de insertarlo en HTML, y los
  asuntos de requerimientos pasan además por `maskPII()` (oculta nombres y documentos de ciudadanos).

## Recetas

### Agregar una pantalla

1. Escribir la función en el archivo del módulo correspondiente. Si se prefiere un archivo nuevo, debe tener
   número de dos dígitos y quedar **antes** de `21-arranque.js`, que siempre es el último porque arranca la app
   (por ejemplo, renombrar `21-arranque.js` a `22-arranque.js` y crear `21-mi-modulo.js`, como se hizo con
   `19-planes-de-mejoramiento.js` y `19-planes-norma-y-memoria.js`). Los botones de un módulo pueden atenderse en su propio archivo con un prefijo
   de `data-act` (así lo hace `pmAct` con los que empiezan por `pm`).

```js
function vMiPantalla(c) {
  c.innerHTML = `<div class="card"><h3>Mi pantalla</h3><div class="sub">${esc(algunTexto)}</div></div>`;
}
```

2. En `src/js/03-estado-y-permisos.js`, agregar el ítem al grupo que corresponda de `NAV` y su título en `TITLES`:

```js
{ id: 'mipantalla', label: 'Mi pantalla', icon: 'fa-star', roles: SUPERV },
// …
mipantalla: ['Mi pantalla', 'Descripción corta que aparece bajo el título'],
```

3. En `src/js/06-interfaz-base.js`, función `render`, agregar `mipantalla: vMiPantalla` al objeto de vistas.
4. Si la pantalla usa el selector de vigencia de la barra superior (filtra el módulo operativo), agregarla a
   `VISTAS_CON_VIGENCIA` en el mismo archivo. Por defecto el selector no aparece.

### Agregar un botón con una acción

```js
// En la vista:
`<button class="btn" data-act="marcarRevisado" data-id="${r.id}">Marcar como revisado</button>`
// En src/js/18-acciones.js, dentro del switch:
case 'marcarRevisado': {
  try { await db.algo(t.dataset.id); toast('Marcado'); render(); } catch (e) { toast(e.message, 'err'); }
  break;
}
```

`t` es el elemento pulsado; sus atributos `data-*` están en `t.dataset`.

### Cambiar quién ve una pantalla

Editar el arreglo `roles` del ítem en `NAV` (`ALL`, `SUPERV` o una lista explícita). Si la pantalla lee o escribe
datos nuevos, ajustar también la política RLS de la tabla en `supabase/`.

### Agregar un rol

1. `ROLES` en `src/js/02-utilidades.js` (nombre visible).
2. `NAV` en `src/js/03-estado-y-permisos.js` (qué pantallas ve).
3. Base de datos: la restricción `check (rol in (...))` de `profiles` en `supabase/01_schema.sql` y las políticas
   que usan `current_rol()` en los scripts `01` a `08`. Crear un script nuevo `09_...sql` con los cambios.

### Cambiar el semáforo

Umbrales en `SEMP` (`src/js/09-cumplimiento-e-historico.js`) **y** en la vista `v_cumplimiento_organismo`
(`supabase/03_historico.sql`). Deben coincidir; las pruebas de `tests/reglas.test.cjs` validan los de la app.

### Ajustar la clasificación por temas o los cruces

Todo está en `src/js/11-cruces-y-temas.js`:

- `TEMA_DEF`: temas y sus patrones (expresiones regulares sobre el asunto sin tildes y en minúsculas).
- `TEMA_PESO`: los temas generales (servicios, administrativo) pesan menos que uno específico.
- `TEMA_SUST`: temas que generan alertas de "mismo tema, varios entes".
- `idsOf` y `RX_*`: identificadores que producen un cruce exacto (contrato, proceso, IUS/IUC, PRF, SINPROC, radicado, cédula).

Si se agrega un tema, agregarlo también a la restricción `check` de `tema_manual` en un script SQL nuevo, y
agregar casos a `tests/reglas.test.cjs`. Después de cualquier cambio de reglas, revisar una muestra de
clasificaciones reales con la versión privada.

### Cambiar colores o tipografía

Variables en `src/css/01-base-y-variables.css` y, para el tema oscuro, en `src/css/11-tema-sala-de-control.css`; los colores del semáforo, en `src/css/13-tablero-solido.css`.
Los tokens de diseño también están en `docs/tokens.json` (para una futura app nativa).

### Cambiar la conexión a Supabase o el remitente de correos

Solo `configuracion.json`. No hay que tocar código.

## Pruebas

| Prueba | Comando | Qué valida |
|---|---|---|
| Reglas de negocio | `npm test` | Semáforo, estadísticas, celulares, datos personales, directorio, temas y cruces (34 verificaciones) |
| Revisión estática | `npm run lint` | Variables no definidas, código inalcanzable, claves duplicadas, variables sin uso |
| Formato | `npm run formato:revisar` | Estilo uniforme (Prettier) |
| Extremo a extremo | ver `tests/e2e/recorrido.py` | Abre cada pantalla con cada rol y pulsa cada botón; falla si hay un error de JavaScript |

Para la prueba de extremo a extremo:

```bash
pip install playwright && python -m playwright install chromium
node scripts/build.mjs --variante demo --pruebas --salida build/e2e/index.html
python tests/e2e/recorrido.py build/e2e/index.html
```

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| La app publicada abre en "modo demostración" | `configuracion.json` sin `supabaseUrl` o `supabaseAnonKey`. Llenarlos y volver a publicar |
| Un usuario no ve nada de su dependencia | El nombre de su dependencia en `dependencias` no coincide con el del histórico. Ejecutar `select * from v_directorio_verificacion;` |
| Los cambios no aparecen en el celular | No se cambió `CACHE` en `public/sw.js`. Cambiarlo y volver a publicar |
| `npm run build` dice que falta un marcador | Se borró `{{…}}` de `src/index.html`. Cada marcador debe aparecer una vez |
| ESLint marca `no-undef` | Se usa una función o variable que no existe en ningún archivo de `src/js/` (revisar nombre) |
