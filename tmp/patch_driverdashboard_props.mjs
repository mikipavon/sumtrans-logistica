import fs from 'fs';

const path = 'src/pages/driver/DriverDashboard.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `                onWhatsAppShare={handleWhatsAppShare}
                hidePrices={(() => {
                    if (!selectedShipment) return false;`;

const replacement = `                onWhatsAppShare={handleWhatsAppShare}
                articles={articles}
                clients={clients}
                tariffs={tariffs}
                familyOrder={familyOrder}
                hidePrices={(() => {
                    if (!selectedShipment) return false;`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
} else {
    // try to fallback using normalize
    const normC = content.replace(/\r\n/g, '\n');
    const normT = target.replace(/\r\n/g, '\n');
    if (normC.includes(normT)) {
        content = normC.replace(normT, replacement.replace(/\r\n/g, '\n'));
    } else {
        console.log("❌ Target not found");
        process.exit(1);
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log("✅ DriverDashboard patched");
