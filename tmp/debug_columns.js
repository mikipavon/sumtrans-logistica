import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
)

async function checkSchema() {
  const { data, error } = await supabase.from('shipments').select('*').limit(1)
  if (error) {
    console.error('Error fetching shipment:', error)
    return
  }
  if (data && data.length > 0) {
    console.log('--- Columnas detectadas en la tabla shipments ---')
    console.log(Object.keys(data[0]))
    console.log('--- Contenido de la columna data ---')
    console.log(JSON.stringify(data[0].data, null, 2))
  } else {
    console.log('No hay envíos en la tabla para analizar.')
  }
}

checkSchema()
