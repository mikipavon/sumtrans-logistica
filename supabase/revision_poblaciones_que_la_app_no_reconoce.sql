-- ============================================================
-- REVISIÓN: poblaciones y códigos postales que la app no reconoce
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-03
--
-- ⚠️ NO ES UNA MIGRACIÓN. Sólo lee. Se puede lanzar cuantas veces haga falta.
--
-- POR QUÉ HACE FALTA
--
-- El envío HAB-86 salió a Juan Carlos sin recomendación de transportista y el
-- desplegable lo trató como fuera de zona: la población venía tecleada desde el
-- móvil como "CORODBA" y el CP 14013 no estaba en la tabla de baremos (Córdoba
-- capital sólo llegaba al 14012). La recomendación de ruta compara el NOMBRE
-- de la población con los pueblos de las rutas, y "Asignar a..." mira nombre o
-- CP contra src/data/baremos.js. Un cliente grabado con la población mal
-- escrita o con un CP que no esté en esa tabla arrastra el mismo problema a
-- todos sus envíos.
--
-- Las dos listas de abajo (CPs y nombres normalizados) están copiadas de
-- src/data/baremos.js el día de la fecha. Si se amplía la tabla, regenerar.
--
-- CÓMO SE USA
-- Supabase → SQL Editor → pegar → Run. Sale una tabla con tres bloques. Lo que
-- salga en el bloque 1 o 2 hay que corregirlo en la ficha del cliente
-- (Clientes → editar). El bloque 3 es para revisar a ojo.
-- ============================================================

WITH baremo_cp AS (
  SELECT unnest(ARRAY['14000', '14001', '14002', '14003', '14004', '14005', '14006', '14007', '14008', '14009', '14010', '14011', '14012', '14013', '14014', '14500', '14510', '14520', '14540', '14548', '14550', '14800', '14810', '14812', '14820', '14830', '14840', '14850', '14857', '14860', '14880', '14900', '14910', '14911', '14913', '14914', '14915', '14930', '14940', '14960', '14970', '29200', '29520', '29530', '29531', '29532', '41560', '41567', '41580', '41590']) AS cp
),
baremo_nombre AS (
  SELECT unnest(ARRAY['aguilar de la frontera', 'alameda', 'almedinilla', 'antequera', 'baena', 'benameji', 'cabra', 'carcabuey', 'casariche', 'castro del rio', 'cordoba', 'dona mencia', 'el tejar', 'encina reales', 'espejo', 'estepa', 'fernan nunez', 'fuente piedra', 'herrera', 'humilladero', 'iznajar', 'jauja', 'la rambla', 'la roda de andalucia', 'llanos de don juan', 'lucena', 'luque', 'mollina', 'montalban de cordoba', 'montemayor', 'montilla', 'monturque', 'moriles', 'navas del selpillar', 'nueva carteya', 'palenciana', 'priego de cordoba', 'puente genil', 'rute', 'santa cruz']) AS nombre
),
direcciones AS (
  -- Dirección principal de la ficha
  SELECT c.id, c.name AS cliente, 'principal' AS donde,
         c.data->>'city' AS poblacion, c.data->>'zip' AS cp
  FROM public.clients c
  UNION ALL
  -- Sucursales / direcciones de entrega de la ficha
  SELECT c.id, c.name, 'sucursal: ' || COALESCE(b->>'name', ''),
         b->>'city', b->>'zip'
  FROM public.clients c,
       jsonb_array_elements(COALESCE(c.data->'branches', '[]'::jsonb)) b
),
-- misma normalización que utils/townMatch.js: minúsculas, sin acentos, sin
-- "(14548)", y todo lo que no sea letra pasa a un espacio
normalizadas AS (
  SELECT d.*,
         btrim(regexp_replace(
           regexp_replace(
             lower(translate(COALESCE(d.poblacion, ''),
               'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ',
               'aeiouaeiouaeiouaeiouncAEIOUAEIOUAEIOUAEIOUNC')),
             '\([^)]*\)', ' ', 'g'),
           '[^a-z]+', ' ', 'g')) AS poblacion_norm,
         btrim(COALESCE(d.cp, '')) AS cp_limpio
  FROM direcciones d
)

-- ────────────────────────────────────────────────────────────
-- 1. El caso HAB-86: la población NO está en la tabla pero el CP sí
--    (nombre mal escrito; la app ya lo rescata por CP, pero conviene arreglarlo)
-- ────────────────────────────────────────────────────────────
SELECT '1. nombre mal escrito' AS bloque, n.id, n.cliente, n.donde, n.poblacion, n.cp,
       (SELECT string_agg(DISTINCT bn.nombre, ' / ') FROM baremo_nombre bn
         WHERE bn.nombre <> n.poblacion_norm
           AND (n.poblacion_norm LIKE '%' || bn.nombre || '%' OR bn.nombre LIKE '%' || n.poblacion_norm || '%')) AS parecido_a
FROM normalizadas n
WHERE n.cp_limpio IN (SELECT cp FROM baremo_cp)
  AND n.poblacion_norm <> ''
  AND n.poblacion_norm NOT IN (SELECT nombre FROM baremo_nombre)

UNION ALL

-- ────────────────────────────────────────────────────────────
-- 2. La población SÍ está en la tabla pero el CP no (o está vacío):
--    "Asignar a..." aún funciona por nombre, pero el modal no autorrellena y
--    el rescate por CP no puede ayudar si un día se escribe mal el nombre
-- ────────────────────────────────────────────────────────────
SELECT '2. CP fuera de tabla', n.id, n.cliente, n.donde, n.poblacion, n.cp, NULL
FROM normalizadas n
WHERE n.poblacion_norm IN (SELECT nombre FROM baremo_nombre)
  AND n.cp_limpio NOT IN (SELECT cp FROM baremo_cp)

UNION ALL

-- ────────────────────────────────────────────────────────────
-- 3. Ni la población ni el CP están en la tabla: fuera de zona de verdad
--    (Sevilla, Málaga...) o mal grabado del todo. Revisar a ojo.
-- ────────────────────────────────────────────────────────────
SELECT '3. fuera de zona', n.id, n.cliente, n.donde, n.poblacion, n.cp, NULL
FROM normalizadas n
WHERE n.poblacion_norm NOT IN (SELECT nombre FROM baremo_nombre)
  AND n.cp_limpio NOT IN (SELECT cp FROM baremo_cp)
ORDER BY 1, 4, 3;
