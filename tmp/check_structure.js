import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkShipments() {
  try {
    const { data: shipments, error } = await supabase.from('shipments').select('*').limit(1)
    if (error) throw error
    
    if (shipments && shipments.length > 0) {
      console.log('--- REVISANDO ESTRUCTURA DE ENVÍO EN CLOUD ---')
      const first = shipments[0]
      console.log('Campos disponibles:', Object.keys(first).join(', '))
      console.log('--- CONTENIDO (RESUMEN) ---')
      console.log(JSON.stringify(first).substring(0, 150) + '...')
      console.log('----------------------------------------------')
    } else {
      console.log('No hay envíos en la base de datos.')
    }
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkShipments()
