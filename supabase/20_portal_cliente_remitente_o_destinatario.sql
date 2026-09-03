-- ============================================================
-- 20. El cliente ve TODO envío suyo: lo mande él o lo reciba él
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-02
--
-- QUÉ PASABA
--
-- En el portal, un cliente sólo veía los envíos que llevaban grabado su id
-- (`data->>'clientId'`), y ese campo lo escribe ÚNICAMENTE el propio portal
-- cuando el cliente se da de alta un envío él mismo. Todo lo que teclea la
-- oficina —que es la mayoría, y en particular casi todos los portes debidos—
-- nace sin `clientId`: sólo lleva los nombres (`client`, `originName`,
-- `destinationName`). Esos albaranes no le llegaban al navegador siquiera, así
-- que por mucho que la pantalla los buscara no estaban.
--
-- Y `destinatarioId`, la otra mitad de la regla anterior, no lo escribe nadie:
-- no existe en la aplicación. O sea que el lado del destinatario nunca contó.
--
-- QUÉ HACE ESTO
--
-- La regla pasa a ser la que pidió la oficina: si el cliente aparece como
-- REMITENTE o como DESTINATARIO, el envío es suyo y lo ve. Da igual quién pague
-- el porte —pagado o debido— porque quién paga decide qué importes se le
-- enseñan, no si el albarán le sale.
--
-- Como la oficina teclea los nombres a mano, la comparación se hace con el
-- nombre normalizado (sin tildes, sin mayúsculas y sin espacios de más), y
-- valen todos los nombres de la ficha: el comercial, el fiscal y el de cada
-- sede. Es la misma regla que aplica la pantalla en
-- `papelDelClienteEnElEnvio` (src/utils/shipmentUtils.js): las dos tienen que
-- decir lo mismo o el cliente ve una cosa y la aplicación cuenta otra.
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Normalizar un nombre igual que lo hace la aplicación
--
-- Sin `unaccent` a propósito: es una extensión y no está garantizada en el
-- proyecto. `translate` cubre de sobra lo que se escribe en un albarán.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nombre_normalizado(txt TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    lower(translate(
      coalesce(txt, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
    )),
    '\s+', ' ', 'g'
  ));
$$;


-- ────────────────────────────────────────────────────────────
-- 2. Todos los nombres con los que puede venir escrito el cliente conectado
--
-- Devuelve el nombre comercial, el fiscal y el de cada sede, ya normalizados.
-- Las cadenas vacías se quitan: si se colara una, cualquier albarán sin
-- destinatario escrito daría positivo y el cliente vería envíos ajenos.
--
-- SECURITY DEFINER porque un cliente sólo puede leer su propia ficha, y con
-- search_path fijo por lo mismo que en la fase 14 (asesor de Supabase).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.nombres_del_cliente_conectado()
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
  WHERE c.id::text = public.get_linked_id();
$$;


-- ────────────────────────────────────────────────────────────
-- 3. La política
--
-- Las llamadas a las funciones van envueltas en `(SELECT ...)` a propósito:
-- así Postgres las resuelve UNA vez por consulta en vez de una por albarán.
-- Con la tabla de envíos entera de por medio, eso es la diferencia entre que
-- el portal cargue y que se quede pensando.
--
-- Los nombres van con `ANY (SELECT unnest(...))` y no con `ANY ((SELECT ...))`:
-- con un SELECT dentro, ANY espera FILAS, no un array, y la primera forma daba
-- "operator does not exist: text = text[]" (03/09/2026). Como la subconsulta no
-- depende del albarán, Postgres la resuelve una sola vez igualmente.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "client_select_own_shipments" ON public.shipments;

CREATE POLICY "client_select_own_shipments"
  ON public.shipments FOR SELECT
  USING (
    (SELECT public.get_user_role()) = 'client'
    AND (
      -- Por id: los que se dio de alta el propio cliente desde el portal.
      (data->>'clientId') = (SELECT public.get_linked_id())
      OR (data->>'destinatarioId') = (SELECT public.get_linked_id())

      -- Por nombre: los que teclea la oficina. Remitente…
      OR public.nombre_normalizado(data->>'client')
           = ANY (SELECT unnest(public.nombres_del_cliente_conectado()))
      OR public.nombre_normalizado(data->>'originName')
           = ANY (SELECT unnest(public.nombres_del_cliente_conectado()))

      -- …y destinatario, que es lo que faltaba.
      OR public.nombre_normalizado(data->>'destinationName')
           = ANY (SELECT unnest(public.nombres_del_cliente_conectado()))
    )
  );


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN
--
-- Lo de arriba no se puede probar desde el editor SQL sin más: allí se corre
-- como `postgres`, RLS no se aplica y `get_user_role()` devuelve NULL. Hay que
-- ponerse en la piel de la cuenta del cliente. Sustituir el uuid por el de
-- `auth.users` del cliente que se quiera probar:
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid de auth.users>","role":"authenticated"}';
--
--   select public.nombres_del_cliente_conectado();          -- sus nombres
--   select count(*) from public.shipments;                  -- lo que ve ahora
--   select id, data->>'client', data->>'destinationName', data->>'porteType'
--     from public.shipments limit 20;
--
--   rollback;
--
-- Tiene que salir MÁS de lo que salía antes, y entre lo nuevo, envíos en los
-- que su nombre está en `destinationName` y portes debidos suyos.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _existe BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shipments'
      AND policyname = 'client_select_own_shipments'
  ) INTO _existe;

  RAISE NOTICE '══════════════════════════════════════';
  IF _existe THEN
    RAISE NOTICE '✅ Politica client_select_own_shipments actualizada';
  ELSE
    RAISE WARNING '❌ La politica NO se ha creado';
  END IF;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
