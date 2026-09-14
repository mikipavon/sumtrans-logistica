-- ============================================================================
-- 29. NINGUNA FICHA VUELVE A GUARDAR CONTRASEÑAS
-- ============================================================================
--
-- EL PROBLEMA
--
-- Al subir nóminas salía "no se pudo crear su cuenta de acceso: Password is
-- known to be weak". La pantalla mandaba la ficha entera del conductor, y la
-- ficha llevaba dentro su contraseña en claro: el guardado la tomó por una
-- contraseña nueva e intentó rehacer la cuenta.
--
-- Las contraseñas seguían ahí porque la fase 16 (que las pasa a huella y las
-- borra) se preparó el 21/08/2026 pero no se ejecutó en Supabase hasta el
-- 14/09/2026. La app lleva desde el 21/08 sin escribirlas, pero cada guardado de
-- una ficha entera (el GPS del repartidor, una entrega) volvía a copiar lo que
-- ya había.
--
-- LO QUE HACE ESTE SCRIPT
--
--   1. Una regla en la base de datos que quita `password` de la ficha en cada
--      alta o guardado de conductores y clientes. No depende de la app: un móvil
--      que lleve la app abierta desde antes de la fase 16 tiene las fichas viejas
--      en memoria y, sin esto, las volvería a escribir con la contraseña.
--   2. Repasa las fichas por si alguna se volvió a escribir con contraseña entre
--      la fase 16 y este script.
--
-- ORDEN: SIEMPRE DESPUÉS DE LA FASE 16
--
-- La fase 16 guarda la huella de cada contraseña ANTES de borrarla; es lo que deja
-- entrar a un conductor que aún no tiene cuenta. Si esto fuera antes, borraría
-- contraseñas sin huella. Por eso el script se para solo si no encuentra la tabla
-- de huellas.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run, justo después de la fase 16.
--   Idempotente: se puede repetir.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.legacy_passwords') IS NULL THEN
    RAISE EXCEPTION 'Falta la fase 16: ejecuta antes supabase/16_contrasenas_con_huella.sql. No se ha cambiado nada.';
  END IF;
END $$;

-- 1. La regla ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.quitar_contrasena_de_la_ficha()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.data IS NOT NULL AND jsonb_typeof(NEW.data) = 'object' THEN
    NEW.data := NEW.data - 'password';
  END IF;
  -- Sólo conductores tienen la columna vieja `password` (vacía desde la fase 16).
  IF TG_TABLE_NAME = 'drivers' THEN
    NEW.password := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- No es llamable por API: el disparador no necesita que nadie tenga EXECUTE.
REVOKE ALL ON FUNCTION public.quitar_contrasena_de_la_ficha() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS quitar_contrasena ON public.drivers;
CREATE TRIGGER quitar_contrasena
  BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.quitar_contrasena_de_la_ficha();

DROP TRIGGER IF EXISTS quitar_contrasena ON public.clients;
CREATE TRIGGER quitar_contrasena
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.quitar_contrasena_de_la_ficha();

-- 2. Lo que se hubiera vuelto a escribir desde la fase 16 ─────────────────────
-- Basta con tocar la fila: la regla de arriba hace el resto. El aviso en tiempo
-- real que sale de este guardado limpia además la ficha en las apps abiertas.
UPDATE public.drivers SET data = data
 WHERE nullif(password, '') IS NOT NULL OR jsonb_exists(data, 'password');

UPDATE public.clients SET data = data
 WHERE jsonb_exists(data, 'password');

-- 3. Comprobación ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  _drv INTEGER;
  _cli INTEGER;
BEGIN
  SELECT count(*) INTO _drv FROM public.drivers
   WHERE nullif(password, '') IS NOT NULL OR jsonb_exists(data, 'password');
  SELECT count(*) INTO _cli FROM public.clients
   WHERE jsonb_exists(data, 'password');

  IF _drv > 0 OR _cli > 0 THEN
    RAISE EXCEPTION 'Siguen con contraseña: % conductores, % clientes', _drv, _cli;
  END IF;

  RAISE NOTICE 'OK: ninguna ficha guarda contraseña, y ya no puede volver a guardarla';
END $$;

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) Las dos reglas están puestas:
--
-- SELECT event_object_table, trigger_name FROM information_schema.triggers
-- WHERE trigger_name = 'quitar_contrasena';
--
-- 2) Ninguna ficha con contraseña (tiene que dar 0 y 0):
--
-- SELECT (SELECT count(*) FROM public.drivers
--          WHERE nullif(password,'') IS NOT NULL OR jsonb_exists(data,'password')) AS conductores,
--        (SELECT count(*) FROM public.clients WHERE jsonb_exists(data,'password')) AS clientes;
-- ============================================================================
