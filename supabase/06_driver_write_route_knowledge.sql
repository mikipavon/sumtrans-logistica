-- ============================================================
-- Permiso de escritura del rol DRIVER sobre settings.route_knowledge
-- Proyecto: SUM Transportes
-- Fecha: 2026-07-29
--
-- PROBLEMA: el panel del repartidor guarda su aprendizaje de posiciones
-- (qué cliente va antes que cuál en cada pueblo) en settings/route_knowledge.
-- Tras las políticas restrictivas de 04, el rol driver solo tiene SELECT sobre
-- settings, así que ese guardado fallaba en silencio y la consola repetía
-- "Error saving route knowledge" cada vez que se sincronizaba.
--
-- ALCANCE: se concede escritura ÚNICAMENTE sobre la fila key='route_knowledge'.
-- El resto de settings (routes, tarifas, credenciales de admin...) sigue siendo
-- de solo lectura para el repartidor.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

-- INSERT: solo si la fila que crea es route_knowledge
DROP POLICY IF EXISTS "driver_insert_route_knowledge" ON public.settings;
CREATE POLICY "driver_insert_route_knowledge"
  ON public.settings FOR INSERT
  WITH CHECK (
    get_user_role() = 'driver'
    AND key = 'route_knowledge'
  );

-- UPDATE: solo puede alcanzar esa fila, y no puede convertirla en otra clave
DROP POLICY IF EXISTS "driver_update_route_knowledge" ON public.settings;
CREATE POLICY "driver_update_route_knowledge"
  ON public.settings FOR UPDATE
  USING (
    get_user_role() = 'driver'
    AND key = 'route_knowledge'
  )
  WITH CHECK (
    get_user_role() = 'driver'
    AND key = 'route_knowledge'
  );

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _count INTEGER;
BEGIN
  SELECT count(*) INTO _count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'settings'
    AND policyname IN ('driver_insert_route_knowledge', 'driver_update_route_knowledge');
  RAISE NOTICE '══════════════════════════════════════';
  IF _count = 2 THEN
    RAISE NOTICE '✅ El repartidor ya puede guardar route_knowledge';
  ELSE
    RAISE NOTICE '⚠️  Esperaba 2 políticas y hay %', _count;
  END IF;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
