-- ============================================================
-- Registro de errores de producción
-- Proyecto: SUM Transportes
-- Fecha: 2026-07-31
--
-- PROBLEMA: cuando a un repartidor se le queda la app en blanco en mitad de la ruta,
-- en la oficina no queda nada: ni el error, ni la pantalla, ni el móvil. Solo la
-- llamada de teléfono, y para entonces ya se ha recargado y no hay forma de saber
-- qué pasó.
--
-- ALCANCE: aquí NO entran datos de clientes ni de envíos. Mensaje del error, pila,
-- pantalla, y de quién era el móvil.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id               BIGSERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  mensaje          TEXT,
  pila             TEXT,
  component_stack  TEXT,
  origen           TEXT,
  pantalla         TEXT,
  rol              TEXT,
  driver_id        TEXT,
  driver_name      TEXT,
  user_agent       TEXT,
  app_version      TEXT
);

-- Lo que siempre se consulta: los últimos errores, y los de un conductor concreto.
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_driver_idx     ON public.error_logs (driver_id, created_at DESC);

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- Cualquiera que haya entrado puede DEJAR constancia de un error...
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "cualquiera_registra_errores" ON public.error_logs;
CREATE POLICY "cualquiera_registra_errores"
  ON public.error_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- ...pero solo la oficina los lee. Un repartidor no tiene por qué ver los fallos
-- que le salen a otro, y en una pila de error puede colarse cualquier cosa.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_lee_errores" ON public.error_logs;
CREATE POLICY "admin_lee_errores"
  ON public.error_logs FOR SELECT
  USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_borra_errores" ON public.error_logs;
CREATE POLICY "admin_borra_errores"
  ON public.error_logs FOR DELETE
  USING (get_user_role() = 'admin');

-- ────────────────────────────────────────────────────────────
-- LIMPIEZA
-- Esta tabla solo sirve para mirar hacia atrás unas semanas. Sin poda crece sola y
-- para siempre. Si el proyecto tiene pg_cron, se puede programar así:
--
--   SELECT cron.schedule('purgar-error-logs', '0 4 * * *',
--     $$DELETE FROM public.error_logs WHERE created_at < now() - INTERVAL '90 days'$$);
--
-- Y si no, ejecutar ese DELETE a mano de vez en cuando.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _existe BOOLEAN;
  _pols   INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'error_logs'
  ) INTO _existe;

  SELECT count(*) INTO _pols
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'error_logs';

  RAISE NOTICE '══════════════════════════════════════';
  IF _existe AND _pols = 3 THEN
    RAISE NOTICE '✅ error_logs lista: los fallos de los móviles quedan registrados';
  ELSE
    RAISE NOTICE '⚠️  Tabla: %, políticas: % (esperaba 3)', _existe, _pols;
  END IF;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
