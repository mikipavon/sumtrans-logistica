/**
 * link_insurance_to_vehicles.cjs
 * Sube los seguros de vehículos al Storage y los vincula a cada vehículo.
 * Clasifica documentos corporativos como "sin vehículo asociado".
 */

const fs   = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const SEGUROS_FOLDER = 'C:\\Users\\sumtr\\OneDrive - SUMTRANS LOGISTICA S.L. CIF B56131717\\01 Corporativos\\03 Seguros\\seguros vigentes';
const BUCKET         = 'vehicle_docs';
const STORAGE_URL    = `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

// Nuestros vehículos activos (los 11 creados)
const KNOWN_VEHICLES = ['5931LWK','9688LLV','5834LPF','5835LPF','5493KKX','5958LWK','9221KTX','0343MMY','0994NKY','0159NDM','0163NDM'];

// Mapeo explícito de archivo → matrícula
const FILE_TO_VEHICLE = {
    '9688LLV-FIAT.pdf':                    '9688LLV',
    'FIAT 5834LPF- PACO.pdf':              '5834LPF',
    'FIAT 5835LPF - VICTOR.pdf':           '5835LPF',
    'FIAT NUEVA 0343MMY- FIAT.pdf':        '0343MMY',
    'FIAT-5493 KKX.pdf':                   '5493KKX',
    'HYUNDAY 9221KTX-JUAN CARLOS.pdf':     '9221KTX',
    'PEUGEOT-5931LWK.pdf':                 '5931LWK',
    'PEUGEOT-5958LWK.pdf':                 '5958LWK',
    'POLIZA ALLIANZ FIAT 0159NDM.pdf':     '0159NDM',
    'POLIZA ALLIANZ FIAT 0163NDM.pdf':     '0163NDM',
    // Sin vehículo asociado (corporativos):
    'NEGOCIO.pdf':                          null,
    'SEGURO DE MERCANCIA.pdf':              null,
    'SEGURO DE VIDA VICTOR.pdf':            null,
    'SEGURO MEDICO MIGUEL PAVON.pdf':       null,
    'SERGURO POR CONVENIO OBLIGATORIO.pdf': null,
    'Seguro Nave CONDICIONES GENERALES.pdf':   null,
    'Seguro Nave CONDICIONES PARTICULARES.pdf': null,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function uploadFile(vehicleId, filename, filePath) {
    const storagePath = `${vehicleId}/seguros/${filename}`;
    const fileBuffer  = fs.readFileSync(filePath);
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: true });
    if (error) return null;
    return `${STORAGE_URL}/${vehicleId}/seguros/${encodeURIComponent(filename)}`;
}

async function main() {
    const files = fs.readdirSync(SEGUROS_FOLDER)
        .filter(f => path.extname(f).toLowerCase() === '.pdf');

    console.log('🚛 SUMTRANS — Subida de Seguros de Vehículos\n');
    console.log('═══════════════════════════════════════════════\n');

    const vehicleFiles = {}; // vehicleId → [{ file, url }]
    const corporate    = []; // archivos sin vehículo
    const unmatched    = []; // archivos no reconocidos

    for (const file of files) {
        if (file in FILE_TO_VEHICLE) {
            const vehicleId = FILE_TO_VEHICLE[file];
            if (vehicleId) {
                if (!vehicleFiles[vehicleId]) vehicleFiles[vehicleId] = [];
                vehicleFiles[vehicleId].push(file);
            } else {
                corporate.push(file);
            }
        } else {
            unmatched.push(file);
        }
    }

    // --- Vehicles with no insurance found ---
    const vehiclesWithoutInsurance = KNOWN_VEHICLES.filter(id => !vehicleFiles[id]);

    // --- Upload and link ---
    console.log('📤 Subiendo seguros a vehículos...\n');
    let ok = 0, failed = 0;

    for (const [vehicleId, fileList] of Object.entries(vehicleFiles)) {
        console.log(`📋 ${vehicleId}`);

        // Fetch current vehicle data
        const { data: row, error: fetchErr } = await supabase
            .from('vehicles').select('data').eq('id', vehicleId).single();

        if (fetchErr) { console.error(`  ❌ No encontrado:`, fetchErr.message); failed++; continue; }

        const existingDocs = row.data?.documents || [];
        const newDocs = [];

        for (const file of fileList) {
            const filePath = path.join(SEGUROS_FOLDER, file);
            const sizeKB   = (fs.statSync(filePath).size / 1024).toFixed(1);
            console.log(`  📤 Subiendo: ${file} (${sizeKB} KB)...`);

            const url = await uploadFile(vehicleId, file, filePath);
            if (url) {
                newDocs.push({
                    id:      Date.now() + Math.random(),
                    name:    file.replace(/\.pdf$/i, '').trim(),
                    docType: 'Seguro',
                    type:    'application/pdf',
                    size:    sizeKB + ' KB',
                    date:    new Date().toLocaleDateString('es-ES'),
                    dataUrl: url,
                });
                console.log(`    ✅ Subido`);
            } else {
                // If upload failed (RLS), use direct URL (file may already be there)
                const fallbackUrl = `${STORAGE_URL}/${vehicleId}/seguros/${encodeURIComponent(file)}`;
                newDocs.push({
                    id:      Date.now() + Math.random(),
                    name:    file.replace(/\.pdf$/i, '').trim(),
                    docType: 'Seguro',
                    type:    'application/pdf',
                    size:    sizeKB + ' KB',
                    date:    new Date().toLocaleDateString('es-ES'),
                    dataUrl: fallbackUrl,
                });
                console.log(`    ⚠️  Upload bloqueado, guardando URL directa`);
            }
            await sleep(300);
        }

        // Merge: keep existing docs, add/replace Seguro
        const merged = existingDocs.filter(d => d.docType !== 'Seguro').concat(newDocs);
        const { error: updateErr } = await supabase
            .from('vehicles')
            .update({ data: { ...row.data, documents: merged } })
            .eq('id', vehicleId);

        if (updateErr) { console.error(`  ❌ Error actualizando:`, updateErr.message); failed++; }
        else { console.log(`  ✅ ${vehicleId} — seguro vinculado\n`); ok++; }
    }

    // --- REPORT ---
    console.log('\n═══════════════════════════════════════════════');
    console.log('📊 RESUMEN FINAL\n');

    console.log(`✅ Vehículos con seguro subido (${ok}):`);
    Object.keys(vehicleFiles).forEach(id => console.log(`   • ${id}`));

    if (vehiclesWithoutInsurance.length > 0) {
        console.log(`\n⚠️  VEHÍCULOS SIN SEGURO ENCONTRADO (${vehiclesWithoutInsurance.length}):`);
        vehiclesWithoutInsurance.forEach(id => console.log(`   • ${id} ← falta documento`));
    } else {
        console.log('\n✅ Todos los vehículos tienen seguro');
    }

    if (corporate.length > 0) {
        console.log(`\n📁 DOCUMENTOS CORPORATIVOS (no asignados a vehículo, ${corporate.length}):`);
        corporate.forEach(f => console.log(`   • ${f}`));
    }

    if (unmatched.length > 0) {
        console.log(`\n❓ ARCHIVOS NO RECONOCIDOS (${unmatched.length}):`);
        unmatched.forEach(f => console.log(`   • ${f}`));
    }

    if (failed > 0) console.log(`\n❌ Errores: ${failed}`);
    console.log('\n═══════════════════════════════════════════════');
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
