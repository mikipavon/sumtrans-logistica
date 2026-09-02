// ============================================================
// Edge Function: confirmar-acceso
// Llamada desde la app cuando el admin aprueba un cliente nuevo.
// Envía el email de confirmación de acceso al cliente y
// confirma su cuenta Supabase Auth.
//
// Confirmar la cuenta NO es un detalle del envío del correo: es lo único que
// deja entrar al cliente, porque registro-cliente la crea sin confirmar. Si no
// se consigue, el aviso no sale y se le dice a la oficina — antes se mandaba
// igual y el cliente se encontraba un «Credenciales inválidas» que no era
// verdad. Ver el bloque "Confirmar cuenta Supabase Auth del cliente".
//
// v3.1 — la búsqueda de la cuenta pagina, y ya no falla en silencio
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const FROM_EMAIL = 'noreply@sumtransportes.com'
const APP_URL = 'https://sumtrans-logistica.vercel.app'

// ── Buscar la cuenta de Auth de un correo ──
//
// Paginando, que es como hay que recorrer listUsers(): llamada sin argumentos
// devuelve SÓLO las 50 primeras cuentas. Con la casa llena de repartidores y
// clientes, el que no cayera en esa primera página no se encontraba, así que su
// cuenta no se confirmaba y no podía entrar al portal — pero se le mandaba
// igualmente el correo diciéndole que ya estaba activa. Al intentarlo, Auth
// contestaba "Email not confirmed" y en la pantalla de entrada eso sale como
// «Credenciales inválidas», o sea, culpando a una contraseña que estaba bien.
//
// Mismo recorrido que buscarPorEmail() en create-auth-user. La diferencia es
// que aquí un fallo del servidor se lanza en vez de devolver null: "no he
// podido preguntarlo" no es "no existe", y confundirlos es lo que dejó a este
// cliente fuera sin que nadie se enterara.
async function buscarPorEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email?: string } | null> {
  for (let page = 1; page <= 50; page++) {
    const { data: listado, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    if (!listado?.users?.length) return null

    const encontrada = listado.users.find((u: { email?: string }) => u.email === email)
    if (encontrada) return encontrada as { id: string; email?: string }

    if (listado.users.length < 1000) return null
  }
  return null
}

serve(async (req: Request) => {
  // CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // x-client-info y apikey van aquí aunque hoy esta función se llame con un
    // fetch a pelo que no las manda: el día que alguien la pase a
    // supabase.functions.invoke(), invoke las añade solo y sin ellas el
    // navegador cortaría la petición en el preflight. Es lo que le pasaba a
    // create-auth-user. Ver el comentario de su CORS.
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Método no permitido', { status: 405, headers: corsHeaders })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Autorización: SOLO un admin puede activar una cuenta de cliente ──
    // Esta función confirma la cuenta Auth de un cliente, es decir, le concede
    // el acceso al portal. Sin esta comprobación cualquiera podría aprobar a
    // cualquier cliente pendiente enviando su id, saltándose la validación.
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: caller, error: callerError } = await supabase.auth.getUser(token)

    if (callerError || !caller?.user) {
      console.warn('[confirmar-acceso] Token inválido o anon key:', callerError?.message)
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.user.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      console.warn(`[confirmar-acceso] Acceso denegado a ${caller.user.email} (rol: ${callerProfile?.role ?? 'ninguno'})`)
      return new Response(JSON.stringify({ error: 'Solo un administrador puede activar clientes' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { clientId, email: correoPedido } = await req.json()

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'clientId es obligatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Obtener datos del cliente
    const { data: clientRow, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single()

    if (error || !clientRow) {
      console.error('[confirmar-acceso] Cliente no encontrado:', clientId, error)
      return new Response(JSON.stringify({ error: 'Cliente no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const clientData = clientRow.data || {}
    const nombre = clientData.name || clientRow.name || 'Cliente'
    // El correo de acceso manda sobre el de la ficha: es el que identifica la
    // cuenta en Auth. Si la ficha no lo trae (que es lo normal), se usa el email
    // de siempre. Mismo criterio que emailDeAcceso() en la app.
    let email = String(
      clientData.accessEmail || clientData.email || clientData.username || ''
    ).trim().toLowerCase()

    // ── A quién se le manda, cuando en la ficha entra más de uno ──
    // El aviso normal va al correo de acceso de la ficha. Pero cuando lo que se
    // acaba de aprobar es el acceso de otra persona de la misma empresa (el
    // dueño además del que hace los albaranes, o el cliente de siempre que se
    // registró por la web y se le ha dado el acceso a su ficha), el que espera
    // el email es ÉL, no el correo principal.
    //
    // Se acepta a quién mandarlo, pero sólo si es uno de los correos de esa
    // ficha: así esta función no se puede usar para mandarle las credenciales
    // de un cliente a una dirección de fuera.
    const pedido = String(correoPedido || '').trim().toLowerCase()
    if (pedido) {
      const suyos = [
        clientData.accessEmail,
        clientData.email,
        clientData.username,
        ...(Array.isArray(clientData.accessEmailsExtra)
          ? clientData.accessEmailsExtra.map((a: { email?: string }) => a?.email)
          : []),
      ].map((v: unknown) => String(v || '').trim().toLowerCase()).filter(Boolean)

      if (!suyos.includes(pedido)) {
        console.warn(`[confirmar-acceso] ${pedido} no es un correo del cliente ${clientId} — no se le manda nada`)
        return new Response(JSON.stringify({ error: 'Ese correo no es de este cliente' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      email = pedido
    }

    // Casi siempre vacía, y tiene que ser así: desde
    // supabase/16_contrasenas_con_huella.sql la ficha ya no guarda contraseñas,
    // van sólo a Auth. Sólo trae algo en las fichas escritas antes de aquello,
    // y por eso más abajo no se cuenta con ella para nada más que ese resto.
    const password = clientData.password || ''

    if (!email) {
      return new Response(JSON.stringify({ error: 'El cliente no tiene email registrado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Confirmar cuenta Supabase Auth del cliente ──
    //
    // Esto es lo que de verdad le abre la puerta. registro-cliente crea la
    // cuenta con `email_confirm: false` a propósito, para que nadie entre antes
    // de que la oficina apruebe; mientras siga sin confirmar, Auth rechaza el
    // login con "Email not confirmed" y eso llega a la pantalla de entrada como
    // «Credenciales inválidas» — el cliente da por hecho que su contraseña está
    // mal y se pone a cambiarla.
    //
    // Por eso NADA de esto puede fallar en silencio, que es lo que hacía antes:
    // si la cuenta no queda confirmada no se manda el correo de bienvenida y se
    // le dice a la oficina. Mandarlo igual es decirle «ya puedes entrar» a
    // alguien a quien la puerta le va a seguir cerrada.
    let cuenta: { id: string; email?: string } | null = null
    try {
      cuenta = await buscarPorEmail(supabase, email)
    } catch (authErr) {
      console.error('[confirmar-acceso] No se ha podido consultar Auth:', authErr)
      return new Response(JSON.stringify({
        error: 'No se ha podido comprobar la cuenta de acceso del cliente. No se le ha enviado nada: vuelve a intentarlo en un momento.',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (cuenta) {
      const { error: confirmErr } = await supabase.auth.admin.updateUserById(cuenta.id, {
        email_confirm: true,
      })
      if (confirmErr) {
        console.error('[confirmar-acceso] No se ha podido confirmar la cuenta:', confirmErr.message)
        return new Response(JSON.stringify({
          error: `No se ha podido activar la cuenta de ${email}: ${confirmErr.message}. No se le ha enviado el aviso.`,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log(`[confirmar-acceso] Cuenta Auth confirmada para ${email}`)
    } else if (password && password.length >= 6) {
      // Fichas anteriores a supabase/16_contrasenas_con_huella.sql, que todavía
      // llevan la contraseña escrita dentro. Desde esa fase la ficha ya no la
      // guarda, así que este camino sólo cubre lo que quedó escrito antes.
      const { error: createErr } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: {
          role: 'client',
          linked_id: String(clientId),
          display_name: nombre,
        },
      })
      if (createErr) {
        console.error('[confirmar-acceso] Error creando Auth user:', createErr.message)
        return new Response(JSON.stringify({
          error: `No se ha podido crear la cuenta de ${email}: ${createErr.message}. No se le ha enviado el aviso.`,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      console.log(`[confirmar-acceso] Cuenta Auth creada y confirmada para ${email}`)
    } else {
      // Ni cuenta que confirmar ni contraseña con la que crearla. Antes esto no
      // hacía nada —ni un aviso— y el correo salía igual.
      console.warn(`[confirmar-acceso] ${email} no tiene cuenta de acceso — no se le manda nada`)
      return new Response(JSON.stringify({
        error: `${email} no tiene cuenta de acceso todavía, así que no se le ha avisado. Abre su ficha, pestaña Acceso, escríbele una contraseña de 6 caracteres o más y guarda: eso le crea la cuenta.`,
      }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Enviar email de confirmación de acceso
    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#fff;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">
    <!-- Body -->
    <div style="padding:40px 36px">
      <p style="color:#1e293b;font-size:15px;line-height:1.7;margin:0 0 8px">Estimado/a <strong>${nombre}</strong>,</p>
      <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 24px">
        Nos complace comunicarle que su solicitud de alta como cliente de SUM Transportes
        ha sido aprobada. Ya tiene acceso completo a su portal personal de clientes.
      </p>
      <!-- Credenciales -->
      <div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:4px;padding:20px 24px;margin-bottom:28px">
        <p style="color:#1e3a5f;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px">Credenciales de acceso al portal</p>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="color:#64748b;font-size:13px;padding:4px 0;width:100px">Usuario:</td><td style="color:#1e293b;font-size:14px;font-weight:600">${email}</td></tr>
          <tr><td style="color:#64748b;font-size:13px;padding:4px 0">Contraseña:</td><td style="color:#475569;font-size:13px;font-style:italic">La contraseña que usted eligió al registrarse</td></tr>
        </table>
      </div>
      <!-- CTA -->
      <div style="margin-bottom:32px">
        <a href="${APP_URL}?tab=client" style="display:inline-block;background:#1e3a5f;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700;font-size:14px">Acceder al Portal →</a>
      </div>
      <!-- Firma -->
      <p style="color:#1e293b;font-size:14px;margin:0 0 4px"><strong>Miguel Ángel Pavón Maíz</strong></p>
      <p style="color:#475569;font-size:13px;margin:0 0 2px">Administración | <strong>SUM Transportes</strong> <em>Más de 20 años de experiencia</em></p>
      <p style="color:#475569;font-size:13px;margin:0 0 2px">T: 957 245 221 | M: 647 914 928</p>
      <p style="color:#475569;font-size:13px;margin:0 0 2px">E: <a href="mailto:info@sumtransportes.com" style="color:#2563eb">info@sumtransportes.com</a> | W: <a href="https://www.sumtransportes.com" style="color:#2563eb">www.sumtransportes.com</a></p>
      <p style="color:#475569;font-size:13px;margin:0">D: Polígono El Junquillo Nº 83, Cabra (Córdoba), CP 14940</p>
    </div>
    <!-- Banner corporativo -->
    <img src="https://www.sumtransportes.com/banner-email.png" alt="Transportes SUM — Logística Sin Límites" style="width:100%;display:block">
  </div>
</body>
</html>`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Sumtrans Transportes <${FROM_EMAIL}>`,
        to: [email],
        subject: '¡Tu cuenta en el Portal de Clientes de Sumtrans está activa! 🎉',
        html,
      }),
    })

    if (!emailRes.ok) {
      const errText = await emailRes.text()
      console.error('[confirmar-acceso] Error Resend:', errText)
      return new Response(JSON.stringify({ error: 'Error al enviar email', detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[confirmar-acceso] Email de acceso enviado a ${email} para cliente ${clientId}`)
    return new Response(JSON.stringify({ ok: true, emailSentTo: email }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[confirmar-acceso] Error inesperado:', e)
    return new Response(JSON.stringify({ error: 'Error inesperado' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
