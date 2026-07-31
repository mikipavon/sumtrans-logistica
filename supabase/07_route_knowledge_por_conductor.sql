-- ============================================================
-- El aprendizaje de ruta pasa a tener una fila por conductor
-- Proyecto: SUM Transportes
-- Fecha: 2026-07-31
--
-- PROBLEMA: todo el aprendizaje vivía en la fila settings/route_knowledge, un único
-- JSON compartido por todos los repartidores. Dos móviles sincronizando a la vez se
-- pisaban: el segundo releía, fusionaba y escribía, pero entre su lectura y su
-- escritura cabía la del primero, que se perdía sin dejar rastro.
--
-- SOLUCIÓN: cada conductor escribe `route_knowledge_driver_<su_id>`. Nadie más toca
-- esa fila, así que no hay carrera posible. En route_knowledge se quedan las cosas
-- del administrador (maestro por ruta, papelera y buzón de órdenes).
--
-- DE PROPINA, SEGURIDAD: la política de 06 dejaba a CUALQUIER repartidor escribir la
-- fila común, es decir, machacar el aprendizaje de todos sus compañeros. Aquí cada
-- uno solo alcanza la suya, comparando con el linked_id de su perfil.
--
-- NO HAY QUE MIGRAR DATOS: el aprendizaje que ya está en route_knowledge.byDriver se
-- sigue leyendo como respaldo, y cada conductor pasa a su fila nueva la primera vez
-- que su móvil sincroniza.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Las políticas antiguas, que daban acceso a la fila común
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "driver_insert_route_knowledge" ON public.settings;
DROP POLICY IF EXISTS "driver_update_route_knowledge" ON public.settings;

-- ────────────────────────────────────────────────────────────
-- 2. Cada repartidor, solo su propia fila
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "driver_insert_su_route_knowledge" ON public.settings;
CREATE POLICY "driver_insert_su_route_knowledge"
  ON public.settings FOR INSERT
  WITH CHECK (
    get_user_role() = 'driver'
    AND get_linked_id() IS NOT NULL
    AND key = 'route_knowledge_driver_' || get_linked_id()
  );

DROP POLICY IF EXISTS "driver_update_su_route_knowledge" ON public.settings;
CREATE POLICY "driver_update_su_route_knowledge"
  ON public.settings FOR UPDATE
  USING (
    get_user_role() = 'driver'
    AND get_linked_id() IS NOT NULL
    AND key = 'route_knowledge_driver_' || get_linked_id()
  )
  WITH CHECK (
    get_user_role() = 'driver'
    AND get_linked_id() IS NOT NULL
    AND key = 'route_knowledge_driver_' || get_linked_id()
  );

-- El SELECT sobre settings ya lo tiene el rol driver desde 04, así que sigue viendo
-- las filas de sus compañeros. No es información sensible (qué cliente va antes que
-- cuál en un pueblo) y el optimizador solo consume la suya.

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _nuevas INTEGER;
  _viejas INTEGER;
BEGIN
  SELECT count(*) INTO _nuevas
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'settings'
    AND policyname IN ('driver_insert_su_route_knowledge', 'driver_update_su_route_knowledge');

  SELECT count(*) INTO _viejas
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'settings'
    AND policyname IN ('driver_insert_route_knowledge', 'driver_update_route_knowledge');

  RAISE NOTICE '══════════════════════════════════════';
  IF _nuevas = 2 AND _viejas = 0 THEN
    RAISE NOTICE '✅ Cada repartidor escribe solo su propio aprendizaje';
  ELSE
    RAISE NOTICE '⚠️  Nuevas: % (esperaba 2), viejas sin retirar: % (esperaba 0)', _nuevas, _viejas;
  END IF;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
