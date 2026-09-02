-- ============================================================
-- FASE 19: Los "otros correos con acceso" tienen que poder entrar
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-02
--
-- PROBLEMA: esta función traduce lo que el cliente escribe en la casilla de
-- usuario al correo con el que hay que firmar en Supabase Auth. Miraba tres
-- campos de la ficha —`username`, `email` y `accessEmail`— y devolvía siempre
-- el correo PRINCIPAL. No sabía nada de `accessEmailsExtra`, que es donde viven
-- las demás personas de la misma empresa (el dueño además de quien hace los
-- albaranes). Cada una de ellas tiene su PROPIA cuenta de Auth, con su correo y
-- su contraseña; el portal las reconoce por `profiles.linked_id`, así que todas
-- ven la misma ficha (ver supabase/04_restrictive_rls_policies.sql).
--
-- Mientras esos correos no coincidieran con ningún campo de la ficha, la
-- función devolvía NULL, la aplicación se quedaba con lo tecleado y todo iba
-- bien. Pero basta con que ese mismo correo esté ADEMÁS escrito en el "Nombre
-- de Usuario" de la ficha —que es lo que hace cualquiera al configurarlo, y lo
-- que invita a hacer el propio campo— para que el paso 1 lo reconozca y lo
-- traduzca al correo principal. A partir de ahí:
--
--   el cliente escribe   ventas.cordoba@empresa.es   (su correo, su contraseña)
--   la función devuelve  gerencia.cordoba@empresa.es (el principal de la ficha)
--   Auth recibe          gerencia.cordoba@empresa.es + la contraseña de ventas
--   Auth contesta        Invalid login credentials
--   la pantalla dice     «Credenciales inválidas»
--
-- Es decir: se intenta entrar en la cuenta de OTRA persona. La contraseña está
-- bien, el correo está bien, y no hay forma de que entre por mucho que se le
-- cambie la contraseña, porque se le está cambiando a la cuenta equivocada.
--
-- SOLUCIÓN: antes que nada, mirar si lo escrito es uno de los correos
-- adicionales de alguna ficha. Si lo es, se devuelve TAL CUAL y no se traduce
-- nada: ese correo ya es una cuenta de Auth por sí mismo.
--
-- Va lo PRIMERO a propósito. El caso que rompía es justo aquel en que el mismo
-- texto encaja en dos sitios (el `username` de la ficha y la lista de accesos
-- adicionales), y de los dos, el que tiene cuenta propia es el adicional.
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

  -- 0. ¿Es uno de los "otros correos con acceso" de alguna ficha?
  --    Entonces no hay nada que traducir: esa persona entra con su propio
  --    correo y su propia contraseña. Devolverlo tal cual (en vez de NULL) deja
  --    dicho que la ficha se ha mirado y que la respuesta es «ése mismo».
  --
  --    jsonb_typeof filtra las fichas donde `accessEmailsExtra` no es un array
  --    (las que no lo tienen, o lo tienen a null): sin esa guarda,
  --    jsonb_array_elements revienta la consulta entera y el login se cae para
  --    todo el mundo, no sólo para quien la tuviera mal.
  PERFORM 1
     FROM public.clients c,
          LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(c.data -> 'accessEmailsExtra') = 'array'
                 THEN c.data -> 'accessEmailsExtra'
                 ELSE '[]'::jsonb
            END
          ) AS extra
    WHERE lower(btrim(coalesce(extra ->> 'email', ''))) = _buscado;

  IF FOUND THEN
    RETURN _buscado;
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
-- El caso que rompía. Ficha con:
--   email    = gerencia.cordoba@vwgproservice.es
--   username = ventas.cordoba@vwgproservice.es      ← el mismo de abajo
--   accessEmailsExtra = [{ email: ventas.cordoba@vwgproservice.es }]
--
--   SELECT public.get_client_email_by_username('ventas.cordoba@vwgproservice.es');
--     antes → gerencia.cordoba@vwgproservice.es   (la cuenta de OTRO)
--     ahora → ventas.cordoba@vwgproservice.es     (la suya)
--
-- Y lo de siempre sigue igual:
--   SELECT public.get_client_email_by_username('ACTIVA');                     → el email de la ficha
--   SELECT public.get_client_email_by_username('gerencia.cordoba@vwgproservice.es');
--                                                                            → él mismo
--   SELECT public.get_client_email_by_username('no-existe@nada.es');          → NULL
--
-- Para ver de una ficha todos los correos que entran, y con cuál se traduce cada uno:
--   SELECT c.name,
--          c.data->>'email'       AS email_ficha,
--          c.data->>'accessEmail' AS correo_acceso,
--          c.data->>'username'    AS usuario,
--          c.data->'accessEmailsExtra' AS adicionales
--     FROM public.clients c
--    WHERE c.name ILIKE '%proservice%';
