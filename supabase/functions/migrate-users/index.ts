// ============================================================
// Edge Function: migrate-users
// Migración ÚNICA: crea cuentas Supabase Auth para todos los
// usuarios existentes (admin, drivers, clients).
// Ejecutar UNA SOLA VEZ después de crear la tabla profiles.
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
    // Verificar autorización básica (usar la clave del body como protección)
    const body = await req.json().catch(() => ({}))
    const adminPassword = body.adminPassword || ''
    if (adminPassword !== '1632') {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const results = {
      admin: { success: false, error: null as string | null },
      drivers: [] as { id: string; username: string; email: string; success: boolean; error?: string }[],
      clients: [] as { id: string; name: string; email: string; success: boolean; error?: string }[],
    }

    // ── 1. CREAR CUENTA ADMIN ──
    console.log('[migrate] Creando cuenta admin...')
    try {
      const { data: adminUser, error: adminError } = await supabase.auth.admin.createUser({
        email: 'info@sumtransportes.com',
        password: '1632',
        email_confirm: true,
        user_metadata: {
          role: 'admin',
          display_name: 'Administrador SUM',
        },
      })

      if (adminError) {
        // Si ya existe, no es error
        if (adminError.message?.includes('already been registered') || adminError.message?.includes('already exists')) {
          results.admin = { success: true, error: 'Ya existía' }
          console.log('[migrate] Admin ya existía')
        } else {
          results.admin = { success: false, error: adminError.message }
          console.error('[migrate] Error creando admin:', adminError.message)
        }
      } else {
        results.admin = { success: true, error: null }
        console.log('[migrate] Admin creado:', adminUser?.user?.id)
      }
    } catch (e) {
      results.admin = { success: false, error: (e as Error).message }
    }

    // ── 2. MIGRAR CONDUCTORES ──
    console.log('[migrate] Migrando conductores...')
    const { data: allDrivers } = await supabase.from('drivers').select('*')

    if (allDrivers) {
      for (const driver of allDrivers) {
        const driverData = driver.data || {}
        const email = driverData.email || driver.email || ''
        const password = driver.password || driverData.password || ''
        const name = driverData.name || driver.username || ''

        if (!email) {
          results.drivers.push({
            id: driver.id,
            username: driver.username || '',
            email: '',
            success: false,
            error: 'Sin email — el admin debe añadir un email antes de migrar',
          })
          continue
        }

        if (!password || password.length < 6) {
          results.drivers.push({
            id: driver.id,
            username: driver.username || '',
            email,
            success: false,
            error: `Contraseña demasiado corta (${password?.length || 0} chars, mínimo 6)`,
          })
          continue
        }

        try {
          const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
              role: 'driver',
              linked_id: String(driver.id),
              display_name: name,
            },
          })

          if (authError) {
            if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
              results.drivers.push({ id: driver.id, username: driver.username || '', email, success: true, error: 'Ya existía' })
            } else {
              results.drivers.push({ id: driver.id, username: driver.username || '', email, success: false, error: authError.message })
            }
          } else {
            results.drivers.push({ id: driver.id, username: driver.username || '', email, success: true })
            console.log(`[migrate] Driver ${name} migrado: ${authUser?.user?.id}`)
          }
        } catch (e) {
          results.drivers.push({ id: driver.id, username: driver.username || '', email, success: false, error: (e as Error).message })
        }
      }
    }

    // ── 3. MIGRAR CLIENTES ──
    console.log('[migrate] Migrando clientes...')
    const { data: allClients } = await supabase.from('clients').select('*')

    if (allClients) {
      for (const client of allClients) {
        const clientData = client.data || {}
        const email = clientData.email || clientData.username || ''
        const password = clientData.password || ''
        const name = clientData.name || client.name || ''

        // Solo migrar clientes con status active y que tengan credenciales
        if (clientData.status !== 'active' && clientData.status !== undefined) {
          continue // Saltar clientes pendientes o rechazados
        }

        if (!email || !password) {
          continue // Sin credenciales, no se puede migrar
        }

        if (password.length < 6) {
          results.clients.push({
            id: client.id,
            name,
            email,
            success: false,
            error: `Contraseña demasiado corta (${password.length} chars, mínimo 6)`,
          })
          continue
        }

        try {
          const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: {
              role: 'client',
              linked_id: String(client.id),
              display_name: name,
            },
          })

          if (authError) {
            if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
              results.clients.push({ id: client.id, name, email, success: true, error: 'Ya existía' })
            } else {
              results.clients.push({ id: client.id, name, email, success: false, error: authError.message })
            }
          } else {
            results.clients.push({ id: client.id, name, email, success: true })
            console.log(`[migrate] Client ${name} migrado: ${authUser?.user?.id}`)
          }
        } catch (e) {
          results.clients.push({ id: client.id, name, email, success: false, error: (e as Error).message })
        }
      }
    }

    // ── RESUMEN ──
    const totalDrivers = results.drivers.length
    const okDrivers = results.drivers.filter(d => d.success).length
    const totalClients = results.clients.length
    const okClients = results.clients.filter(c => c.success).length

    console.log(`[migrate] RESUMEN: Admin=${results.admin.success}, Drivers=${okDrivers}/${totalDrivers}, Clients=${okClients}/${totalClients}`)

    return new Response(JSON.stringify({
      ok: true,
      summary: {
        admin: results.admin.success,
        drivers: `${okDrivers}/${totalDrivers} migrados`,
        clients: `${okClients}/${totalClients} migrados`,
      },
      details: results,
    }, null, 2), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[migrate] Error inesperado:', e)
    return new Response(JSON.stringify({ error: 'Error inesperado', detail: (e as Error).message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
