-- ============================================================
-- Crear tabla coverage_zones y aplicar políticas RLS
-- ============================================================

-- 1. Crear tabla
CREATE TABLE IF NOT EXISTS public.coverage_zones (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2. Habilitar RLS
ALTER TABLE public.coverage_zones ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas anteriores (por si acaso)
DROP POLICY IF EXISTS "admin_full_access" ON public.coverage_zones;
DROP POLICY IF EXISTS "driver_select" ON public.coverage_zones;
DROP POLICY IF EXISTS "client_select" ON public.coverage_zones;

-- 4. Crear política para ADMIN (Acceso total)
CREATE POLICY "admin_full_access" 
ON public.coverage_zones 
FOR ALL 
USING (public.get_user_role() = 'admin') 
WITH CHECK (public.get_user_role() = 'admin');

-- 5. Crear política para DRIVER (Solo lectura)
CREATE POLICY "driver_select" 
ON public.coverage_zones 
FOR SELECT 
USING (public.get_user_role() = 'driver');

-- 6. Crear política para CLIENT (Solo lectura)
CREATE POLICY "client_select" 
ON public.coverage_zones 
FOR SELECT 
USING (public.get_user_role() = 'client');
