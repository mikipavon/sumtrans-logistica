const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
    // Check current model
    const { data } = await supabase.from('vehicles').select('id, data').eq('id', '0159NDM');
    if (!data || data.length === 0) { console.log('No encontrado 0159NDM'); return; }
    const v = data[0];
    console.log('Actual model:', v.data?.model);
    
    // Update model to include FIAT
    const currentModel = v.data?.model || '';
    if (currentModel.toUpperCase().includes('FIAT')) {
        console.log('Ya tiene FIAT en el modelo');
        return;
    }
    const newModel = 'FIAT ' + (currentModel || 'Ducato');
    const updatedData = { ...v.data, model: newModel };
    const { error } = await supabase.from('vehicles').update({ data: updatedData }).eq('id', '0159NDM');
    if (error) console.log('Error:', error.message);
    else console.log('Actualizado a:', newModel);
}
main().catch(console.error);
