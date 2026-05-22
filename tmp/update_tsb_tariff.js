import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

const TSB_TARIFF = [
  { maxKg: 20, price: '4.36' },
  { maxKg: 40, price: '6.43' },
  { maxKg: 60, price: '8.12' },
  { maxKg: 80, price: '9.76' },
  { maxKg: 100, price: '11.33' },
  { maxKg: 150, price: '15.83' },
  { maxKg: 200, price: '17.89' },
  { maxKg: 250, price: '21.54' },
  { maxKg: 300, price: '24.47' },
  { maxKg: 350, price: '27.01' },
  { maxKg: 400, price: '29.44' },
  { maxKg: 450, price: '31.62' },
  { maxKg: 500, price: '33.31' },
  { maxKg: 600, price: '40.54' },
  { maxKg: 700, price: '45.76' }
];

async function main() {
  // Search for TSB or NUTRACOR
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, data');

  if (error) { console.error('Error:', error); return; }

  // Find TSB NUTRACOR or similar
  const matches = clients.filter(c => {
    const name = (c.data?.name || c.name || '').toUpperCase();
    return name.includes('TSB') || name.includes('NUTRACOR');
  });

  if (matches.length === 0) {
    console.log('No TSB/NUTRACOR client found.');
    return;
  }

  for (const client of matches) {
    const name = client.data?.name || client.name;
    console.log(`Found: "${name}" (ID: ${client.id})`);
  }

  // Update each match
  for (const client of matches) {
    const name = client.data?.name || client.name;
    const updatedData = { ...client.data, weightTariff: TSB_TARIFF, tariffType: 'Por Kilos' };
    const { error: updateErr } = await supabase
      .from('clients')
      .update({ data: updatedData })
      .eq('id', client.id);

    if (updateErr) {
      console.error(`Error updating "${name}":`, updateErr);
    } else {
      console.log(`✅ "${name}" actualizado con ${TSB_TARIFF.length} tramos.`);
    }
  }

  console.log('\nPrecios aplicados:');
  TSB_TARIFF.forEach(b => console.log(`  Hasta ${b.maxKg} kg => ${b.price} €`));
}

main();
