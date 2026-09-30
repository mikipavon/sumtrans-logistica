-- ============================================================================
-- 36. NOTAS Y CONTRASEÑAS DE LA OFICINA
-- ============================================================================
--
-- LO QUE HACE
--
-- Crea la tabla de la pestaña "Notas" de Administración (src/pages/Notas.jsx):
-- apuntes sueltos como en OneNote y una libreta de contraseñas (webs de
-- proveedores, agencias, Factusol...).
--
-- Sólo la oficina (rol admin) puede leerla o escribirla. Ni conductores ni
-- clientes la ven, ni siquiera sabiendo que existe.
--
-- LAS CONTRASEÑAS VAN CIFRADAS ANTES DE SALIR DEL NAVEGADOR
--
-- La columna `clave_cifrada` nunca lleva la contraseña en claro: la app la
-- cifra con la "llave maestra" que se teclea al abrir la libreta
-- (src/utils/cifrarClaves.js). Supabase, sus copias de seguridad o quien vea
-- esta tabla sólo ven un churro ilegible.
--
-- La fila de tipo 'comprobante' guarda la sal de la llave y una frase cifrada
-- con ella: sirve para saber si la llave tecleada es la buena. No contiene la
-- llave ni permite sacarla.
--
-- OJO: si se olvida la llave maestra, las contraseñas guardadas NO se pueden
-- recuperar de ninguna forma. Las notas normales no van cifradas.
--
-- CÓMO SE EJECUTA
--   Supabase → SQL Editor → pegar y Run. Idempotente: se puede repetir.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.notas_oficina (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo          text NOT NULL DEFAULT 'nota'
                  CHECK (tipo IN ('nota', 'clave', 'comprobante')),
    titulo        text NOT NULL DEFAULT '',
    texto         text NOT NULL DEFAULT '',
    web           text NOT NULL DEFAULT '',
    usuario       text NOT NULL DEFAULT '',
    clave_cifrada text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Sólo puede haber un comprobante de la llave maestra.
CREATE UNIQUE INDEX IF NOT EXISTS notas_oficina_un_comprobante
    ON public.notas_oficina (tipo) WHERE tipo = 'comprobante';

ALTER TABLE public.notas_oficina ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notas_oficina_admin" ON public.notas_oficina;

CREATE POLICY "notas_oficina_admin" ON public.notas_oficina FOR ALL
    USING (public.get_user_role() = 'admin')
    WITH CHECK (public.get_user_role() = 'admin');

REVOKE ALL ON public.notas_oficina FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_oficina TO authenticated;

COMMIT;

-- ============================================================================
-- COMPROBACIÓN (ejecutar aparte, después)
-- ============================================================================
--
-- 1) La tabla tiene RLS activado (tiene que salir true):
--
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.notas_oficina'::regclass;
--
-- 2) Sólo hay una regla, la de la oficina:
--
-- SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'notas_oficina';
--
-- 3) Ninguna contraseña está en claro (todas empiezan por "v1."):
--
-- SELECT titulo, left(clave_cifrada, 12) FROM public.notas_oficina WHERE tipo = 'clave';
-- ============================================================================
