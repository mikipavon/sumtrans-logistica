import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function main() {
  // Get all clients
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, data');

  if (error) { console.error('Error:', error); return; }

  // Find XPO
  const xpoClients = data.filter(c => 
    (c.name || '').toUpperCase().includes('XPO') || 
    (c.data?.name || '').toUpperCase().includes('XPO')
  );

  if (xpoClients.length > 0) {
    for (const client of xpoClients) {
      const d = client.data || {};
      console.log(`\n=== ${d.name || client.name} (ID: ${client.id}) ===`);
      console.log(`Tariff Type: ${d.tariffType}`);
      if (d.weightTariff && d.weightTariff.length > 0) {
        const sorted = [...d.weightTariff].sort((a, b) => a.maxKg - b.maxKg);
        console.log(`Weight Tariff (${sorted.length} tramos):`);
        sorted.forEach(b => console.log(`  Hasta ${b.maxKg} kg => ${b.price} €`));
      } else {
        console.log('No weight tariff data');
      }
    }
  } else {
    console.log('No XPO client found.');
  }

  // Also show all clients with Por Kilos
  console.log('\n\n=== ALL CLIENTS WITH "Por Kilos" ===');
  const kilosClients = data.filter(c => (c.data?.tariffType) === 'Por Kilos');
  for (const client of kilosClients) {
    const d = client.data || {};
    console.log(`\n--- ${d.name || client.name} ---`);
    if (d.weightTariff && d.weightTariff.length > 0) {
      const sorted = [...d.weightTariff].sort((a, b) => a.maxKg - b.maxKg);
      console.log(`  ${sorted.length} tramos:`);
      sorted.forEach(b => console.log(`    Hasta ${b.maxKg} kg => ${b.price} €`));
    }
  }
}

main();
