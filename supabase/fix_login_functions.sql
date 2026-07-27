-- Create a secure function to look up driver email by username
-- This bypasses RLS (SECURITY DEFINER) but only exposes the email
CREATE OR REPLACE FUNCTION get_driver_email_by_username(p_username text)
RETURNS text AS $$
  SELECT data->>'email' FROM public.drivers 
  WHERE lower(username) = lower(p_username) OR lower(data->>'email') = lower(p_username) LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_driver_email_by_username(text) TO anon;
GRANT EXECUTE ON FUNCTION get_driver_email_by_username(text) TO authenticated;

-- Also fix: allow anon to call RPC for login purposes
-- Create a secure login helper that verifies credentials and returns driver data
CREATE OR REPLACE FUNCTION verify_driver_login(p_username text, p_password text)
RETURNS json AS $$
  SELECT json_build_object(
    'id', id,
    'username', username,
    'email', data->>'email',
    'name', data->>'name',
    'alias', data->>'alias',
    'found', true
  )
  FROM public.drivers 
  WHERE (lower(username) = lower(p_username) OR lower(data->>'email') = lower(p_username)) AND password = p_password
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION verify_driver_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION verify_driver_login(text, text) TO authenticated;
