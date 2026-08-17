-- ============================================================
-- FASE 11: Que un cliente pueda entrar con su nombre de usuario
-- Proyecto: SUM Transportes
-- Fecha: 2026-08-17
--
-- PROBLEMA: `handleLogin` llama a signInWithPassword({ email: username }).
-- Los repartidores tienen una RPC que traduce usuario → email antes de eso
-- (get_driver_email_by_username); los clientes NO. Entrando con el usuario
-- "ACTIVA" en vez de con su email, Supabase Auth rechaza el intento y la app
-- cae al login antiguo, que compara la contraseña EN EL NAVEGADOR y da por
-- iniciada la sesión sin crear ninguna sesión de Auth.
--
-- A partir de ahí esa pantalla escribe como visitante anónimo:
--   - reservar_numeros_albaran     → 42501, se numera con el plan B local
--   - INSERT en shipments          → 42501 (la política exige rol 'client')
--     y la app lo confunde con un fallo de red: el envío se queda en la cola
--     offline y el cliente ve para siempre el aviso ámbar de "pendiente de
--     sincronizar". Comprobado el 17/08/2026 con ACTIVA LA MEJOR COMPRA.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

-- Sólo devuelve el email, nunca la contraseña ni el resto de la ficha. Tiene
-- que ser SECURITY DEFINER y llamable por 'anon' porque se usa ANTES de
-- iniciar sesión, cuando todavía no hay rol ninguno.
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

  -- 1. Usuario o email exactos.
  SELECT lower(data->>'email') INTO _email
    FROM public.clients
   WHERE (lower(data->>'username') = _buscado OR lower(data->>'email') = _buscado)
     AND coalesce(data->>'email', '') <> ''
   LIMIT 1;
  IF _email IS NOT NULL THEN
    RETURN _email;
  END IF;

  -- 2. Nombre completo exacto.
  SELECT lower(data->>'email') INTO _email
    FROM public.clients
   WHERE lower(btrim(name)) = _buscado
     AND coalesce(data->>'email', '') <> ''
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
     AND coalesce(data->>'email', '') <> '';

  IF _cuantos = 1 THEN
    SELECT lower(data->>'email') INTO _email
      FROM public.clients
     WHERE left(lower(btrim(name)), length(_buscado)) = _buscado
       AND coalesce(data->>'email', '') <> ''
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
-- Debe devolver el email de la ficha, no NULL:
--   SELECT public.get_client_email_by_username('ACTIVA');
--
-- Clientes que NO podrán entrar por aquí porque su ficha no tiene email
-- (hay que rellenárselo desde administración):
--   SELECT id, name FROM public.clients
--    WHERE coalesce(data->>'email', '') = '' ORDER BY name;
