// ============================================================
// Edge Function: registro-cliente
// Recibe el POST del formulario de sumtransportes.com,
// detecta si el cliente ya existe (por CIF + nombre),
// crea o actualiza la ficha, crea cuenta Supabase Auth,
// y manda emails automáticos.
// v3.0 — con Supabase Auth + sin contraseñas en emails
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Email del admin (Miguel) que recibirá los avisos
const ADMIN_EMAIL = 'info@sumtransportes.com'
const FROM_EMAIL = 'noreply@sumtransportes.com'
const APP_URL = 'https://sumtrans-logistica.vercel.app'

// ── Normaliza un string para comparación aproximada ──
function normalize(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // quita acentos
    .replace(/[.\-,;:_]/g, '')         // quita puntos, guiones, comas
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Envía email via Resend ──
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Sumtrans Transportes <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`[Resend] Error enviando email a ${to}:`, err)
    } else {
      console.log(`[Resend] Email enviado a ${to}: ${subject}`)
    }
  } catch (e) {
    console.error('[Resend] Excepción al enviar email:', e)
  }
}

// ── HTML del email de solicitud recibida (todo registro queda pendiente) ──
function emailSolicitudRecibida(nombre: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:600px;margin:40px auto;background:#fff;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">
    <!-- Body -->
    <div style="padding:40px 36px">
      <p style="color:#1e293b;font-size:15px;line-height:1.7;margin:0 0 8px">Estimado/a <strong>${nombre}</strong>,</p>
      <p style="color:#475569;font-size:15px;line-height:1.7;margin:0 0 24px">
        Hemos recibido correctamente su solicitud de alta como cliente de SUM Transportes.
        Nuestro equipo la revisará en las próximas <strong>24-48 horas</strong> y recibirá un email
        de confirmación con sus datos de acceso al portal.
      </p>
      <div style="background:#fef9ec;border-left:4px solid #f59e0b;border-radius:4px;padding:16px 20px;margin-bottom:28px">
        <p style="color:#92400e;font-size:14px;margin:0">📧 Recibirá un email de confirmación cuando su cuenta esté activa.</p>
      </div>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 28px">
        Para cualquier consulta puede contactarnos en
        <a href="mailto:info@sumtransportes.com" style="color:#2563eb">info@sumtransportes.com</a>
        o llamarnos al <strong>957 245 221</strong>.
      </p>
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
}

