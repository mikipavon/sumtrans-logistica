import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mottccbalzdzrgqzfkdl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY');

async function run() {
    console.log("Fetching sedes...");
    const { data: cData } = await supabase.from('clients').select('data').eq('data->>name', 'sedes');
    if (cData && cData.length > 0) {
        console.log("Branches for sedes:", JSON.stringify(cData[0].data.branches, null, 2));
    }
}
run();
