import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

async function check() {
  // Simple count test
  const { count, error: countErr } = await supabase
    .from('shipments')
    .select('*', { count: 'exact', head: true });
  
  console.log('Total count:', count, 'Error:', countErr?.message);
  
  // Try getting just 1 shipment
  const { data, error } = await supabase
    .from('shipments')
    .select('id')
    .limit(3);
  
  console.log('Sample:', data, 'Error:', error?.message);
}

check().catch(console.error);
