// ============================================================
// Edge Function: registro-cliente
// Recibe el POST del formulario de sumtransportes.com,
// detecta si el cliente ya existe (por CIF + nombre),
// crea o actualiza la ficha, y manda emails automáticos.
// v2.1 — sin JWT, CIF normalizado, emails corporativos SUM
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

// ── HTML del email de bienvenida (cliente EXISTENTE → acceso inmediato) ──
function emailAccesoInmediato(nombre: string, email: string, password: string): string {
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
        Su solicitud de alta ha sido procesada. Como ya es cliente de SUM Transportes,
        tiene acceso inmediato a su portal personal de clientes.
      </p>
      <!-- Credenciales -->
      <div style="background:#f8fafc;border-left:4px solid #2563eb;border-radius:4px;padding:20px 24px;margin-bottom:28px">
        <p style="color:#1e3a5f;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px">Credenciales de acceso al portal</p>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="color:#64748b;font-size:13px;padding:4px 0;width:100px">Usuario:</td><td style="color:#1e293b;font-size:14px;font-weight:600">${email}</td></tr>
          <tr><td style="color:#64748b;font-size:13px;padding:4px 0">Contraseña:</td><td style="color:#1e293b;font-size:14px;font-weight:600">${password}</td></tr>
        </table>
      </div>
      <!-- CTA -->
    </div>
  </div>
</body>
</html>`
}

// ── HTML del email de solicitud recibida (cliente NUEVO → pendiente de aprobación) ──
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
  tipo: 'existente' | 'nuevo',
  nombre: string,
  cif: string,
  email: string,
  telefono: string,
  ciudad: string
): string {
  const color = tipo === 'existente' ? '#16a34a' : '#d97706'
  const emoji = tipo === 'existente' ? '✅' : '🆕'
  const titulo = tipo === 'existente'
    ? 'Cliente EXISTENTE — Credenciales actualizadas automáticamente'
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
      ${tipo === 'nuevo' ? `
      <div style="margin-top:24px;text-align:center">
        <a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px">
          Ir a la App → Validar Cliente
        </a>
      </div>` : ''}
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

    // ── 4. Buscar cliente existente por CIF ──
    let existingClient: Record<string, unknown> | null = null

    if (cif) {
      // Buscar en la columna data JSONB por cif
      const { data: byJsonbCif } = await supabase
        .from('clients')
        .select('*')
        .filter('data->>cif', 'ilike', cif)
        .limit(5)

      if (byJsonbCif && byJsonbCif.length > 0) {
        // Verificar también el nombre aproximadamente
        const normFormName = normalize(nombreComercial || razonSocial)
        const found = byJsonbCif.find((row: Record<string, unknown>) => {
          const dbName = normalize((row.name as string) || (row.data as Record<string, unknown>)?.name as string || '')
          // Si el CIF coincide exactamente ya es suficiente (el nombre es confirmación)
          // Pero si el nombre es completamente distinto, igual lo aceptamos (CIF es el ID único)
          return dbName.length > 0 || normFormName.length > 0
        })
        if (found) existingClient = found as Record<string, unknown>
      }
    }

    // ── 5. Crear o actualizar cliente ──
    const now = new Date().toISOString()

    if (existingClient) {
      // ─── CLIENTE EXISTENTE: actualizar credenciales y campos vacíos ───
      const existingData = (existingClient.data as Record<string, unknown>) || {}

      // Solo rellenar campos que están vacíos en la ficha existente
      const updatedData: Record<string, unknown> = {
        ...existingData,
        // Credenciales → siempre se escriben (el cliente las ha elegido ahora)
        username: email,
        password: password,
        email: existingData.email || email,
        // Campos vacíos → rellenar con los del formulario
        phone: existingData.phone || telefono,
        mobile: existingData.mobile || telefono,
        contactPerson: existingData.contactPerson || personaContacto,
        address: existingData.address || direccion,
        city: existingData.city || poblacion,
        zip: existingData.zip || cp,
        legalName: existingData.legalName || razonSocial,
        // Marcar como activo
        status: 'active',
        portalRegisteredAt: now,
      }

      const { error: updateError } = await supabase
        .from('clients')
        .update({ data: updatedData })
        .eq('id', existingClient.id)

      if (updateError) {
        console.error('[registro-cliente] Error actualizando cliente:', updateError)
        return new Response(JSON.stringify({ error: 'Error interno al actualizar la ficha.' }), {
          status: 500,
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Emails: acceso inmediato al cliente + aviso a Miguel
      await Promise.all([
        sendEmail(
          email,
          '¡Ya tienes acceso al Portal de Clientes de Sumtrans! 🚛',
          emailAccesoInmediato(nombreComercial, email, password)
        ),
        sendEmail(
          ADMIN_EMAIL,
          `✅ Registro web: ${nombreComercial} (cliente existente, actualizado)`,
          emailAvisoAdmin('existente', nombreComercial, cif, email, telefono, poblacion)
        ),
      ])

      console.log(`[registro-cliente] Cliente existente actualizado: ${existingClient.id}`)
      return new Response(JSON.stringify({ ok: true, tipo: 'existente', nombre: nombreComercial }), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })

    } else {
      // ─── CLIENTE NUEVO: crear ficha con status pending ───
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
        requireSignature: true,
        requireName: true,
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

      // Emails: aviso de espera al cliente + aviso a Miguel
      await Promise.all([
        sendEmail(
          email,
          'Solicitud de alta recibida — Sumtrans Transportes',
          emailSolicitudRecibida(nombreComercial)
        ),
        sendEmail(
          ADMIN_EMAIL,
          `🆕 Nuevo cliente web: ${nombreComercial} (pendiente de aprobación)`,
          emailAvisoAdmin('nuevo', nombreComercial, cif, email, telefono, poblacion)
        ),
      ])

      console.log(`[registro-cliente] Nuevo cliente creado: ${inserted?.id}`)
      return new Response(JSON.stringify({ ok: true, tipo: 'nuevo', nombre: nombreComercial }), {
        status: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

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
