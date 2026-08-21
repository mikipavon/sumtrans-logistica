-- ============================================================
-- FASE 16: Las contraseñas dejan de estar en claro
-- Proyecto: SUM Transportes (principal)
-- Fecha: 2026-08-20
--
-- PROBLEMA
--   drivers.password y drivers.data->>'password' guardaban la contraseña
--   tal cual. Lo mismo en clients.data->>'password'. Y como la política
--   "driver_select" de la fase 04 da SELECT sobre las tablas ENTERAS, el
--   móvil de cada repartidor se descargaba en cada arranque las contraseñas
--   de todos sus compañeros y de todos los clientes: src/App.jsx pedía la
--   columna `password` por su nombre y luego comparaba en el navegador.
--
--   Encima verify_driver_login() comparaba `password = p_password` y estaba
--   abierta a 'anon': cualquiera con la dirección del proyecto —que va dentro
--   del JavaScript de la web— podía probar contraseñas contra
--   /rest/v1/rpc/verify_driver_login sin límite de intentos y sin dejar rastro.
--
--   Es el mismo fallo que ya se cerró para la contraseña de administración en
--   la fase 09; a las de conductores y clientes nunca les llegó el turno.
--
-- QUÉ SE HACE
--   1. Se guarda una huella bcrypt (pgcrypto) en una tabla APARTE, sin
--      políticas RLS, a la que el navegador no llega por definición.
--   2. Se COMPRUEBA huella a huella contra la contraseña original.
--   3. Sólo si todas cuadran, se borra el texto en claro.
--   4. verify_driver_login pasa a comparar la huella y deja de ser llamable
--      desde el navegador: sólo el rol de servicio, es decir, la Edge Function
--      create-auth-user, que es quien migra a los conductores a Supabase Auth.
--
--   Todo va dentro de UNA transacción: si un solo registro no cuadra en el
--   paso 2, salta la excepción y no se borra ni se cambia nada.
--
-- POR QUÉ EN UNA TABLA APARTE Y NO EN UNA COLUMNA
--   Una huella bcrypt no es una contraseña, pero tampoco pinta nada en el
--   móvil de un repartidor: con ella delante se pueden probar contraseñas sin
--   límite y sin conexión. Puesta como columna de `drivers` habría que jugar
--   con permisos columna a columna, y entonces cualquier consulta que pidiera
--   '*' —hoy o dentro de un año— dejaría de funcionar. En su propia tabla con
--   RLS y CERO políticas no hace falta nada de eso: no hay ninguna vía por la
--   que un cliente del navegador la lea.
--
-- LO QUE NO CAMBIA
--   Quien ya tiene cuenta de Supabase Auth entra igual que siempre: su
--   contraseña vive en auth.users, no aquí. Esta huella sólo sirve para que un
--   conductor que todavía NO está en Auth pueda migrarse solo al iniciar sesión.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ────────────────────────────────────────────────────────────
-- 1. La tabla donde viven las huellas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legacy_passwords (
  tabla       TEXT        NOT NULL CHECK (tabla IN ('drivers', 'clients')),
  registro_id TEXT        NOT NULL,
  huella      TEXT        NOT NULL,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tabla, registro_id)
);

COMMENT ON TABLE public.legacy_passwords
  IS 'Huellas bcrypt de las contraseñas anteriores a Supabase Auth. Sólo sirven para que un usuario que aún no está en Auth se migre al iniciar sesión. No tiene políticas RLS a propósito: nadie desde el navegador debe leerla.';

ALTER TABLE public.legacy_passwords ENABLE ROW LEVEL SECURITY;

-- RLS activo y NI UNA SOLA política: con eso, 'anon' y 'authenticated' no ven
-- ninguna fila pase lo que pase. Se revocan además los permisos de tabla, para
-- que la tabla tampoco aparezca en la API.
REVOKE ALL ON public.legacy_passwords FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.legacy_passwords TO service_role;

-- ────────────────────────────────────────────────────────────
-- 2. Calcular la huella
-- ────────────────────────────────────────────────────────────
-- En conductores la contraseña podía estar en la columna o dentro del JSON,
-- porque handleUpdateDriver guardaba el objeto entero del formulario en `data`.
-- Se toma la de la columna y, si está vacía, la del JSON.

INSERT INTO public.legacy_passwords (tabla, registro_id, huella)
SELECT 'drivers',
       id::text,
       extensions.crypt(
         coalesce(nullif(password, ''), data->>'password'),
         extensions.gen_salt('bf', 10)
       )
  FROM public.drivers
 WHERE coalesce(nullif(password, ''), nullif(data->>'password', '')) IS NOT NULL
ON CONFLICT (tabla, registro_id) DO NOTHING;

INSERT INTO public.legacy_passwords (tabla, registro_id, huella)
SELECT 'clients',
       id::text,
       extensions.crypt(data->>'password', extensions.gen_salt('bf', 10))
  FROM public.clients
 WHERE nullif(data->>'password', '') IS NOT NULL
