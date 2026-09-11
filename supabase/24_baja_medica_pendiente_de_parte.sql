-- ============================================================================
-- 24. LA BAJA MÉDICA QUEDA PENDIENTE HASTA QUE TRAIGA EL PARTE
-- ============================================================================
--
-- EL PROBLEMA
--
-- Cuando un conductor llama por la mañana diciendo que está malo, la oficina le
-- marca la Baja Médica en el momento: es lo que le bloquea el fichaje y lo saca del
-- reparto, no puede esperar al papel. Pero el parte no llega hasta días después —a
-- veces no llega— y la ausencia queda en la tabla exactamente igual que una ya
-- justificada. Nada recuerda que falta el papel, y a fin de mes no hay forma de
-- saber de qué bajas se quedó sin traer.
--
-- LO QUE HACE ESTE SCRIPT
--
-- Añade a `driver_absences` dos columnas:
--
--   · `medical_note_received` — el parte está en mano. Nace en FALSE: una baja se
--     marca creyendo al conductor, y el papel se apunta cuando llega de verdad.
--   · `medical_note_at`       — cuándo se apuntó, por si hay que revisarlo luego.
--
-- Sólo se miran en las filas de tipo 'Baja Médica'. Vacaciones, Día Libre y Asuntos
-- Propios las llevan en FALSE y les da igual.
--
-- No cambia NADA de lo que ya hacía la ausencia: sigue bloqueando el fichaje desde
-- el minuto uno y sigue sin descontar de los 22 días de vacaciones. El parte es
-- papeleo; no decide si el conductor está malo.
--
-- LAS BAJAS QUE YA ESTABAN
--
-- Las anteriores a hoy se dan por justificadas. No es que lo sepamos: es que nadie
-- llevaba esta cuenta hasta ahora y arrancar con meses de bajas en rojo no avisa de
-- nada, sólo hace ruido. El control empieza a contar desde hoy. Si de alguna vieja
-- sí falta el parte, se desmarca a mano en Gestión de Ausencias.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run.
--   Es idempotente: se puede pasar dos veces sin estropear nada.
-- ============================================================================

BEGIN;

ALTER TABLE public.driver_absences
    ADD COLUMN IF NOT EXISTS medical_note_received boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS medical_note_at       timestamptz;

COMMENT ON COLUMN public.driver_absences.medical_note_received IS
    'Baja Médica: el parte está en mano. Falso = pendiente de papel. Ver supabase/24.';
COMMENT ON COLUMN public.driver_absences.medical_note_at IS
    'Cuándo apuntó la oficina que el parte había llegado.';

-- Las bajas de antes de hoy arrancan como justificadas (ver arriba el porqué).
-- El `IS NOT TRUE` deja que se pueda repetir el script sin pisar la fecha original.
UPDATE public.driver_absences
SET medical_note_received = true,
    medical_note_at       = now()
WHERE type = 'Baja Médica'
  AND date < current_date
  AND medical_note_received IS NOT TRUE;

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) Las bajas que quedan pendientes de parte. Justo después de ejecutar deben
--    salir sólo las de hoy en adelante.
--
-- SELECT driver_name, date
-- FROM public.driver_absences
-- WHERE type = 'Baja Médica' AND medical_note_received = false
-- ORDER BY driver_name, date;
--
-- 2) Si una baja vieja tampoco tiene parte, se devuelve a pendiente:
--
-- UPDATE public.driver_absences
-- SET medical_note_received = false, medical_note_at = NULL
-- WHERE type = 'Baja Médica' AND driver_name = 'NOMBRE' AND date = 'YYYY-MM-DD';
-- ============================================================================
