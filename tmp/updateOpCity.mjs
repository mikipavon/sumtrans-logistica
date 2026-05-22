import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const lines = envContent.split('\n');

let supabaseUrl = '';
let supabaseKey = '';

for (const line of lines) {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
        supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    } else if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
        supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
}

const supabase = createClient(supabaseUrl, supabaseKey);

const nonYellowClients = [
    "REPUESTOS RAMIRO",
    "INDUSTRIAL LEKUE",
    "MAQUINEX SOLDADURA",
    "CAMISAS A MEDIDA",
    "DRUSO MAIOR",
    "AGROTRACTOR ROCHI",
    "GALISUR CORDOBA",
    "PERCHAN",
    "PINTURAS COPINGRA",
    "SACYR",
    "PROSERVICE",
    "SOTEC LUIS CROVETTO",
    "MECALIA",
    "GECONSA",
    "XPO TRANSPORT SOLUTIONS",
    "DCOOP",
    "LOGISTIC AUTOMOTIVE",
    "JIMENEZ MAÑA"
];

async function run() {
    const { data: clients, error } = await supabase.from('clients').select('id, data');
    if (error) { console.error(error); return;}

    let updated = 0;
    
    for (const c of clients) {
        if(!c.data || !c.data.name) continue;
        const nameUpper = c.data.name.toUpperCase();
        
        const isTarget = nonYellowClients.some(target => nameUpper.includes(target.toUpperCase()));
        
        if (isTarget) {
            // Update to Cordoba
            const newData = {
                ...c.data,
                opCity: 'Córdoba',
                opZip: '14000'
            };
            
            await supabase.from('clients').update({ data: newData }).eq('id', c.id);
            console.log('Updated client:', c.data.name);
            updated++;
        }
    }
    
    console.log('Finished updating', updated, 'clients with opCity=Córdoba.');
}

run();
