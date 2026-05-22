require('dotenv').config();
const { createClient } = require('@supabase/supabase-client');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://vstqkqzkqzvqyqvqyqvq.supabase.co'; // I need to find the real URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

// I'll try to find the credentials from the codebase
const fs = require('fs');
const path = require('path');

async function checkDrivers() {
    try {
        const envPath = 'c:\\Users\\sumtr\\OneDrive - SUMTRANS LOGISTICA S.L. CIF B56131717\\SUM MIGUEL\\miguel\\miaplicacionlogistica\\.env';
        if (fs.existsSync(envPath)) {
            const env = fs.readFileSync(envPath, 'utf8');
            const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1];
            const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1];
            
            if (url && key) {
                const supabase = createClient(url, key);
                const { data, error } = await supabase.from('drivers').select('*');
                if (error) throw error;
                console.log("DRIVERS IN DB:");
                data.forEach(d => {
                    console.log(`- ${d.id}: ${d.username} | Lat: ${d.data?.currentLat} | Lng: ${d.data?.currentLng} | Last: ${d.data?.lastGpsUpdate} | Trigger: ${d.data?.locationRequestTrigger}`);
                });
            } else {
                console.log("No Supabase credentials found in .env");
            }
        } else {
            console.log(".env not found");
        }
    } catch (e) {
        console.error("Error checking drivers:", e);
    }
}

checkDrivers();
