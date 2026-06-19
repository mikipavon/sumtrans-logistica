-- ============================================================
-- FASE 4 (FINAL): Políticas RLS restrictivas basadas en roles
-- Proyecto: mottccbalzdzrgqzfkdl (SUM Transportes)
-- Fecha: 2026-06-17
-- CORREGIDO: cast id::text para comparar con get_linked_id()
-- IDEMPOTENTE: DROP IF EXISTS antes de cada CREATE
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. FUNCIONES AUXILIARES
-- ────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────
-- 2. ELIMINAR TODAS las políticas anteriores (limpieza total)
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  _table TEXT;
  _tables TEXT[] := ARRAY[
    'articles', 'clients', 'driver_absences', 'drivers',
    'fuel_logs', 'settings', 'shipments', 'tariffs',
    'time_logs', 'vehicles'
  ];
  _pol RECORD;
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    -- Borrar TODAS las políticas existentes en cada tabla
    FOR _pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = _table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', _pol.policyname, _table);
      RAISE NOTICE 'Eliminada: %.%', _table, _pol.policyname;
    END LOOP;
  END LOOP;
END $$;

-- ════════════════════════════════════════════════════════════
-- 3. ADMIN — Acceso completo a todas las tablas
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  _table TEXT;
  _tables TEXT[] := ARRAY[
    'articles', 'clients', 'driver_absences', 'drivers',
    'fuel_logs', 'settings', 'shipments', 'tariffs',
    'time_logs', 'vehicles'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    EXECUTE format(
      'CREATE POLICY "admin_full_access" ON public.%I FOR ALL USING (get_user_role() = ''admin'') WITH CHECK (get_user_role() = ''admin'')',
      _table
    );
  END LOOP;
  RAISE NOTICE '✅ Políticas ADMIN creadas en 10 tablas';
END $$;

-- ════════════════════════════════════════════════════════════
-- 4. DRIVER — Lectura amplia + escritura limitada
-- ════════════════════════════════════════════════════════════

-- 4a. SELECT en tablas de referencia y operativas
DO $$
DECLARE
  _table TEXT;
  _tables TEXT[] := ARRAY[
    'shipments', 'drivers', 'settings', 'articles',
    'vehicles', 'clients', 'tariffs', 'fuel_logs',
    'time_logs', 'driver_absences'
  ];
BEGIN
  FOREACH _table IN ARRAY _tables LOOP
    EXECUTE format(
      'CREATE POLICY "driver_select" ON public.%I FOR SELECT USING (get_user_role() = ''driver'')',
      _table
    );
  END LOOP;
  RAISE NOTICE '✅ Políticas DRIVER SELECT creadas';
END $$;

-- 4b. UPDATE envíos asignados al conductor
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

-- 4c. UPDATE su propio perfil (id::text para comparar con linked_id TEXT)
CREATE POLICY "driver_update_own_profile"
  ON public.drivers FOR UPDATE
  USING (
    get_user_role() = 'driver'
    AND id::text = get_linked_id()
  )
  WITH CHECK (
    get_user_role() = 'driver'
    AND id::text = get_linked_id()
  );

-- 4d. Gestionar registros de tiempo
CREATE POLICY "driver_manage_time_logs"
  ON public.time_logs FOR ALL
  USING (get_user_role() = 'driver')
  WITH CHECK (get_user_role() = 'driver');

-- 4e. Gestionar ausencias
CREATE POLICY "driver_manage_absences"
  ON public.driver_absences FOR ALL
  USING (get_user_role() = 'driver')
  WITH CHECK (get_user_role() = 'driver');

-- ════════════════════════════════════════════════════════════
-- 5. CLIENT — Solo sus datos + datos de referencia
-- ════════════════════════════════════════════════════════════

-- 5a. Ver solo su propia ficha (id::text para comparar)
CREATE POLICY "client_select_own_data"
  ON public.clients FOR SELECT
  USING (
    get_user_role() = 'client'
    AND id::text = get_linked_id()
  );

-- 5b. Ver envíos propios
CREATE POLICY "client_select_own_shipments"
  ON public.shipments FOR SELECT
  USING (
    get_user_role() = 'client'
    AND (
      (data->>'clientId') = get_linked_id()
      OR (data->>'destinatarioId') = get_linked_id()
    )
  );

-- 5c. Datos de referencia (solo lectura)
CREATE POLICY "client_select_articles"
  ON public.articles FOR SELECT
  USING (get_user_role() = 'client');

CREATE POLICY "client_select_tariffs"
  ON public.tariffs FOR SELECT
  USING (get_user_role() = 'client');

-- 5d. Crear nuevos envíos
CREATE POLICY "client_insert_shipments"
  ON public.shipments FOR INSERT
  WITH CHECK (get_user_role() = 'client');

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _count INTEGER;
BEGIN
  SELECT count(*) INTO _count FROM pg_policies WHERE schemaname = 'public';
  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE '✅ Total políticas RLS activas: %', _count;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
