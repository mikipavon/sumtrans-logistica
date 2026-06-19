/**
 * Script: cleanup_drivvo_records.cjs
 * 
 * Elimina TODOS los registros de mantenimiento importados desde Drivvo
 * (identificados por el campo importedFrom: 'Drivvo') de todos los vehículos.
 * 
 * Después de ejecutar esto, hay que re-ejecutar import_drivvo_maintenance.cjs
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  🧹 Limpieza de registros Drivvo             ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');

    // 1. Cargar todos los vehículos
    const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('id, data');
    
    if (error) {
        console.error('❌ Error cargando vehículos:', error.message);
        process.exit(1);
    }

    let totalRemoved = 0;
    let vehiclesAffected = 0;

    for (const vehicle of (vehicles || [])) {
        const logs = vehicle.data?.maintenanceLogs || [];
        const drivvoLogs = logs.filter(l => l.importedFrom === 'Drivvo');
        
        if (drivvoLogs.length === 0) continue;

        const cleanLogs = logs.filter(l => l.importedFrom !== 'Drivvo');
        
        console.log(`🚛 ${vehicle.data?.id || vehicle.id}: eliminando ${drivvoLogs.length} registros Drivvo (quedan ${cleanLogs.length} manuales)`);
        
        const updatedData = {
            ...vehicle.data,
            maintenanceLogs: cleanLogs,
            // Reset odometer only if it was set from Drivvo import
            // Keep currentOdometer as is — user may have updated it manually
        };

        const { error: updateErr } = await supabase
            .from('vehicles')
            .update({ data: updatedData })
            .eq('id', vehicle.id);
        
        if (updateErr) {
            console.log(`   ❌ Error: ${updateErr.message}`);
        } else {
            totalRemoved += drivvoLogs.length;
            vehiclesAffected++;
        }
    }

    console.log(`
╔══════════════════════════════════════════════╗
║   🧹 LIMPIEZA COMPLETADA                     ║
╠══════════════════════════════════════════════╣
║  Vehículos afectados:    ${String(vehiclesAffected).padEnd(20)}║
║  Registros eliminados:   ${String(totalRemoved).padEnd(20)}║
╚══════════════════════════════════════════════╝

👉 Ahora ejecuta: node import_drivvo_maintenance.cjs
`);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
