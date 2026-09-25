-- ============================================================================
-- 35. LA FACTURA SIMPLIFICADA VA EN PDF POR WHATSAPP
-- ============================================================================
--
-- EL PROBLEMA
--
-- El botón "Enviar por WhatsApp" de la factura simplificada mandaba sólo un
-- mensaje de texto. Un enlace wa.me (el único que abre el chat con el número ya
-- puesto) no puede llevar ficheros, así que el PDF no llegaba nunca.
--
-- LA SOLUCIÓN
--
-- La app genera el PDF, lo sube a este contenedor y en el mensaje va el enlace
-- para descargarlo (src/utils/enviarFacturaSimplificada.js).
--
-- Contenedor PÚBLICO: el enlace lo abre el cliente desde su WhatsApp, sin entrar
-- en la app, y un enlace firmado caducaría. Lo que protege cada factura es su
-- nombre, que lleva un UUID imposible de adivinar, y que NADIE puede listar el
-- contenedor: aquí sólo hay permiso de AÑADIR, no de LEER (en un contenedor
-- público la descarga por URL no necesita regla de lectura).
--
-- Añaden la oficina y los conductores, que son quienes emiten estas facturas.
-- Límite de 1 MB por fichero y sólo PDF: una factura de ticket pesa unos 5 kB.
--
-- OJO: como las fotos de entrega, estos ficheros NO entran en el backup diario
-- de Supabase. No importa: el PDF se puede volver a generar desde el albarán.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run. Idempotente: se puede repetir.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('facturas_simplificadas', 'facturas_simplificadas', true, 1048576, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
    SET public = true,
        file_size_limit = 1048576,
        allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "facturas_simplificadas_insert" ON storage.objects;

CREATE POLICY "facturas_simplificadas_insert" ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'facturas_simplificadas'
        AND public.get_user_role() IN ('admin', 'driver')
    );

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) El contenedor existe y es público:
--
-- SELECT id, public, file_size_limit, allowed_mime_types
-- FROM storage.buckets WHERE id = 'facturas_simplificadas';
--
-- 2) Sólo hay regla de INSERT (ninguna de SELECT, o se podría listar):
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname LIKE 'facturas_simplificadas%';
