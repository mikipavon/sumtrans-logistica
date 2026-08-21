-- ⚠️ OBSOLETO — NO EJECUTAR ⚠️
-- ============================================================
-- Este script creaba una brecha de seguridad grave.
-- Sustituido por: supabase/13_rls_perfiles_sin_metadatos.sql (2026-08-20)
--
-- Qué hacía y por qué era peligroso
-- ---------------------------------
-- Para esquivar la recursión infinita de la política "Admin full access"
-- de 02_create_profiles_table.sql (que consultaba profiles desde una
-- política sobre profiles), pasó a decidir quién era admin así:
--
--     USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
--
-- Pero 'user_metadata' lo escribe el propio usuario desde el navegador
-- con auth.updateUser({ data: { role: 'admin' } }). Cualquier conductor
-- o cliente con sesión podía darse acceso total a public.profiles,
-- cambiar su fila a role='admin' y, a través de get_user_role(),
-- convertirse en administrador de toda la aplicación.
--
-- La solución correcta es leer el rol de public.profiles con
-- get_user_role(), que es SECURITY DEFINER y por tanto no recursa.
-- Está en 13_rls_perfiles_sin_metadatos.sql.
-- ============================================================

DO $$
BEGIN
  RAISE EXCEPTION
    'Script obsoleto e inseguro. Ejecuta supabase/13_rls_perfiles_sin_metadatos.sql';
END $$;
