-- ============================================================
-- 33. El cliente guarda su logo y el formato de etiqueta desde el portal
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-21
--
-- QUÉ PASABA
--
-- En Ajustes del portal hay "Mi Logo Corporativo" y "Formato de etiqueta", y
-- los dos guardan en la ficha del cliente (`clients.data`). Pero el rol
-- cliente sólo tiene política de SELECT sobre `clients` (fase 04, 5a): el
-- UPDATE no daba error, simplemente no tocaba ninguna fila. La app enseñaba
-- el logo hasta la siguiente recarga y entonces desaparecía. NEUMATICOS
-- VELASCO lo subió varias veces el 21/09/2026 y "se le borraba
-- continuamente". Es el mismo fallo que el de la papelera (fase 31), en
-- otra tabla.
--
-- QUÉ HACE ESTO
--
-- 1) Política UPDATE para que el cliente pueda guardar SU ficha, y sólo la
--    suya (id = get_linked_id()).
--
-- 2) Un disparador que, cuando quien guarda es un cliente, sólo deja pasar
--    las preferencias del portal: `customLogo`, `labelPrintMode` y
--    `lastInteraction`. Todo lo demás (tarifa, tipo de cobro, número, otros
--    nombres, correos de acceso, interruptores…) se conserva tal cual estaba,
--    y el nombre también. Hace falta porque la ficha es un único JSON y la
--    app la guarda entera: con la política a secas, el cliente podría
--    cambiarse el precio o el tipo de cobro desde la consola del navegador.
--    No se rechaza el guardado, se recorta: si el portal tenía una copia
--    vieja de la ficha (la oficina cambió la tarifa mientras el cliente
--    estaba dentro), el logo se guarda igual y la tarifa nueva no se pisa.
--
--    Si algún día el portal guarda otra preferencia en la ficha, hay que
--    añadir su clave a la lista `permitidas` de abajo; si no, se guardará en
--    la app y se perderá en la base de datos, como pasaba con el logo.
--
-- Para la oficina y los conductores no cambia nada: el disparador sólo actúa
-- con rol 'client'. Ejecutado desde el editor SQL (rol postgres, sin
-- usuario) tampoco recorta.
--
-- IDEMPOTENTE: se puede lanzar las veces que haga falta.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.el_cliente_solo_toca_sus_preferencias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  permitidas CONSTANT text[] := ARRAY['customLogo', 'labelPrintMode', 'lastInteraction'];
  resultado jsonb;
  clave text;
BEGIN
  -- get_user_role() devuelve NULL sin sesión (editor SQL, service_role):
  -- IS DISTINCT FROM para que ese caso pase de largo en vez de recortar.
  IF public.get_user_role() IS DISTINCT FROM 'client' THEN
    RETURN NEW;
  END IF;

  resultado := COALESCE(OLD.data, '{}'::jsonb);
  IF NEW.data IS NOT NULL AND jsonb_typeof(NEW.data) = 'object' THEN
    FOREACH clave IN ARRAY permitidas LOOP
      IF NEW.data ? clave THEN
        -- Un `null` en JSON (quitar el logo) también cuenta: se guarda el null.
        resultado := jsonb_set(resultado, ARRAY[clave], NEW.data -> clave, true);
      ELSE
        resultado := resultado - clave;
      END IF;
    END LOOP;
  END IF;

  NEW.data := resultado;
  NEW.name := OLD.name;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.el_cliente_solo_toca_sus_preferencias() OWNER TO postgres;
-- No es llamable por API: el disparador no necesita que nadie tenga EXECUTE.
REVOKE ALL ON FUNCTION public.el_cliente_solo_toca_sus_preferencias() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS el_cliente_solo_toca_sus_preferencias ON public.clients;
CREATE TRIGGER el_cliente_solo_toca_sus_preferencias
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.el_cliente_solo_toca_sus_preferencias();

DROP POLICY IF EXISTS "client_update_own_data" ON public.clients;
CREATE POLICY "client_update_own_data"
  ON public.clients FOR UPDATE
  USING (public.get_user_role() = 'client' AND id::text = public.get_linked_id())
  -- Después del cambio la fila tiene que seguir siendo la suya.
  WITH CHECK (public.get_user_role() = 'client' AND id::text = public.get_linked_id());

COMMIT;

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN (ejecutar aparte si se quiere comprobar)
-- ────────────────────────────────────────────────────────────
-- 1) Las políticas del rol cliente sobre clients:
-- SELECT policyname, cmd FROM pg_policies
--  WHERE schemaname = 'public' AND tablename = 'clients'
--    AND policyname LIKE 'client_%'
--  ORDER BY policyname;
-- Esperado: client_select_own_data (SELECT), client_update_own_data (UPDATE).
--
-- 2) Probar como lo hace el portal (sin dejar rastro). Hace falta el uuid de
--    auth.users de la cuenta de Velasco:
--    select id from auth.users where email ilike '%velasco%';
--
-- begin;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- update public.clients
--    set data = data || '{"customLogo":"data:prueba","tariffName":"PIRATA"}'::jsonb
--  where id::text = public.get_linked_id()
-- returning data->>'customLogo' as logo, data->>'tariffName' as tarifa;
-- rollback;
-- Esperado: 1 fila, logo = data:prueba y la tarifa SIN cambiar (el
-- disparador recortó "PIRATA"). 0 filas = la política no se ha aplicado.
