const XLSX = require('xlsx');

// Test 1: Empty data with headers
const headers = ["CODIGO", "NOMBRE", "C.I.F.", "DOMICILIO", "C. POSTAL", "POBLACION", "PROVINCIA", "TELEFONO", "E-MAIL"];
const config = { header: headers };

const ws1 = XLSX.utils.json_to_sheet([], config);
console.log("WS1 (Empty data with headers):", ws1);

// Test 2: Using aoa_to_sheet for header then sheet_add_json
const ws2 = XLSX.utils.aoa_to_sheet([headers]);
console.log("WS2 (aoa_to_sheet only):", ws2);
XLSX.utils.sheet_add_json(ws2, [], { skipHeader: true, origin: "A2" });
console.log("WS2 (after sheet_add_json):", ws2);

// Test 3: json_to_sheet with empty data but mapped objects with empty values
const factusolData = [
    {
        'CODIGO': '',
        'NOMBRE': '',
        'C.I.F.': '',
        'DOMICILIO': '',
        'C. POSTAL': '',
        'POBLACION': '',
        'PROVINCIA': '',
        'TELEFONO': '',
        'E-MAIL': ''
    }
];
const ws3 = XLSX.utils.json_to_sheet(factusolData);
console.log("WS3 (empty row):", ws3);

