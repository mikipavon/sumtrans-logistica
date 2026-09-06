-- ============================================================
-- 21. Cada envío nuevo se empareja solo con la ficha del destinatario
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-06
--
-- QUÉ PASABA
--
-- El portal del cliente teclea el destinatario a mano (nombre, dirección, CP y
-- población) y el envío nace sin ningún enlace a nuestras fichas. El cliente
-- no puede ver cómo tenemos nosotros a esa empresa —sólo lee su propia ficha—,
-- así que escribe "Ferretería Pérez" cuando en cartera está como "Ferretería
-- Pérez e Hijos S.L. (la del polígono)". Al entregar, la app busca la ficha
-- por nombre EXACTO, no la encuentra, y crea otra: dos fichas de la misma
-- empresa, y la nueva sin tarifa, sin GPS y sin su número de cliente.
--
-- QUÉ HACE ESTO
--
-- El emparejamiento se hace aquí, en la base de datos, donde se ven todas las
-- fichas, y no en el navegador del cliente, que no ve ninguna. Un trigger mira
-- cada envío que entra (o al que le cambian el destinatario) y, si encuentra
-- la ficha, le graba en `data`:
--
--   destinatarioId            id de la ficha
--   destinatarioSedeId        id de la sede, si el que coincide es una sede
--   destinatarioEmparejadoPor 'nombre' o 'direccion', para saber por qué
--
-- El TEXTO del envío no se toca: el cliente sigue viendo en su portal lo que
-- escribió, y el repartidor ve el nombre de nuestra ficha porque su pantalla
-- lo saca por el enlace (nombreDestinatarioEnRuta en shipmentUtils.js).
--
-- CÓMO EMPAREJA, en este orden
--
--   1. Por nombre: el nombre del envío es el comercial, el fiscal o el de una
--      sede, sin tildes, mayúsculas ni espacios de más (nombre_normalizado).
--   2. Por dirección: mismo CP (si los dos lo traen), la calle y el número de
--      uno contienen a los del otro, y los nombres comparten al menos una
--      palabra con sustancia. Lo último evita casar a dos empresas que
--      comparten nave: "Juan Gómez" en la dirección de "Ferretería Pérez" no
--      es Ferretería Pérez.
--
-- Si no hay coincidencia clara, no se inventa nada: el envío queda sin enlace
-- y la ficha nace en la entrega como hasta ahora, y Validar avisa si se parece
-- a alguna.
--
-- FICHAS DE AGENCIA: los destinatarios de TSB, TXT y XPO viven en su propia
-- bolsa (ownerAgencyId). Sólo se casan con un envío cuyo porte lo paga esa
-- misma agencia; para el resto no existen.
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta. Al final empareja
-- también los envíos que ya estaban en la tabla sin enlace.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Palabras con sustancia de un nombre
--
-- Para decidir si dos nombres "se parecen": fuera siglas de sociedad, artículos
-- y palabras de menos de tres letras. "Ferretería Pérez" y "Ferretería Pérez e
-- Hijos S.L." comparten 'ferreteria' y 'perez'; "Juan Gómez" no comparte nada.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.palabras_del_nombre(txt TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT w), '{}'::TEXT[])
  FROM unnest(string_to_array(
         regexp_replace(public.nombre_normalizado(txt), '[^a-z0-9]+', ' ', 'g'),
         ' '
       )) AS w
  WHERE length(w) >= 3
    AND w NOT IN ('los', 'las', 'del', 'the', 'and', 'una', 'uno', 'con', 'por', 'para',
                  'slu', 'sll', 'sal', 'scp', 'coop', 'ltd', 'inc', 'hnos', 'hermanos',
                  'hijos', 'sucesores', 'grupo', 'group');
$$;


-- ────────────────────────────────────────────────────────────
-- 2. Palabras con sustancia de una dirección
--
-- Fuera el tipo de vía y las partículas: "C/ Mayor, 3 - Nave 2" y "Calle Mayor
-- nº 3 nave 2" tienen que quedar en las mismas palabras ('mayor','3','nave','2').
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.palabras_de_la_direccion(txt TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT w), '{}'::TEXT[])
  FROM unnest(string_to_array(
         regexp_replace(public.nombre_normalizado(txt), '[^a-z0-9]+', ' ', 'g'),
         ' '
       )) AS w
  WHERE w <> ''
    AND w NOT IN ('c', 'cl', 'calle', 'av', 'avd', 'avda', 'avenida', 'pol', 'pg', 'pi',
                  'poligono', 'ind', 'industrial', 'ctra', 'cr', 'carretera', 'pl', 'pza',
                  'plaza', 'ps', 'po', 'paseo', 'cno', 'cm', 'camino', 'urb', 'urbanizacion',
                  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'n', 'no', 'num', 'numero',
                  's', 'sn', 'km', 'esq', 'esquina', 'bajo', 'bajos');
