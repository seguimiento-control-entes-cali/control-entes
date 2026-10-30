-- =====================================================================
-- 15 · Programar el resumen semanal (lunes 7:00 a. m., hora de Colombia)
-- YA NO PROGRAMA NINGUNA TAREA. La programación se hace con supabase/21_programar_tareas_boveda.sql,
-- que lee la dirección y la clave de la bóveda (Vault) y deja el resumen semanal desactivado.
-- Este script tenía escrita la dirección fija del proyecto anterior y una clave para reemplazar a mano;
-- ejecutarlo habría reprogramado la tarea hacia ese proyecto. Se conserva el número para no romper el orden.
-- Se puede ejecutar sin riesgo: solo muestra este aviso.
-- =====================================================================
select 'El script 15 ya no programa tareas: use supabase/21_programar_tareas_boveda.sql' as aviso;
