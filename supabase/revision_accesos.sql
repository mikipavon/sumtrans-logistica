-- ============================================================
-- REVISIÓN: ¿a quién más le falta la cuenta de acceso?
-- Proyecto: SUM Transportes
-- Fecha: 2026-09-02
--
-- ⚠️ ESTO NO ES UNA MIGRACIÓN. No cambia nada: son cinco consultas de sólo
-- lectura. Por eso no lleva número: no hay que "ejecutarla" en orden ni una
-- sola vez, se puede lanzar cuantas veces haga falta.
--
-- POR QUÉ HACE FALTA
--
-- La función create-auth-user —la única que crea cuentas de acceso, tanto de
-- clientes como de conductores— era inalcanzable desde la aplicación: no
-- permitía la cabecera `x-client-info`, y el navegador cortaba la petición
-- antes de enviarla. La ficha se guardaba y todo parecía correcto, pero la
-- cuenta no se creaba nunca.
--
-- O sea: cada vez que la oficina le puso una contraseña a alguien y guardó, se
-- quedó con la sensación de haberle dado acceso. Y no se lo dio. Esas personas
-- sólo se descubren cuando llaman diciendo que no entran — como VWG PROSERVICE.
--
-- Estas consultas sacan la lista sin esperar a que llamen.
--
-- CÓMO SE USA
-- Supabase → SQL Editor → pegar cada bloque y pulsar Run. Se pueden lanzar de
-- una en una; están numeradas por orden de importancia.
--
-- CÓMO SE ARREGLA LO QUE SALGA
-- Ficha del cliente → pestaña Acceso → botón Generar → Guardar Ficha. Al
-- guardar, la aplicación enseña las credenciales con un botón de copiar: ése es
-- el único momento en que se ven, porque la contraseña no se guarda en ningún
-- sitio. Para un conductor, lo mismo desde su ficha.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. CLIENTES a los que se les configuró acceso y NO tienen cuenta
--
-- Éstos son los afectados de lleno. `tieneAccesoPortal` lo escribe la propia
-- aplicación cuando alguien le pone una contraseña a la ficha, así que estar
-- marcado significa "la oficina quiso darle acceso". Si además no hay ninguna
-- cuenta con su correo, es que no se llegó a crear.
--
-- Estos clientes NO PUEDEN ENTRAR, y al intentarlo se les dice que sus
-- credenciales no valen.
-- ────────────────────────────────────────────────────────────
SELECT
  c.id,
  c.name                                                                  AS cliente,
  coalesce(nullif(btrim(c.data->>'accessEmail'), ''), c.data->>'email')    AS correo_con_el_que_deberia_entrar,
  c.data->>'status'                                                       AS estado_ficha,
  c.data->>'createdFrom'                                                  AS de_donde_salio,
  c.data->>'phone'                                                        AS telefono
FROM public.clients c
WHERE coalesce(c.data->>'tieneAccesoPortal', 'false') = 'true'
  AND coalesce(nullif(btrim(c.data->>'accessEmail'), ''), c.data->>'email', '') <> ''
  AND NOT EXISTS (
        SELECT 1
          FROM auth.users u
         WHERE lower(u.email) = lower(coalesce(nullif(btrim(c.data->>'accessEmail'), ''), c.data->>'email'))
      )
ORDER BY c.name;


-- ────────────────────────────────────────────────────────────
-- 2. OTROS CORREOS CON ACCESO que se quedaron sin cuenta
--
-- Las demás personas de la misma empresa (el dueño además de quien hace los
-- albaranes). Cada una necesita su propia cuenta, y les afectó exactamente lo
-- mismo. Éste es el caso de ventas.cordoba@vwgproservice.es.
--
-- Ojo: aquí también aparecen los correos a los que se les escribió la dirección
-- pero nunca la contraseña. El efecto para esa persona es el mismo —no entra—
-- así que la lista sirve igual.
-- ────────────────────────────────────────────────────────────
SELECT
  c.id,
  c.name                                  AS cliente,
  lower(btrim(extra->>'email'))           AS correo_adicional_sin_cuenta
FROM public.clients c,
     LATERAL jsonb_array_elements(
       CASE WHEN jsonb_typeof(c.data->'accessEmailsExtra') = 'array'
            THEN c.data->'accessEmailsExtra'
            ELSE '[]'::jsonb
       END
     ) AS extra
WHERE nullif(btrim(extra->>'email'), '') IS NOT NULL
  AND NOT EXISTS (
        SELECT 1
          FROM auth.users u
         WHERE lower(u.email) = lower(btrim(extra->>'email'))
      )
ORDER BY c.name;


