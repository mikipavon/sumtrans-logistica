import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mottccbalzdzrgqzfkdl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY');

async function run() {
    const { data: sData } = await supabase.from('shipments').select('data').eq('id', 'SUM-15').single();
    if (sData) {
        console.log("SUM-15 full data:", JSON.stringify(sData.data, null, 2));
    }
}
run();
