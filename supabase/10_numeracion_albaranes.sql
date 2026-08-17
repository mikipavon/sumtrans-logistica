-- ============================================================
-- FASE 10: Numeración de albaranes a prueba de RLS
-- Proyecto: SUM Transportes
-- Fecha: 2026-08-17
--
-- PROBLEMA: el portal de clientes calcula el siguiente número de albarán
-- con un `SELECT id FROM shipments` y se queda con el máximo de la serie.
-- Desde la fase 04 ese SELECT sólo devuelve LOS ENVÍOS DEL PROPIO CLIENTE,
-- así que el máximo se queda corto y genera un ID que ya existe:
--
--   cliente A tiene hasta SUM-1200, la serie real va por SUM-1450
--   → el portal emite SUM-1201, que es de otro cliente
--   → el upsert cae sobre esa fila ajena: como INSERT ... ON CONFLICT DO
--     UPDATE necesita política de UPDATE y el rol 'client' no la tiene,
--     Postgres responde 42501 y la app lo confunde con un fallo de red:
--     el envío se queda en la cola offline reintentando para siempre.
--
-- SOLUCIÓN: el número deja de calcularse en el navegador. Esta función
-- SECURITY DEFINER ve la tabla entera (se salta RLS a propósito) y reserva
-- el tramo pedido de forma atómica, así que dos clientes que creen a la vez
-- no se llevan el mismo número.
--
-- IDEMPOTENTE: se puede volver a ejecutar sin problema.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Contador por serie
-- ────────────────────────────────────────────────────────────
-- Guarda el último número ENTREGADO de cada serie (SUM, HAB, PU...). Hace
-- falta además del máximo real de `shipments` porque un número reservado
-- todavía no es una fila: entre la reserva y el guardado (o mientras el
-- envío espera en la cola offline) el máximo de la tabla sigue por detrás.
CREATE TABLE IF NOT EXISTS public.contadores_albaran (
  prefijo TEXT PRIMARY KEY,
  ultimo  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.contadores_albaran ENABLE ROW LEVEL SECURITY;

-- Sin políticas a propósito: nadie llega a esta tabla directamente, ni
-- siquiera administración. El único camino es la función de abajo.
REVOKE ALL ON TABLE public.contadores_albaran FROM anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. Reservar N números correlativos de una serie
-- ────────────────────────────────────────────────────────────
-- Devuelve el PRIMER número reservado; quien la llama usa desde ahí hasta
-- `primero + cantidad - 1`. Nadie más recibirá esos números.
CREATE OR REPLACE FUNCTION public.reservar_numeros_albaran(
  prefijo  TEXT,
  cantidad INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefijo  TEXT;
  _ultimo   INTEGER;
  _max_real INTEGER;
  _primero  INTEGER;
BEGIN
  -- Sesión con perfil: repartidor, cliente o administración. Sin perfil no
  -- se reserva nada (el GRANT de abajo ya deja fuera a 'anon', esto cubre
  -- las cuentas de Auth que aún no tienen fila en `profiles`).
  IF public.get_user_role() IS NULL THEN
    RAISE EXCEPTION 'Sin perfil de usuario: no se puede reservar numeración';
  END IF;

  -- El prefijo entra en una expresión regular más abajo, así que se acota
  -- a letras antes de tocar nada.
  _prefijo := upper(btrim(coalesce(prefijo, '')));
  IF _prefijo !~ '^[A-Z]{2,6}$' THEN
    RAISE EXCEPTION 'Prefijo de serie no válido: %', prefijo;
  END IF;

  -- El tope no es un límite de negocio, es un freno: la importación de Excel
  -- pide de golpe tantos números como filas traiga el fichero, y no queremos
  -- que un bucle desbocado se coma la serie entera.
  IF cantidad IS NULL OR cantidad < 1 OR cantidad > 5000 THEN
    RAISE EXCEPTION 'Cantidad fuera de rango (1-5000): %', cantidad;
  END IF;

  -- La fila del contador nace la primera vez que se usa una serie.
  INSERT INTO public.contadores_albaran (prefijo, ultimo)
  VALUES (_prefijo, 0)
  ON CONFLICT (prefijo) DO NOTHING;

  -- FOR UPDATE serializa: dos peticiones simultáneas hacen cola en vez de
  -- leer el mismo valor y devolver el mismo número.
  SELECT ultimo INTO _ultimo
    FROM public.contadores_albaran
   WHERE prefijo = _prefijo
     FOR UPDATE;

  -- El contador no es la única fuente de verdad: administración y los
  -- repartidores siguen numerando con el máximo que ven en pantalla (ellos
  -- sí leen la tabla entera), y los albaranes anteriores a esta migración
  -- nunca pasaron por aquí. Se toma el mayor de los dos.
  --
  -- El límite de 5 dígitos es el mismo `num < 100000` que aplica la app:
  -- deja fuera los ids con año incrustado que usan otros documentos.
  SELECT coalesce(max((regexp_match(id, '^[A-Za-z]+-([0-9]+)$'))[1]::INTEGER), 0)
    INTO _max_real
    FROM public.shipments
   WHERE id ~* ('^' || _prefijo || '-[0-9]{1,5}$');

  _primero := GREATEST(_ultimo, _max_real) + 1;

  UPDATE public.contadores_albaran
     SET ultimo = _primero + cantidad - 1
   WHERE prefijo = _prefijo;

  RETURN _primero;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_numeros_albaran(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reservar_numeros_albaran(TEXT, INTEGER) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. Arrancar los contadores con lo que ya hay
-- ────────────────────────────────────────────────────────────
-- No es imprescindible (la función toma GREATEST con el máximo real), pero
-- deja la tabla legible desde el primer día para poder auditarla.
INSERT INTO public.contadores_albaran (prefijo, ultimo)
SELECT serie, max_num
  FROM (
    SELECT upper((regexp_match(id, '^([A-Za-z]+)-[0-9]{1,5}$'))[1]) AS serie,
           max((regexp_match(id, '^[A-Za-z]+-([0-9]+)$'))[1]::INTEGER) AS max_num
      FROM public.shipments
     WHERE id ~ '^[A-Za-z]+-[0-9]{1,5}$'
     GROUP BY 1
  ) AS series
 WHERE serie IS NOT NULL
ON CONFLICT (prefijo) DO UPDATE
   SET ultimo = GREATEST(public.contadores_albaran.ultimo, EXCLUDED.ultimo);

-- ────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  _fila RECORD;
BEGIN
  RAISE NOTICE '══════════════════════════════════════';
  RAISE NOTICE 'Contadores de albarán:';
  FOR _fila IN SELECT prefijo, ultimo FROM public.contadores_albaran ORDER BY prefijo LOOP
    RAISE NOTICE '  %-6s → %', _fila.prefijo, _fila.ultimo;
  END LOOP;
  RAISE NOTICE '══════════════════════════════════════';
END $$;

-- Comprobación manual, con la sesión de un CLIENTE (antes devolvía un
-- número ya usado; ahora debe devolver el siguiente de la serie real):
--   SELECT public.reservar_numeros_albaran('SUM', 1);
-- Ojo: cada llamada consume número. Para mirar sin consumir:
--   SELECT * FROM public.contadores_albaran;   -- (sólo desde el editor SQL)
