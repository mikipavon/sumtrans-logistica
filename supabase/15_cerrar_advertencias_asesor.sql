-- ============================================================
-- FASE 15: Advertencias del asesor de seguridad
-- Proyecto: SUM Transportes (principal)
-- Fecha: 2026-08-20
-- Descripción:
--   Cierra las advertencias del asesor que se pueden cerrar sin cambiar
--   el comportamiento de la aplicación. Las que NO se tocan aquí van
--   explicadas al final, con el motivo.
--
--   Las 4 de "function_search_path_mutable" ya se cerraron en los
--   ficheros 13 y 14. Este es el resto.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. LO URGENTE: las nóminas se podían listar enteras
-- ════════════════════════════════════════════════════════════
-- El bucket 'payrolls' es público Y tiene una política SELECT amplia sobre
-- storage.objects. Público significa que cualquiera con la URL exacta de un
-- fichero lo descarga; la política SELECT, además, permite pedir el ÍNDICE
-- del bucket. Juntas, cualquiera que tenga la URL del proyecto (está en el
-- JavaScript de la web, siempre) puede listar las nóminas de toda la
-- plantilla y bajárselas una a una.
--
-- Un bucket público NO necesita esa política para servir sus ficheros por
-- URL, así que se puede quitar sin romper nada. El único `.list()` de la
-- aplicación (src/App.jsx:753, limpieza de huérfanos) trabaja sobre
-- signatures, delivery_photos, merchandise_photos e incident_photos:
-- ni payrolls ni vehicle_docs.

DROP POLICY IF EXISTS "Permitir descargar nominas"          ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from vehicle_docs" ON storage.objects;

-- ⚠️ Esto corta el listado, no el acceso directo. Ver el punto A del final.

-- ════════════════════════════════════════════════════════════
-- 2. Funciones SECURITY DEFINER que no deberían ser llamables por API
-- ════════════════════════════════════════════════════════════
-- Ojo: PostgreSQL concede EXECUTE a PUBLIC por defecto al crear una función,
-- así que no basta con revocar a 'anon' y 'authenticated': hay que revocar
-- también a PUBLIC o la siguen teniendo por herencia.

-- 2a. handle_new_user() es un disparador sobre auth.users. No tiene ningún
--     sentido llamarla por /rest/v1/rpc. Revocarla no afecta al disparador:
--     el permiso EXECUTE se comprueba al CREAR el trigger, no al dispararlo.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 2b. Las ayudas de login sí hacen falta sin sesión (son parte de entrar),
--     pero no pintan nada disponibles para quien ya ha entrado.
REVOKE ALL ON FUNCTION public.verify_driver_login(text, text)          FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.get_driver_email_by_username(text)       FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.get_client_email_by_username(TEXT)       FROM PUBLIC, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_driver_login(text, text)       TO anon;
GRANT EXECUTE ON FUNCTION public.get_driver_email_by_username(text)    TO anon;
GRANT EXECUTE ON FUNCTION public.get_client_email_by_username(TEXT)    TO anon;

-- El rol de servicio (Edge Functions) conserva acceso por si acaso.
GRANT EXECUTE ON FUNCTION public.verify_driver_login(text, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.get_driver_email_by_username(text)    TO service_role;
GRANT EXECUTE ON FUNCTION public.get_client_email_by_username(TEXT)    TO service_role;

-- ════════════════════════════════════════════════════════════
-- 3. VERIFICACIÓN
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  _pols INTEGER;
BEGIN
  SELECT count(*) INTO _pols
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('Permitir descargar nominas', 'Allow public reads from vehicle_docs');

  IF _pols = 0 THEN
    RAISE NOTICE '✅ Las nóminas y la documentación de vehículos ya no se pueden listar';
  ELSE
    RAISE WARNING '⚠️ Siguen % políticas de listado', _pols;
  END IF;

  RAISE NOTICE '── Quién puede llamar a cada función ──';
END $$;

SELECT p.proname AS funcion,
       r.rolname AS rol,
       has_function_privilege(r.oid, p.oid, 'EXECUTE') AS puede_llamarla
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 CROSS JOIN pg_roles r
 WHERE n.nspname = 'public'
   AND p.prosecdef
   AND r.rolname IN ('anon', 'authenticated')
 ORDER BY p.proname, r.rolname;


-- ════════════════════════════════════════════════════════════
-- LO QUE NO SE TOCA AQUÍ, Y POR QUÉ
-- ════════════════════════════════════════════════════════════
--
-- A) Los buckets siguen siendo PÚBLICOS.
--    Quitar el listado impide sacar el índice, pero quien tenga la URL
--    exacta de una nómina la sigue descargando sin identificarse, y esas
--    URLs se guardan en drivers.data->'payrolls'. El arreglo de verdad es
--    poner 'payrolls' en privado y servirlo con createSignedUrl() en vez de
--    getPublicUrl() (src/utils/storage.js:125). Eso es cambio de código y
--    de comportamiento: hay que hacerlo con calma y avisando.
--
-- B) get_user_role() y get_linked_id() siguen siendo llamables.
--    El asesor las marca (4 advertencias), pero revocarles EXECUTE rompería
--    la aplicación entera: las expresiones de una política RLS se evalúan
--    con los permisos de quien hace la consulta, así que sin EXECUTE toda
--    consulta a shipments, clients, drivers... daría error de permisos.
--    Y lo que devuelven no es una filtración: a quien las llama le dicen su
--    propio rol y su propio vínculo, que ya sabe.
--    Si se quieren cerrar del todo, hay que moverlas a un esquema privado
--    no expuesto por la API y reescribir las ~25 políticas que las usan.
--
-- C) error_logs / "cualquiera_registra_errores" es intencionada.
--    Que cualquiera con sesión pueda dejar constancia de un error es el
--    objetivo del fichero 08: si el repartidor no puede escribir el fallo,
--    no hay fallo que mirar. Solo la oficina los LEE. El riesgo real es que
--    alguien infle la tabla, y para eso está la poda a 90 días que ya está
--    documentada en 08_error_logs.sql.
--
-- D) "Leaked Password Protection" se activa en el panel, no por SQL:
--    Authentication → Providers → Password → Leaked password protection.
-- ============================================================
