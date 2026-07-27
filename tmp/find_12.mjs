import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function find12() {
  const { data: shipments, error } = await supabase.from('shipments').select('id, data');
  if (error) { console.error('Error:', error.message); return; }
  
  if (!shipments) { console.log('No shipments'); return; }

  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 7);
  start.setHours(0,0,0,0);

  const filtered = shipments.filter(s => {
    const d = s.data || {};
    let dateObj;
    if (d.status === 'Entregado' && d.updatedAt) {
      dateObj = new Date(d.updatedAt);
    } else {
      dateObj = d.createdAt ? new Date(d.createdAt) : new Date();
    }
    return dateObj >= start && dateObj <= today;
  });

  console.log(`Total envíos últimos 7 días: ${filtered.length}`);
  filtered.forEach(s => {
    const d = s.data || {};
    const amt = parseFloat(d.amount) || 0;
    if (amt > 0) {
      console.log(`- Albarán ${s.id}: ${d.destinationName} -> ${amt}€`);
    }
  });
}

find12();
