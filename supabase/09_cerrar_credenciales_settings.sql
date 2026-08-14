-- ============================================================
-- FASE 9: Sacar las credenciales de la tabla settings
-- Proyecto: SUM Transportes
-- Fecha: 2026-08-14
--
-- PROBLEMA 1: `settings` guardaba admin_user y admin_pass en texto plano.
-- PROBLEMA 2: la política "driver_select" de la fase 04 da SELECT sobre la
--             tabla ENTERA, así que el móvil de cada repartidor se descargaba
--             la contraseña de administración en cada arranque.
--
-- La aplicación ya no lee ni escribe esas claves (la contraseña de admin la
-- gestiona Supabase Auth), así que se pueden borrar sin romper nada.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Borrar las credenciales guardadas en claro
-- ────────────────────────────────────────────────────────────
DELETE FROM public.settings WHERE key IN ('admin_user', 'admin_pass');

-- ────────────────────────────────────────────────────────────
-- 2. Acotar la lectura del repartidor sobre settings
-- ────────────────────────────────────────────────────────────
-- Se mantiene la lectura amplia (el panel del repartidor necesita rutas,
-- alertas, aprendizaje de rutas, preferencias...), pero se excluyen las
-- claves sensibles. Es una lista de exclusión y no una lista blanca a
-- propósito: así no se rompe ninguna clave existente ni las que se añadan
-- después. Los comodines cubren de oficio cualquier secreto futuro cuyo
-- nombre contenga pass/secret/token/key/credential.
DROP POLICY IF EXISTS "driver_select" ON public.settings;

CREATE POLICY "driver_select"
  ON public.settings FOR SELECT
  USING (
    get_user_role() = 'driver'
    AND key NOT IN ('admin_user', 'admin_pass')
    AND key !~* '(pass|secret|token|credential)'
    AND key !~* '_key$'
  );

-- ────────────────────────────────────────────────────────────
-- 3. Lo mismo para el cliente, por si alguna vez se le da lectura
-- ────────────────────────────────────────────────────────────
-- Hoy el rol 'client' no tiene ninguna política SELECT sobre settings
-- (ver fase 04), así que esto no cambia nada. Se deja anotado para que
-- quien añada esa política en el futuro copie el filtro y no la tabla entera.

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _credenciales INTEGER;
BEGIN
  SELECT count(*) INTO _credenciales
    FROM public.settings
   WHERE key IN ('admin_user', 'admin_pass');

  RAISE NOTICE '══════════════════════════════════════';
  IF _credenciales = 0 THEN
    RAISE NOTICE '✅ No quedan credenciales en settings';
  ELSE
    RAISE WARNING '⚠️ Siguen existiendo % filas de credenciales', _credenciales;
  END IF;
  RAISE NOTICE '══════════════════════════════════════';
END $$;

-- Comprobación manual: esta consulta, ejecutada con la sesión de un
-- repartidor, no debe devolver ninguna fila de credenciales.
--   SELECT key FROM public.settings ORDER BY key;
