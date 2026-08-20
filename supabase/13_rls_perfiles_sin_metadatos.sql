-- ============================================================
-- FASE 13: El rol de administrador deja de leerse del JWT
-- Proyecto: SUM Transportes (principal)
-- Fecha: 2026-08-20
-- Descripción:
--   La política "admin_full_profiles" (supabase/fix_profiles_policy.sql)
--   decidía quién era admin leyendo auth.jwt() -> 'user_metadata' -> 'role'.
--
--   Ese campo lo escribe el PROPIO usuario con auth.updateUser({ data: ... }),
--   así que cualquier conductor o cliente con sesión podía declararse admin
--   y obtener FOR ALL sobre public.profiles. Y como el resto de tablas
--   confían en get_user_role(), que lee profiles.role, desde ahí se
--   escalaba a administrador de toda la aplicación.
--
--   Aquí se sustituye por get_user_role(), que lee el rol de la tabla
--   public.profiles: la escribe el trigger handle_new_user() o las Edge
--   Functions con clave de servicio, nunca el usuario.
--
--   No recursa porque get_user_role() es SECURITY DEFINER: se ejecuta con
--   los privilegios del dueño de la tabla, y el dueño no pasa por RLS.
--
-- IDEMPOTENTE: se puede ejecutar varias veces sin efectos secundarios.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Blindar las funciones auxiliares
-- ────────────────────────────────────────────────────────────
-- Se les fija search_path: sin él, una función SECURITY DEFINER puede
-- ser engañada para leer una tabla "profiles" de otro esquema.
-- (handle_new_user() en 02 ya lo tenía; estas dos no.)

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
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
SET search_path = public
AS $$
  SELECT linked_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- El dueño debe ser el mismo que el de public.profiles para que la
-- función se salte las RLS y no vuelva la recursión infinita.
ALTER FUNCTION public.get_user_role()  OWNER TO postgres;
ALTER FUNCTION public.get_linked_id() OWNER TO postgres;

-- ────────────────────────────────────────────────────────────
-- 2. Retirar la política insegura
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin_full_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access"   ON public.profiles;

-- ────────────────────────────────────────────────────────────
-- 3. Políticas nuevas sobre public.profiles
-- ────────────────────────────────────────────────────────────

-- 3a. Cada usuario lee su propio perfil (y SOLO lee: sin UPDATE propio
--     nadie puede ascenderse a sí mismo cambiando su fila).
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "perfil_propio_select"       ON public.profiles;

CREATE POLICY "perfil_propio_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

-- 3b. El administrador tiene acceso completo, según la tabla, no el JWT.
CREATE POLICY "admin_full_profiles"
  ON public.profiles
  FOR ALL
  TO authenticated
  USING       (public.get_user_role() = 'admin')
  WITH CHECK  (public.get_user_role() = 'admin');

-- ────────────────────────────────────────────────────────────
-- 4. Verificación
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _malas INTEGER;
BEGIN
  SELECT count(*) INTO _malas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) LIKE '%user_metadata%';

  IF _malas > 0 THEN
    RAISE EXCEPTION 'Quedan % políticas que leen user_metadata', _malas;
  END IF;

  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE '✅ Ninguna política RLS lee user_metadata';
  RAISE NOTICE '══════════════════════════════════════';
END $$;

-- Listado final de las políticas de profiles, para revisar a ojo:
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;
