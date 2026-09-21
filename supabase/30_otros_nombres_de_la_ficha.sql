-- ============================================================
-- 30. La ficha responde también a sus «Otros nombres»
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-21
--
-- QUÉ PASABA
--
-- Cada remitente escribe al destinatario a su manera: "AGROCOR", "Comercial
-- Agrocor", "AGROCOR TORRECILLA". El emparejado (fases 21/22) sólo casa el
-- nombre comercial, la razón social y el nombre de las sedes, así que cada
-- forma nueva llegaba sin enlace, el conductor no veía la ficha al entregar y
-- la app le creaba otra pendiente. La única manera de que la ficha
-- respondiera a otro nombre era colgarle una sede, y así una empresa con una
-- sola nave acababa en la lista con "7 sedes" que no existen.
--
-- QUÉ HACE ESTO
--
-- La ficha lleva en `data.otrosNombres` una lista de textos (la pestaña
-- «Nombres» de la ficha, y el botón «Es esta ficha: vincular» de Validar
-- Clientes). Aquí `emparejar_destinatario` los trata igual que el nombre
-- comercial y la razón social: un albarán con cualquiera de ellos se engancha
-- a la ficha madre (sin sede). Y para saber si el pagador es una agencia,
-- también valen.
--
-- Todo lo demás de la fase 22 se queda igual: sólo nombre exacto (sin tildes,
-- mayúsculas ni espacios de más), una ficha validada antes que una pendiente,
-- la madre antes que la sede, y las rechazadas fuera.
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta. La firma de la
-- función no cambia, así que el trigger de la fase 26 la sigue usando. Los
-- envíos que ya estaban sueltos se vuelven a mirar al final.
-- ============================================================


-- Los otros nombres de una ficha, como filas. Sin la lista, o si no es una
-- lista, no devuelve nada.
CREATE OR REPLACE FUNCTION public.otros_nombres_de_ficha(p_data JSONB)
RETURNS SETOF TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT n
  FROM jsonb_array_elements_text(
    CASE jsonb_typeof(p_data->'otrosNombres') WHEN 'array' THEN p_data->'otrosNombres' ELSE '[]'::jsonb END
  ) AS n
  WHERE btrim(coalesce(n, '')) <> '';
$$;


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
  _pagador  TEXT := public.nombre_normalizado(p_pagador);
  _agencia  TEXT;
BEGIN
  IF _nombre = '' THEN
    RETURN;
  END IF;

  -- Si el porte lo paga una agencia, sus destinatarios entran en juego.
  SELECT c.id::text INTO _agencia
  FROM public.clients c
  WHERE (c.data->>'isAgency') = 'true'
    AND _pagador <> ''
    AND (
      public.nombre_normalizado(c.name) = _pagador
      OR public.nombre_normalizado(c.data->>'legalName') = _pagador
      OR EXISTS (
        SELECT 1 FROM public.otros_nombres_de_ficha(c.data) o
        WHERE public.nombre_normalizado(o) = _pagador
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE jsonb_typeof(c.data->'branches') WHEN 'array' THEN c.data->'branches' ELSE '[]'::jsonb END
        ) s WHERE public.nombre_normalizado(s->>'name') = _pagador
      )
    )
  LIMIT 1;

  RETURN QUERY
  WITH fichas AS (
    -- La madre, por su nombre comercial y su razón social.
    SELECT c.id                    AS cid,
           to_jsonb(c.id)           AS ficha,
           NULL::jsonb              AS sede,
           c.name                   AS nombre,
           c.data->>'legalName'     AS fiscal,
           c.data->>'ownerAgencyId' AS agencia,
           c.data->>'status'        AS estado
    FROM public.clients c
    UNION ALL
    -- La madre otra vez, una fila por cada otro nombre (fase 30).
    SELECT c.id,
           to_jsonb(c.id),
           NULL::jsonb,
           o,
           NULL,
           c.data->>'ownerAgencyId',
           c.data->>'status'
    FROM public.clients c
    CROSS JOIN LATERAL public.otros_nombres_de_ficha(c.data) o
    UNION ALL
    -- Cada sede como una fila.
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

REVOKE ALL ON FUNCTION public.otros_nombres_de_ficha(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.otros_nombres_de_ficha(JSONB) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- Los envíos activos que siguen sin enlace se vuelven a mirar: si su nombre es
-- uno de los «Otros nombres» de una ficha, se enganchan. El trigger (BEFORE
-- UPDATE OF data) sólo trabaja con los que no tienen enlace, así que tocar
-- `data` sin cambiar nada basta para que lo evalúe. Los terminados se quedan
-- como están: al reparto ya no le sirven, y el botón de vincular ata a mano
-- los que la app tiene cargados.
--
-- Vale volver a lanzar sólo este bloque después de apuntar nombres a mano en
-- varias fichas, para que los albaranes en curso los cojan.
-- ────────────────────────────────────────────────────────────
UPDATE public.shipments
SET data = data
WHERE jsonb_typeof(data) = 'object'
  AND coalesce(data->>'destinatarioId', '') = ''
  AND btrim(coalesce(data->>'destinationName', '')) <> ''
  AND status NOT IN ('Entregado', 'Cancelado');
