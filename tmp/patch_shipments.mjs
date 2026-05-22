import fs from 'fs';

const p = 'src/pages/Shipments.jsx';
let content = fs.readFileSync(p, 'utf8');

const t = `<ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                shipment={selectedShipment}
                drivers={drivers}
                allPoblaciones={allPoblaciones}
                onUpdate={onUpdateShipment}
            />`;

const r = `<ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                shipment={selectedShipment}
                drivers={drivers}
                allPoblaciones={allPoblaciones}
                onUpdate={onUpdateShipment}
                clients={clients}
                articles={articles}
                tariffs={tariffs}
                familyOrder={[]}
            />`;

const target = t.replace(/\r\n/g, '\n');
const normalizedContent = content.replace(/\r\n/g, '\n');
const replaceStr = r;

if (normalizedContent.includes(target)) {
    fs.writeFileSync(p, normalizedContent.replace(target, replaceStr), 'utf8');
    console.log('✅ Shipments.jsx patched');
} else {
    console.log('❌ Target not found in Shipments.jsx');
}
