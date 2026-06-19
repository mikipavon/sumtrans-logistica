/**
 * Script: import_drivvo_maintenance.cjs
 * 
 * Importa los datos de mantenimiento desde CSVs exportados de Drivvo
 * a la tabla vehicles de Supabase (campo maintenanceLogs dentro de data).
 * 
 * - Lee todos los archivos *.csv del directorio que tengan formato Drivvo
 * - Solo importa la sección #Servicio (NO gastos)
 * - Mapea los tipos de servicio de Drivvo a los tipos de la app
 * - Detecta duplicados (fecha + tipo + km)
 * - Actualiza el odómetro si el CSV tiene un valor más alto
 * 
 * Uso: node import_drivvo_maintenance.cjs
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
);

// CSVs a excluir (no son de Drivvo)
const EXCLUDED_FILES = [
    'crc39_articulos2.4 csv.csv',
];

// ─── Mapeo de tipos de servicio Drivvo → tipos de la app ───────────────────
const SERVICE_TYPE_MAP = {
    'cambio de aceite':                     'Aceite',
    'filtro de aceite':                     'Filtros',
    'filtro de aire':                       'Filtros',
    'filtro de combustible':                'Filtros',
    'pastillas delanteras':                 'Frenos',
    'pastillas traseras':                   'Frenos',
    'discos de freno delanteros':           'Frenos',
    'discos de freno traseros':             'Frenos',
    'neumaticos delanteros':                'Ruedas',
    'neumaticos traseros':                  'Ruedas',
    'neumáticos delanteros':                'Ruedas',
    'neumáticos traseros':                  'Ruedas',
    'cambio distribución y bomba de agua':  'Correa',
    'cambio distribucion y bomba de agua':  'Correa',
    'batería':                              'Reparación',
    'bateria':                              'Reparación',
    'vidrio/espejos':                       'Reparación',
    'revisión general':                     'Revisión',
    'revision general':                     'Revisión',
};

function mapServiceType(drivvoType) {
    const key = drivvoType.trim().toLowerCase();
    // Exact match first
    if (SERVICE_TYPE_MAP[key]) return SERVICE_TYPE_MAP[key];
    // Partial match
    for (const [pattern, appType] of Object.entries(SERVICE_TYPE_MAP)) {
        if (key.includes(pattern) || pattern.includes(key)) return appType;
    }
    return 'Otro';
}

// ─── Parseo del formato CSV de Drivvo ─────────────────────────────────────
// Drivvo tiene dos formatos de exportación:
//   Formato A (nuevo): campos separados por comas con comillas simples
//     "Fiat 0343MMY","148231","04/06/2026 12:11","0","Cambio de Aceite",...
//   Formato B (antiguo): comillas dobles anidadas como separador  
//     "Fiat 5834LPF Paco,""349792"",""04/05/2026 17:44"",""30""..."

function parseDrivvoRow(rawLine) {
    let line = rawLine.trim();
    if (!line) return [];
    
    // Detect format: Format B uses ,""value"" (comma + TWO double quotes)
    // Format A uses standard CSV: "value1","value2"
    // The key difference: Format B has ,"" (comma + double-double-quote inside the outer quotes)
    // while Format A has "," (quote + comma + quote)
    const isFormatB = line.includes(',""') && !line.match(/^"[^"]*","/);
    
    if (isFormatB) {
        // Format B: "field1,""field2"",""field3""..."
        if (line.startsWith('"') && line.endsWith('"')) {
            line = line.slice(1, -1);
        }
        const parts = [];
        const firstSep = line.indexOf(',""');
        if (firstSep === -1) return [line];
        
        parts.push(line.substring(0, firstSep));
        
        let rest = line.substring(firstSep + 2);
        if (rest.endsWith('""')) {
            rest = rest.slice(0, -2);
        }
        
        const fields = rest.split('","');
        for (const f of fields) {
            parts.push(f.replace(/^"+|"+$/g, ''));
        }
        return parts;
    }
    
    // Format A: standard CSV with quoted fields
    // Parse properly handling commas inside quotes
    const parts = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++; // skip escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            parts.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    parts.push(current.trim());
    
    return parts;
}

function isDrivvoFile(content) {
    // A Drivvo CSV always starts with a #Vehículo section
    return content.includes('#Veh') && (content.includes('#Servicio') || content.includes('#Gasto'));
}

function parseDrivvoCSV(content) {
    const lines = content.split(/\r?\n/);
    
    let currentSection = null;
    const sections = {
        vehiculo: { headers: [], rows: [] },
        gasto: { headers: [], rows: [] },
        servicio: { headers: [], rows: [] },
    };
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Detectar secciones (handle encoding issues with accented chars)
        if (/^#Veh/i.test(trimmed)) {
            currentSection = 'vehiculo';
            continue;
        }
        if (/^#Gasto/i.test(trimmed)) {
            currentSection = 'gasto';
            continue;
        }
        if (/^#Servicio/i.test(trimmed)) {
            currentSection = 'servicio';
            continue;
        }
        
        if (!currentSection || !trimmed) continue;
        
        const section = sections[currentSection];
        
        // La primera línea de cada sección son los headers
        if (section.headers.length === 0) {
            section.headers = parseDrivvoRow(trimmed);
            continue;
        }
        
        // Filas de datos
        const row = parseDrivvoRow(trimmed);
        if (row.length > 1) { // Skip empty/malformed rows
            section.rows.push(row);
        }
    }
    
    return sections;
}

// ─── Extraer matrícula del CSV ────────────────────────────────────────────
function extractMatricula(sections) {
    // De la sección vehículo — campo "Matrícula"
    if (sections.vehiculo.rows.length > 0) {
        const headers = sections.vehiculo.headers;
        const row = sections.vehiculo.rows[0];
        
        // Try header matching first
        const matIdx = headers.findIndex(h => {
            const clean = h.toLowerCase().replace(/[^a-z]/g, '');
            return clean.includes('matricula') || clean.includes('matrcula') || clean.includes('licen');
        });
        
        if (matIdx !== -1 && row[matIdx]) {
            const val = row[matIdx].replace(/\s/g, '').toUpperCase();
            if (/\d{4}[A-Z]{3}/.test(val) || /[A-Z]{1,2}\d{4}[A-Z]{2,3}/.test(val)) {
                return val;
            }
        }
        
        // Fallback: index 5 is always Matrícula in Drivvo exports
        if (row[5]) {
            const val = row[5].replace(/\s/g, '').toUpperCase();
            if (/\d{4}[A-Z]{3}/.test(val) || /[A-Z]{1,2}\d{4}[A-Z]{2,3}/.test(val)) {
                return val;
            }
        }
        
        // Last resort: scan all fields for something that looks like a matrícula
        for (const field of row) {
            const val = (field || '').replace(/\s/g, '').toUpperCase();
            if (/^\d{4}[A-Z]{3}$/.test(val)) {
                return val;
            }
        }
    }
    
    // Fallback: del nombre del vehículo en cualquier sección con datos
    const fallbackRows = sections.servicio.rows.length > 0 
        ? sections.servicio.rows 
        : sections.gasto.rows;
    
    if (fallbackRows.length > 0) {
        const name = fallbackRows[0][0] || '';
        const match = name.match(/(\d{4}\s?[A-Z]{3})/i);
        if (match) return match[1].replace(/\s/g, '').toUpperCase();
    }
    
    return null;
}

// ─── Convertir fecha Drivvo a formato ISO ─────────────────────────────────
function parseDrivvoDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
}

// ─── Convertir servicios Drivvo a maintenanceLogs de la app ──────────────
function convertServicesToLogs(sections) {
    const headers = sections.servicio.headers;
    const rows = sections.servicio.rows;
    
    if (headers.length === 0 || rows.length === 0) return [];
    
    // Normalizar headers para buscar índices
    const normalize = (s) => s.toLowerCase()
        .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
        .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
        .replace(/[^a-z0-9 ]/g, '');
    
    const normalizedHeaders = headers.map(normalize);
    
    const findIdx = (...keywords) => {
        for (const kw of keywords) {
            const idx = normalizedHeaders.findIndex(h => h.includes(kw));
            if (idx !== -1) return idx;
        }
        return -1;
    };
    
    const idxKm = findIdx('odometro', 'km');
    const idxDate = findIdx('fecha');
    const idxCost = findIdx('costo total', 'costo', 'cost');
    const idxType = findIdx('tipo de servicio', 'tipo');
    const idxLocal = findIdx('local del servicio', 'local');
    const idxDriver = findIdx('conductor');
    const idxNotes = findIdx('notas');
    
    const logs = [];
    
    for (const row of rows) {
        const drivvoType = (idxType >= 0 ? row[idxType] : '') || '';
        const appType = mapServiceType(drivvoType.trim());
        const dateStr = (idxDate >= 0 ? row[idxDate] : '') || '';
        const isoDate = parseDrivvoDate(dateStr);
        const km = ((idxKm >= 0 ? row[idxKm] : '') || '0').trim();
        const cost = ((idxCost >= 0 ? row[idxCost] : '') || '0').trim();
        const workshop = ((idxLocal >= 0 ? row[idxLocal] : '') || '').trim();
        const driver = ((idxDriver >= 0 ? row[idxDriver] : '') || '').trim();
        const notes = ((idxNotes >= 0 ? row[idxNotes] : '') || '').trim();
        
        // Construir nota detallada
        const noteParts = [];
        if (drivvoType.trim()) noteParts.push(`[Drivvo: ${drivvoType.trim()}]`);
        if (driver) noteParts.push(`Conductor: ${driver}`);
        if (notes && notes !== 'undefined') noteParts.push(notes);
        
        logs.push({
            id: Date.now() + Math.floor(Math.random() * 100000),
            type: appType,
            date: isoDate || '',
            km: km,
            cost: (cost === 'undefined' || cost === '') ? '0' : cost,
            notes: noteParts.join(' — '),
            workshop: workshop,
            nextKm: '',
            alertAtKm: null,
            invoicePhoto: null,
            createdAt: new Date().toISOString(),
            importedFrom: 'Drivvo',
            drivvoType: drivvoType.trim(),
        });
    }
    
    return logs;
}

// ─── Detección de duplicados ──────────────────────────────────────────────
// Usa fecha + tipo original Drivvo + km + coste para detección precisa
function isDuplicate(existingLog, newLog) {
    // Si ambos tienen drivvoType, usar comparación precisa
    if (existingLog.drivvoType && newLog.drivvoType) {
        return existingLog.date === newLog.date 
            && existingLog.drivvoType.toLowerCase() === newLog.drivvoType.toLowerCase()
            && existingLog.km === newLog.km;
    }
    // Fallback: fecha + tipo app + km + coste
    return existingLog.date === newLog.date 
        && existingLog.type === newLog.type 
        && existingLog.km === newLog.km
        && existingLog.cost === newLog.cost;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  📥 Importador de Mantenimiento desde Drivvo ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
    
    // 1. Buscar todos los CSVs que sean formato Drivvo
    const allFiles = fs.readdirSync(__dirname);
    const csvFiles = allFiles.filter(f => {
        if (!f.toLowerCase().endsWith('.csv')) return false;
        if (EXCLUDED_FILES.includes(f.toLowerCase())) return false;
        // Quick check: read first few bytes to see if it's Drivvo format
        try {
            const content = fs.readFileSync(path.join(__dirname, f), 'utf-8');
            return isDrivvoFile(content);
        } catch { return false; }
    });
    
    if (csvFiles.length === 0) {
        console.log('❌ No se encontraron archivos CSV con formato Drivvo.');
        process.exit(1);
    }
    
    console.log(`📁 Encontrados ${csvFiles.length} archivo(s) de Drivvo:\n`);
    csvFiles.forEach(f => console.log(`   • ${f}`));
    console.log('');
    
    // 2. Cargar vehículos existentes de Supabase
    console.log('🔄 Cargando vehículos de Supabase...');
    const { data: existing, error: loadErr } = await supabase
        .from('vehicles')
        .select('id, data');
    
    if (loadErr) {
        console.error('❌ Error cargando vehículos:', loadErr.message);
        process.exit(1);
    }
    
    const vehicleList = existing || [];
    console.log(`   ✅ ${vehicleList.length} vehículos en la base de datos`);
    console.log(`   📋 Matrículas: ${vehicleList.map(v => v.data?.id || v.id).join(', ')}\n`);
    
    // Crear mapa de vehículos por matrícula (sin espacios, uppercase)
    const vehicleMap = {};
    for (const v of vehicleList) {
        const mat = (v.data?.id || v.id || '').replace(/\s/g, '').toUpperCase();
        vehicleMap[mat] = v;
    }
    
    // 3. Procesar cada CSV
    let totalImported = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;
    let filesProcessed = 0;
    let filesNotMatched = 0;
    let filesNoServices = 0;
    
    for (const csvFile of csvFiles) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📄 Procesando: ${csvFile}`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        const content = fs.readFileSync(path.join(__dirname, csvFile), 'utf-8');
        const sections = parseDrivvoCSV(content);
        
        // Extraer matrícula
        const matricula = extractMatricula(sections);
        if (!matricula) {
            console.log('   ⚠️  No se pudo extraer la matrícula. Saltando.');
            filesNotMatched++;
            continue;
        }
        
        console.log(`   🚛 Matrícula detectada: ${matricula}`);
        
        // Buscar vehículo en Supabase
        const vehicle = vehicleMap[matricula];
        if (!vehicle) {
            console.log(`   ⚠️  Vehículo ${matricula} NO encontrado en Supabase. Saltando.`);
            filesNotMatched++;
            continue;
        }
        
        // Verificar si hay servicios
        if (sections.servicio.rows.length === 0) {
            console.log('   ⚠️  Sin sección #Servicio en este CSV.');
            filesNoServices++;
            continue;
        }
        
        // Convertir servicios a logs
        const newLogs = convertServicesToLogs(sections);
        console.log(`   📋 Servicios encontrados en CSV: ${newLogs.length}`);
        
        if (newLogs.length === 0) {
            console.log('   ⚠️  Sin servicios para importar.');
            filesNoServices++;
            continue;
        }
        
        // Mostrar resumen de servicios
        const typeCounts = {};
        for (const log of newLogs) {
            typeCounts[log.type] = (typeCounts[log.type] || 0) + 1;
        }
        for (const [type, count] of Object.entries(typeCounts).sort((a,b) => b[1] - a[1])) {
            console.log(`      • ${type}: ${count} registro(s)`);
        }
        
        // Filtrar duplicados
        const existingLogs = vehicle.data?.maintenanceLogs || [];
        const uniqueNewLogs = newLogs.filter(newLog => 
            !existingLogs.some(el => isDuplicate(el, newLog))
        );
        
        const duplicates = newLogs.length - uniqueNewLogs.length;
        if (duplicates > 0) {
            console.log(`   ⚡ ${duplicates} registro(s) duplicados detectados (ignorados)`);
        }
        
        if (uniqueNewLogs.length === 0) {
            console.log('   ✅ Todos los registros ya existían. Nada nuevo que importar.');
            totalDuplicates += duplicates;
            filesProcessed++;
            continue;
        }
        
        // Combinar logs existentes + nuevos, ordenados por fecha desc
        const allLogs = [...existingLogs, ...uniqueNewLogs].sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            return dateB.localeCompare(dateA);
        });
        
        // Actualizar odómetro si el CSV tiene un valor más alto
        const maxKm = Math.max(...newLogs.map(l => parseInt(l.km) || 0));
        const currentKm = parseInt(vehicle.data?.currentOdometer) || 0;
        const newOdometer = maxKm > currentKm ? String(maxKm) : (vehicle.data?.currentOdometer || '');
        
        if (maxKm > currentKm) {
            console.log(`   📏 Odómetro actualizado: ${currentKm.toLocaleString()} km → ${maxKm.toLocaleString()} km`);
        }
        
        // Actualizar vehículo en Supabase
        const updatedData = {
            ...vehicle.data,
            maintenanceLogs: allLogs,
            currentOdometer: newOdometer,
        };
        
        const { error: updateErr } = await supabase
            .from('vehicles')
            .update({ data: updatedData })
            .eq('id', vehicle.id);
        
        if (updateErr) {
            console.log(`   ❌ Error actualizando ${matricula}: ${updateErr.message}`);
        } else {
            console.log(`   ✅ Importados ${uniqueNewLogs.length} registro(s) de mantenimiento`);
            totalImported += uniqueNewLogs.length;
            totalDuplicates += duplicates;
            filesProcessed++;
        }
    }
    
    // Resumen final
    console.log(`
╔══════════════════════════════════════════════╗
║   📊 RESUMEN DE IMPORTACIÓN                  ║
╠══════════════════════════════════════════════╣
║  Archivos procesados OK: ${String(filesProcessed).padEnd(20)}║
║  Archivos sin match:     ${String(filesNotMatched).padEnd(20)}║
║  Archivos sin servicios: ${String(filesNoServices).padEnd(20)}║
║  Registros importados:   ${String(totalImported).padEnd(20)}║
║  Duplicados ignorados:   ${String(totalDuplicates).padEnd(20)}║
╚══════════════════════════════════════════════╝
`);
}

main().catch(e => { console.error('Error fatal:', e); process.exit(1); });
