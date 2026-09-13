-- ============================================================
-- 26. La agenda del portal sale de TODOS sus envíos y apunta a nuestras fichas
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-13
--
-- QUÉ PASABA
--
-- Ibermangueras manda desde el portal a Agro Velasco, que ya está en cartera.
-- El portal no ve nuestras fichas (RLS, fase 04), así que teclea el nombre a
-- su manera; la fase 22 sólo enlaza por nombre exacto, no casa, y en la
-- entrega nace OTRA ficha de Agro Velasco. A partir de ahí los envíos de esa
-- empresa se reparten entre dos fichas y se facturan a dos clientes.
--
-- La agenda de destinatarios del portal se montaba en el navegador con los
-- envíos que la app tiene cargados: los activos y los terminados de los
-- últimos 90 días. Un cliente de toda la vida (Rodamientos) que entra por
-- primera vez ve una agenda corta, y de los envíos que sí ve sólo recibe el
-- TEXTO que se tecleó, no la ficha a la que la base de datos los enlazó.
--
-- QUÉ HACE ESTO
--
-- La regla que pidió la oficina: si a un cliente ya se le ha mandado un
-- paquete a una ficha nuestra —lo tecleara él, la oficina o el repartidor—,
-- ese cliente puede ver los datos de etiqueta de esa ficha (nombre, dirección,
-- CP y población) y enviarle de nuevo apuntando a la ficha, no al texto.
--
--   1. agenda_destinatarios_del_cliente_conectado(): la agenda entera del
--      cliente, calculada aquí donde se ven todos los envíos y todas las
--      fichas. Cada entrada trae el id de la ficha (y de la sede) cuando el
--      envío estaba enlazado, y en ese caso el nombre y la dirección son los
--      ACTUALES de la ficha, no los que se escribieron en su día: si la
--      oficina renombró o corrigió la ficha, el portal lo ve corregido.
--
--   2. El portal graba destinatarioId / destinatarioSedeId al crear el envío.
--      El trigger de la fase 21 respeta un enlace que ya viene puesto, pero
--      sólo si es legítimo: un cliente del portal sólo puede apuntar a una
--      ficha a la que ya haya enviado antes (cliente_conectado_ha_enviado_a).
--      Si no, se le quita y el envío se empareja por nombre como cualquier
--      otro. La oficina y el repartidor no pasan por esta puerta.
--
-- Lo que NO hace: el primer envío a una empresa a la que nunca se le ha
-- mandado nada sigue tecleándose a mano. Para eso quedan el emparejamiento
-- por nombre y el aviso de parecido de Validar Clientes.
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. ¿El cliente conectado ya ha enviado a esta ficha?
--
-- Es "suyo" cualquier envío en el que aparezca como remitente, por id (los
-- que creó él en el portal) o por nombre (los que teclea la oficina), con la
-- misma regla que la política de la fase 20. Los nombres y el id se calculan
-- UNA vez, fuera de la consulta: llamarlos por cada albarán es lo que deja el
-- portal pensando.
--
-- SECURITY DEFINER porque un cliente sólo ve sus envíos, pero aquí no hace
-- falta más: ya se filtra por el cliente conectado. search_path fijo (fase 14).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cliente_conectado_ha_enviado_a(p_ficha TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _id      TEXT   := public.get_linked_id();
  _nombres TEXT[] := coalesce(public.nombres_del_cliente_conectado(), '{}'::TEXT[]);
BEGIN
  IF coalesce(_id, '') = '' OR coalesce(p_ficha, '') = '' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.shipments s
    WHERE jsonb_typeof(s.data) = 'object'
      AND s.data->>'destinatarioId' = p_ficha
      AND (
        s.data->>'clientId' = _id
        OR public.nombre_normalizado(s.data->>'client')     = ANY (_nombres)
        OR public.nombre_normalizado(s.data->>'originName') = ANY (_nombres)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cliente_conectado_ha_enviado_a(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cliente_conectado_ha_enviado_a(TEXT) TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 2. La agenda de destinatarios del cliente conectado
--
-- Una fila por destinatario distinto. Se agrupa por ficha (y sede) cuando el
-- envío está enlazado, y por nombre normalizado cuando no lo está. Cuenta las
-- veces y se queda con el envío más reciente; para la dirección, el último
-- valor NO vacío de cada campo, para que un envío nuevo sin CP no borre el CP
-- que ya se conocía (misma regla que agendaDestinatarios.js).
--
-- Fuera lo que se manda a sí mismo (a su propia sede): sugerírselo como
-- destino no ayuda a nadie.
--
-- Si la ficha enlazada ya no existe o está rechazada, la entrada vuelve al
-- texto del envío y sin id: el envío nuevo se emparejará por nombre, como
-- siempre, en vez de apuntar a una ficha que no vale.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.agenda_destinatarios_del_cliente_conectado()
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
  _id      TEXT   := public.get_linked_id();
  _nombres TEXT[] := coalesce(public.nombres_del_cliente_conectado(), '{}'::TEXT[]);
BEGIN
  IF public.get_user_role() IS DISTINCT FROM 'client' OR coalesce(_id, '') = '' THEN
    RETURN;
  END IF;

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

REVOKE ALL ON FUNCTION public.agenda_destinatarios_del_cliente_conectado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agenda_destinatarios_del_cliente_conectado() TO authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. El trigger de la fase 21, con la puerta para el portal
--
-- Igual que estaba, más un paso: si quien inserta es un cliente del portal y
-- trae el enlace puesto, sólo se le respeta si ya ha enviado antes a esa
-- ficha. Si no, se le quita y sigue el emparejamiento por nombre de siempre.
-- La oficina y el repartidor (cualquier otro rol) no pasan por aquí.
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

  -- La puerta del portal (fase 26).
  IF TG_OP = 'INSERT'
     AND coalesce(NEW.data->>'destinatarioId', '') <> ''
     AND public.get_user_role() = 'client'
     AND NOT public.cliente_conectado_ha_enviado_a(NEW.data->>'destinatarioId') THEN
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

-- El trigger sigue siendo el de la fase 21 (misma función, mismo nombre); se
-- vuelve a declarar por si esta fase se lanza en un proyecto donde no estaba.
DROP TRIGGER IF EXISTS trg_emparejar_destinatario ON public.shipments;

CREATE TRIGGER trg_emparejar_destinatario
  BEFORE INSERT OR UPDATE OF data ON public.shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.emparejar_destinatario_del_envio();


-- ────────────────────────────────────────────────────────────
-- COMPROBACIÓN
--
-- Desde el editor SQL se corre como `postgres` y get_user_role() da NULL: hay
-- que ponerse en la piel de la cuenta del cliente (fase 20). Sustituir el uuid
-- por el de `auth.users` del cliente que se quiera probar:
--
--   begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid de auth.users>","role":"authenticated"}';
--
--   select * from public.agenda_destinatarios_del_cliente_conectado();
--   -- Tienen que salir sus destinatarios de siempre, con ficha_id en los que
--   -- ya están en cartera, y con el nombre ACTUAL de la ficha.
--
--   select public.cliente_conectado_ha_enviado_a('<id de una ficha suya>');   -- true
--   select public.cliente_conectado_ha_enviado_a('<id de una ficha ajena>');  -- false
--
--   rollback;
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _agenda  BOOLEAN;
  _puerta  BOOLEAN;
  _trigger BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'agenda_destinatarios_del_cliente_conectado')
    INTO _agenda;
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'cliente_conectado_ha_enviado_a')
    INTO _puerta;
  SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_emparejar_destinatario' AND NOT tgisinternal)
    INTO _trigger;

  RAISE NOTICE '══════════════════════════════════════';
  IF _agenda AND _puerta AND _trigger THEN
    RAISE NOTICE '✅ Agenda del portal con fichas: funciones y trigger en su sitio';
  ELSE
    RAISE WARNING '❌ Falta algo: agenda=% puerta=% trigger=%', _agenda, _puerta, _trigger;
  END IF;
  RAISE NOTICE '══════════════════════════════════════';
END $$;
