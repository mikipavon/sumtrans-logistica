import fs from 'fs';
import https from 'https';
import path from 'path';

const folderName = 'PRUEBA_ESCANER_REEMBOLSOS';
const folderPath = path.join(process.cwd(), folderName);

if (!fs.existsSync(folderPath)){
    fs.mkdirSync(folderPath);
}

const downloadQR = (shipmentId) => {
    const data = encodeURIComponent(`COD:${shipmentId}`);
    // Añadimos un poco de margen y tamaño para que parezca un folio escaneado (en la medida de lo posible para la prueba)
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=800x800&margin=50&data=${data}`;
    const filePath = path.join(folderPath, `escaner_justificante_${shipmentId}.png`);
    
    const file = fs.createWriteStream(filePath);
    https.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
            file.close();
            console.log(`✅ Creado falso escaneo para: ${shipmentId}`);
        });
    }).on('error', function(err) {
        fs.unlink(filePath, () => {});
        console.error(`Error descargando QR para ${shipmentId}: ${err.message}`);
    });
};

console.log('Generando imágenes de prueba en la carpeta: ' + folderPath);
downloadQR('TR-105');
downloadQR('TR-5');

// Y un tercero falso que no exista para comprobar que el sistema detecta que "no cuadra"
downloadQR('TR-9999');
