-- ============================================================
-- REVISIÓN: ¿a qué ficha de cliente entra cada cuenta de acceso?
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-03
--
-- ⚠️ NO ES UNA MIGRACIÓN. Sólo lee. Se puede lanzar cuantas veces haga falta.
--
-- POR QUÉ HACE FALTA
--
-- Al entrar en el portal, la aplicación no mira el nombre que se teclea: firma
-- en Supabase Auth con el correo de la cuenta y abre la ficha que diga
-- `profiles.linked_id` de ESA cuenta. Si dos fichas comparten el correo de
-- acceso, o una cuenta quedó enlazada a la ficha equivocada, quien teclea los
-- datos de PROSERVICE acaba dentro del portal de GUILLERMO GARCIA y no hay
-- forma de verlo desde la pantalla.
--
-- CÓMO SE USA
-- Supabase → SQL Editor → cambiar los dos nombres del WHERE de abajo por los
-- clientes que se quieran comparar → Run. Salen dos bloques.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Qué correos tiene cada ficha (es lo que traduce el login)
-- ────────────────────────────────────────────────────────────
SELECT
  c.id,
  c.name                                    AS cliente,
  c.data->>'username'                       AS usuario,
  c.data->>'email'                          AS email_contacto,
  c.data->>'accessEmail'                    AS email_de_acceso,
  c.data->'accessEmailsExtra'               AS otros_correos_con_acceso,
  c.data->>'tieneAccesoPortal'              AS acceso_configurado
FROM public.clients c
WHERE c.name ILIKE '%GUILLERMO GARCIA%'
   OR c.name ILIKE '%PROSERVICE%'
ORDER BY c.name;


-- ────────────────────────────────────────────────────────────
-- 2. Qué cuentas de acceso existen para esos correos y a qué ficha abren
--
-- `ficha_a_la_que_entra` es lo que manda: si dos correos distintos llevan a la
-- misma ficha, o el correo de una ficha abre la otra, ahí está el cruce.
-- ────────────────────────────────────────────────────────────
WITH fichas AS (
  SELECT c.id, c.name,
         lower(btrim(coalesce(nullif(btrim(c.data->>'accessEmail'), ''), c.data->>'email', ''))) AS correo_principal,
         c.data
    FROM public.clients c
   WHERE c.name ILIKE '%GUILLERMO GARCIA%'
      OR c.name ILIKE '%PROSERVICE%'
),
correos AS (
  SELECT f.id AS ficha_id, f.name AS ficha, f.correo_principal AS correo FROM fichas f
  UNION
  SELECT f.id, f.name, lower(btrim(extra->>'email'))
    FROM fichas f,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(f.data->'accessEmailsExtra') = 'array'
                THEN f.data->'accessEmailsExtra' ELSE '[]'::jsonb END
         ) AS extra
)
SELECT
  co.ficha                                  AS correo_escrito_en_la_ficha_de,
  co.correo,
  u.id                                      AS cuenta_auth,
  p.role                                    AS rol,
  p.linked_id                               AS ficha_a_la_que_entra_id,
  cl.name                                   AS ficha_a_la_que_entra,
  CASE
    WHEN u.id IS NULL                        THEN '❌ sin cuenta: no puede entrar'
    WHEN p.id IS NULL                        THEN '❌ cuenta sin perfil: no puede entrar'
    WHEN p.linked_id = co.ficha_id::text     THEN '✅ entra en su ficha'
    ELSE                                          '⚠️ ENTRA EN OTRA FICHA'
  END                                       AS diagnostico
FROM correos co
LEFT JOIN auth.users u       ON lower(u.email) = co.correo
LEFT JOIN public.profiles p  ON p.id = u.id
LEFT JOIN public.clients cl  ON cl.id::text = p.linked_id
WHERE co.correo <> ''
ORDER BY co.ficha, co.correo;
