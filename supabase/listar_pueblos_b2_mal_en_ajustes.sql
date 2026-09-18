-- Filas de Ajustes (coverage_zones) de pueblos que el listado maestro tiene en
-- Baremo 2 pero que aquí no lo llevan (sin baremo o en Baremo 1). Estas filas
-- hacían que las importaciones (Excel y fotos de agencia) pusieran el envío a
-- precio B1 hasta el 18/9/2026. Solo lista; no cambia nada.
select id,
       data->>'name'   as pueblo,
       data->>'zip'    as cp,
       data->>'baremo' as baremo
from public.coverage_zones
where (lower(trim(data->>'name')) in ('alameda', 'antequera', 'casariche', 'estepa', 'fuente piedra', 'herrera', 'humilladero', 'jauja', 'la roda de andalucía', 'mollina', 'santa cruz')
       or data->>'zip' in ('29530', '29200', '41580', '41560', '29520', '41567', '29531', '14911', '41590', '29532', '14820'))
  and coalesce(data->>'baremo', '') <> '2'
order by pueblo;
