/**
 * repair_vehicle_data.cjs
 *
 * Repara las fichas de vehículos que perdieron datos por el fallo de guardado
 * (se escribía solo el campo modificado y se borraba el resto de la ficha).
 *
 * Rellena ÚNICAMENTE los campos que faltan o están vacíos. Nunca sobrescribe
 * un dato que ya exista, y nunca borra documentos ni mantenimientos.
 *
 * Uso:
 *   node repair_vehicle_data.cjs            → informe, no toca nada
 *   node repair_vehicle_data.cjs --apply    → aplica las reparaciones
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

const BUCKET      = 'vehicle_docs';
const STORAGE_URL = `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

// Marca y modelo originales (de import_fleet_vehicles.cjs)
const MODELOS = {
    '5931LWK': 'PEUGEOT Boxer Furgón',
    '9688LLV': 'FIAT Ducato',
    '5834LPF': 'FIAT Ducato',
    '5835LPF': 'FIAT Ducato',
    '5493KKX': 'FIAT Ducato',
    '5958LWK': 'PEUGEOT Boxer Furgón',
    '9221KTX': 'HYUNDAI H350',
    '0343MMY': 'FIAT Ducato',
    '0994NKY': 'FIAT Ducato',
    '0159NDM': 'FIAT Ducato',
    '0163NDM': 'FIAT Ducato',
};

// Documentos ya subidos al almacén (de link_docs_to_vehicles.cjs)
const DOCUMENTOS = {
    '5931LWK': [
        { file: 'PEUGEOT- PERMISO CIRCULACION 5931 LWK.pdf', docType: 'Permiso de Circulación' },
        { file: 'PEUGEOT-FICHA TECNICA 5931 LWK.pdf',        docType: 'Ficha Técnica' },
    ],
    '9688LLV': [
        { file: 'FIAT-FICHA TECNICA 9688LLV.pdf',            docType: 'Ficha Técnica' },
        { file: 'FIAT-PERMISO DE CIRCULACION 9688LLV.pdf',   docType: 'Permiso de Circulación' },
    ],
    '5834LPF': [
        { file: 'FIAT-FICHA TECNICA 5834LPF.pdf',                   docType: 'Ficha Técnica' },
        { file: 'FIAT-PERMISO DE CIRCULACION 5834 LPF(JAVIER).pdf', docType: 'Permiso de Circulación' },
    ],
    '5835LPF': [
        { file: 'FIAT-FICHA TECNICA 5835LPF (VICTOR).pdf',          docType: 'Ficha Técnica' },
        { file: 'FIAT-PERMISO CIRCULACION 5835LPF (VICTOR).pdf',    docType: 'Permiso de Circulación' },
    ],
    '5493KKX': [
        { file: 'FIAT- FICHA TECNICA 5493KKX(RAMBLA).pdf',          docType: 'Ficha Técnica' },
        { file: 'FIAT- PERMISO CIRCULACION 5493 KKX.pdf',           docType: 'Permiso de Circulación' },
    ],
    '5958LWK': [
        { file: 'PEUGEOT-FICHA TECNICA 5958 LWK (2).pdf',           docType: 'Ficha Técnica' },
        { file: 'PEUGEOT-PERMISO CIRCULACION 5958LWK.pdf',          docType: 'Permiso de Circulación' },
    ],
    '9221KTX': [
        { file: 'HYUNDAY- FICHA TECNICA 9221KTX.pdf',               docType: 'Ficha Técnica' },
        { file: 'HYUNDAY- PERMISO CIRCULACION 9221KTX.pdf',         docType: 'Permiso de Circulación' },
    ],
    '0343MMY': [
        { file: 'FICHA TECNICA 0343MMY.pdf',                        docType: 'Ficha Técnica' },
        { file: 'PERMISO CIRCULACION 0343MMY.pdf',                  docType: 'Permiso de Circulación' },
        { file: 'CONTRATO COMPRAVENTA DE FIAT DUCATO0343MMY.pdf',   docType: 'Contrato' },
    ],
    '0994NKY': [
        { file: 'FIAT - FICHA TECNICA 0994NKY- PACO.pdf',           docType: 'Ficha Técnica' },
        { file: 'FIAT- PERMISO CIRCULACION 0994NKY- PACO.pdf',      docType: 'Permiso de Circulación' },
    ],
    '0159NDM': [
        { file: 'FICHA TECNICA FIAT 0159NDM.pdf',                   docType: 'Ficha Técnica' },
        { file: 'PERMISO DE CIRCULACION FIAT 0159NDM.pdf',          docType: 'Permiso de Circulación' },
    ],
};

const docUrl = (vehicleId, file) => `${STORAGE_URL}/${vehicleId}/${encodeURIComponent(file)}`;

/**
 * Decide si hay que reparar el modelo de un vehículo.
 * Repara si está vacío, o si lo guardado es el principio de lo correcto
 * (caso «FIAT» cuando debería poner «FIAT Ducato»).
 * Nunca toca un modelo distinto: puede ser un cambio hecho a propósito.
 */