$$;


-- ────────────────────────────────────────────────────────────
-- 3. Buscar la ficha de un destinatario
--
-- Devuelve como mucho una fila: la ficha (y la sede, si es una sede) con la
-- que casa el destinatario, y por qué. Vacío si no hay nada claro.
--
-- SECURITY DEFINER porque la llama el trigger en nombre de quien inserta, y un
-- cliente del portal sólo ve su propia ficha. search_path fijo, como en la
-- fase 14.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emparejar_destinatario(
  p_nombre    TEXT,
  p_direccion TEXT,
  p_cp        TEXT,
  p_pagador   TEXT   -- quien paga el porte, para saber si el envío es de una agencia
)
RETURNS TABLE (ficha_id JSONB, sede_id JSONB, motivo TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _nombre      TEXT   := public.nombre_normalizado(p_nombre);
  _cp          TEXT   := btrim(coalesce(p_cp, ''));
  _direccion   TEXT[] := public.palabras_de_la_direccion(p_direccion);
  _palabras    TEXT[] := public.palabras_del_nombre(p_nombre);
  _agencia     TEXT;
  _con_numero  BOOLEAN;
BEGIN
  IF _nombre = '' THEN
    RETURN;
  END IF;

  -- La dirección sólo vale para casar si trae un número: "Polígono Sur" a
  -- secas es media comarca.
  _con_numero := EXISTS (SELECT 1 FROM unnest(_direccion) w WHERE w ~ '^[0-9]+[a-z]?$');

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
    -- Cada ficha y cada sede como una fila, con sus datos de dirección.
    SELECT c.id                                   AS cid,
           to_jsonb(c.id)                          AS ficha,
           NULL::jsonb                             AS sede,
           c.name                                  AS nombre,
           c.data->>'legalName'                    AS fiscal,
           c.data->>'address'                      AS direccion,
           c.data->>'zip'                          AS cp,
           c.data->>'ownerAgencyId'                AS agencia,
           c.data->>'status'                       AS estado
    FROM public.clients c
    UNION ALL
    SELECT c.id,
           to_jsonb(c.id),
           s->'id',
           s->>'name',
           NULL,
           s->>'address',
           s->>'zip',
           c.data->>'ownerAgencyId',
           c.data->>'status'
    FROM public.clients c
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE jsonb_typeof(c.data->'branches') WHEN 'array' THEN c.data->'branches' ELSE '[]'::jsonb END
    ) s
  ),
  candidatas AS (
    SELECT f.ficha, f.sede,
           CASE
             WHEN public.nombre_normalizado(f.nombre) = _nombre
               OR public.nombre_normalizado(f.fiscal) = _nombre
             THEN 'nombre'
             WHEN _con_numero
               AND (_cp = '' OR btrim(coalesce(f.cp, '')) = '' OR btrim(f.cp) = _cp)
               AND cardinality(public.palabras_de_la_direccion(f.direccion)) > 0
               AND (public.palabras_de_la_direccion(f.direccion) @> _direccion
                    OR _direccion @> public.palabras_de_la_direccion(f.direccion))
               AND public.palabras_del_nombre(f.nombre) && _palabras
             THEN 'direccion'
           END AS motivo,
           f.sede IS NOT NULL AS es_sede,
           f.estado,
           f.cid
    FROM fichas f
    WHERE coalesce(f.agencia, '') = '' OR f.agencia = coalesce(_agencia, '')
  )
  SELECT k.ficha, k.sede, k.motivo
  FROM candidatas k
  WHERE k.motivo IS NOT NULL
    AND coalesce(k.estado, '') <> 'rejected'
  ORDER BY
    CASE k.motivo WHEN 'nombre' THEN 0 ELSE 1 END,
    -- Una ficha validada antes que una pendiente; la madre antes que la sede
    -- a igualdad de motivo.
    CASE WHEN coalesce(k.estado, '') = 'pending' THEN 1 ELSE 0 END,
    k.es_sede,
    k.cid
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.emparejar_destinatario(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emparejar_destinatario(TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. El trigger
--
-- BEFORE, para escribir en NEW.data sin una segunda escritura. Corre al
-- insertar y en cada cambio de `data`, pero sale al instante si el envío ya
-- tiene enlace; sólo trabaja de verdad con los que siguen sin él. Así un envío
-- que no casó al nacer se engancha solo cuando la ficha aparece más tarde (la
-- crea la entrega) y se vuelve a tocar el albarán.
--
-- Si la oficina cambia el destinatario de un envío ya enlazado, el enlace viejo
-- se tira y se busca de nuevo: no se puede quedar apuntando a quien ya no es.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emparejar_destinatario_del_envio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r RECORD;
BEGIN
  IF NEW.data IS NULL OR jsonb_typeof(NEW.data) <> 'object' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.data->>'destinationName') IS DISTINCT FROM (NEW.data->>'destinationName') THEN
    NEW.data := NEW.data - 'destinatarioId' - 'destinatarioSedeId' - 'destinatarioEmparejadoPor';
  END IF;

  IF coalesce(NEW.data->>'destinatarioId', '') <> '' THEN
    RETURN NEW;
  END IF;

  IF btrim(coalesce(NEW.data->>'destinationName', '')) = '' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _r
  FROM public.emparejar_destinatario(
    NEW.data->>'destinationName',
    coalesce(nullif(NEW.data->>'destinationAddress', ''), NEW.data->>'destination'),
    NEW.data->>'destinationZip',
    CASE WHEN NEW.data->>'porteType' = 'Debido'
         THEN NEW.data->>'destinationName'
         ELSE coalesce(nullif(NEW.data->>'client', ''), NEW.data->>'originName') END
  )
  LIMIT 1;

  IF FOUND THEN
    NEW.data := NEW.data
      || jsonb_build_object('destinatarioId', _r.ficha_id, 'destinatarioEmparejadoPor', _r.motivo)
      || CASE WHEN _r.sede_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('destinatarioSedeId', _r.sede_id) END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emparejar_destinatario ON public.shipments;

CREATE TRIGGER trg_emparejar_destinatario
  BEFORE INSERT OR UPDATE OF data ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.emparejar_destinatario_del_envio();


-- ────────────────────────────────────────────────────────────
-- 5. Los envíos que ya estaban
--
-- Tocar `data` sin cambiarla dispara el trigger, que sólo actúa sobre los que
-- no tienen enlace. Los que no casen se quedan como estaban.
-- ────────────────────────────────────────────────────────────
UPDATE public.shipments
SET data = data
WHERE jsonb_typeof(data) = 'object'
  AND coalesce(data->>'destinatarioId', '') = ''
  AND btrim(coalesce(data->>'destinationName', '')) <> '';


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN
--
--   select data->>'destinationName' as escrito,
--          c.name                    as ficha,
--          data->>'destinatarioEmparejadoPor' as por
--   from public.shipments s
--   left join public.clients c on c.id::text = s.data->>'destinatarioId'
--   where s.data ? 'destinatarioId'
--   order by s.created_at desc nulls last
--   limit 50;
--
-- Y para ver los que se han quedado sin pareja:
--
--   select id, data->>'destinationName', data->>'destinationAddress', data->>'destinationZip'
--   from public.shipments
--   where coalesce(data->>'destinatarioId','') = ''
--   order by id desc limit 50;
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _con INTEGER;
  _sin INTEGER;
BEGIN
  SELECT count(*) FILTER (WHERE coalesce(data->>'destinatarioId', '') <> ''),
         count(*) FILTER (WHERE coalesce(data->>'destinatarioId', '') = ''
                            AND btrim(coalesce(data->>'destinationName', '')) <> '')
  INTO _con, _sin
  FROM public.shipments
  WHERE jsonb_typeof(data) = 'object';

  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE '✅ Trigger trg_emparejar_destinatario instalado';
  RAISE NOTICE '   Envios con ficha de destinatario: %', _con;
  RAISE NOTICE '   Envios sin pareja clara:          %', _sin;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
