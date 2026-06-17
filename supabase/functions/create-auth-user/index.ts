// ============================================================
// Edge Function: create-auth-user
// Crea una cuenta Supabase Auth para un usuario (driver/client)
// Se llama automáticamente desde la app al crear/editar usuarios
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Método no permitido', { status: 405, headers: CORS })
  }

  try {
    const body = await req.json()
    const { email, password, role, linked_id, display_name } = body

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Faltan email o password' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (password.length < 4) {
      return new Response(JSON.stringify({ error: 'La contraseña debe tener al menos 4 caracteres' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Intentar crear el usuario
    const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        role: role || 'driver',
        linked_id: String(linked_id || ''),
        display_name: display_name || email,
      },
    })

    if (createError) {
      // Si ya existe, actualizar la contraseña y metadata
      if (createError.message?.includes('already') || createError.message?.includes('exists')) {
        // Buscar el usuario existente
        const { data: listData } = await supabase.auth.admin.listUsers()
        const existingUser = listData?.users?.find((u: any) => u.email === email)
        
        if (existingUser) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
            password: password,
            email_confirm: true,
            user_metadata: {
              role: role || 'driver',
              linked_id: String(linked_id || ''),
              display_name: display_name || email,
            },
          })

          if (updateError) {
            return new Response(JSON.stringify({ error: updateError.message }), {
              status: 500,
              headers: { ...CORS, 'Content-Type': 'application/json' },
            })
          }

          return new Response(JSON.stringify({ ok: true, action: 'updated', userId: existingUser.id }), {
            status: 200,
            headers: { ...CORS, 'Content-Type': 'application/json' },
          })
        }
      }

      return new Response(JSON.stringify({ error: createError.message }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[create-auth-user] Cuenta creada para ${email} (${role}) → ${authUser?.user?.id}`)

    return new Response(JSON.stringify({ ok: true, action: 'created', userId: authUser?.user?.id }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[create-auth-user] Error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
