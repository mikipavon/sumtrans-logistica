-- ============================================================
-- 31. El cliente borra o modifica su envío hasta que escaneamos los bultos
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-21
--
-- QUÉ PASABA
--
-- El portal enseña una papelera en los envíos "Pendiente de asignar", pero el
-- rol cliente sólo tiene políticas de SELECT e INSERT sobre `shipments`
-- (fase 04). Al pulsar, Postgres no daba error: simplemente no borraba
-- ninguna fila. La app quitaba el envío de la lista y, al recargar, volvía.
-- NEUMATICOS VELASCO lo estuvo intentando el 21/09/2026 con un envío que
-- todavía no habíamos recogido.
--
-- QUÉ HACE ESTO
--
-- El cliente puede borrar y modificar un envío SUYO (él es el pagador,
-- `data->>'clientId'`) mientras siga "Pendiente de asignar" y no tenga
-- ningún bulto escaneado. En cuanto un conductor pasa el escáner, o la
-- oficina lo asigna a reparto, el envío es nuestro y sólo la administración
-- lo toca. La misma regla vive en la app (src/utils/envioDelPortal.js);
-- aquí es la que manda, la pantalla sólo la refleja.
--
-- Al modificar, además, no puede cambiar de dueño, de estado, ni meterse
-- bultos escaneados él mismo (WITH CHECK).
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta.
-- ============================================================

BEGIN;

-- ¿Tiene el envío algún bulto escaneado? `scannedPackages` puede faltar, ser
-- null o no ser una lista: sólo cuenta una lista con algo dentro.
CREATE OR REPLACE FUNCTION public.envio_con_bultos_escaneados(p_data JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(p_data->'scannedPackages') = 'array'
     AND jsonb_array_length(p_data->'scannedPackages') > 0;
$$;

ALTER FUNCTION public.envio_con_bultos_escaneados(JSONB) OWNER TO postgres;

-- Lo que el cliente todavía puede tocar: suyo, pendiente y sin escanear.
CREATE OR REPLACE FUNCTION public.cliente_puede_tocar_envio(p_status TEXT, p_data JSONB)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.get_user_role() = 'client'
     AND (p_data->>'clientId') = public.get_linked_id()
     AND p_status = 'Pendiente de asignar'
     AND COALESCE(p_data->>'status', p_status) = 'Pendiente de asignar'
     AND NOT COALESCE(public.envio_con_bultos_escaneados(p_data), false);
$$;

ALTER FUNCTION public.cliente_puede_tocar_envio(TEXT, JSONB) OWNER TO postgres;

DROP POLICY IF EXISTS "client_delete_own_pending_shipments" ON public.shipments;
CREATE POLICY "client_delete_own_pending_shipments"
  ON public.shipments FOR DELETE
  USING (public.cliente_puede_tocar_envio(status, data));

DROP POLICY IF EXISTS "client_update_own_pending_shipments" ON public.shipments;
CREATE POLICY "client_update_own_pending_shipments"
  ON public.shipments FOR UPDATE
  USING (public.cliente_puede_tocar_envio(status, data))
  -- Después del cambio tiene que seguir siendo suyo, pendiente y sin bultos:
  -- así no puede darlo por entregado, ponerlo en reparto ni cambiarle el
  -- pagador. El conductor grabado no se mira a propósito: un albarán
  -- pendiente no sale en el reparto de nadie aunque lleve conductor.
  WITH CHECK (public.cliente_puede_tocar_envio(status, data));

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN (ejecutar aparte si se quiere comprobar)
-- ────────────────────────────────────────────────────────────
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'shipments'
--    AND policyname LIKE 'client_%'
--  ORDER BY policyname;
-- Esperado: client_delete_own_pending_shipments (DELETE),
--           client_insert_shipments (INSERT),
--           client_select_own_shipments (SELECT),
--           client_update_own_pending_shipments (UPDATE).
