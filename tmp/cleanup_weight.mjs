import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const VITE_SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const VITE_SUPABASE_ANON_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

// IDs de clientes que NO deben tener tarifa por kilos (falsos positivos)
const REMOVE_IDS = [90, 207, 445, 476]; // EXPOFIC, EXPOMOTO, TSB CAFÉ, HERMOVINGBEMA

async function run() {
    for (const id of REMOVE_IDS) {
        const { data: client } = await supabase.from('clients').select('id, data').eq('id', id).single();
        if (!client) {
            console.log(`[!] Client ID ${id} not found`);
            continue;
        }
        
        const updatedData = { ...client.data };
        delete updatedData.weightTariff;
        delete updatedData.pricingMode;

        const { error } = await supabase.from('clients').update({ data: updatedData }).eq('id', id);
        if (error) {
            console.error(`Error cleaning ${client.data.name}:`, error);
        } else {
            console.log(`[✓] Cleaned: ${client.data.name} (removed weightTariff)`);
        }
    }
    console.log('\n🏁 Cleanup done!');
}

run();
