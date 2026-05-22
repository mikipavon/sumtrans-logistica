const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58';

async function checkDrivers() {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: drivers, error } = await supabase.from('drivers').select('*');
    if (error) {
        console.error(error);
        return;
    }
    console.log("DRIVERS STATUS:");
    drivers.forEach(d => {
        console.log(`- ID: ${d.id} Name: ${d.data?.name || d.username} | Lat: ${d.data?.currentLat} | Lng: ${d.data?.currentLng} | Last: ${d.data?.lastGpsUpdate} | Trigger: ${d.data?.locationRequestTrigger}`);
    });
}

checkDrivers();
