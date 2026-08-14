# Quitar las contraseñas en texto plano

Estado a 14 de agosto de 2026. Este es el último tramo del cambio a Supabase Auth:
mientras existan las columnas `password`, cualquiera que consiga leer las tablas
`drivers` o `clients` se lleva las contraseñas de todo el mundo.

## Dónde están hoy

| Sitio | Qué guarda | Quién lo lee |
|---|---|---|
| `drivers.password` | contraseña del repartidor, en claro | `verify_driver_login` (SECURITY DEFINER) |
| `clients.data->>'password'` | contraseña del cliente, en claro | el login antiguo, en el navegador |

El login de clientes antiguo (`handleLegacyLogin`, rama `role === 'client'`) se
descarga **todas** las fichas de clientes al navegador y compara la contraseña
allí. Con las políticas de la fase 04 aplicadas eso ya no devuelve nada a un
visitante sin sesión, así que probablemente esté muerto en producción — pero
conviene confirmarlo antes de borrarlo.

## Orden de trabajo

### 1. Ver cuánta gente falta por migrar

```sql
-- Repartidores sin cuenta en Auth
SELECT d.id, d.username, d.data->>'email' AS email
  FROM public.drivers d
  LEFT JOIN auth.users u ON lower(u.email) = lower(d.data->>'email')
 WHERE u.id IS NULL;

-- Clientes sin cuenta en Auth
SELECT c.id, c.name, c.data->>'email' AS email
  FROM public.clients c
  LEFT JOIN auth.users u ON lower(u.email) = lower(c.data->>'email')
 WHERE u.id IS NULL
   AND c.data->>'email' IS NOT NULL;

-- Perfiles sin rol correcto (entran pero lo ven todo vacío)
SELECT p.id, p.role, p.linked_id, u.email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
 WHERE p.linked_id IS NULL OR p.role IS NULL;
```

### 2. Migrar a los que faltan

Los repartidores se migran solos: al iniciar sesión con su contraseña antigua,
la app llama a `create-auth-user` en modo automigración y les crea la cuenta.
Basta con esperar a que entren todos, o avisarles de que entren una vez.

Los clientes no tienen ese automatismo. Para ellos, desde la pantalla de
administración, edita la ficha y vuelve a guardarla con una contraseña de 6
caracteres o más: eso dispara la creación de la cuenta con sesión de admin.

### 3. Cuando no quede nadie en las consultas del paso 1

Quitar el login antiguo del código:

- `handleLegacyLogin` entera en `src/App.jsx` (ramas `driver` y `client`)
- la llamada de respaldo desde `handleLogin`
- el modo automigración de `supabase/functions/create-auth-user/index.ts`
  (a partir de ahí la función sólo debe aceptar el modo administrador)

### 4. Borrar las contraseñas de la base de datos

⚠️ Sólo después del paso 3, y con copia de seguridad hecha.

```sql
-- Las funciones que comparan contraseñas en claro dejan de tener sentido
DROP FUNCTION IF EXISTS public.verify_driver_login(text, text);

-- El email por usuario sigue haciendo falta mientras se pueda entrar con
-- nombre de usuario en vez de con email; si se exige email, bórrala también:
-- DROP FUNCTION IF EXISTS public.get_driver_email_by_username(text);

ALTER TABLE public.drivers DROP COLUMN IF EXISTS password;

UPDATE public.clients SET data = data - 'password' WHERE data ? 'password';
```

### 5. Dejar de guardar contraseñas nuevas

`supabase/functions/registro-cliente/index.ts` escribe hoy `password` dentro de
`newClientData` (el alta desde el formulario de la web). Una vez hecho el paso 4
hay que quitar esa línea: la cuenta de Auth ya se crea ahí mismo, así que la
copia en claro no sirve para nada.

## Lo que queda pendiente aparte de esto

- **El auto-login del portal de clientes.** Ya no deja las credenciales en la
  barra de direcciones (se borran nada más cargar) y acepta el canal nuevo por
  `postMessage`, pero **sumtransportes.com sigue mandándolas por la URL**, así
  que viajan una vez en la petición inicial y quedan en los registros del
  alojamiento. Para cerrarlo del todo hay que cambiar la web padre — el fragmento
  está en `src/utils/ventanaPadre.js`.
