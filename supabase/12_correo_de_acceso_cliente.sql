-- ============================================================
-- FASE 12: Correo de acceso al portal, separado del de la ficha
-- Proyecto: SUM Transportes
-- Fecha: 2026-08-18
--
-- PROBLEMA: `data->>'email'` hacía dos papeles a la vez. Era el correo de la
-- ficha (facturación, avisos) Y la identidad de la cuenta en Supabase Auth. El
-- cliente que quiere las facturas en administracion@ y entrar en la app con
-- pedidos@ no tenía dónde ponerlo.
--
-- SOLUCIÓN: nuevo campo `data->>'accessEmail'`. Si la ficha lo trae, ése es el
-- usuario del portal; si no, se sigue usando `email` y las fichas de siempre
-- funcionan igual que siempre, sin migrar ninguna.
--
-- Esta función es el punto por el que pasa el login: traduce lo que el cliente
-- escribe (usuario, nombre, su email de facturación…) al correo con el que hay
-- que firmar en Auth. Dos cambios respecto a la fase 11:
--   1. Devuelve el correo de acceso, no el de la ficha.
--   2. Acepta también el correo de acceso como texto de entrada.
-- Y sigue aceptando el email de la ficha en la casilla: quien lleve años
-- entrando con él tiene que seguir entrando, aunque ya no sea su cuenta de Auth.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_client_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _buscado TEXT;
  _email   TEXT;
  _cuantos INTEGER;
BEGIN
  _buscado := lower(btrim(coalesce(p_username, '')));
  IF _buscado = '' THEN
    RETURN NULL;
  END IF;

  -- 1. Usuario, email de la ficha o correo de acceso, exactos.
  SELECT lower(coalesce(nullif(btrim(data->>'accessEmail'), ''), data->>'email'))
    INTO _email
    FROM public.clients
   WHERE (
           lower(data->>'username') = _buscado
        OR lower(data->>'email') = _buscado
        OR lower(btrim(coalesce(data->>'accessEmail', ''))) = _buscado
         )
     AND coalesce(nullif(btrim(data->>'accessEmail'), ''), data->>'email', '') <> ''
   LIMIT 1;
  IF _email IS NOT NULL THEN
    RETURN _email;
  END IF;

  -- 2. Nombre completo exacto.
  SELECT lower(coalesce(nullif(btrim(data->>'accessEmail'), ''), data->>'email'))
    INTO _email
    FROM public.clients
   WHERE lower(btrim(name)) = _buscado
     AND coalesce(nullif(btrim(data->>'accessEmail'), ''), data->>'email', '') <> ''
   LIMIT 1;
  IF _email IS NOT NULL THEN
    RETURN _email;
  END IF;

  -- 3. Principio del nombre ("ACTIVA" → "ACTIVA LA MEJOR COMPRA..."), que es
  --    como entra la gente en la práctica. Sólo si no hay ninguna duda: si el
  --    trozo encaja con dos fichas no se devuelve nada, porque mandar a alguien
  --    al email de otro cliente es peor que no dejarle entrar.
  --    Se compara con left() en vez de LIKE para que un '%' escrito en la
  --    casilla de usuario no se convierta en comodín.
  SELECT count(*) INTO _cuantos
    FROM public.clients
   WHERE left(lower(btrim(name)), length(_buscado)) = _buscado
     AND coalesce(nullif(btrim(data->>'accessEmail'), ''), data->>'email', '') <> '';

  IF _cuantos = 1 THEN
    SELECT lower(coalesce(nullif(btrim(data->>'accessEmail'), ''), data->>'email'))
      INTO _email
      FROM public.clients
     WHERE left(lower(btrim(name)), length(_buscado)) = _buscado
       AND coalesce(nullif(btrim(data->>'accessEmail'), ''), data->>'email', '') <> ''
     LIMIT 1;
    RETURN _email;
  END IF;

  RETURN NULL;
END;
$$;

-- Llamable sin sesión: es parte del propio proceso de entrar.
GRANT EXECUTE ON FUNCTION public.get_client_email_by_username(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_client_email_by_username(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
-- Ficha SIN correo de acceso: se comporta como en la fase 11.
--   SELECT public.get_client_email_by_username('ACTIVA');
--     → el email de la ficha
--
-- Ficha CON correo de acceso: los tres caminos llevan a la cuenta de Auth.
--   SELECT public.get_client_email_by_username('ACTIVA');                  → pedidos@…
--   SELECT public.get_client_email_by_username('administracion@empresa.com'); → pedidos@…
--   SELECT public.get_client_email_by_username('pedidos@empresa.com');     → pedidos@…
