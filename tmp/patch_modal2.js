import fs from 'fs';

// ------------------------------------------------------------------
// 1. Patch DriverDashboard to pass hidePrices
// ------------------------------------------------------------------
let dbPath = 'src/pages/driver/DriverDashboard.jsx';
let dbContent = fs.readFileSync(dbPath, 'utf8');

const targetProps = `                isReadOnly={isReadOnlyModal}
                onWhatsAppShare={handleWhatsAppShare}
            />`;
const newProps = `                isReadOnly={isReadOnlyModal}
                onWhatsAppShare={handleWhatsAppShare}
                hidePrices={(() => {
                    if (!selectedShipment) return false;
                    const payingClientName = selectedShipment.porteType === 'Pagado' ? selectedShipment.client : selectedShipment.destinationName;
                    const payingClient = (clients || []).find(c => {
                        const name = String(c.name || '').toLowerCase();
                        const legal = String(c.legalName || '').toLowerCase();
                        const target = String(payingClientName || '').toLowerCase();
                        return name === target || legal === target;
                    });
                    return String(payingClient?.billingType || '').toLowerCase().includes('factur');
                })()}
            />`;

if (dbContent.includes(targetProps)) {
    dbContent = dbContent.replace(targetProps, newProps);
    fs.writeFileSync(dbPath, dbContent, 'utf8');
    console.log("✅ DriverDashboard patched");
} else {
    // maybe try normalizing 
    const ndb = dbContent.replace(/\r\n/g, '\n');
    const nt = targetProps.replace(/\r\n/g, '\n');
    if (ndb.includes(nt)) {
        dbContent = ndb.replace(nt, newProps.replace(/\r\n/g, '\n'));
        fs.writeFileSync(dbPath, dbContent, 'utf8');
        console.log("✅ DriverDashboard patched (normalize)");
    } else {
        console.log("❌ Could not patch DriverDashboard");
    }
}

// ------------------------------------------------------------------
// 2. Patch ShipmentDetailsModal
// ------------------------------------------------------------------
let modalPath = 'src/components/shipments/ShipmentDetailsModal.jsx';
let modalContent = fs.readFileSync(modalPath, 'utf8');

// A. Signature
const oldSig = "export default function ShipmentDetailsModal({ isOpen, onClose, shipment, onUpdate, allPoblaciones, drivers = [], isReadOnly = false, onWhatsAppShare }) {";
const newSig = "export default function ShipmentDetailsModal({ isOpen, onClose, shipment, onUpdate, allPoblaciones, drivers = [], isReadOnly = false, onWhatsAppShare, hidePrices = false }) {";
if (modalContent.includes(oldSig)) {
    modalContent = modalContent.replace(oldSig, newSig);
}

// B. Amount Field Hiding
const oldAmountRender = '{renderField("Precio Final Porte", formData.amount, "amount", <Euro />)}';
const newAmountRender = `                        {hidePrices ? (
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <Euro size={12} /> Precio Final Porte
                                </span>
                                <p className="text-slate-400 italic font-medium text-sm">FACTURACIÓN (OCULTO)</p>
                            </div>
                        ) : (
                            renderField("Precio Final Porte", formData.amount, "amount", <Euro />)
                        )}`;
if (modalContent.includes(oldAmountRender)) {
    modalContent = modalContent.replace(oldAmountRender, newAmountRender);
}

// C. Make Packages a textarea
const oldPackagesRender = '{renderField("Bultos", formData.packages, "packages", <Package />)}';
const newPackagesRender = '{renderField("Bultos", formData.packages, "packages", <Package />, "textarea")}';
if (modalContent.includes(oldPackagesRender)) {
    modalContent = modalContent.replace(oldPackagesRender, newPackagesRender);
}

fs.writeFileSync(modalPath, modalContent, 'utf8');
console.log("✅ ShipmentDetailsModal patched");
