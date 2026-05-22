import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = 'https://mottccbalzdzrgqzfkdl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vdHRjY2JhbHpkenJncXpma2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI3ODc5MywiZXhwIjoyMDg5ODU0NzkzfQ.qfq5NNQFY6dBxhwR9kSPk4_Yoy8GhIBY-uXxqsqlX58';
const supabase = createClient(supabaseUrl, supabaseKey);

async function importClients() {
    console.log('🚀 Iniciando importación de clientes desde CLI.xlsx...');
    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.readFile('CLI.xlsx');
    } catch (err) {
        console.error('❌ No se pudo encontrar o leer CLI.xlsx en la raíz del proyecto.');
        process.exit(1);
    }

    const worksheet = workbook.worksheets[0];
    const headerRow = worksheet.getRow(1).values;
    const headerMap = {};
    headerRow.forEach((h, i) => { if (h) headerMap[String(h).trim()] = i; });

    const clientsToImport = [];
    worksheet.eachRow((row, rowNum) => {
        if (rowNum === 1) return;

        const get = (col) => {
            const idx = headerMap[col];
            if (!idx) return '';
            const v = row.getCell(idx).value;
            // Handle ExcelJS value types
            if (v && typeof v === 'object' && v.text) return String(v.text).trim();
            if (v && typeof v === 'object' && v.result) return String(v.result).trim();
            return v !== null && v !== undefined ? String(v).trim() : '';
        };

        const name = get('Nombre comercial') || get('Nombre fiscal');
        if (!name) return;

        const clientData = {
            id: get('Código') || crypto.randomUUID(),
            name: name,
            legalName: get('Nombre fiscal'),
            cif: get('NIF'),
            address: get('Domicilio'),
            city: get('Población'),
            zip: get('Código postal'),
            province: get('Provincia'),
            phone: get('Teléfono'),
            mobile: get('Móvil'),
            email: get('E-mail'),
            type: get('Tipo de cliente') || 'Remitente',
            billingType: 'Facturación',
            status: 'approved',
            registrationDate: get('Fecha de alta') || new Date().toISOString().split('T')[0],
            paymentMethod: get('Forma de pago'),
            account: get('Cuenta'),
            controlDigit: get('Dígito de control')
        };

        clientsToImport.push({
            id: clientData.id,
            name: clientData.name,
            data: clientData
        });
    });

    console.log(`📦 Preparados ${clientsToImport.length} clientes para importar.`);

    // Batch upsert to Supabase
    const chunkSize = 50;
    for (let i = 0; i < clientsToImport.length; i += chunkSize) {
        const chunk = clientsToImport.slice(i, i + chunkSize);
        const { error } = await supabase.from('clients').upsert(chunk);
        if (error) {
            console.error(`❌ Error en bloque ${i / chunkSize + 1}:`, error.message);
        } else {
            console.log(`✅ Bloque ${i / chunkSize + 1} completado (${chunk.length} registros).`);
        }
    }

    console.log('✨ Importación finalizada con éxito.');
}

importClients();
