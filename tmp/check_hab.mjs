import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function check() {
  const { data: drivers } = await supabase.from('drivers').select('id, data');
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  for (const d of (drivers || [])) {
    const name = d.data?.name || 'N/A';
    const collections = d.data?.[`collectedCollections_${todayStr}`] || [];
    if (collections.length === 0) continue;
    
    console.log(`\nDriver: ${name} (ID: ${d.id}) - ${collections.length} cobros hoy`);
    
    const hab4col = collections.filter(c => c.shipmentId === 'HAB-4');
    const hab37col = collections.filter(c => c.shipmentId === 'HAB-37');
    
    if (hab4col.length) console.log('  ⚠️ HAB-4 encontrado en collections:', JSON.stringify(hab4col, null, 2));
    if (hab37col.length) console.log('  ⚠️ HAB-37 encontrado en collections:', JSON.stringify(hab37col, null, 2));
    
    // Show all collections for this driver
    collections.forEach(c => {
      console.log(`  - ${c.type || '?'} | ${c.shipmentId || 'sin ID'} | ${c.client || '?'} | €${c.amount || '?'}`);
    });
  }
}

check().catch(console.error);
