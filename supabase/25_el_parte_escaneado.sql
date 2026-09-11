-- ============================================================================
-- 25. EL PARTE ESCANEADO SE QUEDA GUARDADO CON LA BAJA
-- ============================================================================
--
-- EL PROBLEMA
--
-- Con la fase 24 la oficina ya sabe de qué bajas falta el papel, pero el papel
-- sigue siendo papel: se marca "parte recibido" y el parte se queda en una carpeta
-- (o se pierde). Cuando a los meses hace falta enseñarlo, hay que buscarlo a mano.
--
-- LO QUE HACE ESTE SCRIPT
--
--   1. La columna `medical_note_path`, con la ruta del parte escaneado dentro del
--      almacén de ficheros. Subir el parte es lo que marca la baja como justificada:
--      no hay que pulsar además el botón.
--   2. El contenedor `medical_notes` donde se guardan esos ficheros, PRIVADO.
--   3. Las reglas de acceso: sólo la oficina (rol `admin`) sube, mira y borra.
--
-- POR QUÉ PRIVADO, SI LOS DEMÁS NO LO SON
--
-- Un parte de baja dice por qué está malo alguien. En un contenedor público basta
-- tener el enlace para abrirlo sin entrar en la aplicación, y esos enlaces viajan en
-- el historial del navegador, en los correos y en cualquier captura. Privado obliga a
-- pedir un enlace temporal (un minuto de vida) cada vez que se abre, y ese enlace
-- sólo lo consigue quien ha entrado como oficina.
--
-- El conductor NO ve el parte en su app: él ya tiene el suyo, y su app no toca este
-- contenedor. Sólo ve el aviso de que falta, que ya estaba en la fase 24.
--
-- OJO CON LAS COPIAS DE SEGURIDAD
--
-- La copia de seguridad de Supabase cubre las tablas, NO los ficheros. Estos partes,
-- igual que las firmas y las fotos de entrega, quedan fuera: si esto va a ser el
-- archivo de partes de la empresa, que no sea el único sitio donde estén.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run. Idempotente: se puede repetir.
--   No hace falta crear nada a mano en el panel; el contenedor lo crea este script.
-- ============================================================================

BEGIN;

-- 1. Dónde está el parte de esta baja ────────────────────────────────────────
ALTER TABLE public.driver_absences
    ADD COLUMN IF NOT EXISTS medical_note_path text;

COMMENT ON COLUMN public.driver_absences.medical_note_path IS
    'Ruta del parte escaneado dentro del contenedor medical_notes. Ver supabase/25.';

-- 2. El contenedor, privado ───────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical_notes', 'medical_notes', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- 3. Sólo la oficina entra ────────────────────────────────────────────────────
-- Se borran antes por si el script se repite: CREATE POLICY no tiene IF NOT EXISTS.
DROP POLICY IF EXISTS "medical_notes_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "medical_notes_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "medical_notes_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "medical_notes_admin_delete" ON storage.objects;

CREATE POLICY "medical_notes_admin_select" ON storage.objects FOR SELECT
    USING (bucket_id = 'medical_notes' AND public.get_user_role() = 'admin');

CREATE POLICY "medical_notes_admin_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'medical_notes' AND public.get_user_role() = 'admin');

CREATE POLICY "medical_notes_admin_update" ON storage.objects FOR UPDATE
    USING (bucket_id = 'medical_notes' AND public.get_user_role() = 'admin')
    WITH CHECK (bucket_id = 'medical_notes' AND public.get_user_role() = 'admin');

CREATE POLICY "medical_notes_admin_delete" ON storage.objects FOR DELETE
    USING (bucket_id = 'medical_notes' AND public.get_user_role() = 'admin');

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) El contenedor existe y NO es público. `public` tiene que salir en false:
--
-- SELECT id, public FROM storage.buckets WHERE id = 'medical_notes';
--
-- 2) Las cuatro reglas están puestas:
--
-- SELECT policyname, cmd FROM pg_policies
-- WHERE schemaname = 'storage' AND tablename = 'objects'
--   AND policyname LIKE 'medical_notes%'
-- ORDER BY policyname;
--
-- 3) Los partes que ya hay guardados, con su baja:
--
-- SELECT driver_name, date, medical_note_received, medical_note_path
-- FROM public.driver_absences
-- WHERE type = 'Baja Médica' AND medical_note_path IS NOT NULL
-- ORDER BY date DESC;
-- ============================================================================