// ── HTML del email de aviso al admin ──
function emailAvisoAdmin(
  tipo: 'duplicado' | 'nuevo',
  nombre: string,
  cif: string,
  email: string,
  telefono: string,
  ciudad: string,
  duplicadoDeNombre?: string
): string {
  const color = tipo === 'duplicado' ? '#dc2626' : '#d97706'
  const emoji = tipo === 'duplicado' ? '⚠️' : '🆕'
  const titulo = tipo === 'duplicado'
    ? 'ATENCIÓN: el CIF ya está en cartera — Pendiente de tu aprobación'
    : 'Cliente NUEVO — Pendiente de tu aprobación'

  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:${color};padding:24px 32px">
      <h2 style="color:#fff;margin:0;font-size:18px">${emoji} Nuevo registro web: ${nombre}</h2>
      <p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:13px">${titulo}</p>
    </div>
    <div style="padding:32px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:130px">Empresa:</td><td style="padding:8px 0;color:#1e293b;font-size:13px;font-weight:600">${nombre}</td></tr>
        <tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b;font-size:13px">CIF:</td><td style="padding:8px 12px;color:#1e293b;font-size:13px;font-weight:600">${cif || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px">Email:</td><td style="padding:8px 0;color:#1e293b;font-size:13px">${email}</td></tr>
        <tr style="background:#f8fafc"><td style="padding:8px 12px;color:#64748b;font-size:13px">Teléfono:</td><td style="padding:8px 12px;color:#1e293b;font-size:13px">${telefono || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px">Ciudad:</td><td style="padding:8px 0;color:#1e293b;font-size:13px">${ciudad || '—'}</td></tr>
      </table>
      ${tipo === 'duplicado' ? `
      <div style="margin-top:20px;background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:16px 20px">
        <p style="color:#991b1b;font-size:13px;margin:0 0 6px;font-weight:700">Este CIF ya pertenece a un cliente en cartera:</p>
        <p style="color:#7f1d1d;font-size:14px;margin:0 0 10px">${duplicadoDeNombre || '(cliente sin nombre)'}</p>
        <p style="color:#991b1b;font-size:12px;margin:0;line-height:1.5">
          No se ha modificado nada de la ficha existente ni se ha dado acceso.
          Verifica que quien se registra pertenece realmente a esa empresa antes de aprobar.
        </p>
      </div>` : ''}
      <div style="margin-top:24px;text-align:center">
        <a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px">
          Ir a la App → Validar Cliente
        </a>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ══════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ══════════════════════════════════════════════════
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Método no permitido', { status: 405, headers: CORS })
  }

  try {
    // ── 1. Parsear el formulario ──
    const contentType = req.headers.get('content-type') || ''
    let fields: Record<string, string> = {}

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await req.text()
      const params = new URLSearchParams(text)
      params.forEach((val, key) => { fields[key] = val })
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      formData.forEach((val, key) => { fields[key] = val.toString() })
    } else if (contentType.includes('application/json')) {
      fields = await req.json()
    }

    console.log('[registro-cliente] Datos recibidos:', JSON.stringify(fields))

    // ── 2. Extraer campos (compatibles con los nombres del formulario) ──
    const nombreComercial = fields['Nombre_Comercial'] || fields['nombre'] || ''
    const cif             = (fields['CIF'] || fields['cif'] || '').trim().toUpperCase().replace(/[-\s]/g, '')
    const razonSocial     = fields['Razon_Social'] || fields['razon_social'] || nombreComercial
    const direccion       = fields['Direccion'] || fields['direccion'] || ''
    const poblacion       = fields['Poblacion'] || fields['poblacion'] || ''
    const cp              = fields['CP'] || fields['cp'] || ''
    const personaContacto = fields['Persona_Contacto'] || fields['persona_contacto'] || ''
    const telefono        = fields['Teléfono'] || fields['Telefono'] || fields['telefono'] || ''
    const email           = (fields['email'] || fields['Correo_electronico'] || fields['correo'] || '').toLowerCase().trim()
    const password        = fields['Contraseña'] || fields['Password'] || fields['password'] || ''
    const sector          = fields['Sector'] || fields['sector'] || ''

    if (!email || !password || !nombreComercial) {
      return new Response(JSON.stringify({ error: 'Faltan datos obligatorios' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── 3. Conectar a Supabase con service role (sin restricciones RLS) ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── 4. Buscar si el CIF ya corresponde a un cliente en cartera ──
    // ⚠️ SOLO INFORMATIVO. Este endpoint es público (lo llama el formulario de
    // la web, que no tiene sesión), así que NUNCA debe modificar la ficha de un
    // cliente existente ni concederle acceso: un CIF es información pública y
    // cualquiera podría suplantar a un cliente real. Todo registro entra como
    // 'pending' y lo aprueba el admin desde la pantalla de Validar Clientes.
    let duplicadoDe: { id: unknown; nombre: string } | null = null

    if (cif) {
      const { data: byJsonbCif } = await supabase
        .from('clients')
        .select('id, name, data')
        .filter('data->>cif', 'ilike', cif)
        .limit(1)

      const match = byJsonbCif?.[0] as Record<string, unknown> | undefined
      if (match) {
        duplicadoDe = {
          id: match.id,
          nombre: (match.name as string)
            || ((match.data as Record<string, unknown>)?.name as string)
            || '(sin nombre)',
        }
        console.log(`[registro-cliente] CIF ${cif} ya existe → cliente ${match.id}. Se marca como posible duplicado.`)
      }
    }

    // ── 5. Crear la solicitud SIEMPRE como pendiente ──
    // Nunca se toca una ficha existente ni se concede acceso automático:
    // el admin aprueba desde la pantalla de Validar Clientes.
    const now = new Date().toISOString()

    const newClientData: Record<string, unknown> = {
      name: nombreComercial,
      legalName: razonSocial,
      cif: cif,
      address: direccion,
      city: poblacion,
      zip: cp,
      phone: telefono,
      mobile: telefono,
      email: email,
      contactPerson: personaContacto,
      username: email,
      password: password,
      type: 'Remitente',
      billingType: 'Clientes Habituales',
      tariffType: 'General',
      status: 'pending',
      createdFrom: 'web-registro',
      createdAt: now,
      lastInteraction: new Date().toLocaleDateString('es-ES'),
      sector: sector,
      color: '#3b82f6',
      priority: 'normal',
      requireSignature: false,
      requireName: true,
      // Pistas para el admin si el CIF ya estaba en cartera
      ...(duplicadoDe ? {
        possibleDuplicateOf: duplicadoDe.id,
        possibleDuplicateName: duplicadoDe.nombre,
      } : {}),
    }

    const { data: inserted, error: insertError } = await supabase
      .from('clients')
      .insert([{ name: nombreComercial, data: newClientData }])
      .select('id')
      .single()

    if (insertError) {
      console.error('[registro-cliente] Error creando cliente:', insertError)
      return new Response(JSON.stringify({ error: 'Error interno al crear la solicitud.' }), {
        status: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // ── Crear cuenta Supabase Auth SIN confirmar (no puede entrar aún) ──
    // Si el email ya tiene cuenta, createUser falla con "already registered" y
    // se ignora a propósito: así un registro web nunca puede pisar la
    // contraseña de una cuenta que ya existe.
    try {
      if (password.length >= 6 && inserted?.id) {
        const { error: authError } = await supabase.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: false, // No confirmar hasta que el admin apruebe
          user_metadata: {
            role: 'client',
            linked_id: String(inserted.id),
            display_name: nombreComercial,
          },
        })
        if (authError && !authError.message?.includes('already')) {
          console.warn('[registro-cliente] Error creando Auth user:', authError.message)
        } else {
          console.log(`[registro-cliente] Auth user (sin confirmar) para ${email}`)
        }
      }
    } catch (authErr) {
      console.warn('[registro-cliente] Auth creation error:', authErr)
    }

    // Emails: aviso de espera al cliente + aviso a Miguel
    await Promise.all([
      sendEmail(
        email,
        'Solicitud de alta recibida — Sumtrans Transportes',
        emailSolicitudRecibida(nombreComercial)
      ),
      sendEmail(
        ADMIN_EMAIL,
        duplicadoDe
          ? `⚠️ Registro web: ${nombreComercial} — CIF YA EN CARTERA, revisar`
          : `🆕 Nuevo cliente web: ${nombreComercial} (pendiente de aprobación)`,
        emailAvisoAdmin(
          duplicadoDe ? 'duplicado' : 'nuevo',
          nombreComercial, cif, email, telefono, poblacion,
          duplicadoDe?.nombre
        )
      ),
    ])

    console.log(`[registro-cliente] Solicitud creada: ${inserted?.id}${duplicadoDe ? ` (posible duplicado de ${duplicadoDe.id})` : ''}`)
    return new Response(JSON.stringify({ ok: true, tipo: 'pendiente', nombre: nombreComercial }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e) {
    console.error('[registro-cliente] Error inesperado:', e)
    return new Response(JSON.stringify({ error: 'Error inesperado. Por favor, inténtalo de nuevo.' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})

// ── Páginas HTML de respuesta ──
function htmlExito(nombre: string, accesoDirecto: boolean): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Registro completado — Sumtrans</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #fff; border-radius: 20px; padding: 48px 40px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.1); }
    .icon { font-size: 56px; margin-bottom: 20px; }
    h1 { color: #1e293b; font-size: 24px; margin-bottom: 12px; }
    p { color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 28px; }
    .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px; }
    .note { font-size: 13px; color: #94a3b8; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${accesoDirecto ? '🎉' : '⏳'}</div>
    <h1>${accesoDirecto ? '¡Bienvenido, ' + nombre + '!' : 'Solicitud recibida'}</h1>
    <p>${accesoDirecto
      ? 'Ya tienes acceso al portal. Hemos enviado tus credenciales a tu email. Puedes entrar directamente.'
      : 'Hemos recibido tu solicitud de alta. Te enviaremos un email de confirmación en 24-48 horas.'
    }</p>
    ${accesoDirecto ? `<a href="${APP_URL}?tab=client" class="btn">Entrar al Portal →</a>` : ''}
    <p class="note">Revisa tu bandeja de entrada (y la carpeta de spam, por si acaso).</p>
  </div>
</body>
</html>`
}

function htmlError(mensaje: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Error — Sumtrans</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #fff; border-radius: 20px; padding: 48px 40px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 8px 40px rgba(0,0,0,0.1); }
    h1 { color: #dc2626; font-size: 22px; margin-bottom: 12px; }
    p { color: #475569; font-size: 15px; }
    .btn { display: inline-block; margin-top: 24px; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:48px;margin-bottom:16px">❌</div>
    <h1>Error al procesar tu solicitud</h1>
    <p>${mensaje}</p>
    <a href="https://www.sumtransportes.com/registro-empresa" class="btn">Volver al formulario</a>
  </div>
</body>
</html>`
}
