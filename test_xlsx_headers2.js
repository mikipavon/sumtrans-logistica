import XLSX from 'xlsx';

const headers = ["CODIGO", "NOMBRE", "C.I.F.", "DOMICILIO", "C. POSTAL", "POBLACION", "PROVINCIA", "TELEFONO", "E-MAIL"];
const factusolData = [
    {
        'CODIGO': '1',
        'NOMBRE': 'Test',
        'C.I.F.': '123',
        'DOMICILIO': 'Calle Falsa',
        'C. POSTAL': '28000',
        'POBLACION': 'Madrid',
        'PROVINCIA': 'Madrid',
        'TELEFONO': '123456789',
        'E-MAIL': 'test@test.com'
    }
];

// Method 1: purely json_to_sheet (how it was originally)
const ws1 = XLSX.utils.json_to_sheet(factusolData);
console.log("Original json_to_sheet method:", XLSX.utils.sheet_to_json(ws1, { header: 1 }));

// Method 2: aoa_to_sheet + sheet_add_json (how I modified it)
const ws2 = XLSX.utils.aoa_to_sheet([headers]);
XLSX.utils.sheet_add_json(ws2, factusolData, { skipHeader: true, origin: "A2" });
console.log("Modified aoa_to_sheet method:", XLSX.utils.sheet_to_json(ws2, { header: 1 }));

// Method 3: json_to_sheet with header explicitly defined
const factusolDataEmpty = [];
const ws3 = XLSX.utils.json_to_sheet(factusolDataEmpty, { header: headers });
console.log("Empty json_to_sheet with headers:", XLSX.utils.sheet_to_json(ws3, { header: 1 }));
