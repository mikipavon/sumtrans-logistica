
import { read, utils } from 'xlsx';
import fs from 'fs';

const filePath = 'c:\\Users\\sumtr\\OneDrive - SUMTRANS LOGISTICA S.L. CIF B56131717\\SUM MIGUEL\\miguel\\miaplicacionlogistica\\crc39_Articulos2.xlsx';

try {
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = utils.sheet_to_json(worksheet);

    console.log(JSON.stringify(jsonData.slice(0, 10), null, 2));
    console.log(`Total rows: ${jsonData.length}`);
} catch (err) {
    console.error(err);
}
