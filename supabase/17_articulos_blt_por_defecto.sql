-- ============================================================
-- FASE 17: BLT_5 a BLT_10 disponibles en todas las fichas
-- Proyecto: SUM Transportes (principal)
-- Fecha: 2026-08-21
-- Descripción:
--   Hasta ahora cada ficha de cliente decidía qué bultos se ofrecen al crear
--   un envío (clients.data->'allowedArticles'). De 503 clientes, 467 tenían su
--   propia lista —casi siempre BLT_1 a BLT_4— y 36 no tenían ninguna.
--
--   Aquí se añaden BLT_5..BLT_10 al FINAL de la lista de los que ya tienen una.
--   Al final y no al principio porque el orden del array es el orden en que
--   aparecen los artículos al crear el envío, y BLT_1..4 deben seguir primero.
--
--   Los 36 sin lista NO se tocan: se resuelven en el código (STD_IDS de
--   CreateShipmentModal), que pasa a incluir BLT_1..BLT_10. Darles aquí una
--   lista explícita sería peor: los 4 clientes "Por Kilos" sin lista reciben
--   hoy TODOS los bultos y palets automáticamente, y escribirles una lista de
--   seis los dejaría con menos artículos que antes.
--
--   Los ids se insertan como NÚMERO, no como texto. En la tabla conviven los
--   dos tipos (1832 numéricos y 184 de texto, de importaciones antiguas). La
--   pantalla de envíos tolera ambos, pero la ficha del cliente compara con
--   includes(a.id) sin convertir, así que un id de texto no se vería marcado.
--
-- IDEMPOTENTE: comprueba las dos formas (número y texto) antes de añadir, así
-- que ejecutarlo dos veces no duplica nada.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Fotografía previa, para poder comparar después
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _con_lista INTEGER;
  _ya_tienen INTEGER;
BEGIN
  SELECT count(*) INTO _con_lista
    FROM public.clients
   WHERE jsonb_array_length(coalesce(data->'allowedArticles','[]'::jsonb)) > 0;

  SELECT count(*) INTO _ya_tienen
    FROM public.clients
   WHERE coalesce(data->'allowedArticles','[]'::jsonb) @> '1774442159095'::jsonb;

  RAISE NOTICE 'Antes: % fichas con lista propia, % ya tenían BLT_5', _con_lista, _ya_tienen;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. Añadir los que falten, al final de la lista
-- ────────────────────────────────────────────────────────────
UPDATE public.clients c
   SET data = jsonb_set(
         c.data,
         '{allowedArticles}',
         coalesce(c.data->'allowedArticles','[]'::jsonb) || (
           SELECT coalesce(jsonb_agg(to_jsonb(v.id)), '[]'::jsonb)
             FROM (VALUES
                     (1774442159095::bigint),  -- BLT_5
                     (1774442159096::bigint),  -- BLT_6
                     (1774442159097::bigint),  -- BLT_7
                     (1774442159098::bigint),  -- BLT_8
                     (1774442159099::bigint),  -- BLT_9
                     (1774442159100::bigint)   -- BLT_10
                   ) AS v(id)
            -- Se comprueban las dos formas: si la ficha ya lo tiene como texto
            -- no se añade otra vez como número.
            WHERE NOT (coalesce(c.data->'allowedArticles','[]'::jsonb) @> to_jsonb(v.id))
              AND NOT (coalesce(c.data->'allowedArticles','[]'::jsonb) @> to_jsonb(v.id::text))
         )
       )
 WHERE jsonb_array_length(coalesce(c.data->'allowedArticles','[]'::jsonb)) > 0;

-- ────────────────────────────────────────────────────────────
-- 3. Verificación
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _con_lista INTEGER;
  _completos INTEGER;
BEGIN
  SELECT count(*) INTO _con_lista
    FROM public.clients
   WHERE jsonb_array_length(coalesce(data->'allowedArticles','[]'::jsonb)) > 0;

  SELECT count(*) INTO _completos
    FROM public.clients
   WHERE coalesce(data->'allowedArticles','[]'::jsonb) @> '[1774442159095,1774442159096,1774442159097,1774442159098,1774442159099,1774442159100]'::jsonb;

  IF _completos < _con_lista THEN
    RAISE WARNING 'Solo % de % fichas con lista tienen los seis BLT nuevos', _completos, _con_lista;
  ELSE
    RAISE NOTICE '✅ Las % fichas con lista propia tienen BLT_5..BLT_10', _completos;
  END IF;
END $$;

-- Muestra de control: las diez primeras fichas y cuántos artículos les quedan.
SELECT data->>'name' AS cliente,
       jsonb_array_length(data->'allowedArticles') AS n_articulos
  FROM public.clients
 WHERE jsonb_array_length(coalesce(data->'allowedArticles','[]'::jsonb)) > 0
 ORDER BY id
 LIMIT 10;

-- ════════════════════════════════════════════════════════════
-- CÓMO DESHACERLO
-- ════════════════════════════════════════════════════════════
-- UPDATE public.clients c
--    SET data = jsonb_set(c.data, '{allowedArticles}', (
--          SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
--            FROM jsonb_array_elements(c.data->'allowedArticles') e
--           WHERE e NOT IN ('1774442159095'::jsonb, '1774442159096'::jsonb,
--                           '1774442159097'::jsonb, '1774442159098'::jsonb,
--                           '1774442159099'::jsonb, '1774442159100'::jsonb)
--        ))
--  WHERE c.data->'allowedArticles' @> '1774442159095'::jsonb;
--
-- Ojo: eso quitaría los seis también a quien los tuviera puestos a mano de
-- antes. Los que ya los tenían salen en el NOTICE del paso 1.
-- ============================================================
