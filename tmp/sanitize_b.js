import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58'
const supabase = createClient(supabaseUrl, supabaseKey)

async function sanitizeDatabase() {
  console.log('🕵️‍♂️ Iniciando Lavado de Cara de Base de Datos...');

  try {
    // 1. LIMPIAR CLIENTES
    console.log('⏱️ Transformando Clientes (Cobro Diario -> Clientes Habituales)...');
    const { data: q1, error: cmdErr1 } = await supabase
        .from('clients')
        .update({ billingType: 'Clientes Habituales' })
        .in('billingType', ['Cobro Diario', 'Libre Escritura'])
        .select('*');
    if (cmdErr1) throw cmdErr1;
    console.log(`✅ ${q1.length} Clientes lavados.`);

    // 2. LIMPIAR ENVIOS (Remitente y Destinatario)
    console.log('⏱️ Limpiando "billingType" de Remitentes en Envíos...');
    const { data: q2, error: cmdErr2 } = await supabase
        .from('shipments')
        .update({ billingType: 'Clientes Habituales' })
        .in('billingType', ['Cobro Diario', 'Libre Escritura'])
        .select('*');
    if (cmdErr2) throw cmdErr2;
    console.log(`✅ ${q2.length} Remitentes (Shipments) lavados.`);

    console.log('⏱️ Limpiando "destinationBillingType" en Envíos...');
    const { data: q3, error: cmdErr3 } = await supabase
        .from('shipments')
        .update({ destinationBillingType: 'Clientes Habituales' })
        .in('destinationBillingType', ['Cobro Diario', 'Libre Escritura'])
        .select('*');
    if (cmdErr3) throw cmdErr3;
    console.log(`✅ ${q3.length} Destinatarios (Shipments) lavados.`);

    // 3. ACTUALIZAR SETTINGS (si hubiera alguna configurada por defecto)
    console.log('\n🎉 ¡Base de Datos Saneada Correctamente! Ya nadie es "Diario".');
  } catch (error) {
    console.error('❌ Error limpiando DB:', error);
  }
}

sanitizeDatabase();
