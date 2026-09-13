-- ============================================================
-- 27. La agenda del portal también desde la vista de administración
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-13
--
-- QUÉ PASABA
--
-- La agenda de la fase 26 decide de quién es por la cuenta conectada
-- (get_linked_id). Cuando la oficina entra en el portal de un cliente desde
-- administración ("Vista de administración — estás dentro del portal de…"),
-- la cuenta conectada es la del administrador, la función no devolvía nada y
-- el portal caía en la agenda local: la de los 90 días cargados, con los
-- nombres tecleados en vez de los de la ficha. La oficina veía una cosa y el
-- cliente otra, y no había manera de probar desde dentro lo que ve el cliente.
--
-- QUÉ HACE ESTO
--
-- La función admite el id de la ficha como parámetro. Un cliente lo trae y se
-- ignora: para él manda siempre su cuenta, como antes. Un administrador lo
-- trae y se usa. Cualquier otro rol no recibe nada.
--
-- La firma cambia (antes sin parámetros), así que se tira la versión vieja
-- para que no convivan dos y PostgREST no dude a cuál llamar.
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Los nombres de una ficha cualquiera
--
-- Lo mismo que nombres_del_cliente_conectado (fase 20) pero para la ficha que
-- se le diga. Sin permiso de ejecución para nadie: sólo la llama la agenda,
-- que corre como el dueño. Así un cliente no puede ir preguntando por los
-- nombres de fichas ajenas.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nombres_de_la_ficha(p_id TEXT)
RETURNS TEXT[]
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT array_remove(array_agg(DISTINCT nombre), '')
  FROM public.clients c
  CROSS JOIN LATERAL (
    SELECT public.nombre_normalizado(c.name)              AS nombre
    UNION ALL
    SELECT public.nombre_normalizado(c.data->>'legalName')
    UNION ALL
    SELECT public.nombre_normalizado(sede->>'name')
      FROM jsonb_array_elements(
             CASE jsonb_typeof(c.data->'branches')
               WHEN 'array' THEN c.data->'branches'
               ELSE '[]'::jsonb
             END
           ) AS sede
  ) AS nombres
  WHERE c.id::text = p_id;
$$;

REVOKE ALL ON FUNCTION public.nombres_de_la_ficha(TEXT) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. La agenda, con la ficha como parámetro
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.agenda_destinatarios_del_cliente_conectado();

