import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mottccbalzdzrgqzfkdl.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY');

async function run() {
    console.log("Fetching SUM-15...");
    const { data: sData } = await supabase.from('shipments').select('data').eq('id', 'SUM-15').single();
    if (sData) {
        console.log("SUM-15 billingType:", sData.data.billingType);
        console.log("SUM-15 destinationName:", sData.data.destinationName);
        console.log("SUM-15 destinationBillingType:", sData.data.destinationBillingType);
    } else {
        console.log("SUM-15 not found!");
    }

    console.log("Fetching sedes...");
    const { data: cData } = await supabase.from('clients').select('data');
    if (cData) {
        const sedes = cData.map(c => c.data).filter(c => c.name.toLowerCase().includes('sede') || c.name.toLowerCase().includes('baena'));
        console.log("Clients matching sede/baena:", JSON.stringify(sedes.map(c => ({id: c.id, name: c.name, type: c.type, status: c.status, billingType: c.billingType})), null, 2));
    }
}
run();
