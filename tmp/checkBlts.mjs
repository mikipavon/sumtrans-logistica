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

async function run() {
    const { data: articlesRows } = await supabase.from('articles').select('id, data');
    const blts = articlesRows.filter(a => String(a.data?.name || '').includes('BLT_')).map(a => a.data?.name + ' -> ' + a.data?.category);
    console.log(blts.filter(b => b.includes('BLT_1 ') || b.includes('BLT_2 ') || b.includes('BLT_3 ') || b.includes('BLT_4 ')));
}

run();