ON CONFLICT (tabla, registro_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. COMPROBAR antes de borrar
-- ────────────────────────────────────────────────────────────
-- Este es el paso que hace que esto no sea un salto al vacío: se verifica que
-- cada huella reconoce su contraseña original. Si una sola falla, la excepción
-- deshace la transacción entera y la base de datos se queda como estaba.
DO $$
DECLARE
  _fallos INTEGER;
BEGIN
  SELECT count(*) INTO _fallos
    FROM public.drivers d
    JOIN public.legacy_passwords lp
      ON lp.tabla = 'drivers' AND lp.registro_id = d.id::text
   WHERE coalesce(nullif(d.password, ''), nullif(d.data->>'password', '')) IS NOT NULL
     AND extensions.crypt(
           coalesce(nullif(d.password, ''), d.data->>'password'),
           lp.huella
         ) <> lp.huella;

  IF _fallos > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % conductores cuya huella no reconoce su contraseña. No se ha borrado nada.', _fallos;
  END IF;

  SELECT count(*) INTO _fallos
    FROM public.clients c
    JOIN public.legacy_passwords lp
      ON lp.tabla = 'clients' AND lp.registro_id = c.id::text
   WHERE nullif(c.data->>'password', '') IS NOT NULL
     AND extensions.crypt(c.data->>'password', lp.huella) <> lp.huella;

  IF _fallos > 0 THEN
    RAISE EXCEPTION 'ABORTADO: % clientes cuya huella no reconoce su contraseña. No se ha borrado nada.', _fallos;
  END IF;

  RAISE NOTICE 'Todas las huellas reconocen su contraseña original';
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. Marcar quién tiene acceso al portal, ANTES de perder la señal
-- ────────────────────────────────────────────────────────────
-- La aplicación usaba "tiene contraseña" como sinónimo de "entra en el portal"
-- (src/utils/duplicadosClientes.js y correoDeAccesoCambiado en App.jsx). Al
-- quitar la contraseña esa señal desaparece, así que se deja escrita. El lado
-- del navegador lo lee con tieneAccesoAlPortal(), en utils/clientAccess.js.
UPDATE public.clients
   SET data = jsonb_set(data, '{tieneAccesoPortal}', 'true'::jsonb, true)
 WHERE nullif(data->>'password', '') IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 5. Borrar el texto en claro
-- ────────────────────────────────────────────────────────────
UPDATE public.drivers
   SET password = NULL,
       data     = data - 'password'
 WHERE password IS NOT NULL
    OR jsonb_exists(data, 'password');

UPDATE public.clients
   SET data = data - 'password'
 WHERE jsonb_exists(data, 'password');

-- La columna drivers.password se deja existiendo pero vacía: así no falla
-- ningún INSERT o UPDATE antiguo que todavía la nombre, ni las consultas que
-- piden '*'. Se puede borrar del todo más adelante, cuando no quede código que
-- la mencione:
--   ALTER TABLE public.drivers DROP COLUMN password;

-- ────────────────────────────────────────────────────────────
-- 6. verify_driver_login: contra la huella, y fuera del navegador
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_driver_login(p_username text, p_password text)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'id',       d.id,
    'username', d.username,
    'email',    d.data->>'email',
    'name',     d.data->>'name',
    'alias',    d.data->>'alias',
    'found',    true
  )
  FROM public.drivers d
  JOIN public.legacy_passwords lp
    ON lp.tabla = 'drivers' AND lp.registro_id = d.id::text
  WHERE (lower(d.username) = lower(p_username) OR lower(d.data->>'email') = lower(p_username))
    AND lp.huella = extensions.crypt(p_password, lp.huella)
  LIMIT 1;
$$;

-- Ya no la llama el navegador. El único que la necesita es create-auth-user,
-- que corre en el servidor con el rol de servicio. Así deja de existir el
-- probador de contraseñas abierto a internet.
REVOKE ALL ON FUNCTION public.verify_driver_login(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_driver_login(text, text) TO service_role;

-- ────────────────────────────────────────────────────────────
-- 7. VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _drv_claro INTEGER;
  _cli_claro INTEGER;
  _huellas   INTEGER;
  _politicas INTEGER;
BEGIN
  SELECT count(*) INTO _drv_claro
    FROM public.drivers
   WHERE nullif(password, '') IS NOT NULL
      OR jsonb_exists(data, 'password');

  SELECT count(*) INTO _cli_claro
    FROM public.clients
   WHERE jsonb_exists(data, 'password');

  SELECT count(*) INTO _huellas
    FROM public.legacy_passwords;

  SELECT count(*) INTO _politicas
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'legacy_passwords';

  IF _drv_claro > 0 OR _cli_claro > 0 THEN
    RAISE EXCEPTION 'Siguen en claro: % conductores, % clientes', _drv_claro, _cli_claro;
  END IF;

  IF _politicas > 0 THEN
    RAISE EXCEPTION 'legacy_passwords tiene % políticas: debe tener CERO', _politicas;
  END IF;

  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE 'OK: no queda ninguna contraseña en claro';
  RAISE NOTICE '    Huellas guardadas para migrarse: %', _huellas;
  RAISE NOTICE '══════════════════════════════════════';
END $$;

COMMIT;

-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN MANUAL, después de aplicar
-- ────────────────────────────────────────────────────────────
-- 1. Que no queda texto en claro por ninguna parte. Las dos deben dar 0:
--      SELECT count(*) FROM public.drivers
--       WHERE nullif(password,'') IS NOT NULL OR jsonb_exists(data,'password');
--      SELECT count(*) FROM public.clients WHERE jsonb_exists(data,'password');
--
-- 2. Que la huella funciona. Con un usuario y contraseña de verdad:
--      SELECT public.verify_driver_login('elusuario', 'lacontrasena');
--    Debe devolver la ficha. Con la contraseña equivocada, NULL.
--
-- 3. Que el navegador ya no llega a ninguna de las dos cosas. Desde la consola
--    de la aplicación, con sesión iniciada, las dos deben fallar:
--      await supabase.rpc('verify_driver_login', { p_username:'x', p_password:'y' })
--      await supabase.from('legacy_passwords').select('*')
--
-- 4. Que un conductor que YA estaba en Supabase Auth entra igual que siempre,
--    y que uno que no lo estaba se migra al primer intento.
