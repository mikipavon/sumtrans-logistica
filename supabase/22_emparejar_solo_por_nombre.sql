-- ============================================================
-- 22. El destinatario sólo se empareja por nombre exacto
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-07
--
-- QUÉ PASABA
--
-- La fase 21 tenía una segunda vía de emparejamiento "por dirección": mismo
-- CP, una dirección contenida en la otra y una palabra del nombre en común.
-- Con un albarán sin calle, el trigger usaba de respaldo el campo
-- `destination` (", 14000 CORDOBA"), tomaba el CP por número de portal, y
-- cualquier ficha de Córdoba que compartiera una palabra del nombre valía:
-- "SAFAMOTOR QUEMADAS" se enganchó a "Bobinados las quemadas" y "Raúl millan"
-- a "Rafael millan". El repartidor veía en la tarjeta un destinatario que no
-- era, mientras administración (que enseña el texto escrito) salía bien.
--
-- QUÉ HACE ESTO
--
-- Se elimina la vía por dirección. Un envío sólo se enlaza con una ficha
-- cuando el nombre escrito coincide exactamente (sin tildes, mayúsculas ni
-- espacios de más) con el nombre comercial, el fiscal o el de una sede. Si no
-- coincide, el envío queda sin enlace y el repartidor ve lo que se escribió
-- en el albarán, que es lo que ve la oficina.
--
-- Al final suelta los enlaces que se hicieron por dirección. El trigger de la
-- fase 21 los vuelve a evaluar en la misma escritura: si el nombre casa se
-- enganchan por nombre; si no, se quedan sueltos.
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta. La firma de la
-- función no cambia, así que el trigger existente la sigue usando.
-- ============================================================


CREATE OR REPLACE FUNCTION public.emparejar_destinatario(
  p_nombre    TEXT,
  p_direccion TEXT,   -- se conserva por compatibilidad con el trigger; ya no se usa
  p_cp        TEXT,   -- ídem
  p_pagador   TEXT    -- quien paga el porte, para saber si el envío es de una agencia
)
RETURNS TABLE (ficha_id JSONB, sede_id JSONB, motivo TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _nombre   TEXT := public.nombre_normalizado(p_nombre);
  _agencia  TEXT;
BEGIN
  IF _nombre = '' THEN
    RETURN;
  END IF;

  -- Si el porte lo paga una agencia, sus destinatarios entran en juego.
  SELECT c.id::text INTO _agencia
  FROM public.clients c
  WHERE (c.data->>'isAgency') = 'true'
    AND public.nombre_normalizado(p_pagador) <> ''
    AND (
      public.nombre_normalizado(c.name) = public.nombre_normalizado(p_pagador)
      OR public.nombre_normalizado(c.data->>'legalName') = public.nombre_normalizado(p_pagador)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE jsonb_typeof(c.data->'branches') WHEN 'array' THEN c.data->'branches' ELSE '[]'::jsonb END
        ) s WHERE public.nombre_normalizado(s->>'name') = public.nombre_normalizado(p_pagador)
      )
    )
  LIMIT 1;

  RETURN QUERY
  WITH fichas AS (
    -- Cada ficha y cada sede como una fila.
    SELECT c.id                  AS cid,
           to_jsonb(c.id)         AS ficha,
           NULL::jsonb            AS sede,
           c.name                 AS nombre,
           c.data->>'legalName'   AS fiscal,
           c.data->>'ownerAgencyId' AS agencia,
           c.data->>'status'      AS estado
    FROM public.clients c
    UNION ALL
    SELECT c.id,
           to_jsonb(c.id),
           s->'id',
           s->>'name',
           NULL,
           c.data->>'ownerAgencyId',
           c.data->>'status'
    FROM public.clients c
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(c.data->'branches') WHEN 'array' THEN c.data->'branches' ELSE '[]'::jsonb END
    ) s
  )
  SELECT f.ficha, f.sede, 'nombre'::TEXT
  FROM fichas f
  WHERE (coalesce(f.agencia, '') = '' OR f.agencia = coalesce(_agencia, ''))
    AND coalesce(f.estado, '') <> 'rejected'
    AND (public.nombre_normalizado(f.nombre) = _nombre
         OR public.nombre_normalizado(f.fiscal) = _nombre)
  ORDER BY
    -- Una ficha validada antes que una pendiente; la madre antes que la sede.
    CASE WHEN coalesce(f.estado, '') = 'pending' THEN 1 ELSE 0 END,
    f.sede IS NOT NULL,
    f.cid
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.emparejar_destinatario(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emparejar_destinatario(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- Soltar los enlaces hechos por dirección
--
-- El trigger (BEFORE UPDATE OF data) ve que el envío ya no tiene enlace y lo
-- vuelve a buscar, ahora sólo por nombre.
-- ────────────────────────────────────────────────────────────
UPDATE public.shipments
SET data = data - 'destinatarioId' - 'destinatarioSedeId' - 'destinatarioEmparejadoPor'
WHERE jsonb_typeof(data) = 'object'
  AND data->>'destinatarioEmparejadoPor' = 'direccion';


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN: no tiene que quedar ningún envío emparejado por dirección.
--
--   select s.id, s.data->>'destinationName' as escrito, c.name as ficha,
--          s.data->>'destinatarioEmparejadoPor' as por
--   from public.shipments s
--   left join public.clients c on c.id::text = s.data->>'destinatarioId'
--   where s.data ? 'destinatarioId'
--   order by s.id;
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _dir INTEGER;
BEGIN
  SELECT count(*) INTO _dir
  FROM public.shipments
  WHERE jsonb_typeof(data) = 'object'
    AND data->>'destinatarioEmparejadoPor' = 'direccion';
  IF _dir > 0 THEN
    RAISE EXCEPTION 'Fase 22: quedan % envíos emparejados por dirección', _dir;
  END IF;
  RAISE NOTICE 'Fase 22 aplicada: el destinatario sólo se empareja por nombre exacto.';
END $$;