CREATE OR REPLACE FUNCTION public.agenda_destinatarios_del_cliente_conectado(p_cliente TEXT DEFAULT NULL)
RETURNS TABLE (
  nombre       TEXT,
  direccion    TEXT,
  cp           TEXT,
  poblacion    TEXT,
  ficha_id     JSONB,
  sede_id      JSONB,
  veces        INTEGER,
  ultimo_envio TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _rol     TEXT := public.get_user_role();
  _id      TEXT;
  _nombres TEXT[];
BEGIN
  -- De quién es la agenda: el cliente, de la suya y de nadie más; la oficina,
  -- de la ficha que pida.
  IF _rol = 'client' THEN
    _id := public.get_linked_id();
  ELSIF _rol = 'admin' THEN
    _id := nullif(btrim(coalesce(p_cliente, '')), '');
  ELSE
    RETURN;
  END IF;

  IF coalesce(_id, '') = '' THEN
    RETURN;
  END IF;

  _nombres := coalesce(public.nombres_de_la_ficha(_id), '{}'::TEXT[]);

  RETURN QUERY
  WITH envios AS (
    SELECT btrim(s.data->>'destinationName')                                              AS escrito,
           nullif(btrim(coalesce(nullif(s.data->>'destinationAddress', ''),
                                 s.data->>'destination')), '')                           AS direccion,
           nullif(btrim(s.data->>'destinationZip'), '')                                   AS cp,
           nullif(btrim(s.data->>'destinationCity'), '')                                  AS poblacion,
           nullif(s.data->>'destinatarioId', '')                                          AS ficha,
           nullif(s.data->>'destinatarioSedeId', '')                                      AS sede,
           coalesce(s.data->>'createdAt', '')                                             AS momento
    FROM public.shipments s
    WHERE jsonb_typeof(s.data) = 'object'
      AND btrim(coalesce(s.data->>'destinationName', '')) <> ''
      AND (
        s.data->>'clientId' = _id
        OR public.nombre_normalizado(s.data->>'client')     = ANY (_nombres)
        OR public.nombre_normalizado(s.data->>'originName') = ANY (_nombres)
      )
      AND coalesce(s.data->>'destinatarioId', '') <> _id
      AND NOT (public.nombre_normalizado(s.data->>'destinationName') = ANY (_nombres))
  ),
  agrupados AS (
    SELECT CASE WHEN e.ficha IS NOT NULL
                THEN 'f:' || e.ficha || ':' || coalesce(e.sede, '')
                ELSE 'n:' || public.nombre_normalizado(e.escrito)
           END                                                                    AS clave,
           max(e.ficha)                                                           AS ficha,
           max(e.sede)                                                            AS sede,
           count(*)::INTEGER                                                      AS veces,
           max(e.momento)                                                         AS ultimo,
           (array_remove(array_agg(e.escrito   ORDER BY e.momento DESC), NULL))[1] AS escrito,
           (array_remove(array_agg(e.direccion ORDER BY e.momento DESC), NULL))[1] AS direccion,
           (array_remove(array_agg(e.cp        ORDER BY e.momento DESC), NULL))[1] AS cp,
           (array_remove(array_agg(e.poblacion ORDER BY e.momento DESC), NULL))[1] AS poblacion
    FROM envios e
    GROUP BY 1
  ),
  con_ficha AS (
    SELECT a.*,
           c.id                     AS cid,
           c.name                   AS ficha_nombre,
           c.data->>'address'       AS ficha_direccion,
           c.data->>'zip'           AS ficha_cp,
           c.data->>'city'          AS ficha_poblacion,
           c.data->>'status'        AS ficha_estado,
           sd.s                     AS sede_json
    FROM agrupados a
    LEFT JOIN public.clients c
      ON a.ficha IS NOT NULL AND c.id::text = a.ficha
    LEFT JOIN LATERAL (
      SELECT x AS s
      FROM jsonb_array_elements(
             CASE jsonb_typeof(c.data->'branches')
               WHEN 'array' THEN c.data->'branches'
               ELSE '[]'::jsonb
             END
           ) AS x
      WHERE a.sede IS NOT NULL AND x->>'id' = a.sede
      LIMIT 1
    ) sd ON TRUE
  )
  SELECT
    CASE WHEN k.cid IS NOT NULL AND coalesce(k.ficha_estado, '') <> 'rejected'
         THEN coalesce(nullif(btrim(coalesce(k.sede_json->>'name', '')), ''),
                       nullif(btrim(coalesce(k.ficha_nombre, '')), ''),
                       k.escrito)
         ELSE k.escrito END                                                       AS nombre,
    CASE WHEN k.cid IS NOT NULL AND coalesce(k.ficha_estado, '') <> 'rejected'
         THEN coalesce(nullif(btrim(coalesce(k.sede_json->>'address', '')), ''),
                       nullif(btrim(coalesce(k.ficha_direccion, '')), ''),
                       k.direccion)
         ELSE k.direccion END                                                     AS direccion,
    CASE WHEN k.cid IS NOT NULL AND coalesce(k.ficha_estado, '') <> 'rejected'
         THEN coalesce(nullif(btrim(coalesce(k.sede_json->>'zip', '')), ''),
                       nullif(btrim(coalesce(k.ficha_cp, '')), ''),
                       k.cp)
         ELSE k.cp END                                                            AS cp,
    CASE WHEN k.cid IS NOT NULL AND coalesce(k.ficha_estado, '') <> 'rejected'
         THEN coalesce(nullif(btrim(coalesce(k.sede_json->>'city', '')), ''),
                       nullif(btrim(coalesce(k.ficha_poblacion, '')), ''),
                       k.poblacion)
         ELSE k.poblacion END                                                     AS poblacion,
    CASE WHEN k.cid IS NOT NULL AND coalesce(k.ficha_estado, '') <> 'rejected'
         THEN to_jsonb(k.cid) ELSE NULL END                                       AS ficha_id,
    CASE WHEN k.cid IS NOT NULL AND coalesce(k.ficha_estado, '') <> 'rejected'
         THEN k.sede_json->'id' ELSE NULL END                                     AS sede_id,
    k.veces,
    k.ultimo                                                                      AS ultimo_envio
  FROM con_ficha k
  ORDER BY k.veces DESC, k.ultimo DESC, 1;
END;
$$;

REVOKE ALL ON FUNCTION public.agenda_destinatarios_del_cliente_conectado(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_destinatarios_del_cliente_conectado(TEXT) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN
--
-- Como administrador, desde el editor SQL, poniéndose en la piel de la cuenta
-- de la oficina (fase 20) y pidiendo la ficha por su id:
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid del administrador>","role":"authenticated"}';
--   select * from public.agenda_destinatarios_del_cliente_conectado('<id de la ficha>');
--   rollback;
--
-- Y como cliente, el parámetro tiene que dar igual: con su id, con otro o sin
-- nada, sale siempre SU agenda.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _vieja BOOLEAN;
  _nueva BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'agenda_destinatarios_del_cliente_conectado'
                   AND p.pronargs = 0)
    INTO _vieja;
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'agenda_destinatarios_del_cliente_conectado'
                   AND p.pronargs = 1)
    INTO _nueva;

  RAISE NOTICE '══════════════════════════════════════';
  IF _nueva AND NOT _vieja THEN
    RAISE NOTICE '✅ Agenda del portal: vale también desde la vista de administración';
  ELSE
    RAISE WARNING '❌ Algo no cuadra: nueva=% vieja=%', _nueva, _vieja;
  END IF;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
