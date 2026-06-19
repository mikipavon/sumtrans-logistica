const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://mottccbalzdzrgqzfkdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY'
);

const tables = [
  'articles', 'clients', 'coverage_zones', 'driver_absences',
  'drivers', 'fuel_logs', 'settings', 'shipments',
  'tariffs', 'time_logs', 'vehicles'
];

async function checkTables() {
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('id').limit(1);
    const exists = !error || !error.message.includes('does not exist');
    console.log(`  ${exists ? '✅' : '❌'}  ${t}${error ? ' → ' + error.message : ` → ${data?.length || 0} rows`}`);
  }
}

checkTables();
