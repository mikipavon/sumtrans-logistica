// ============================================================
// Edge Function: create-auth-user
// Crea o actualiza la cuenta Supabase Auth de un usuario.
//
// ⚠️ Esta función usa la SERVICE ROLE KEY, así que puede crear cuentas y
// cambiar contraseñas sin ninguna restricción. Por eso SIEMPRE tiene que
// comprobar quién llama. Sólo hay dos formas legítimas de entrar:
//
//   A) MODO ADMIN — el que llama presenta un token de un usuario cuyo
//      perfil tiene role='admin'. Es el caso del panel de conductores.
//
//   B) MODO AUTOMIGRACIÓN — no hay admin, pero el que llama demuestra que
//      ya conoce la contraseña antigua del conductor (se verifica contra la
//      tabla `drivers` mediante verify_driver_login). Sirve para que un
//      conductor que aún no está en Auth se migre solo al iniciar sesión.
//      En este modo el rol y el linked_id salen de la base de datos, NUNCA
//      del cuerpo de la petición, y la contraseña que se graba es la misma
//      que se acaba de verificar: no se puede fijar una que no se sepa ya.
//
// Antes no comprobaba nada: cualquiera con la clave anónima (que es pública,
// va dentro del bundle) podía crear una cuenta con role='admin' o pisar la
// contraseña de una cuenta existente y entrar como administrador.
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const ROLES_VALIDOS = ['admin', 'driver', 'client']

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── ¿El que llama es un administrador con sesión válida? ──
// Ojo: la clave anónima también es un JWT, pero no identifica a ningún
// usuario, así que getUser() la rechaza y caemos al modo automigración.
async function llamadaDeAdmin(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return false

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()

  return perfil?.role === 'admin'
}

// ── Crear la cuenta, o actualizar la contraseña si el email ya existe ──
async function crearOActualizar(
  supabase: ReturnType<typeof createClient>,
  email: string,
  password: string,
  metadata: Record<string, string>,
): Promise<Response> {
  const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  })

  if (!createError) {
    console.log(`[create-auth-user] Cuenta creada para ${email} (${metadata.role})`)
    return json({ ok: true, action: 'created', userId: authUser?.user?.id })
  }

  const yaExiste = createError.message?.includes('already') || createError.message?.includes('exists')
  if (!yaExiste) {
    return json({ error: createError.message }, 500)
  }

  // Buscar la cuenta existente (paginando por si hay muchos usuarios)
  let existente: { id: string } | null = null
  for (let page = 1; page <= 50 && !existente; page++) {
    const { data: listado, error: listError } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (listError || !listado?.users?.length) break
    existente = listado.users.find((u: { email?: string }) => u.email === email) as { id: string } | null
    if (listado.users.length < 1000) break
  }

  if (!existente) {
    return json({ error: 'La cuenta ya existe pero no se ha podido localizar' }, 500)
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(existente.id, {
    password,
    email_confirm: true,
    user_metadata: metadata,
  })

  if (updateError) {
    return json({ error: updateError.message }, 500)
  }

  console.log(`[create-auth-user] Contraseña actualizada para ${email} (${metadata.role})`)
  return json({ ok: true, action: 'updated', userId: existente.id })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Método no permitido', { status: 405, headers: CORS })
  }

  try {
    const body = await req.json()
    const { email, password, role, linked_id, display_name, legacy_username } = body

    if (!password) {
      return json({ error: 'Falta la contraseña' }, 400)
    }

    // Mínimo 6: es el que exige Supabase Auth por defecto. Aceptar menos aquí
    // sólo consigue que createUser falle más abajo con un error menos claro.
    if (password.length < 6) {
      return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── MODO A: administrador autenticado ──
    if (await llamadaDeAdmin(req, supabase)) {
      if (!email) {
        return json({ error: 'Falta el email' }, 400)
      }
      const rol = ROLES_VALIDOS.includes(role) ? role : 'driver'
      return await crearOActualizar(supabase, email, password, {
        role: rol,
        linked_id: String(linked_id || ''),
        display_name: display_name || email,
      })
    }

    // ── MODO B: automigración de un conductor que aún no está en Auth ──
    // Hay que demostrar conocimiento de la contraseña antigua. verify_driver_login
    // es SECURITY DEFINER y sólo devuelve fila si usuario y contraseña coinciden.
    if (!legacy_username) {
      console.warn('[create-auth-user] Llamada sin admin y sin legacy_username — denegada')
      return json({ error: 'No autorizado' }, 401)
    }

    const { data: conductor, error: rpcError } = await supabase.rpc('verify_driver_login', {
      p_username: legacy_username,
      p_password: password,
    })

    if (rpcError || !conductor?.found) {
      console.warn(`[create-auth-user] Credenciales antiguas no válidas para "${legacy_username}" — denegada`)
      return json({ error: 'No autorizado' }, 401)
    }

    if (!conductor.email) {
      return json({ error: 'El conductor no tiene email en su ficha' }, 400)
    }

    // Rol y vínculo salen de la base de datos, no de lo que mande el cliente.
    return await crearOActualizar(supabase, conductor.email, password, {
      role: 'driver',
      linked_id: String(conductor.id),
      display_name: conductor.name || conductor.username || conductor.email,
    })

  } catch (e) {
    console.error('[create-auth-user] Error:', e)
    return json({ error: (e as Error).message }, 500)
  }
})
