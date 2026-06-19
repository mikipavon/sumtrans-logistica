-- Fix infinite recursion in profiles RLS policy
-- The old policy queries profiles table from within a profiles policy = infinite loop
DROP POLICY IF EXISTS "Admin full access" ON public.profiles;

-- New policy: check admin role from JWT metadata (no recursion)
CREATE POLICY "admin_full_profiles" ON public.profiles
  FOR ALL
  USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
