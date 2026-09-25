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
//      En este modo, si la ficha ya tiene cuenta y lo que cambia es el email
//      (un cliente al que se le pone correo de acceso propio), se MUEVE la
//      cuenta existente en vez de crear otra: ver buscarPorVinculo().
//      Con `acceso_adicional: true` es al revés: se crea una cuenta MÁS para la
//      misma ficha (el dueño de la empresa además del que hace los albaranes),
//      y con `accion: 'revocar_acceso_adicional'` se le quita el acceso.
//      Con `accion: 'mover_acceso'` se lleva la cuenta que nació de un registro
//      web a la ficha que ese cliente ya tenía en cartera, para no acabar con
//      dos fichas de la misma empresa y el portal atado a la vacía.
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

// ── Las cabeceras que el navegador va a pedir permiso para mandar ──
//
// `x-client-info` y `apikey` NO son opcionales: supabase-js las añade él solo a
// toda llamada hecha con `supabase.functions.invoke()`. Si no están en esta
// lista, el navegador ni siquiera llega a enviar la petición —la corta en el
// preflight— y lo que le llega a la aplicación es un "Failed to send a request
// to the Edge Function" que parece un problema de red y no lo es.
//
// Esta función se llama SIEMPRE con invoke(), y es la que crea las cuentas de
// acceso de clientes y conductores. Con la lista corta, ninguna se llegaba a
// crear: la ficha se guardaba, el aviso hablaba de un fallo de envío, y la
// persona se quedaba sin poder entrar sin que nada dijera por qué.
// (confirmar-acceso se salvaba de milagro porque se llama con un fetch a pelo
// que sólo manda estas dos de siempre.)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
}

const ROLES_VALIDOS = ['admin', 'driver', 'client']

// Marca en user_metadata que distingue las cuentas adicionales de un cliente
// (el dueño de la empresa, el que hace los albaranes…) de la cuenta principal
// de su ficha. Todas comparten linked_id, así que sin esta marca no hay forma
// de saber cuál es cuál, y buscarPorVinculo() acabaría moviéndole el correo a
// la cuenta equivocada.
const MARCA_ADICIONAL = 'si'

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
  return (await porQueNoEsAdmin(req, supabase)) === null
}

// ── Y si no lo es, por qué ──
// "No autorizado" a secas lo mismo quería decir que no había sesión, que la
// función no podía leer el perfil (su clave de servicio rechazada) o que el
// perfil no era de admin. Los tres se arreglan en sitios distintos, así que el
// motivo va en la respuesta y en el log. Devuelve null si es admin.
async function porQueNoEsAdmin(req: Request, supabase: ReturnType<typeof createClient>): Promise<string | null> {
  if (!SUPABASE_SERVICE_ROLE_KEY) return 'la función no tiene la clave de servicio configurada'

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return 'la petición llega sin sesión'

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) {
    return `el servidor no reconoce la sesión (${error?.message || 'sin usuario'})`
  }

  const { data: perfil, error: perfilError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()

  if (perfilError) return `la función no ha podido leer tu perfil (${perfilError.message})`
  if (perfil?.role !== 'admin') return `tu perfil no es de administrador (rol: ${perfil?.role || 'ninguno'})`
  return null
}

function noAutorizado(motivo: string, que: string): Response {
  console.warn(`[create-auth-user] ${que} denegado: ${motivo}`)
  return json({ error: `No autorizado: ${motivo}` }, 401)
}

// ── Buscar la cuenta que ya está vinculada a esta ficha ──
// Se busca por el vínculo, NO por el email, porque sirve justo para el caso en
// que el email ha cambiado: un cliente al que se le pone un correo de acceso
// distinto del que tenía. Si esto no existiera, createUser vería un email nuevo,
// crearía una SEGUNDA cuenta y la vieja seguiría viva con su contraseña vieja:
// dos llaves de la misma casa y ninguna forma clara de quitar el acceso.
async function buscarPorVinculo(
  supabase: ReturnType<typeof createClient>,
  role: string,
  linkedId: string,
): Promise<{ id: string; email?: string } | null> {
  if (!linkedId) return null

  for (let page = 1; page <= 50; page++) {
    const { data: listado, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !listado?.users?.length) return null

    const encontrada = listado.users.find((u: { user_metadata?: Record<string, unknown> }) =>
      String(u.user_metadata?.linked_id || '') === String(linkedId)
      && String(u.user_metadata?.role || '') === role
      // Las cuentas adicionales comparten el vínculo con la principal, pero no
      // son ella: si se colara una aquí, cambiar el correo de acceso de la ficha
      // le cambiaría el correo al dueño de la empresa en vez de al principal, y
      // el dueño se quedaría fuera sin que nadie hubiera tocado su cuenta.
      && String(u.user_metadata?.acceso_adicional || '') !== MARCA_ADICIONAL
    )
    if (encontrada) return encontrada as { id: string; email?: string }

    if (listado.users.length < 1000) return null
  }
  return null
}

