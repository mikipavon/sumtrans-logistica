-- ============================================================
-- FASE 2: Tabla de perfiles y trigger de nuevo usuario
-- Proyecto: mottccbalzdzzrgqzfkdl (SUM Transportes)
-- Fecha: 2026-06-17
-- Descripción:
--   Crea la tabla public.profiles vinculada a auth.users,
--   habilita RLS con políticas de lectura propia y acceso
--   total para administradores, y configura un trigger que
--   inserta automáticamente un perfil cada vez que se
--   registra un nuevo usuario en Supabase Auth.
-- ============================================================

-- ===========================================
-- 1. Crear tabla public.profiles
-- ===========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  -- Clave primaria vinculada al usuario de auth; se elimina en cascada
  id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Rol del usuario: solo se permiten estos tres valores
  role         TEXT        NOT NULL CHECK (role IN ('admin', 'driver', 'client')),

  -- ID del conductor/cliente en su tabla original (drivers / clients)
  linked_id    TEXT,

  -- Nombre visible del usuario
  display_name TEXT,

  -- Fecha de creación del perfil
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Comentario descriptivo en la tabla
COMMENT ON TABLE public.profiles
  IS 'Perfiles de usuario vinculados a Supabase Auth. Cada fila corresponde a un usuario registrado.';

-- ===========================================
-- 2. Habilitar Row Level Security (RLS)
-- ===========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- 3. Políticas de seguridad (RLS policies)
-- ===========================================

-- 3a. Cada usuario puede leer su propio perfil
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 3b. Los administradores tienen acceso completo (CRUD)
CREATE POLICY "Admin full access"
  ON public.profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM public.profiles
       WHERE id   = auth.uid()
         AND role = 'admin'
    )
  );

-- ===========================================
-- 4. Función trigger: handle_new_user()
-- ===========================================
-- Se ejecuta automáticamente tras cada INSERT en auth.users.
-- Extrae role, linked_id y display_name de raw_user_meta_data;
-- si no se proporcionan, asigna valores por defecto.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER          -- Se ejecuta con privilegios del owner (bypass RLS)
SET search_path = public  -- Evitar inyección de esquema
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, linked_id, display_name)
  VALUES (
    NEW.id,

    -- Rol: usa el valor de metadata o 'client' por defecto
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'client'),

    -- ID vinculado a la tabla original (puede ser NULL)
    NEW.raw_user_meta_data ->> 'linked_id',

    -- Nombre visible: metadata o el email como fallback
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.email
    )
  );

  RETURN NEW;
END;
$$;

-- ===========================================
-- 5. Trigger: on_auth_user_created
-- ===========================================
-- Dispara handle_new_user() después de cada inserción en auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
