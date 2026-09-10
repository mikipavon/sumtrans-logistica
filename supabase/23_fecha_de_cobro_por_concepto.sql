-- ============================================================================
-- 23. LA FECHA DE COBRO, UNA POR CONCEPTO (portePaidAt / codPaidAt)
-- ============================================================================
--
-- EL PROBLEMA
--
-- Un albarán guardaba UNA sola fecha de cobro (`paidAt`) para las dos cosas que se
-- cobran: el porte y el reembolso. Y muchas veces no se cobran el mismo día — el
-- reembolso al entregar, el porte cuando el cliente lo paga.
--
-- Al cobrar el segundo, la fecha del primero se pisaba con la de hoy. La Cuenta del
-- repartidor fecha cada concepto por esa fecha, así que el reembolso cobrado hace
-- días volvía a salir en la caja de hoy — y en la de QUIEN LO COBRÓ ENTONCES, que no
-- es quien acaba de cobrar el porte. Caso real (10/09/2026): Paco cobra los portes
-- pendientes de Carmen y a Juan Carlos le aparecen en su Cuenta los reembolsos de
-- HAB-122 (382,80 €) y HAB-145 (729,50 €), 1.112,30 € que no lleva encima.
--
-- LO QUE HACE ESTE SCRIPT
--
-- El código nuevo escribe `portePaidAt` y `codPaidAt`, cada uno con SU fecha. Los
-- albaranes de antes del cambio no las tienen, así que hay que rellenarlas: si no,
-- la Cuenta se sigue apañando con `paidAt` y esos albaranes conservan el fallo.
--
-- La fecha buena sale de los cobros que apuntó el móvil del repartidor, que sí están
-- separados por concepto y por día (`drivers.data -> collectedCollections_YYYY-MM-DD`).
-- Cuando un albarán no aparece ahí (cobros muy antiguos, o marcados desde la oficina)
-- se cae a su `paidAt`, que es lo mismo que se usaba hasta ahora.
--
-- No cambia ningún esquema: los albaranes son JSON dentro de `shipments.data`.
-- Es idempotente: sólo toca los albaranes cobrados a los que les falta la fecha.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run.
-- ============================================================================

BEGIN;

WITH cobros AS (
    -- Todos los cobros que apuntaron los móviles, uno por línea.
    SELECT
        c ->> 'shipmentId' AS shipment_id,
        CASE
            WHEN lower(coalesce(c ->> 'partType', '')) = 'reembolso' THEN 'cod'
            WHEN coalesce(c ->> 'type', '') = 'Reembolso'            THEN 'cod'
            ELSE 'porte'
        END AS concepto,
        -- La fecha del cobro; si la entrada no la trajo, la del día en cuya lista está.
        left(coalesce(
            nullif(c ->> 'date', ''),
            replace(dia.key, 'collectedCollections_', '')
        ), 10) AS fecha
    FROM drivers d
    CROSS JOIN LATERAL jsonb_each(coalesce(d.data, '{}'::jsonb)) AS dia(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(dia.value) = 'array' THEN dia.value ELSE '[]'::jsonb END
    ) AS c
    WHERE dia.key LIKE 'collectedCollections\_%'
      AND nullif(c ->> 'shipmentId', '') IS NOT NULL
),
primer_cobro AS (
    -- Si un albarán tiene varios apuntes del mismo concepto (un cobro deshecho y
    -- vuelto a hacer), manda el PRIMERO: es el día en que el dinero entró en caja.
    SELECT shipment_id, concepto, min(fecha) AS fecha
    FROM cobros
    WHERE fecha ~ '^\d{4}-\d{2}-\d{2}$'
    GROUP BY shipment_id, concepto
)
UPDATE shipments s
SET data = s.data
    || CASE
         WHEN coalesce(s.data ->> 'codPaid', '') IN ('true', 't')
              AND (s.data ->> 'codPaidAt') IS NULL
              AND coalesce(
                    (SELECT p.fecha FROM primer_cobro p
                      WHERE p.shipment_id = s.id::text AND p.concepto = 'cod'),
                    s.data ->> 'paidAt'
                  ) IS NOT NULL
         THEN jsonb_build_object('codPaidAt', coalesce(
                    (SELECT p.fecha FROM primer_cobro p
                      WHERE p.shipment_id = s.id::text AND p.concepto = 'cod'),
                    s.data ->> 'paidAt'
              ))
         ELSE '{}'::jsonb
       END
    || CASE
         WHEN coalesce(s.data ->> 'portePaid', '') IN ('true', 't')
              AND (s.data ->> 'portePaidAt') IS NULL
              AND coalesce(
                    (SELECT p.fecha FROM primer_cobro p
                      WHERE p.shipment_id = s.id::text AND p.concepto = 'porte'),
                    s.data ->> 'paidAt'
                  ) IS NOT NULL
         THEN jsonb_build_object('portePaidAt', coalesce(
                    (SELECT p.fecha FROM primer_cobro p
                      WHERE p.shipment_id = s.id::text AND p.concepto = 'porte'),
                    s.data ->> 'paidAt'
              ))
         ELSE '{}'::jsonb
       END
WHERE (coalesce(s.data ->> 'codPaid', '')   IN ('true', 't') AND (s.data ->> 'codPaidAt')   IS NULL)
   OR (coalesce(s.data ->> 'portePaid', '') IN ('true', 't') AND (s.data ->> 'portePaidAt') IS NULL);

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) Cuántos albaranes cobrados quedan sin fecha por concepto. Debe dar 0 y 0,
--    salvo los que nunca tuvieron ni paidAt ni apunte de cobro (cobros viejísimos).
--
-- SELECT
--     count(*) FILTER (WHERE coalesce(data ->> 'codPaid','')   IN ('true','t') AND (data ->> 'codPaidAt')   IS NULL) AS reembolsos_sin_fecha,
--     count(*) FILTER (WHERE coalesce(data ->> 'portePaid','') IN ('true','t') AND (data ->> 'portePaidAt') IS NULL) AS portes_sin_fecha
-- FROM shipments;
--
-- 2) Los albaranes donde las dos fechas NO coinciden: son exactamente los que la
--    Cuenta estaba contando dos veces, y ahora cada concepto cae en su día.
--
-- SELECT id,
--        data ->> 'client'      AS cliente,
--        data ->> 'paidAt'      AS paid_at_comun,
--        data ->> 'portePaidAt' AS cobro_porte,
--        data ->> 'codPaidAt'   AS cobro_reembolso
-- FROM shipments
-- WHERE (data ->> 'portePaidAt') IS NOT NULL
--   AND (data ->> 'codPaidAt')   IS NOT NULL
--   AND left(data ->> 'portePaidAt', 10) <> left(data ->> 'codPaidAt', 10)
-- ORDER BY data ->> 'codPaidAt' DESC;
