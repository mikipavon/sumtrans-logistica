-- Todos los albaranes con origen o destino en un pueblo de Baremo 2, artículo
-- por artículo, con el precio grabado y el que tocaría con la regla del
-- 21/9/2026 (tarifa especial B2 de la ficha → si no, B2 del catálogo).
-- Sólo lee; no cambia nada.
with b2 as (
    select lower(trim(nombre)) as nombre, cp from (values
        ('Alameda','29530'), ('Antequera','29200'), ('Casariche','41580'),
        ('Estepa','41560'), ('Fuente Piedra','29520'), ('Herrera','41567'),
        ('Humilladero','29531'), ('Jauja','14911'), ('La Roda de Andalucía','41590'),
        ('Mollina','29532'), ('Santa Cruz','14820')
    ) as m(nombre, cp)
    union
    select lower(trim(data->>'name')), trim(data->>'zip')
    from public.coverage_zones where data->>'baremo' = '2'
),
env as (
    select s.id,
           s.data->>'createdAt'       as creado,
           s.data->>'date'            as fecha,
           s.data->>'client'          as cliente,
           s.data->>'clientId'        as cliente_id,
           s.data->>'originCity'      as origen,
           s.data->>'originZip'       as cp_origen,
           s.data->>'destinationCity' as destino,
           s.data->>'destinationZip'  as cp_destino,
           s.data->>'amount'          as importe,
           s.data->>'porteType'       as porte,
           s.data->'articles'         as articulos
    from public.shipments s
),
env_b2 as (
    select e.* from env e
    where exists (select 1 from b2 where b2.nombre = lower(trim(e.origen))  or (b2.cp <> '' and b2.cp = trim(e.cp_origen)))
       or exists (select 1 from b2 where b2.nombre = lower(trim(e.destino)) or (b2.cp <> '' and b2.cp = trim(e.cp_destino)))
),
lineas as (
    select e.id, e.creado, e.fecha, e.cliente, e.origen, e.destino, e.importe, e.porte,
           a->>'name' as articulo,
           coalesce((a->>'quantity')::numeric, 1) as cantidad,
           (a->>'unitPrice')::numeric as grabado,
           (c.data->>'price')::numeric as cat_b1,
           (c.data->>'priceB2')::numeric as cat_b2,
           (cl.data->'customRates'->>(a->>'id'))::numeric as esp_b1,
           (cl.data->'customRatesB2'->>(a->>'id'))::numeric as esp_b2
    from env_b2 e
    cross join lateral jsonb_array_elements(coalesce(e.articulos, '[]'::jsonb)) as a
    left join public.articles c on c.id::text = a->>'id'
    left join lateral (
        select data from public.clients k
        where k.id::text = e.cliente_id or lower(trim(k.data->>'name')) = lower(trim(e.cliente))
        order by (k.id::text = e.cliente_id) desc limit 1
    ) cl on true
)
select string_agg(
    concat(id, '|', fecha, '|', cliente, '|', origen, '|', destino, '|', articulo, '|', cantidad, '|', grabado, '|',
              coalesce(esp_b2, cat_b2, cat_b1), '|', cat_b1, '|', cat_b2, '|', esp_b1, '|', esp_b2, '|', importe, '|', porte),
    E'\n' order by creado desc, id) as lista,
    count(*) as lineas
from lineas;
