import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan las variables de entorno de Supabase en .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  console.log('Probando conexión con Supabase...')
  
  try {
    // Probar lectura de transportistas (drivers)
    const { data: drivers, error: dError } = await supabase.from('drivers').select('*').limit(1)
    if (dError) throw dError
    console.log('✅ Lectura de tabla "drivers": OK (Encontrados: ' + (drivers?.length || 0) + ')')

    // Probar lectura de envíos (shipments)
    const { data: shipments, error: sError } = await supabase.from('shipments').select('*').limit(1)
    if (sError) throw sError
    console.log('✅ Lectura de tabla "shipments": OK (Encontrados: ' + (shipments?.length || 0) + ')')

    // Probar lectura de clientes (clients)
    const { data: clients, error: cError } = await supabase.from('clients').select('*').limit(1)
    if (cError) throw cError
    console.log('✅ Lectura de tabla "clients": OK (Encontrados: ' + (clients?.length || 0) + ')')

    console.log('\n🚀 La base de datos está respondiendo correctamente.')
  } catch (error) {
    console.error('❌ Error de conexión o permisos:', error.message)
  }
}

testConnection()
