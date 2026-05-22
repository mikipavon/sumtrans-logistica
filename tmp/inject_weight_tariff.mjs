import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const VITE_SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const VITE_SUPABASE_ANON_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

// Tarifa por kilos de XPO (se aplica igual a TSB y TXT)
const WEIGHT_TARIFF = [
    { maxKg: 20, price: '4.36' },
    { maxKg: 40, price: '6.43' },
    { maxKg: 60, price: '8.12' },
    { maxKg: 80, price: '9.76' },
    { maxKg: 100, price: '11.33' },
    { maxKg: 150, price: '15.83' },
    { maxKg: 200, price: '17.89' },
    { maxKg: 250, price: '21.54' },
    { maxKg: 300, price: '24.47' },
    { maxKg: 350, price: '27.01' },
    { maxKg: 400, price: '29.44' },
    { maxKg: 450, price: '31.62' },
    { maxKg: 500, price: '33.31' },
    { maxKg: 600, price: '40.54' },
    { maxKg: 700, price: '45.76' },
    { maxKg: 800, price: '54.72' },
    { maxKg: 900, price: '58.51' },
    { maxKg: 1000, price: '63.30' }
];

async function run() {
    const { data: clients } = await supabase.from('clients').select('id, data');
    
    // Search for XPO, TSB, TXT
    const agencyKeywords = ['xpo', 'tsb', 'txt'];
    let updatedCount = 0;

    for (const keyword of agencyKeywords) {
        const matches = clients.filter(c => {
            const name = String(c.data.name || '').toLowerCase();
            return name.includes(keyword);
        });

        if (matches.length === 0) {
            console.log(`[!] No client found for "${keyword.toUpperCase()}"`);
            continue;
        }

        for (const client of matches) {
            console.log(`[✓] Found: ${client.data.name} (ID: ${client.id})`);

            const updatedData = {
                ...client.data,
                weightTariff: WEIGHT_TARIFF,
                pricingMode: 'weight' // Flag for future use
            };

            const { error } = await supabase.from('clients').update({ data: updatedData }).eq('id', client.id);
            if (error) {
                console.error(`Error updating ${client.data.name}:`, error);
            } else {
                console.log(`   ✅ Weight tariff (${WEIGHT_TARIFF.length} brackets) applied!`);
                updatedCount++;
            }
        }
    }

    console.log(`\n🏁 Done! Updated ${updatedCount} agency clients with weight-based pricing.`);
}

run();