// ── Buscar una cuenta por su email ──
// Paginando, que es como hay que recorrer listUsers(). Estaba escrito dos veces
// dentro de crearOActualizar(); ahora lo necesitan también el alta y la baja de
// los accesos adicionales.
async function buscarPorEmail(
  supabase: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email?: string; user_metadata?: Record<string, unknown> } | null> {
  for (let page = 1; page <= 50; page++) {
    const { data: listado, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !listado?.users?.length) return null

    const encontrada = listado.users.find((u: { email?: string }) => u.email === email)
    if (encontrada) return encontrada as { id: string; email?: string; user_metadata?: Record<string, unknown> }

    if (listado.users.length < 1000) return null
  }
  return null
}

// ── ¿A quién le abre el portal esta cuenta que ya existe? ──
//
// Sirve para decidir si una cuenta que ya está en Auth se puede reutilizar para
// la ficha a la que se le está dando acceso. Se mira `profiles`, que es lo que
// leen las políticas RLS (supabase/13_rls_perfiles_sin_metadatos.sql), y los
// metadatos sólo si el perfil no existe.
//
// Devuelve null cuando NO hay nadie a quien quitarle nada: la cuenta ya es de
// esta misma ficha, o apunta a una que ya no existe (una solicitud web que se
// borró, una ficha duplicada que se fusionó con otra). Y devuelve el nombre de
// quien la usa cuando apunta a otra ficha o a un conductor que siguen vivos.
//
// Pasó con PECOMARK el 15/09/2026: su correo ya tenía cuenta de antes, apuntando
// a una ficha que ya no estaba. "Dar acceso" desde su ficha de verdad sólo le
// cambió la contraseña y los metadatos —el trigger escribe `profiles` al CREAR—,
// así que entraba bien y RLS no le dejaba ver ninguna ficha: "No encontramos tu
// ficha", con teléfono de la oficina.
async function aQuienLeAbreElPortal(
  supabase: ReturnType<typeof createClient>,
  cuenta: { id: string; user_metadata?: Record<string, unknown> },
  rolDestino: string,
  vinculoDestino: string,
): Promise<string | null> {
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, linked_id')
    .eq('id', cuenta.id)
    .maybeSingle()

  const rolActual = String(perfil?.role ?? cuenta.user_metadata?.role ?? '')
  const vinculoActual = String(perfil?.linked_id ?? cuenta.user_metadata?.linked_id ?? '')

  if (!vinculoActual) return null
  if (rolActual === rolDestino && vinculoActual === vinculoDestino) return null

  // Un vínculo que no es un número no puede ser el id de ninguna ficha: las dos
  // tablas llevan id numérico, y preguntarles por un texto tumba la consulta.
  if (!/^\d+$/.test(vinculoActual)) return null

  if (rolActual === 'driver') {
    const { data: conductor, error } = await supabase
      .from('drivers')
      .select('id, data')
      .eq('id', vinculoActual)
      .maybeSingle()
    if (error) return `un conductor que no se ha podido comprobar (${error.message})`
    if (!conductor) return null
    const nombre = String((conductor.data as Record<string, unknown> | null)?.name || '')
    return `el conductor ${nombre || `nº ${vinculoActual}`}`
  }

  // Cualquier otro rol se trata como cliente: las cuentas antiguas pueden venir
  // sin rol en los metadatos y sin perfil, y siempre han sido de clientes.
  const { data: ficha, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', vinculoActual)
    .maybeSingle()
  if (error) return `un cliente que no se ha podido comprobar (${error.message})`
  if (!ficha) return null
  return `el cliente ${String(ficha.name || '') || `nº ${vinculoActual}`}`
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
  const existente = await buscarPorEmail(supabase, email)

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

  // ⚠️ Lo que decide qué ve al entrar es profiles.linked_id, y el trigger
  // handle_new_user() sólo lo escribe al CREAR la cuenta. Actualizando sólo
  // los metadatos, una cuenta que ya existía seguía abriendo la ficha de
  // antes —o ninguna, si esa ficha ya no estaba— aunque la oficina acabara de
  // darle acceso a otra. Quien llega aquí ya ha comprobado que la cuenta se
  // puede reutilizar (ver aQuienLeAbreElPortal), así que se apunta a la ficha
  // buena, igual que hace mover_acceso.
  const { error: perfilError } = await supabase
    .from('profiles')
    .upsert({
      id: existente.id,
      role: metadata.role,
      linked_id: metadata.linked_id,
      display_name: metadata.display_name,
    }, { onConflict: 'id' })

  if (perfilError) {
    return json({
      error: `La contraseña se ha actualizado pero la cuenta no se ha podido apuntar a la ficha: ${perfilError.message}`,
    }, 500)
  }

  console.log(`[create-auth-user] Contraseña actualizada para ${email} (${metadata.role}) → ${metadata.linked_id}`)
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
    const { email, password, role, linked_id, display_name, legacy_username, acceso_adicional, accion, desde_linked_id } = body

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── QUITARLE EL ACCESO A UNA PERSONA DE LA EMPRESA ──
    // Va antes de exigir contraseña: para borrar una cuenta no hay ninguna que
    // poner. Sólo un admin, y sólo cuentas adicionales de ESE cliente: la
    // principal se cambia por la ficha, y una cuenta de otro no se toca ni por
    // equivocación ni mandando su correo a mano.
    if (accion === 'revocar_acceso_adicional') {
      const motivo = await porQueNoEsAdmin(req, supabase)
      if (motivo) return noAutorizado(motivo, 'Revocación')

      const emailARevocar = String(email || '').trim().toLowerCase()
      const vinculo = String(linked_id || '')
      if (!emailARevocar || !vinculo) {
        return json({ error: 'Faltan el email y el cliente' }, 400)
      }

      const cuenta = await buscarPorEmail(supabase, emailARevocar)
      // Que no exista es el final feliz: el acceso ya no está.
      if (!cuenta) {
        return json({ ok: true, action: 'no_existia' })
      }

      const esAdicionalDeEsteCliente =
        String(cuenta.user_metadata?.acceso_adicional || '') === MARCA_ADICIONAL
        && String(cuenta.user_metadata?.linked_id || '') === vinculo

      if (!esAdicionalDeEsteCliente) {
        console.warn(`[create-auth-user] ${emailARevocar} no es un acceso adicional de ${vinculo} — no se borra`)
        return json({ error: 'Esa cuenta no es un acceso adicional de este cliente' }, 409)
      }

      const { error: borradoError } = await supabase.auth.admin.deleteUser(cuenta.id)
      if (borradoError) {
        return json({ error: borradoError.message }, 500)
      }

      console.log(`[create-auth-user] Acceso adicional revocado: ${emailARevocar} (cliente ${vinculo})`)
      return json({ ok: true, action: 'revoked' })
    }

    // ── EL CLIENTE DE SIEMPRE QUE SÓLO QUERÍA ENTRAR EN EL PORTAL ──
    // El formulario de la web no puede tocar fichas (registro-cliente es
    // público), así que el cliente que ya estaba en cartera entra como una ficha
    // nueva y su cuenta de Auth nace apuntando a ESA, que está vacía. Aquí se
    // mueve la cuenta a la ficha de verdad para poder borrar la solicitud sin
    // dejarle el portal a cero. Ver src/utils/accesoFichaExistente.js.
    //
    // Va antes de exigir contraseña: la cuenta ya existe con la que eligió el
    // cliente al registrarse, y aquí no se cambia ninguna. Sólo hace falta una
    // si no hay cuenta que mover y hay que crearla.
    if (accion === 'mover_acceso') {
      const motivo = await porQueNoEsAdmin(req, supabase)
      if (motivo) return noAutorizado(motivo, 'Movimiento de acceso')

      const correo = String(email || '').trim().toLowerCase()
      const destino = String(linked_id || '')
      const origen = String(desde_linked_id || '')

      if (!correo || !destino) {
        return json({ error: 'Faltan el correo y la ficha a la que darle el acceso' }, 400)
      }

      const metadata: Record<string, string> = {
        role: 'client',
        linked_id: destino,
        display_name: display_name || correo,
        // Siempre escrita, también cuando NO es adicional: updateUserById
        // fusiona los metadatos en vez de reemplazarlos, así que una marca
        // vieja sobreviviría a la mudanza y buscarPorVinculo() dejaría de ver
        // esta cuenta como la principal de su ficha.
        acceso_adicional: acceso_adicional === true ? MARCA_ADICIONAL : '',
      }

      const cuenta = await buscarPorEmail(supabase, correo)

      // Sin cuenta que mover (registros anteriores a Auth, o el createUser del
      // registro falló): se crea, y el trigger handle_new_user() ya escribe el
      // perfil con el vínculo bueno.
      if (!cuenta) {
        if (!password || password.length < 6) {
          return json({
            error: 'Ese correo no tiene cuenta todavía y la solicitud no trae contraseña. Dale el acceso desde la ficha, escribiéndole una.',
          }, 400)
        }
        return await crearOActualizar(supabase, correo, password, metadata)
      }

      // La cuenta existe. Sólo se mueve la del registro web que se está
      // validando, o una que ya sea de esta misma ficha. La de un conductor —o
      // la de otro cliente— no se toca ni mandando su correo a mano: moverla
      // sería quitarle el acceso a uno para dárselo a otro.
      const vinculoActual = String(cuenta.user_metadata?.linked_id || '')
      const rolActual = String(cuenta.user_metadata?.role || '')
      const yaEsDeEstaFicha = vinculoActual === destino && (rolActual === 'client' || rolActual === '')
      const esLaDeLaSolicitud = Boolean(origen) && vinculoActual === origen && (rolActual === 'client' || rolActual === '')

      if (!yaEsDeEstaFicha && !esLaDeLaSolicitud) {
        console.warn(`[create-auth-user] ${correo} no es la cuenta del registro ${origen || '(sin origen)'} — no se mueve a ${destino}`)
        return json({
          error: 'Ese correo ya tiene cuenta en la aplicación y no es la del registro web. Compruébalo antes de darle acceso.',
        }, 409)
      }

      // La contraseña no se toca: es la que el cliente eligió al registrarse y
      // es la que espera escribir. Aquí sólo se confirma la cuenta —el registro
      // la dejó sin confirmar a propósito— y se le cambia a qué ficha mira.
      const { error: moverError } = await supabase.auth.admin.updateUserById(cuenta.id, {
        email_confirm: true,
        user_metadata: metadata,
      })

      if (moverError) {
        return json({ error: moverError.message }, 500)
      }

      // ⚠️ Lo que decide de verdad qué ve el cliente es profiles.linked_id: las
      // políticas RLS leen esa tabla, no los metadatos (ver
      // supabase/13_rls_perfiles_sin_metadatos.sql), y el trigger sólo la
      // escribe al CREAR la cuenta. Sin este upsert el cliente entraría mirando
      // la solicitud —que se acaba de borrar— y vería el portal a cero.
      const { error: perfilError } = await supabase
        .from('profiles')
        .upsert({
          id: cuenta.id,
          role: 'client',
          linked_id: destino,
          display_name: metadata.display_name,
        }, { onConflict: 'id' })

      if (perfilError) {
        return json({
          error: `La cuenta se ha confirmado pero no se ha podido apuntar a la ficha: ${perfilError.message}`,
        }, 500)
      }

      console.log(`[create-auth-user] Acceso movido: ${correo} → cliente ${destino}${acceso_adicional === true ? ' (adicional)' : ''}`)
      return json({ ok: true, action: 'moved', userId: cuenta.id })
    }

    if (!password) {
      return json({ error: 'Falta la contraseña' }, 400)
    }

    // Mínimo 6: es el que exige Supabase Auth por defecto. Aceptar menos aquí
    // sólo consigue que createUser falle más abajo con un error menos claro.
    if (password.length < 6) {
      return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)
    }

    // ── MODO A: administrador autenticado ──
    if (await llamadaDeAdmin(req, supabase)) {
      if (!email) {
        return json({ error: 'Falta el email' }, 400)
      }
      const rol = ROLES_VALIDOS.includes(role) ? role : 'driver'
      const emailNormalizado = String(email).trim().toLowerCase()

      // ── OTRA PERSONA DE LA MISMA EMPRESA ──
      // El dueño y quien hace los albaranes entran cada uno con su correo y ven
      // la misma ficha, porque el portal reconoce al cliente por linked_id, no
      // por el correo. Aquí NO se pasa por buscarPorVinculo: eso es para mover
      // el correo de la cuenta principal, y aplicado a un correo adicional le
      // quitaría el suyo al que ya entraba. Aquí siempre es una cuenta más.
      if (acceso_adicional === true) {
        const vinculo = String(linked_id || '')
        if (!vinculo) {
          return json({ error: 'Falta el cliente al que dar acceso' }, 400)
        }

        // Si el correo ya tiene cuenta en la aplicación y no es de este cliente,
        // no se toca: actualizarla le cambiaría la contraseña a un conductor —o
        // a otro cliente— y aun así seguiría entrando en SU portal, porque el
        // vínculo de verdad está en `profiles` y el trigger sólo lo escribe al
        // crear la cuenta. Sería quitarle el acceso a uno sin dárselo al otro.
        const yaEnLaCasa = await buscarPorEmail(supabase, emailNormalizado)
        const esDeEsteCliente =
          String(yaEnLaCasa?.user_metadata?.linked_id || '') === vinculo
          && String(yaEnLaCasa?.user_metadata?.role || '') === 'client'

        if (yaEnLaCasa && !esDeEsteCliente) {
          console.warn(`[create-auth-user] ${emailNormalizado} ya tiene cuenta de otro — no se le da acceso a ${vinculo}`)
          return json({
            error: 'Ese correo ya tiene cuenta en la aplicación y no es de este cliente. Usa otro correo.',
          }, 409)
        }

        return await crearOActualizar(supabase, emailNormalizado, password, {
          role: 'client',
          linked_id: vinculo,
          display_name: display_name || emailNormalizado,
          acceso_adicional: MARCA_ADICIONAL,
        })
      }

      const metadata = {
        role: rol,
        linked_id: String(linked_id || ''),
        display_name: display_name || emailNormalizado,
        // Siempre escrita, como en mover_acceso: updateUserById fusiona los
        // metadatos, y un correo que era adicional y pasa a principal seguiría
        // marcado. Con la marca vieja, buscarPorVinculo() no lo ve como principal
        // y la revocación de adicionales se lo puede llevar por delante.
        acceso_adicional: '',
      }

      // ¿Esta ficha ya tenía cuenta con OTRO email? Entonces no se crea nada
      // nuevo: se le cambia el correo a la que ya existe, para que conserve su
      // id (y con él la fila de `profiles`, que es de donde RLS saca el vínculo).
      const yaVinculada = await buscarPorVinculo(supabase, rol, metadata.linked_id)
      if (yaVinculada && String(yaVinculada.email || '').toLowerCase() !== emailNormalizado) {
        const { error: cambioError } = await supabase.auth.admin.updateUserById(yaVinculada.id, {
          email: emailNormalizado,
          password,
          email_confirm: true,
          user_metadata: metadata,
        })
        if (cambioError) {
          console.warn(`[create-auth-user] No se pudo mover ${yaVinculada.email} → ${emailNormalizado}: ${cambioError.message}`)
          return json({ error: `No se pudo cambiar el correo de acceso: ${cambioError.message}` }, 500)
        }
        console.log(`[create-auth-user] Correo de acceso movido ${yaVinculada.email} → ${emailNormalizado} (${rol})`)
        return json({ ok: true, action: 'email_changed', userId: yaVinculada.id })
      }

      // ── ¿Ese correo ya entra con otra cuenta? ──
      // crearOActualizar() reutiliza la cuenta si el correo ya existe, y ahora
      // además la apunta a esta ficha. Eso sólo se puede hacer si no se le
      // quita el portal a nadie: si la cuenta sigue abriendo la ficha de otro
      // cliente, o la app de un conductor, se para aquí y se dice de quién es.
      const yaConCuenta = await buscarPorEmail(supabase, emailNormalizado)
      if (yaConCuenta) {
        const dueno = await aQuienLeAbreElPortal(supabase, yaConCuenta, rol, metadata.linked_id)
        if (dueno) {
          console.warn(`[create-auth-user] ${emailNormalizado} ya es la cuenta de ${dueno} — no se le da acceso a ${rol} ${metadata.linked_id}`)
          return json({
            error: `Ese correo ya entra en la aplicación como ${dueno}. Quítale el acceso ahí (o fusiona las fichas) antes de dárselo aquí, o usa otro correo.`,
          }, 409)
        }
      }

      return await crearOActualizar(supabase, emailNormalizado, password, metadata)
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
