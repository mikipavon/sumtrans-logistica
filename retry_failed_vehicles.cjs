/**
 * Script: retry_failed_vehicles.cjs
 * Reintenta subir vehículos que fallaron por timeout, 
 * usando una estrategia de "crear vacío, luego añadir docs uno a uno"
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const DOCS_FOLDER = 'C:\\Users\\sumtr\\OneDrive - SUMTRANS LOGISTICA S.L. CIF B56131717\\01 Corporativos\\DOCUMENTACION DE VEHICULOS';

// Only vehicles that need retry or were not yet processed
const RETRY_VEHICLES = [
    { id: '5834LPF', marca: 'FIAT',    modelo: 'Ducato' },   // failed timeout
    { id: '0343MMY', marca: 'FIAT',    modelo: 'Ducato' },   // may have timed out (big contract pdf)
    { id: '0994NKY', marca: 'FIAT',    modelo: 'Ducato' },   // very large files
    { id: '0159NDM', marca: 'FIAT',    modelo: 'Ducato' },
    { id: '0163NDM', marca: 'FIAT',    modelo: 'Ducato' },
];

// Map files to vehicles — same logic as before
function classifyFile(filename, vehicleId) {
    const upper = filename.toUpperCase();
    const matNoSpace = vehicleId.replace(/\s/g, '').toUpperCase();
    const matSpaced  = matNoSpace.replace(/^(\d+)([A-Z]+)$/, '$1 $2');
    const patterns   = [matNoSpace, matSpaced];
    if (!patterns.some(p => upper.includes(p))) return null;

    if (upper.includes('FICHA TECNICA') || upper.includes('FICHA TÉCNICA')) return 'Ficha Técnica';
    if (upper.includes('PERMISO') && upper.includes('CIRCULACION'))          return 'Permiso de Circulación';
    if (upper.includes('CONTRATO'))                                           return 'Contrato';
    return 'Otro';
}

function fileToBase64(filePath) {
    const data = fs.readFileSync(filePath);
    return `data:application/pdf;base64,${data.toString('base64')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function upsertVehicleWithDocs(v, docs) {
    // Step 1: Check if vehicle already exists
    const { data: existing } = await supabase.from('vehicles').select('id, data').eq('id', v.id).maybeSingle();
    
    // Build base vehicle object (NO documents yet)
    const vehicleBase = {
        id:               v.id,
        model:            `${v.marca} ${v.modelo}`,
        status:           existing?.data?.status    || 'Disponible',
        location:         existing?.data?.location  || 'Base',
        fuel:             existing?.data?.fuel       || '—',
        maintenance:      existing?.data?.maintenance || 'OK',
        documents:        existing?.data?.documents  || [],
        maintenanceLogs:  existing?.data?.maintenanceLogs || [],
        currentOdometer:  existing?.data?.currentOdometer || '',
        assignedDriverId: existing?.data?.assignedDriverId || null,
    };

    if (!existing) {
        // Create vehicle without documents first
        const { error: createErr } = await supabase
            .from('vehicles')
            .insert([{ id: v.id, data: vehicleBase }]);
        if (createErr) { console.error(`  ❌ Error creando ${v.id}:`, createErr.message); return false; }
        console.log(`  📋 ${v.id} — vehículo creado (sin docs aún)`);
    } else {
        console.log(`  🔄 ${v.id} — ya existe, actualizando documentos`);
    }

    await sleep(500);

    // Step 2: Add documents one by one
    let addedCount = 0;
    for (const doc of docs) {
        // Get fresh state to avoid overwriting
        const { data: fresh } = await supabase.from('vehicles').select('data').eq('id', v.id).single();
        const currentDocs = fresh?.data?.documents || [];

        // Skip if this docType already exists
        if (currentDocs.some(d => d.docType === doc.docType)) {
            console.log(`    ⏭️  ${doc.docType} ya existe, saltando`);
            continue;
        }

        const updatedData = { ...(fresh?.data || vehicleBase), documents: [...currentDocs, doc] };
        const { error: docErr } = await supabase
            .from('vehicles')
            .update({ data: updatedData })
            .eq('id', v.id);

        if (docErr) {
            console.error(`    ❌ Error añadiendo ${doc.docType} a ${v.id}:`, docErr.message);
        } else {
            console.log(`    ✅ ${doc.docType} añadido a ${v.id} (${doc.size})`);
            addedCount++;
        }
        await sleep(1000); // wait between uploads
    }

    console.log(`  ✅ ${v.id} — completado (${addedCount}/${docs.length} documentos nuevos)\n`);
    return true;
}

async function main() {
    console.log('🔄 Reintentando vehículos fallidos...\n');

    const allFiles = fs.readdirSync(DOCS_FOLDER).filter(f =>
        ['.pdf', '.jpg', '.jpeg', '.png'].includes(path.extname(f).toLowerCase())
    );

    for (const v of RETRY_VEHICLES) {
        console.log(`\n📋 Procesando: ${v.id} (${v.marca} ${v.modelo})`);

        // Find matching files
        const docs = [];
        for (const file of allFiles) {
            const docType = classifyFile(file, v.id);
            if (!docType) continue;

            const filePath = path.join(DOCS_FOLDER, file);
            const stats    = fs.statSync(filePath);
            const sizeKB   = (stats.size / 1024).toFixed(1);

            console.log(`    📄 Leyendo: ${file} (${sizeKB} KB)...`);
            docs.push({
                id:      Date.now() + Math.random(),
                name:    file.replace(/\.pdf$/i, '').trim(),
                docType,
                type:    'application/pdf',
                size:    sizeKB + ' KB',
                date:    new Date().toLocaleDateString('es-ES'),
                dataUrl: fileToBase64(filePath),
            });
            await sleep(10);
        }

        if (docs.length === 0) {
            console.log(`  ⚠️  Sin documentos para ${v.id}`);
            continue;
        }

        await upsertVehicleWithDocs(v, docs);
    }

    console.log('\n✅ Proceso de reintento completado.');
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
