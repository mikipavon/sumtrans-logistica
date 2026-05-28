import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf-8');
const VITE_SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const VITE_SUPABASE_ANON_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

// Normaliza un nombre para comparación
const normalize = (val) => String(val || '').toLowerCase().trim();

async function run() {
    console.log('📦 Cargando clientes...');
    const { data: clientRows, error: clientErr } = await supabase.from('clients').select('id, data');
    if (clientErr) { console.error('Error cargando clientes:', clientErr); return; }

    // Mapa nombre → billingType (ficha actual del cliente)
    const clientMap = new Map();
    for (const row of clientRows) {
        const d = row.data || {};
        const bt = d.billingType || '';
        if (d.name) clientMap.set(normalize(d.name), bt);
        if (d.legalName) clientMap.set(normalize(d.legalName), bt);
    }
    console.log(`✅ ${clientRows.length} clientes cargados en mapa`);

    console.log('\n📦 Cargando TODOS los envíos...');
    const { data: shipmentRows, error: shipErr } = await supabase.from('shipments').select('id, data');
    if (shipErr) { console.error('Error cargando envíos:', shipErr); return; }
    console.log(`✅ ${shipmentRows.length} envíos cargados`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const row of shipmentRows) {
        const s = row.data || {};
        let changed = false;
        const newData = { ...s };

        // --- REMITENTE ---
        const remitenteKey = normalize(s.client);
        if (remitenteKey && clientMap.has(remitenteKey)) {
            const currentBilling = clientMap.get(remitenteKey);
            if (currentBilling && s.billingType !== currentBilling) {
                newData.billingType = currentBilling;
                changed = true;
            }
        }

        // --- DESTINATARIO ---
        const destinatarioKey = normalize(s.destinationName || s.destination);
        if (destinatarioKey && clientMap.has(destinatarioKey)) {
            const currentBilling = clientMap.get(destinatarioKey);
            if (currentBilling && s.destinationBillingType !== currentBilling) {
                newData.destinationBillingType = currentBilling;
                changed = true;
            }
        }

        if (!changed) {
            skipped++;
            continue;
        }

        const { error: updateErr } = await supabase
            .from('shipments')
            .update({ data: newData })
            .eq('id', row.id);

        if (updateErr) {
            console.error(`  ❌ Error en envío ${row.id}:`, updateErr.message);
            errors++;
        } else {
            const remLog = newData.billingType !== s.billingType
                ? ` remitente: "${s.billingType || '(vacío)'}" → "${newData.billingType}"`
                : '';
            const destLog = newData.destinationBillingType !== s.destinationBillingType
                ? ` destinatario: "${s.destinationBillingType || '(vacío)'}" → "${newData.destinationBillingType}"`
                : '';
            console.log(`  ✅ ${row.id} |${remLog}${destLog}`);
            updated++;
        }
    }

    console.log('\n🏁 Migración completada:');
    console.log(`   ✅ Actualizados: ${updated}`);
    console.log(`   ⏭️  Sin cambios:  ${skipped}`);
    console.log(`   ❌ Errores:      ${errors}`);
}

run();
