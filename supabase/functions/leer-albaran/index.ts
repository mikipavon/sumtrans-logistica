// ============================================================
// Edge Function: leer-albaran
// Lee la foto de un albarán de agencia (TSB, TXT…) con un modelo de IA con
// visión a través de OpenRouter y devuelve los datos para crear el envío.
//
// La clave de OpenRouter vive SÓLO aquí (secreto OPENROUTER_API_KEY): la web
// nunca la ve. Por eso la lectura pasa por esta función y no se llama a
// OpenRouter desde el navegador, donde cualquiera podría sacarla y gastar el
// saldo de la empresa.
//
// Sólo la usa la oficina: comprueba que quien llama es admin mirando
// public.profiles, nunca los metadatos del token (ver create-auth-user).
//
// Acciones (campo `accion` del cuerpo):
//   'leer'  → { imagen: 'data:image/jpeg;base64,…', modelo? }
//             devuelve { campos, coste, modelo }
//   'saldo' → devuelve lo que queda y lo gastado, para el panel de consumo
//
// Lo que devuelve el modelo NO se da por bueno: la app lo enseña junto a la
// foto y la oficina lo revisa antes de crear nada (ImportarAlbaranesAgencia).
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const OPENROUTER_API_KEY = (Deno.env.get('OPENROUTER_API_KEY') || '').trim()

// El modelo de todos los días. Se puede cambiar sin tocar el código poniendo
// el secreto OPENROUTER_MODEL en Supabase.
const MODELO_POR_DEFECTO = (Deno.env.get('OPENROUTER_MODEL') || 'google/gemini-2.5-flash-lite').trim()

// Los únicos que se pueden pedir desde la app (para comparar cuál lee mejor).
// Una lista cerrada para que nadie pueda mandar las fotos a un modelo caro o
// a uno que no se haya revisado.
const MODELOS_PERMITIDOS = new Set([
  MODELO_POR_DEFECTO,
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'qwen/qwen3-vl-8b-instruct',
  'qwen/qwen3-vl-32b-instruct',
  'google/gemma-3-27b-it',
  'mistralai/mistral-small-3.2-24b-instruct',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-4.1-mini',
])

// Una foto de móvil reducida a 1600 px en JPEG ronda 300-500 KB. Más de 6 MB
// es que algo ha ido mal en la app (o alguien está mandando otra cosa).
const TAMANO_MAXIMO_IMAGEN = 6 * 1024 * 1024

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // x-client-info y apikey las añade supabase.functions.invoke() por su cuenta:
  // sin ellas el navegador corta la petición en el preflight.
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function llamadaDeAdmin(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return false
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
  return perfil?.role === 'admin'
}

const INSTRUCCIONES = `Eres el administrativo de una empresa de transporte de Córdoba (España).
Te llega la foto de un albarán o etiqueta de una agencia de transporte (TSB, TXT, Seur, etc.) con un envío que tenemos que repartir.
La foto puede estar girada, torcida o con sombras.

Devuelve SOLO un objeto JSON, sin texto alrededor, con estas claves:
{
  "giro": grados (0, 90, 180 o 270) que hay que girar la foto en el sentido de las agujas del reloj para leerla derecha,
  "expedicion": número de expedición o referencia de la agencia ("Nº Exped.", "Expedición"), como texto,
  "remitente": nombre de quien envía la mercancía (casilla "Remitente"),
  "destinatario": nombre de quien recibe (casilla "Destinatario" o "Consignatario"),
  "direccion": calle y número del destinatario,
  "poblacion": población del destinatario, sin el código postal,
  "cp": código postal del destinatario (5 cifras),
  "telefono": teléfono del destinatario, sólo cifras, "" si no aparece,
  "bultos": número de bultos (entero) o null,
  "kilos": peso en kilos (número) o null,
  "porte": "Pagado" si el porte es pagado/pagados, "Debido" si es debido/debidos, "" si no se ve,
  "reembolso": importe a cobrar contra reembolso en euros (número), 0 si no hay,
  "devolverFirmado": true si la agencia pide que le devolvamos el albarán o la documentación firmada por el destinatario, false si no
}

Cuándo "devolverFirmado" es true:
- En TXT aparece "DAC" (Devolución de Albarán/Documentación firmada), normalmente junto al servicio.
- En XPO aparece "devolver albarán firmado".
- Cualquier otra agencia que diga lo mismo con otras palabras ("retorno de albarán firmado", "devolver documentación firmada", "albarán conformado").
- La casilla "Recibí (Sello, Firma y D.N.I.)" la llevan TODOS los albaranes para que firme quien recibe: eso sola NO es devolver firmado.

Cuidado:
- La cabecera con el logo, la dirección, el teléfono, el NIF y el correo de la DELEGACIÓN de la agencia NO son del remitente ni del destinatario: ignóralos.
- "Origen", "Destino" y "Zona" son las delegaciones de la agencia (p. ej. "014-CORDOBA"), no la población del destinatario.
- Una casilla de reembolso vacía o a cero es 0.
- Si un dato no se lee con seguridad, déjalo vacío ("" o null). No te lo inventes.
- Copia los nombres y direcciones tal cual, con sus tildes y eñes.`

