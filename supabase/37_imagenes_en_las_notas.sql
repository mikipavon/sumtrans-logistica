-- ============================================================================
-- 37. IMÁGENES EN LAS NOTAS Y EN LAS CONTRASEÑAS
-- ============================================================================
--
-- LO QUE HACE
--
-- Deja poner imágenes (capturas, fotos) en la pestaña "Notas y Contraseñas"
-- (src/pages/Notas.jsx), con el botón "Añadir imagen" o pegándolas con Ctrl+V.
--
--   1) Columna `imagenes` en notas_oficina: la lista de ficheros de cada nota.
--   2) Contenedor PRIVADO `notas_oficina`: sin enlaces públicos. Para ver una
--      imagen la app pide un enlace temporal, y el almacén sólo lo da a la
--      oficina (rol admin). Conductores y clientes no pueden ni listarlo.
--
-- Las imágenes de una CONTRASEÑA se suben ya cifradas con la llave maestra
-- (por eso se admite 'application/octet-stream'): en el almacén son ficheros
-- ilegibles. Las de las NOTAS van sin cifrar, como el texto de las notas.
--
-- OJO: como las fotos de entrega, estos ficheros NO entran en el backup diario
-- de Supabase (ver la memoria "Los backups no cubren las fotos").
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run. Idempotente: se puede repetir.
-- ============================================================================

BEGIN;

ALTER TABLE public.notas_oficina
    ADD COLUMN IF NOT EXISTS imagenes jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('notas_oficina', 'notas_oficina', false, 10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE
    SET public = false,
        file_size_limit = 10485760,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/octet-stream'];

DROP POLICY IF EXISTS "notas_oficina_select" ON storage.objects;
DROP POLICY IF EXISTS "notas_oficina_insert" ON storage.objects;
DROP POLICY IF EXISTS "notas_oficina_delete" ON storage.objects;

CREATE POLICY "notas_oficina_select" ON storage.objects FOR SELECT
    USING (bucket_id = 'notas_oficina' AND public.get_user_role() = 'admin');

CREATE POLICY "notas_oficina_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'notas_oficina' AND public.get_user_role() = 'admin');

CREATE POLICY "notas_oficina_delete" ON storage.objects FOR DELETE
    USING (bucket_id = 'notas_oficina' AND public.get_user_role() = 'admin');

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) La columna existe:
--
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'notas_oficina' AND column_name = 'imagenes';
--
-- 2) El contenedor existe y NO es público (public = false):
--
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'notas_oficina';
--
-- 3) Las tres reglas, todas de la oficina:
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname LIKE 'notas_oficina%';
-- ============================================================================
