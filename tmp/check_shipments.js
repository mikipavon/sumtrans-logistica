import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkShipments() {
  try {
    const { data: shipments, error } = await supabase.from('shipments').select('*').limit(3)
    if (error) throw error
    
    console.log('--- MUESTRA DE ENVIOS EN CLOUD ---')
    shipments.forEach(s => {
      console.log(`- ID: ${s.id}, Cliente: ${s.client}, Status: ${s.status}, Fecha: ${s.date}`)
    })
    console.log('-----------------------------------')
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkShipments()