-- ────────────────────────────────────────────────────────────
-- 3. CUENTAS QUE EXISTEN PERO SIGUEN SIN CONFIRMAR
--
-- Otra avería distinta, con el mismo final. Los registros de la web crean la
-- cuenta a propósito sin confirmar, y se confirma al aprobar el alta. Pero la
-- función que lo hacía buscaba al usuario con `listUsers()` sin paginar, que
-- sólo devuelve los 50 primeros: a partir de ahí no encontraba la cuenta, no la
-- confirmaba, y aun así mandaba el correo de "tu cuenta ya está activa".
--
-- Estas personas SÍ tienen cuenta, pero Auth les responde "Email not confirmed"
-- y en pantalla sale «Credenciales inválidas».
--
-- Se arregla marcándolas en Authentication → Users → Confirm email, sin tocarles
-- la contraseña que ellos eligieron.
-- ────────────────────────────────────────────────────────────
SELECT
  u.email,
  u.created_at                        AS cuenta_creada,
  c.name                              AS cliente,
  c.data->>'status'                   AS estado_ficha
FROM auth.users u
LEFT JOIN public.clients c
       ON c.id::text = u.raw_user_meta_data->>'linked_id'
WHERE u.email_confirmed_at IS NULL
  AND coalesce(u.raw_user_meta_data->>'role', '') = 'client'
ORDER BY u.created_at DESC;


-- ────────────────────────────────────────────────────────────
-- 4. CONDUCTORES DE ALTA SIN CUENTA DE ACCESO
--
-- A los conductores les afectó lo mismo: su cuenta se crea con la misma función
-- que no era alcanzable. Un conductor sin cuenta entra en la app pero lo ve todo
-- vacío, porque RLS le bloquea las consultas — no le sale ni el reparto.
--
-- Se excluyen los dados de baja: a ésos no les hace falta.
-- ────────────────────────────────────────────────────────────
SELECT
  d.id,
  d.username,
  d.data->>'name'   AS conductor,
  d.data->>'email'  AS correo
FROM public.drivers d
WHERE nullif(btrim(d.data->>'email'), '') IS NOT NULL
  AND coalesce(d.data->>'isActive', 'true') <> 'false'
  AND NOT EXISTS (
        SELECT 1
          FROM auth.users u
         WHERE lower(u.email) = lower(btrim(d.data->>'email'))
      )
ORDER BY d.username;


-- ────────────────────────────────────────────────────────────
-- 5. CUENTAS SIN FICHA EN `profiles`
--
-- Rareza, pero conviene mirarla. Lo que decide qué ve cada uno es
-- `profiles.linked_id`: es lo que leen las políticas RLS
-- (supabase/13_rls_perfiles_sin_metadatos.sql), NO los metadatos de la cuenta.
-- Una cuenta sin fila en `profiles` entra y lo ve todo vacío.
-- ────────────────────────────────────────────────────────────
SELECT
  u.email,
  u.raw_user_meta_data->>'role'      AS rol_en_metadatos,
  u.raw_user_meta_data->>'linked_id' AS vinculo_en_metadatos,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.created_at DESC;


-- ────────────────────────────────────────────────────────────
-- 6. RESUMEN: cuánto hay de cada cosa
--
-- Para saber de un vistazo si esto son tres casos o son treinta, antes de
-- ponerse a arreglarlos uno a uno.
-- ────────────────────────────────────────────────────────────
SELECT 'Clientes con acceso configurado y SIN cuenta' AS que_pasa, count(*) AS cuantos
  FROM public.clients c
 WHERE coalesce(c.data->>'tieneAccesoPortal', 'false') = 'true'
   AND coalesce(nullif(btrim(c.data->>'accessEmail'), ''), c.data->>'email', '') <> ''
   AND NOT EXISTS (SELECT 1 FROM auth.users u
                    WHERE lower(u.email) = lower(coalesce(nullif(btrim(c.data->>'accessEmail'), ''), c.data->>'email')))

UNION ALL
SELECT 'Correos adicionales sin cuenta', count(*)
  FROM public.clients c,
       LATERAL jsonb_array_elements(
         CASE WHEN jsonb_typeof(c.data->'accessEmailsExtra') = 'array'
              THEN c.data->'accessEmailsExtra' ELSE '[]'::jsonb END) AS extra
 WHERE nullif(btrim(extra->>'email'), '') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(btrim(extra->>'email')))

UNION ALL
SELECT 'Cuentas de cliente sin confirmar', count(*)
  FROM auth.users u
 WHERE u.email_confirmed_at IS NULL
   AND coalesce(u.raw_user_meta_data->>'role', '') = 'client'

UNION ALL
SELECT 'Conductores de alta sin cuenta', count(*)
  FROM public.drivers d
 WHERE nullif(btrim(d.data->>'email'), '') IS NOT NULL
   AND coalesce(d.data->>'isActive', 'true') <> 'false'
   AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(btrim(d.data->>'email')))

UNION ALL
SELECT 'Cuentas sin fila en profiles', count(*)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
 WHERE p.id IS NULL;
