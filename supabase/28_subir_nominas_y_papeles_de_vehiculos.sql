-- ============================================================================
-- 28. LA OFICINA VUELVE A PODER SUBIR NÓMINAS Y PAPELES DE VEHÍCULOS
-- ============================================================================
--
-- EL PROBLEMA
--
-- Al subir las nóminas desde la carpeta salía, para todas:
--   "0 nóminas subidas... Motivo: Permiso denegado (RLS) en 'payrolls'."
--
-- La fase 15 quitó la regla que dejaba LEER los contenedores `payrolls` y
-- `vehicle_docs` (con ella cualquiera podía listar las nóminas de la plantilla).
-- La aplicación subía con `upsert`, y Supabase, para subir así, exige además poder
-- leer el contenedor. Sin esa regla, cada subida se rechazaba.
--
-- La aplicación ya no usa `upsert` (src/utils/storage.js), así que sólo necesita
-- permiso para AÑADIR ficheros. Este script deja escrito ese permiso, sólo para la
-- oficina, por si nunca se llegó a crear o se creó en el panel con otro alcance.
--
-- LO QUE NO HACE
--
-- No vuelve a abrir el listado: la regla es de INSERTAR, no de LEER. Las nóminas
-- se siguen abriendo por su enlace público, como hasta ahora. Poner `payrolls` en
-- privado (enlaces de un minuto, como los partes médicos de la fase 25) sigue
-- pendiente: ver el punto A del final de la fase 15.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run. Idempotente: se puede repetir.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "payrolls_admin_insert"     ON storage.objects;
DROP POLICY IF EXISTS "vehicle_docs_admin_insert" ON storage.objects;

CREATE POLICY "payrolls_admin_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'payrolls' AND public.get_user_role() = 'admin');

CREATE POLICY "vehicle_docs_admin_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'vehicle_docs' AND public.get_user_role() = 'admin');

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- Las reglas que hay sobre los dos contenedores. Tiene que salir al menos la de
-- INSERT de cada uno, y NINGUNA de SELECT abierta a todo el mundo:
--
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND (qual ILIKE '%payrolls%' OR with_check ILIKE '%payrolls%'
--     OR qual ILIKE '%vehicle_docs%' OR with_check ILIKE '%vehicle_docs%')
-- ORDER BY policyname;
-- ============================================================================