/** Saca el primer objeto JSON de la respuesta, aunque venga envuelto en ```json … ```. */
function extraerJson(texto: string): Record<string, unknown> | null {
  const limpio = String(texto || '').replace(/```(?:json)?/gi, '')
  const inicio = limpio.indexOf('{')
  const fin = limpio.lastIndexOf('}')
  if (inicio < 0 || fin <= inicio) return null
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1))
  } catch {
    return null
  }
}

async function leer(imagen: string, modelo: string): Promise<Response> {
  const respuesta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sumtrans-logistica.vercel.app',
      'X-Title': 'Sumtrans - lectura de albaranes',
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      // Los albaranes llevan nombres, direcciones y teléfonos de clientes: sólo
      // proveedores que no guardan ni entrenan con lo que se les manda.
      provider: { data_collection: 'deny' },
      // Que la respuesta traiga lo que ha costado, para el panel de consumo.
      usage: { include: true },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: INSTRUCCIONES },
          { type: 'image_url', image_url: { url: imagen } },
        ],
      }],
    }),
  })

  const cuerpo = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    const motivo = cuerpo?.error?.message || `OpenRouter respondió ${respuesta.status}`
    // 402 = sin saldo. Se dice tal cual para que la oficina sepa qué hacer.
    const sinSaldo = respuesta.status === 402
    return json({ error: sinSaldo ? 'Se ha acabado el saldo de OpenRouter. Hay que recargar en openrouter.ai/settings/credits.' : motivo, sinSaldo }, 502)
  }

  const contenido = cuerpo?.choices?.[0]?.message?.content || ''
  const campos = extraerJson(contenido)
  if (!campos) return json({ error: 'La IA no devolvió datos legibles', respuesta: String(contenido).slice(0, 500) }, 502)

  return json({
    campos,
    modelo: cuerpo?.model || modelo,
    coste: typeof cuerpo?.usage?.cost === 'number' ? cuerpo.usage.cost : null,
  })
}

async function saldo(): Promise<Response> {
  const cabeceras = { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` }
  const [creditos, clave] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/credits', { headers: cabeceras }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch('https://openrouter.ai/api/v1/key', { headers: cabeceras }).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!creditos && !clave) return json({ error: 'No se pudo consultar el saldo de OpenRouter' }, 502)
  const total = creditos?.data?.total_credits ?? null
  const gastado = creditos?.data?.total_usage ?? null
  return json({
    // En dólares, que es como cuenta OpenRouter.
    cargado: total,
    gastadoTotal: gastado,
    queda: total !== null && gastado !== null ? Math.max(0, total - gastado) : null,
    gastadoMes: clave?.data?.usage_monthly ?? null,
    gastadoHoy: clave?.data?.usage_daily ?? null,
    limiteClave: clave?.data?.limit ?? null,
  })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405)

  if (!OPENROUTER_API_KEY) return json({ error: 'Falta el secreto OPENROUTER_API_KEY en Supabase' }, 500)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  if (!(await llamadaDeAdmin(req, supabase))) return json({ error: 'Sólo la oficina puede leer albaranes' }, 403)

  let cuerpo: { accion?: string; imagen?: string; modelo?: string }
  try {
    cuerpo = await req.json()
  } catch {
    return json({ error: 'Petición mal formada' }, 400)
  }

  try {
    if (cuerpo.accion === 'saldo') return await saldo()

    if (cuerpo.accion === 'leer') {
      const imagen = String(cuerpo.imagen || '')
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(imagen)) return json({ error: 'Falta la imagen del albarán' }, 400)
      if (imagen.length > TAMANO_MAXIMO_IMAGEN) return json({ error: 'La imagen es demasiado grande' }, 413)
      const modelo = cuerpo.modelo ? String(cuerpo.modelo) : MODELO_POR_DEFECTO
      if (!MODELOS_PERMITIDOS.has(modelo)) return json({ error: `Modelo no permitido: ${modelo}` }, 400)
      return await leer(imagen, modelo)
    }

    return json({ error: 'Acción desconocida' }, 400)
  } catch (err) {
    console.error('leer-albaran', err)
    return json({ error: err instanceof Error ? err.message : 'Error inesperado' }, 500)
  }
})
