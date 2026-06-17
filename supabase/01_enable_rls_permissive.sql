-- ============================================================
-- FASE 1: Activar Row Level Security con políticas permisivas
-- ============================================================
-- Proyecto : mottccbalzdzzrgqzfkdl (SUM Transportes)
-- Fecha    : 2026-06-17
--
-- Tablas reales en la BD (10):
--   articles, clients, driver_absences, drivers, fuel_logs,
--   settings, shipments, tariffs, time_logs, vehicles
--
-- NOTA: coverage_zones NO existe como tabla (se guarda en localStorage)
-- ============================================================

DO $$
DECLARE
    _tabla TEXT;
    _tablas TEXT[] := ARRAY[
        'articles', 'clients', 'driver_absences', 'drivers',
        'fuel_logs', 'settings', 'shipments', 'tariffs',
        'time_logs', 'vehicles'
    ];
BEGIN
    FOREACH _tabla IN ARRAY _tablas LOOP
        -- Activar RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _tabla);

        -- Eliminar política temporal si ya existe (idempotencia)
        EXECUTE format('DROP POLICY IF EXISTS "temp_allow_all" ON public.%I', _tabla);

        -- Crear política permisiva temporal
        EXECUTE format(
            'CREATE POLICY "temp_allow_all" ON public.%I FOR ALL USING (true) WITH CHECK (true)',
            _tabla
        );

        RAISE NOTICE '✅ RLS activado en: %', _tabla;
    END LOOP;

    RAISE NOTICE '════════════════════════════════════';
    RAISE NOTICE '✅ RLS activado en 10 tablas';
    RAISE NOTICE '════════════════════════════════════';
END $$;
