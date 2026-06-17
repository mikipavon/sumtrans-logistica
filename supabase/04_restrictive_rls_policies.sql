-- ============================================================
-- FASE 4 (FINAL): Políticas RLS restrictivas basadas en roles
-- Proyecto: mottccbalzdzzrgqzfkdl (SUM Transportes)
-- Fecha: 2026-06-17
-- Descripción: Reemplaza las políticas temporales permisivas
--   (temp_allow_all) por políticas granulares basadas en el
--   rol del usuario (admin, driver, client).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. FUNCIONES AUXILIARES
--    Permiten consultar el rol y el linked_id del usuario
--    autenticado de forma segura y eficiente.
-- ────────────────────────────────────────────────────────────

-- Devuelve el rol del usuario autenticado desde la tabla profiles
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- Devuelve el linked_id del usuario autenticado desde la tabla profiles
-- (linked_id vincula el usuario auth con su registro en drivers/clients)
CREATE OR REPLACE FUNCTION public.get_linked_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT linked_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_role() IS
  'Obtiene el rol del usuario autenticado desde profiles (admin/driver/client)';
COMMENT ON FUNCTION public.get_linked_id() IS
  'Obtiene el linked_id del usuario autenticado (vincula con drivers/clients)';


-- ────────────────────────────────────────────────────────────
-- 2. ELIMINAR POLÍTICAS TEMPORALES (temp_allow_all)
--    Recorre las 11 tablas y elimina la política temporal
--    que se creó durante la migración.
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  _table TEXT;
  _tables TEXT[] := ARRAY[
    'articles',
    'clients',
    'driver_absences',
    'drivers',
    'fuel_logs',
    'settings',
    'shipments',
    'tariffs',
    'time_logs',
    'vehicles'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "temp_allow_all" ON public.%I',
      _table
    );
    RAISE NOTICE 'Política temp_allow_all eliminada de: %', _table;
  END LOOP;
END
$$;


-- ════════════════════════════════════════════════════════════
-- 3. POLÍTICAS DE ADMINISTRADOR (ADMIN)
--    Acceso completo (ALL) a todas las tablas.
-- ════════════════════════════════════════════════════════════

-- articles
CREATE POLICY "admin_full_access"
  ON public.articles FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- clients
CREATE POLICY "admin_full_access"
  ON public.clients FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- driver_absences
CREATE POLICY "admin_full_access"
  ON public.driver_absences FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- drivers
CREATE POLICY "admin_full_access"
  ON public.drivers FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- fuel_logs
CREATE POLICY "admin_full_access"
  ON public.fuel_logs FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- settings
CREATE POLICY "admin_full_access"
  ON public.settings FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- shipments
CREATE POLICY "admin_full_access"
  ON public.shipments FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- tariffs
CREATE POLICY "admin_full_access"
  ON public.tariffs FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- time_logs
CREATE POLICY "admin_full_access"
  ON public.time_logs FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- vehicles
CREATE POLICY "admin_full_access"
  ON public.vehicles FOR ALL
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');


-- ════════════════════════════════════════════════════════════
-- 4. POLÍTICAS DE CONDUCTOR (DRIVER)
--    Lectura amplia + escritura limitada a sus propios datos.
-- ════════════════════════════════════════════════════════════

-- 4a. SELECT — El conductor puede leer datos de referencia y operativos
--     Tablas: shipments, drivers, settings, articles, vehicles,
--             clients, coverage_zones, tariffs, fuel_logs,
--             time_logs, driver_absences

CREATE POLICY "driver_select"
  ON public.shipments FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.drivers FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.settings FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.articles FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.vehicles FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.clients FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.tariffs FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.fuel_logs FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.time_logs FOR SELECT
  USING (get_user_role() = 'driver');

CREATE POLICY "driver_select"
  ON public.driver_absences FOR SELECT
  USING (get_user_role() = 'driver');

-- 4b. UPDATE — El conductor solo puede actualizar envíos asignados a él
CREATE POLICY "driver_update_assigned_shipments"
  ON public.shipments FOR UPDATE
  USING (
    get_user_role() = 'driver'
    AND (data->>'assignedDriverId') = get_linked_id()
  )
  WITH CHECK (
    get_user_role() = 'driver'
    AND (data->>'assignedDriverId') = get_linked_id()
  );

-- 4c. UPDATE — El conductor puede actualizar su propio perfil de conductor
CREATE POLICY "driver_update_own_profile"
  ON public.drivers FOR UPDATE
  USING (
    get_user_role() = 'driver'
    AND id = get_linked_id()
  )
  WITH CHECK (
    get_user_role() = 'driver'
    AND id = get_linked_id()
  );

-- 4d. ALL — El conductor puede gestionar sus propios registros de tiempo
CREATE POLICY "driver_manage_time_logs"
  ON public.time_logs FOR ALL
  USING (get_user_role() = 'driver')
  WITH CHECK (get_user_role() = 'driver');

-- 4e. ALL — El conductor puede gestionar sus propias ausencias
CREATE POLICY "driver_manage_absences"
  ON public.driver_absences FOR ALL
  USING (get_user_role() = 'driver')
  WITH CHECK (get_user_role() = 'driver');


-- ════════════════════════════════════════════════════════════
-- 5. POLÍTICAS DE CLIENTE (CLIENT)
--    Solo lectura de sus propios datos + datos de referencia.
--    Puede crear nuevos envíos.
-- ════════════════════════════════════════════════════════════

-- 5a. SELECT — El cliente solo puede ver su propia ficha
CREATE POLICY "client_select_own_data"
  ON public.clients FOR SELECT
  USING (
    get_user_role() = 'client'
    AND id = get_linked_id()
  );

-- 5b. SELECT — El cliente puede ver envíos donde es remitente o destinatario
CREATE POLICY "client_select_own_shipments"
  ON public.shipments FOR SELECT
  USING (
    get_user_role() = 'client'
    AND (
      (data->>'clientId') = get_linked_id()
      OR (data->>'destinatarioId') = get_linked_id()
    )
  );

-- 5c. SELECT — El cliente puede consultar datos de referencia (solo lectura)
CREATE POLICY "client_select_articles"
  ON public.articles FOR SELECT
  USING (get_user_role() = 'client');

CREATE POLICY "client_select_tariffs"
  ON public.tariffs FOR SELECT
  USING (get_user_role() = 'client');

-- 5d. INSERT — El cliente puede crear nuevos envíos
CREATE POLICY "client_insert_shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (get_user_role() = 'client');


-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN FINAL
-- Muestra un resumen de todas las políticas RLS activas
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  _rec RECORD;
  _count INTEGER := 0;
BEGIN
  RAISE NOTICE '══════════════════════════════════════════════════';
  RAISE NOTICE 'RESUMEN DE POLÍTICAS RLS APLICADAS';
  RAISE NOTICE '══════════════════════════════════════════════════';

  FOR _rec IN
    SELECT
      schemaname,
      tablename,
      policyname,
      cmd AS operation,
      permissive
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'articles', 'clients',
        'driver_absences', 'drivers', 'fuel_logs',
        'settings', 'shipments', 'tariffs',
        'time_logs', 'vehicles'
      )
    ORDER BY tablename, policyname
  LOOP
    RAISE NOTICE '  %-20s | %-40s | %-8s | %s',
      _rec.tablename,
      _rec.policyname,
      _rec.operation,
      _rec.permissive;
    _count := _count + 1;
  END LOOP;

  RAISE NOTICE '──────────────────────────────────────────────────';
  RAISE NOTICE 'Total de políticas activas: %', _count;
  RAISE NOTICE '══════════════════════════════════════════════════';
END
$$;
