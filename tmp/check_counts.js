import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCounts() {
  try {
    const { count: sCount, error: sError } = await supabase.from('shipments').select('*', { count: 'exact', head: true })
    const { count: cCount, error: cError } = await supabase.from('clients').select('*', { count: 'exact', head: true })
    const { count: dCount, error: dError } = await supabase.from('drivers').select('*', { count: 'exact', head: true })
    
    if (sError) throw sError
    if (cError) throw cError
    if (dError) throw dError

    console.log('--- ESTADO DE LA BASE DE DATOS (CLOUD) ---')
    console.log(`Envíos (shipments): ${sCount || 0}`)
    console.log(`Clientes (clients): ${cCount || 0}`)
    console.log(`Conductores (drivers): ${dCount || 0}`)
    console.log('------------------------------------------')
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkCounts()
