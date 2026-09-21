-- ============================================================================
-- PASAR A ESTÁNDAR TODAS LAS FICHAS DE LAS BASES DE DATOS DE AGENCIA
-- ============================================================================
--
-- EJECUTADO en producción el 21/09/2026: el recuento final dio 0. Volver a
-- lanzarlo no hace daño (no encuentra nada que cambiar), pero no hace falta.
--
-- Desde el 21/09/2026 la prioridad de servicio va con la base de datos: los
-- clientes de SUM son Urgente y los destinatarios de una agencia (TSB, TXT,
-- XPO) son Estándar. Ver src/utils/prioridadDeFicha.js
--
-- Las fichas de agencia se crean solas al entregar, sin prioridad grabada, y
-- la app ya las trata como Estándar. Pero las que la oficina abrió y guardó
-- antes tienen "urgent" grabado a mano y seguirían yendo por delante de los
-- clientes propios en el reparto. Este script las pone todas en Estándar.
--
-- QUÉ TOCA
--   Sólo fichas con `ownerAgencyId` (las que están en la base de una agencia)
--   y que no sean una agencia. En cada una:
--     - priority → 'normal' (Estándar)
--     - color    → gris de Estándar, sólo si tenía el rojo de Urgente. Un color
--                  elegido a mano por la oficina se deja como está.
--
-- QUÉ NO TOCA
--   Las fichas propias (sin ownerAgencyId) y las de las propias agencias, que
--   son clientes de SUM y siguen Urgente.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run.
--   1. La consulta de PREVIEW dice cuántas fichas cambiarían y cuáles.
--   2. El bloque BEGIN/COMMIT hace el cambio. Si el recuento no cuadra con lo
--      esperado, cambiar COMMIT por ROLLBACK y no se guarda nada.
-- ============================================================================

-- ── 1. PREVIEW: qué fichas cambiarían ───────────────────────────────────────
SELECT
    id,
    data ->> 'clientNumber'                       AS numero,
    data ->> 'name'                               AS nombre,
    data ->> 'ownerAgencyId'                      AS agencia_id,
    coalesce(data ->> 'priority', '(sin grabar)') AS prioridad_actual,
    data ->> 'color'                              AS color_actual
FROM public.clients
WHERE coalesce(data ->> 'ownerAgencyId', '') <> ''
  AND coalesce(data ->> 'isAgency', 'false') <> 'true'
  AND coalesce(data ->> 'priority', '') IS DISTINCT FROM 'normal'
ORDER BY data ->> 'ownerAgencyId', data ->> 'name';

-- ── 2. CAMBIO ───────────────────────────────────────────────────────────────
BEGIN;

UPDATE public.clients
SET data = jsonb_set(
        CASE
            -- El rojo de Urgente pasa al gris de Estándar; otro color no se pisa.
            WHEN coalesce(data ->> 'color', '') IN ('', '#ef4444')
                THEN jsonb_set(data, '{color}', '"#64748b"', true)
            ELSE data
        END,
        '{priority}', '"normal"', true
    )
WHERE coalesce(data ->> 'ownerAgencyId', '') <> ''
  AND coalesce(data ->> 'isAgency', 'false') <> 'true'
  AND coalesce(data ->> 'priority', '') IS DISTINCT FROM 'normal';

-- Cuántas quedan sin ser Estándar dentro de las bases de agencia: debe dar 0.
SELECT count(*) AS fichas_de_agencia_no_estandar
FROM public.clients
WHERE coalesce(data ->> 'ownerAgencyId', '') <> ''
  AND coalesce(data ->> 'isAgency', 'false') <> 'true'
  AND coalesce(data ->> 'priority', '') IS DISTINCT FROM 'normal';

COMMIT;
