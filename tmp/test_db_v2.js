import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  console.log('Probando conexión con Supabase...')
  
  try {
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
