import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

const TXT_TARIFF = [
  { maxKg: 20, price: '3.96' },
  { maxKg: 40, price: '5.84' },
  { maxKg: 60, price: '7.39' },
  { maxKg: 80, price: '8.87' },
  { maxKg: 100, price: '10.30' },
  { maxKg: 150, price: '14.39' },
  { maxKg: 200, price: '16.26' },
  { maxKg: 250, price: '19.58' },
  { maxKg: 300, price: '22.25' },
  { maxKg: 350, price: '24.04' },
  { maxKg: 400, price: '25.91' },
  { maxKg: 450, price: '27.83' },
  { maxKg: 500, price: '29.32' },
  { maxKg: 600, price: '35.67' },
  { maxKg: 700, price: '40.27' },
  { maxKg: 800, price: '48.15' },
  { maxKg: 900, price: '50.91' },
  { maxKg: 1000, price: '55.07' }
];

async function main() {
  // Find TXT client
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, data')
    .ilike('name', '%TXT%');

  if (error) { console.error('Error:', error); return; }

  const txt = clients.find(c => (c.name || '').toUpperCase() === 'TXT' || (c.data?.name || '').toUpperCase() === 'TXT');
  if (!txt) {
    console.log('No TXT client found. Found:', clients.map(c => c.name));
    return;
  }

  console.log(`Found TXT: ID=${txt.id}, Name="${txt.data?.name || txt.name}"`);
  console.log('Current tariff:', JSON.stringify(txt.data?.weightTariff?.length || 0, null, 2), 'tramos');

  // Update
  const updatedData = { ...txt.data, weightTariff: TXT_TARIFF };
  const { error: updateErr } = await supabase
    .from('clients')
    .update({ data: updatedData })
    .eq('id', txt.id);

  if (updateErr) {
    console.error('Update error:', updateErr);
    return;
  }

  console.log('✅ TXT actualizado con 18 tramos de peso (precios nuevos).');
  TXT_TARIFF.forEach(b => console.log(`  Hasta ${b.maxKg} kg => ${b.price} €`));
}

main();
