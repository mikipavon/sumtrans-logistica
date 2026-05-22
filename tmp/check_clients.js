import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkClients() {
  try {
    const { data: clients, error } = await supabase.from('clients').select('*')
    if (error) throw error
    
    console.log('--- LISTADO DE CLIENTES EN CLOUD ---')
    clients.forEach(c => {
      console.log(`- ID: ${c.id}, Nombre: ${c.name}, Username: ${c.data?.username || 'N/A'}, Status: ${c.data?.status || 'N/A'}`)
    })
    console.log('------------------------------------')
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkClients()
