import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envText = fs.readFileSync('.env.local', 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val) env[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function reset() {
    console.log("Fetching TR-105 and TR-5...");
    const { data: shipments, error: fetchError } = await supabase
        .from('shipments')
        .select('*')
        .in('id', ['TR-105', 'TR-5']);
    
    if (fetchError) {
        console.error("Fetch Error:", fetchError);
        return;
    }

    if (!shipments || shipments.length === 0) {
        console.log("No se encontraron los envíos.");
        return;
    }

    for (const s of shipments) {
        let newData = s.data || {};
        // Borramos el justificante
        delete newData.codReceiptPhoto;
        // Y nos aseguramos de que sigan constando como cobrados para que requieran justificante
        newData.hasCod = true;
        newData.codPaid = true;
        
        console.log(`Actualizando ${s.id}...`);
        const { error: updateError } = await supabase
            .from('shipments')
            .update({ data: newData })
            .eq('id', s.id);
            
        if (updateError) {
            console.error(`Error actualizando ${s.id}:`, updateError);
        } else {
            console.log(`✅ ${s.id} reseteado a pendiente de justificante.`);
        }
    }
}

reset();
