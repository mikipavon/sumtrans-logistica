import fs from 'fs';

const p = 'src/components/shipments/ShipmentDetailsModal.jsx';
let content = fs.readFileSync(p, 'utf8');

const t = `    useEffect(() => {
        if (shipment) {
            setFormData(shipment);
            setIsEditing(false);
        }
    }, [shipment, isOpen]);`;

const target = t.replace(/\r\n/g, '\n');
const normalizedContent = content.replace(/\r\n/g, '\n');

const replaceStr = `    useEffect(() => {
        if (shipment) {
            let packagesText = shipment.packages || '';
            if (!packagesText && shipment.articles && shipment.articles.length > 0) {
                packagesText = shipment.articles.map(a => \`\${a.quantity || 1}x \${a.name}\`).join('\\n');
            }
            setFormData({
                ...shipment,
                packages: packagesText
            });
            setIsEditing(false);
        }
    }, [shipment, isOpen]);`;

if (normalizedContent.includes(target)) {
    fs.writeFileSync(p, normalizedContent.replace(target, replaceStr), 'utf8');
    console.log('✅ Success');
} else {
    console.log('❌ Target not found');
}
