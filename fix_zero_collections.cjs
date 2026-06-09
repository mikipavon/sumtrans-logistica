/**
 * fix_zero_collections.cjs
 * Limpia entradas de cobro €0.00 falsas y resetea portePaid en los albaranes afectados.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mottccbalzdzrgqzfkdl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzg3OTMsImV4cCI6MjA4OTg1NDc5M30.k4xkllpQfQcGXGD_qr-1Sr2aYvkx8Pj_Mzxw8su_zVY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// IDs de las colecciones €0.00 a borrar (sacados de la pantalla)
const ZERO_COLLECTION_IDS = [
    'COL-1780905505965-SUM-18-porte-o2x6',
    'COL-1780905505965-SUM-16-porte-7ww0',
    'COL-1780905505965-SUM-17-porte-uoss',
];

// Albaranes a resetear (portePaid=false, paymentStatus=Pending)
const ALBARANS_TO_RESET = ['SUM-18', 'SUM-16', 'SUM-17'];

async function run() {
    console.log('🔍 Buscando estructura de tablas...');

    // 1. Buscar los albaranes para ver su estructura actual
    const { data: shipments, error: shipErr } = await supabase
        .from('shipments')
        .select('id, amount, customAmount, portePaid, paymentStatus, porteType')
        .in('id', ALBARANS_TO_RESET);

    if (shipErr) {
        console.error('❌ Error buscando albaranes:', shipErr.message);
    } else {
        console.log('\n📋 Estado actual de los albaranes:');
        shipments.forEach(s => {
            console.log(`  ${s.id}: amount=${s.amount}, customAmount=${s.customAmount}, portePaid=${s.portePaid}, paymentStatus=${s.paymentStatus}, porteType=${s.porteType}`);
        });
    }

    // 2. Buscar drivers para encontrar las collectedCollections
    console.log('\n🔍 Buscando conductores con esas colecciones...');
    const { data: drivers, error: drvErr } = await supabase
        .from('drivers')
        .select('id, data');

    if (drvErr) {
        console.error('❌ Error buscando conductores:', drvErr.message);
        return;
    }

    let fixed = false;
    for (const driver of drivers) {
        const collections = driver.data?.collectedCollections || [];
        const zeroCols = collections.filter(c => ZERO_COLLECTION_IDS.includes(c.id));
        
        if (zeroCols.length > 0) {
            console.log(`\n🎯 Conductor ${driver.id} tiene ${zeroCols.length} colección(es) €0.00:`);
            zeroCols.forEach(c => console.log(`   - ${c.id}: €${c.amount}`));

            // Eliminar las entradas €0.00
            const cleanedCollections = collections.filter(c => !ZERO_COLLECTION_IDS.includes(c.id));
            
            const { error: updateErr } = await supabase
                .from('drivers')
                .update({ data: { ...driver.data, collectedCollections: cleanedCollections } })
                .eq('id', driver.id);

            if (updateErr) {
                console.error(`❌ Error limpiando colecciones del conductor ${driver.id}:`, updateErr.message);
            } else {
                console.log(`✅ Colecciones €0.00 eliminadas del conductor ${driver.id}`);
                fixed = true;
            }
        }
    }

    if (!fixed) {
        console.log('\n⚠️  No se encontraron esas colecciones en ningún conductor (puede que ya estén limpias)');
    }

    // 3. Resetear portePaid y paymentStatus en los albaranes afectados
    console.log('\n🔄 Reseteando portePaid=false y paymentStatus=Pending en albaranes...');
    for (const id of ALBARANS_TO_RESET) {
        const { error: resetErr } = await supabase
            .from('shipments')
            .update({
                portePaid: false,
                paymentStatus: 'Pending',
                updatedAt: new Date().toISOString()
            })
            .eq('id', id);

        if (resetErr) {
            console.error(`❌ Error reseteando ${id}:`, resetErr.message);
        } else {
            console.log(`✅ ${id} → portePaid=false, paymentStatus=Pending`);
        }
    }

    console.log('\n🏁 Proceso completado.');
}

run().catch(console.error);
