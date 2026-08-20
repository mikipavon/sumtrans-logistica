-- ============================================================
-- FASE 14: search_path fijo en las funciones de login antiguas
-- Proyecto: SUM Transportes (principal)
-- Fecha: 2026-08-20
-- Descripción:
--   get_driver_email_by_username() y verify_driver_login()
--   (supabase/fix_login_functions.sql) son SECURITY DEFINER pero no
--   fijaban search_path. El asesor de seguridad de Supabase lo marca
--   como "function_search_path_mutable".
--
--   Sin search_path fijo, la función resuelve "public.drivers" según el
--   search_path de QUIEN la llama. Como se ejecuta con privilegios del
--   dueño, alguien que pueda crear un esquema propio podría colar ahí
--   una tabla "drivers" y hacer que la función lea la suya.
--
--   Aquí sólo se añade SET search_path = public. El comportamiento no
--   cambia: mismas firmas, mismo cuerpo, mismos GRANT. Siguen siendo
--   llamables por 'anon' porque forman parte del proceso de entrar,
--   antes de que exista sesión.
--
--   ⚠️ Esto NO arregla el problema de fondo de verify_driver_login
--   (contraseñas en claro y sin límite de intentos). Ver el aviso al
--   final del fichero.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_driver_email_by_username(p_username text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT data->>'email'
  FROM public.drivers
  WHERE lower(username) = lower(p_username)
     OR lower(data->>'email') = lower(p_username)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.verify_driver_login(p_username text, p_password text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'id',       id,
    'username', username,
    'email',    data->>'email',
    'name',     data->>'name',
    'alias',    data->>'alias',
    'found',    true
  )
  FROM public.drivers
  WHERE (lower(username) = lower(p_username) OR lower(data->>'email') = lower(p_username))
    AND password = p_password
  LIMIT 1;
$$;

-- Mismos permisos que antes: el login ocurre sin sesión.
GRANT EXECUTE ON FUNCTION public.get_driver_email_by_username(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_driver_login(text, text)     TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- ⚠️ PENDIENTE, y es más grave que la advertencia que cierra este fichero
-- ────────────────────────────────────────────────────────────
-- verify_driver_login compara `password = p_password` en claro, y está
-- abierta a 'anon'. Cualquiera con la URL del proyecto puede probar
-- contraseñas contra /rest/v1/rpc/verify_driver_login sin límite de
-- intentos y sin dejar rastro: devuelve la ficha si acierta y NULL si no.
--
-- Además, la columna drivers.password guarda la contraseña en claro y la
-- política "driver_select" de 04_restrictive_rls_policies.sql deja que
-- CUALQUIER conductor haga SELECT sobre toda la tabla drivers. Es decir,
-- un conductor puede leer las contraseñas de sus compañeros.
-- (src/App.jsx:961 se las descarga al navegador tal cual.)
--
-- La app ya sabe hacerlo bien: la contraseña del modo fantasma se guarda
-- como huella PBKDF2 (src/utils/ghostPassword.js). Falta aplicar lo mismo
-- aquí, o terminar la migración a Supabase Auth y retirar esta función.
-- ============================================================

-- Verificación: ninguna función SECURITY DEFINER de public sin search_path.
DO $$
DECLARE
  _sueltas TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO _sueltas
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef                                    -- SECURITY DEFINER
     AND NOT EXISTS (
       SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) AS c
        WHERE c LIKE 'search_path=%'
     );

  IF _sueltas IS NULL THEN
    RAISE NOTICE '✅ Todas las funciones SECURITY DEFINER tienen search_path fijo';
  ELSE
    RAISE WARNING '⚠️ Sin search_path todavía: %', _sueltas;
  END IF;
END $$;
