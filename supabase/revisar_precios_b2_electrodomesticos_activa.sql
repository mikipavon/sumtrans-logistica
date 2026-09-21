-- Revisión de precios (21/09/2026): albaranes del cliente ACTIVA con artículos
-- de electrodomésticos (categoría ELE) cuyo origen o destino cae en un pueblo
-- de Baremo 2, comparando el precio unitario grabado con el precio B2 del
-- catálogo. Sólo lee; no cambia nada.
--
-- 1) La ficha de ACTIVA: tarifas especiales que se saltan el precio B2 del catálogo.
select id,
       data->>'name'        as cliente,
       data->>'billingType' as tipo_cobro,
       data->'customRates'  as tarifa_especial,
       data->'customRatesB2' as tarifa_especial_b2,
       data->'allowedArticles' as articulos_permitidos
from public.clients
where data->>'name' ilike '%activa%';

-- 2) Pueblos de Baremo 2: listado maestro + filas de Ajustes con baremo 2.
with b2 as (
    select lower(trim(nombre)) as nombre, cp from (values
        ('Alameda','29530'), ('Antequera','29200'), ('Casariche','41580'),
        ('Estepa','41560'), ('Fuente Piedra','29520'), ('Herrera','41567'),
        ('Humilladero','29531'), ('Jauja','14911'), ('La Roda de Andalucía','41590'),
        ('Mollina','29532'), ('Santa Cruz','14820')
    ) as m(nombre, cp)
    union
    select lower(trim(data->>'name')), trim(data->>'zip')
    from public.coverage_zones
    where data->>'baremo' = '2'
),
env as (
    select s.id,
           s.data->>'date'            as fecha,
           s.data->>'client'          as cliente,
           s.data->>'originCity'      as origen,
           s.data->>'originZip'       as cp_origen,
           s.data->>'destinationCity' as destino,
           s.data->>'destinationZip'  as cp_destino,
           s.data->>'amount'          as importe,
           s.data->'articles'         as articulos
    from public.shipments s
    where s.data->>'client' ilike '%activa%'
),
env_b2 as (
    select e.*
    from env e
    where exists (select 1 from b2 where b2.nombre = lower(trim(e.origen))  or (b2.cp <> '' and b2.cp = trim(e.cp_origen)))
       or exists (select 1 from b2 where b2.nombre = lower(trim(e.destino)) or (b2.cp <> '' and b2.cp = trim(e.cp_destino)))
)
-- 3) Cada electrodoméstico de esos albaranes, con lo que se cobró y lo que dice el catálogo.
select e.id as albaran,
       e.fecha,
       e.origen, e.destino,
       a->>'name'      as articulo,
       a->>'quantity'  as cantidad,
       (a->>'unitPrice')::numeric as precio_grabado,
       (c.data->>'price')::numeric   as catalogo_b1,
       (c.data->>'priceB2')::numeric as catalogo_b2,
       case
         when (a->>'unitPrice')::numeric = (c.data->>'priceB2')::numeric then 'OK (B2)'
         when (a->>'unitPrice')::numeric = (c.data->>'price')::numeric   then 'A PRECIO B1'
         else 'OTRO (tarifa especial o precio a mano)'
       end as resultado,
       e.importe
from env_b2 e
cross join lateral jsonb_array_elements(e.articulos) as a
left join public.articles c on c.id::text = a->>'id'
where coalesce(a->>'category', c.data->>'category') = 'ELE'
order by e.fecha desc, e.id;
