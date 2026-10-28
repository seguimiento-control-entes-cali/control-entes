# Seguridad

- **Separación por dependencia:** la hacen las políticas RLS de PostgreSQL (`supabase/01` a `09`). Un secretario
  o director solo recibe del servidor los registros de su dependencia, aunque use las herramientas del navegador.
- **Claves:** la app solo contiene la URL y la clave pública (anon), públicas por diseño. La `service_role` nunca
  va en la app ni en el repositorio; `scripts/build.mjs` se niega a construir si la detecta.
- **Datos reales:** solo en Supabase y en `datos_privados/` (excluida de git). La variante `privada` es un archivo
  local de presentación: no tiene inicio de sesión real, no se publica ni se reenvía.
- **Datos personales de ciudadanos:** `maskPII` oculta nombres y documentos en listas, informes, exportaciones y
  en la pantalla de cruces (un documento citado se muestra como "C.C. terminada en 123"). Los mensajes de
  WhatsApp y correo no incluyen el asunto de los requerimientos.
- **Auditoría inmutable:** cada cambio en tablas sensibles queda en `audit_log` con cadena SHA-256; los triggers
  impiden modificarla o borrarla. La firma de quién hizo cada cambio la pone el servidor, no la app.
- **Decisiones humanas** (tema manual, confirmación o descarte de cruces): solo Super administrador, Alcalde y Control Interno.
- **Cuentas:** se crean por invitación (cada persona define su contraseña; nadie más la conoce). Solo correos
  @cali.gov.co. Al cambiar el titular de una dependencia, la cuenta pasa al correo nuevo y la contraseña anterior
  queda invalidada. Cada acción queda en `cuentas_eventos` y en la auditoría. La función que lo hace verifica en el
  servidor que quien la llama es Super administrador activo.
- **Contraseñas:** mínimo 10 caracteres con letras y números; cualquier usuario puede cambiar la suya desde el ícono
  de llave del menú, y recuperarla desde "¿Olvidaste tu contraseña?" en la pantalla de ingreso.
