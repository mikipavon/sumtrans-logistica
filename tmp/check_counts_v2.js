import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCounts() {
  try {
    const [{ count: sCount }, { count: cCount }, { count: dCount }] = await Promise.all([
      supabase.from('shipments').select('*', { count: 'exact', head: true }),
      supabase.from('clients').select('*', { count: 'exact', head: true }),
      supabase.from('drivers').select('*', { count: 'exact', head: true })
    ])
    
    console.log(`DB_SUMMARY: Shipments=${sCount}, Clients=${cCount}, Drivers=${dCount}`)
  } catch (error) {
    console.error('Error:', error.message)
  }
}

checkCounts()
