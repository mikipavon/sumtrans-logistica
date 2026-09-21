-- ── 32: varios artículos con cantidad en el portal para los talleres de neumáticos ──
--
-- Los talleres mandan por cantidad ("4 de turismo y 2 de 4x4") y el portal sólo
-- dejaba elegir un artículo. Desde el 21/09/2026 la ficha lleva el interruptor
-- `portalVariosArticulos` (pestaña Artículos de la ficha, en la oficina).
--
-- Este script lo enciende de golpe a los tres que lo pidieron. Es OPCIONAL: se
-- puede hacer igual desde la ficha de cada uno. Primero mira a quién va a tocar.

-- 1) Comprobar a quién afecta (tiene que salir: Neumáticos Velasco, Neumáticos
--    Lucena y ACTIVA, y nadie más). Si sale alguno de más, afina el WHERE.
select id, name
from clients
where name ilike '%NEUMATICOS VELASCO%'
   or name ilike '%NEUMATICOS LUCENA%'
   or name ilike 'ACTIVA%';

-- 2) Encenderlo.
update clients
set data = coalesce(data, '{}'::jsonb) || '{"portalVariosArticulos": true}'::jsonb
where name ilike '%NEUMATICOS VELASCO%'
   or name ilike '%NEUMATICOS LUCENA%'
   or name ilike 'ACTIVA%';

-- Para apagárselo a alguien: en su ficha, o
--   update clients set data = data - 'portalVariosArticulos' where id = <id>;
