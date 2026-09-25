-- ============================================================================
-- 34. LO REVISADO SE QUEDA REVISADO
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-24
-- ============================================================================
--
-- EL PROBLEMA
--
-- Un albarán con observaciones o con 5 bultos o más sale en Notificaciones
-- Albaranes. La oficina lo revisa, pulsa Revisado, y desaparece. Al día
-- siguiente el repartidor lo entrega y el albarán vuelve a aparecer en la
-- lista, ya como Entregado.
--
-- Revisado no es más que la marca `notificationDismissed: true` dentro del
-- JSON del albarán (`shipments.data`). Y cada aparato graba ese JSON ENTERO
-- con la copia que tiene en memoria: la entrega del móvil, la cola offline
-- cuando vuelve la cobertura, una edición desde la oficina. Si esa copia es
-- anterior al Revisado (el móvil sólo se entera por Realtime, y Realtime se
-- cae al bloquear el móvil o al pasar de wifi a datos; la vigilancia de cada
-- 15 s compara sólo el estado, y Revisado no cambia el estado), la grabación
-- pisa la fila sin la marca y el albarán resucita en Notificaciones.
--
-- LO QUE HACE ESTE SCRIPT
--
-- Una regla en la base de datos: si la fila que había ya estaba marcada como
-- revisada, la marca se conserva aunque la fila nueva no la traiga. Protege
-- todas las vías de escritura a la vez (móvil, oficina, cola offline, copias
-- de seguridad) sin depender de que cada app tenga la copia al día.
--
-- No hay ningún botón que quite la marca (sólo se pone), así que la regla no
-- le quita nada a nadie. Si algún día hace falta "volver a notificar" un
-- albarán, habrá que hacerlo con un cambio deliberado aquí, no desde la app.
--
-- Los albaranes que ya resucitaron antes de este script no se pueden
-- distinguir de los que nunca se revisaron: en Notificaciones, "Seleccionar
-- Todos" y Revisado los quita de una vez, y desde ahora ya no vuelven.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run.
--   Idempotente: se puede repetir.
-- ============================================================================

BEGIN;

-- 1. La regla ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lo_revisado_se_queda_revisado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.data IS NOT NULL
     AND jsonb_typeof(OLD.data) = 'object'
     AND OLD.data -> 'notificationDismissed' = 'true'::jsonb
     AND NEW.data IS NOT NULL
     AND jsonb_typeof(NEW.data) = 'object'
     AND NEW.data -> 'notificationDismissed' IS DISTINCT FROM 'true'::jsonb THEN
    NEW.data := jsonb_set(NEW.data, ARRAY['notificationDismissed'], 'true'::jsonb, true);
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.lo_revisado_se_queda_revisado() OWNER TO postgres;

-- No es llamable por API: el disparador no necesita que nadie tenga EXECUTE.
REVOKE ALL ON FUNCTION public.lo_revisado_se_queda_revisado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lo_revisado_se_queda_revisado ON public.shipments;
CREATE TRIGGER lo_revisado_se_queda_revisado
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.lo_revisado_se_queda_revisado();

-- 2. Comprobación ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
     WHERE event_object_table = 'shipments'
       AND trigger_name = 'lo_revisado_se_queda_revisado'
  ) THEN
    RAISE EXCEPTION 'La regla no se ha creado';
  END IF;
  RAISE NOTICE 'OK: un albarán revisado ya no vuelve a Notificaciones aunque lo grabe una copia vieja';
END $$;

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) La regla está puesta:
--
-- SELECT event_object_table, trigger_name, action_timing, event_manipulation
--   FROM information_schema.triggers
--  WHERE trigger_name = 'lo_revisado_se_queda_revisado';
--
-- 2) Prueba con un albarán ya revisado (cambiar el id): se le graba el JSON
--    sin la marca y tiene que seguir saliendo true.
--
-- UPDATE public.shipments SET data = data - 'notificationDismissed' WHERE id = 'SUM-000';
-- SELECT id, data -> 'notificationDismissed' AS revisado FROM public.shipments WHERE id = 'SUM-000';
-- ============================================================================