function modeloAReparar(guardado, correcto) {
    if (!correcto) return null;
    const actual = String(guardado || '').trim();
    if (!actual) return correcto;
    if (actual === correcto) return null;
    const esPrincipioDe = correcto.toUpperCase().startsWith(actual.toUpperCase()) && actual.length < correcto.length;
    return esPrincipioDe ? correcto : null;
}

async function main() {
    console.log(APPLY ? '⚙️  MODO REPARACIÓN (se van a guardar cambios)\n' : '🔍 MODO INFORME (no se toca nada)\n');

    const { data: rows, error } = await supabase.from('vehicles').select('id,data');
    if (error) {
        console.error('❌ No se pudieron leer los vehículos:', error.message);
        console.error('   Si es un problema de permisos (RLS), ejecútalo con la clave de servicio:');
        console.error('   VITE_SUPABASE_ANON_KEY=<service_role_key> node repair_vehicle_data.cjs');
        process.exitCode = 1;
        return;
    }

    if (rows.length === 0) {
        console.error('⚠️  La consulta no ha devuelto ningún vehículo.');
        console.error('   Las reglas de seguridad (RLS) no dejan leerlos con la clave anónima.');
        console.error('   Vuelve a lanzarlo con la clave de servicio, que encontrarás en');
        console.error('   Supabase → Project Settings → API → service_role:');
        console.error('   VITE_SUPABASE_ANON_KEY=<service_role_key> node repair_vehicle_data.cjs');
        process.exitCode = 1;
        return;
    }

    console.log(`Vehículos encontrados: ${rows.length}\n`);
    let reparados = 0;

    for (const row of rows) {
        const data     = row.data || {};
        const cambios  = {};
        const detalles = [];

        // 1. Marca y modelo
        const modeloNuevo = modeloAReparar(data.model, MODELOS[row.id]);
        if (modeloNuevo) {
            cambios.model = modeloNuevo;
            detalles.push(`modelo → "${data.model || '(vacío)'}" pasa a "${modeloNuevo}"`);
        }

        // 2. Estado (sin él, el vehículo no se muestra bien en la lista)
        if (!data.status) {
            cambios.status = 'Disponible';
            detalles.push('estado → Disponible');
        }

        // 3. Documentos del almacén que falten (se añaden, no se sustituyen)
        const actuales = Array.isArray(data.documents) ? data.documents : [];
        const conocidos = DOCUMENTOS[row.id] || [];
        const faltan = conocidos.filter(d => !actuales.some(a => (a.dataUrl || '').includes(encodeURIComponent(d.file))));
        if (faltan.length > 0) {
            cambios.documents = [
                ...actuales,
                ...faltan.map((f, i) => ({
                    id:      Date.now() + i,
                    name:    f.file.replace(/\.pdf$/i, '').trim(),
                    docType: f.docType,
                    type:    'application/pdf',
                    size:    '—',
                    date:    new Date().toLocaleDateString('es-ES'),
                    dataUrl: docUrl(row.id, f.file),
                })),
            ];
            detalles.push(`documentos → se añaden ${faltan.length} (${faltan.map(f => f.docType).join(', ')})`);
        }

        // 4. Campos que deben existir aunque estén vacíos
        if (!Array.isArray(data.maintenanceLogs)) {
            cambios.maintenanceLogs = [];
            detalles.push('mantenimientos → lista vacía (ver nota al final)');
        }

        if (detalles.length === 0) {
            console.log(`✅ ${row.id} — correcto`);
            continue;
        }

        console.log(`🔧 ${row.id}`);
        detalles.forEach(d => console.log(`     · ${d}`));
        reparados++;

        if (APPLY) {
            const { error: upErr } = await supabase
                .from('vehicles')
                .update({ data: { ...data, ...cambios } })
                .eq('id', row.id);
            if (upErr) console.log(`     ❌ error al guardar: ${upErr.message}`);
            else       console.log('     ✔️  guardado');
        }
    }

    console.log(`\n${'─'.repeat(50)}`);
    console.log(APPLY
        ? `Reparados: ${reparados} de ${rows.length}`
        : `Se repararían: ${reparados} de ${rows.length}. Ejecuta con --apply para aplicarlo.`);

    console.log(`
NOTA sobre los mantenimientos: este script no los reconstruye, porque los
registros añadidos a mano desde la aplicación no están en ningún fichero.
Los que vinieron de DRIVVO sí se pueden reimportar con:
    node import_drivvo_maintenance.cjs
revisando antes que ese script añada y no sustituya.`);
}

main().catch(e => { console.error('Error inesperado:', e); process.exit(1); });
