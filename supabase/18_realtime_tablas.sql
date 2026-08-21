-- ============================================================
-- FASE 18: asegurar que Realtime publica las tablas que la oficina escucha
-- Proyecto: SUM Transportes (principal)
-- Fecha: 2026-08-21
--
-- PROBLEMA
--   El panel de la oficina se entera de los cambios por Realtime
--   (src/App.jsx, canal 'global-db-changes'): envíos, conductores, clientes
--   y ajustes. Pero una tabla sólo manda avisos si está dentro de la
--   publicación `supabase_realtime`, y eso se marca a mano desde el panel de
--   Supabase (Database → Replication). No estaba escrito en ningún sitio del
--   repositorio, así que nadie puede afirmar qué tablas están dentro.
--
--   Si `drivers` se hubiera quedado fuera, la oficina no recibiría NUNCA el
--   orden de ruta que el repartidor arrastra en el móvil ni su posición GPS:
--   esa tabla sólo se leía en la carga inicial de la página.
--
-- QUÉ HACE ESTE SCRIPT
--   Comprobar tabla por tabla y añadir sólo lo que falte. Si ya estaban
--   todas, no cambia nada: se puede ejecutar las veces que haga falta.
--   Al final imprime la lista, que es la respuesta a "¿está o no está?".
--
-- NOTA
--   No hace falta REPLICA IDENTITY FULL: la aplicación sólo usa `payload.new`
--   (la fila nueva entera, que siempre viaja) y, en los borrados, el id de
--   `payload.old`, que viaja con la identidad por clave primaria de serie.
-- ============================================================

-- La publicación existe de serie en Supabase, pero por si acaso.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
    RAISE NOTICE 'Creada la publicación supabase_realtime (no existía)';
  END IF;
END $$;

DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['shipments', 'drivers', 'clients', 'settings'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tabla
    ) THEN
      RAISE NOTICE 'Ya estaba publicada: %', tabla;
    ELSE
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tabla);
      RAISE NOTICE 'AÑADIDA a Realtime: %', tabla;
    END IF;
  END LOOP;
END $$;

-- Comprobación final: esto es lo que la oficina puede recibir al momento.
SELECT tablename AS tablas_publicadas_en_realtime
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;
