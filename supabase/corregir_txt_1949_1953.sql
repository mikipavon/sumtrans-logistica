-- Corrige los cinco albaranes de TXT del 21/09/2026 (SUM-1949 a SUM-1953).
-- Salieron del importador por fotos con una versión a medias del arreglo:
-- llevaban el precio del bulto (7 € el BLT_1, 21 € el BLT_4) sumado al
-- tramo por kilos, y sin el tramo apuntado. En TXT (tarifa "Por Kilos") el
-- bulto va a 0 € y el importe es sólo el tramo de peso, como en los
-- tecleados a mano.
--
-- Ejecutar en el editor SQL de Supabase. Deja los importes así:
--   SUM-1949  24 kg  Tramo ≤40kg   5,84 €  (antes 12,84)
--   SUM-1950  80 kg  Tramo ≤80kg   8,87 €  (antes 29,87)
--   SUM-1951  47 kg  Tramo ≤60kg   7,39 €  (antes 14,39)
--   SUM-1952  15 kg  Tramo ≤20kg   3,96 €  (antes 10,96)
--   SUM-1953  60 kg  Tramo ≤60kg   7,39 €  (antes 14,39)

begin;

with correcciones(id, importe, tramo) as (
    values
        ('SUM-1949', 5.84, 'Tramo ≤40kg'),
        ('SUM-1950', 8.87, 'Tramo ≤80kg'),
        ('SUM-1951', 7.39, 'Tramo ≤60kg'),
        ('SUM-1952', 3.96, 'Tramo ≤20kg'),
        ('SUM-1953', 7.39, 'Tramo ≤60kg')
)
update public.shipments s
set data = s.data
    || jsonb_build_object(
        'amount',        to_char(c.importe, 'FM999990.00'),
        'customAmount',  c.importe,
        'weightBracket', c.tramo
    )
    || jsonb_build_object(
        'articles',
        coalesce((
            select jsonb_agg(a || '{"unitPrice": 0, "totalPrice": 0}'::jsonb)
            from jsonb_array_elements(s.data -> 'articles') a
        ), '[]'::jsonb)
    )
from correcciones c
where s.id = c.id
  and s.data ->> 'client' = 'TXT';

-- Comprobación: deben salir 5 filas con el bulto a 0 y el importe del tramo.
select
    id,
    data ->> 'weightKg'                       as kilos,
    data ->> 'weightBracket'                  as tramo,
    data ->> 'amount'                         as amount,
    data -> 'customAmount'                    as custom_amount,
    data -> 'articles' -> 0 ->> 'name'        as bulto,
    data -> 'articles' -> 0 -> 'unitPrice'    as precio_bulto
from public.shipments
where id in ('SUM-1949', 'SUM-1950', 'SUM-1951', 'SUM-1952', 'SUM-1953')
order by id;

commit;
