import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const VITE_SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const VITE_SUPABASE_ANON_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

// IDs de las agencias correctas (XPO, TSB, TXT)
const AGENCY_IDS = [493, 65, 460];

async function run() {
    for (const id of AGENCY_IDS) {
        const { data: client } = await supabase.from('clients').select('id, data').eq('id', id).single();
        if (!client) { console.log(`[!] Client ${id} not found`); continue; }
        
        const updatedData = { ...client.data, tariffType: 'Por Kilos' };
        const { error } = await supabase.from('clients').update({ data: updatedData }).eq('id', id);
        
        if (error) console.error(`Error:`, error);
        else console.log(`[✓] ${client.data.name} → tariffType: "Por Kilos"`);
    }
    console.log('\n✅ Done!');
}

run();
